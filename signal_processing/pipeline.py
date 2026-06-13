"""Real-time focus pipeline.

Feed it raw samples as they arrive (``add_samples``). Every so often call
``compute()`` to get the current state: cleaned waveform tail, band powers,
engagement index, a 0-100 focus score, and an alert flag.

Two scoring modes:

* **Uncalibrated** (works immediately): the score is the engagement index
  z-scored against its own recent history and squashed to 0-100. It centres
  around 50 and moves up/down with *relative* changes in focus.

* **Calibrated** (after the user records a focused minute + a zoned-out
  minute): the score linearly maps engagement between the zoned baseline (0)
  and the focused baseline (100). This is the honest, personalised mode.
"""

from __future__ import annotations

import math
import time
from collections import deque

import numpy as np

from .bands import band_powers, engagement_index, relative_band_powers
from .filters import clean_signal


class FocusPipeline:
    def __init__(
        self,
        fs=500,
        powerline=50.0,
        window_sec=2.0,
        history_sec=10.0,
        display_hz=100,
        display_sec=4.0,
        ema_alpha=0.2,
        alert_threshold=35.0,
        alert_hold_sec=4.0,
    ):
        self.fs = int(fs)
        self.powerline = powerline
        self.window_n = int(window_sec * fs)
        self.ema_alpha = ema_alpha
        self.alert_threshold = alert_threshold
        self.alert_hold_sec = alert_hold_sec

        # Raw ring buffer of the most recent samples.
        self._raw = deque(maxlen=int(history_sec * fs))

        # Downsampled cleaned waveform for the live trace.
        self.display_hz = display_hz
        self._display = deque(maxlen=int(display_sec * display_hz))

        # Rolling history of engagement values for uncalibrated z-scoring.
        self._eng_hist = deque(maxlen=300)

        # Smoothed focus score state.
        self.focus = 50.0
        self._focus_init = False

        # Calibration baselines (median engagement per labelled state).
        self.baseline = {"focused": None, "zoned": None}
        self._calib_label = None
        self._calib_values = []
        self._calib_until = 0.0

        # Alert state machine.
        self._below_since = None
        self.alert = False

        self.samples_seen = 0

    # ------------------------------------------------------------------ input
    def add_samples(self, values):
        """Append raw samples (iterable of numbers)."""
        for v in values:
            self._raw.append(float(v))
        self.samples_seen += len(values) if hasattr(values, "__len__") else 0

    # ------------------------------------------------------ calibration control
    def start_calibration(self, label, seconds=60):
        if label not in ("focused", "zoned"):
            raise ValueError("label must be 'focused' or 'zoned'")
        self._calib_label = label
        self._calib_values = []
        self._calib_until = time.time() + seconds

    def cancel_calibration(self):
        self._calib_label = None
        self._calib_values = []

    @property
    def calibrating(self):
        return self._calib_label is not None

    @property
    def is_calibrated(self):
        return (
            self.baseline["focused"] is not None
            and self.baseline["zoned"] is not None
        )

    def reset_calibration(self):
        self.baseline = {"focused": None, "zoned": None}

    # --------------------------------------------------------------- scoring
    def _score_from_engagement(self, eng):
        """Map an engagement value to 0-100."""
        if self.is_calibrated:
            lo = self.baseline["zoned"]
            hi = self.baseline["focused"]
            if hi == lo:
                return 50.0
            score = 100.0 * (eng - lo) / (hi - lo)
            return float(np.clip(score, 0.0, 100.0))

        # Uncalibrated: z-score against recent history -> logistic -> 0-100.
        if len(self._eng_hist) < 8:
            return 50.0
        arr = np.asarray(self._eng_hist, dtype=float)
        mean, std = arr.mean(), arr.std()
        if std < 1e-9:
            return 50.0
        z = (eng - mean) / std
        return float(100.0 / (1.0 + math.exp(-z)))

    # ---------------------------------------------------------------- compute
    def compute(self):
        """Run one analysis step and return a JSON-serialisable dict."""
        now = time.time()
        n = len(self._raw)
        ready = n >= self.window_n

        packet = {
            "t": now,
            "fs": self.fs,
            "samples_seen": self.samples_seen,
            "ready": ready,
            "calibrating": self.calibrating,
            "calibrated": self.is_calibrated,
            "baseline": dict(self.baseline),
        }

        if not ready:
            packet.update(
                state="warmup",
                focus=round(self.focus, 1),
                engagement=0.0,
                bands={}, band_rel={}, alert=False,
                wave=self._wave_list(), wave_hz=self.display_hz,
                quality="warmup",
                progress=round(100.0 * n / self.window_n, 1),
            )
            return packet

        window = np.asarray(self._raw, dtype=float)[-self.window_n:]
        cleaned = clean_signal(window, self.fs, powerline=self.powerline)

        # Update the live display trace (downsample the cleaned tail).
        self._push_display(cleaned)

        powers = band_powers(cleaned, self.fs)
        eng = engagement_index(powers)
        self._eng_hist.append(eng)

        # Feed calibration if active.
        if self.calibrating:
            self._calib_values.append(eng)
            if now >= self._calib_until and self._calib_values:
                self.baseline[self._calib_label] = float(
                    np.median(self._calib_values)
                )
                self._calib_label = None
                self._calib_values = []

        # Focus score (EMA-smoothed).
        target = self._score_from_engagement(eng)
        if not self._focus_init:
            self.focus = target
            self._focus_init = True
        else:
            a = self.ema_alpha
            self.focus = (1 - a) * self.focus + a * target

        # Alert state machine: sustained low focus.
        if self.focus < self.alert_threshold:
            if self._below_since is None:
                self._below_since = now
            self.alert = (now - self._below_since) >= self.alert_hold_sec
        else:
            self._below_since = None
            self.alert = False

        # Signal-quality heuristic: how much residual sits at powerline freq.
        quality = self._quality(window)

        if self.calibrating:
            state = "calibrating"
        elif self.alert:
            state = "zoning"
        elif self.focus < self.alert_threshold:
            state = "dipping"
        else:
            state = "focused"

        packet.update(
            state=state,
            focus=round(self.focus, 1),
            engagement=round(eng, 4),
            bands={k: round(v, 8) for k, v in powers.items()},
            band_rel={k: round(v, 4) for k, v in relative_band_powers(powers).items()},
            alert=self.alert,
            wave=self._wave_list(),
            wave_hz=self.display_hz,
            quality=quality,
            calib_label=self._calib_label,
            calib_remaining=max(0.0, round(self._calib_until - now, 1)) if self.calibrating else 0.0,
        )
        return packet

    # ---------------------------------------------------------------- display
    def _push_display(self, cleaned):
        step = max(1, int(self.fs / self.display_hz))
        # Only push the freshly-needed tail to keep a continuous-looking trace.
        tail = cleaned[::step]
        keep = self._display.maxlen
        for v in tail[-keep:]:
            self._display.append(float(v))

    def _wave_list(self):
        return [round(v, 4) for v in self._display]

    def _quality(self, window):
        """Rough: powerline power vs EEG-band power on the *raw* window."""
        from .bands import band_powers as _bp
        raw_powers = _bp(window, self.fs, bands={
            "line": (self.powerline - 1.5, self.powerline + 1.5),
            "eeg": (4.0, 30.0),
        })
        line = raw_powers.get("line", 0.0)
        eeg = raw_powers.get("eeg", 1e-12)
        ratio = line / eeg if eeg > 0 else 999
        if ratio > 8:
            return "noisy"
        if ratio > 2:
            return "fair"
        return "good"
