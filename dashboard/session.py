"""Study-session tracking.

Records the focus score over a session so we can show a focus-over-time graph
and an end-of-session summary (and, later, feed it to an AI coach).

The Engine calls ``record(packet)`` on every compute tick; the tracker
down-samples to ~1 Hz so a long session stays light. ``stop()`` returns the
summary dict the dashboard renders.
"""

from __future__ import annotations

import time

# Focus at/above this counts as "focused" (matches the pipeline alert threshold).
FOCUS_THRESHOLD = 45.0
_BAND_KEYS = ("theta", "alpha", "beta", "gamma")


class SessionTracker:
    def __init__(self, sample_interval=1.0):
        self.sample_interval = sample_interval
        self.reset()

    def reset(self):
        self.active = False
        self.start_t = None
        self.end_t = None
        self.samples = []          # {t, f, alert}
        self.bands = []            # {theta, alpha, beta, gamma}
        self.zone_outs = 0
        self._prev_alert = False
        self._last_sample_t = 0.0
        self._last_summary = None

    # ------------------------------------------------------------- lifecycle
    def start(self):
        self.reset()
        self.active = True
        self.start_t = time.time()

    def stop(self):
        if not self.active:
            return self._last_summary or self.summary()
        self.active = False
        self.end_t = time.time()
        self._last_summary = self.summary()
        return self._last_summary

    # ---------------------------------------------------------------- record
    def record(self, packet):
        if not self.active or not packet.get("ready"):
            return
        now = time.time()
        alert = bool(packet.get("alert"))
        if alert and not self._prev_alert:   # rising edge = a new lapse
            self.zone_outs += 1
        self._prev_alert = alert

        if now - self._last_sample_t >= self.sample_interval:
            self._last_sample_t = now
            self.samples.append({
                "t": round(now - self.start_t, 1),
                "f": float(packet.get("focus", 0.0)),
                "alert": alert,
            })
            br = packet.get("band_rel", {}) or {}
            self.bands.append({k: float(br.get(k, 0.0)) for k in _BAND_KEYS})

    # ------------------------------------------------------------- read-outs
    def state(self):
        """Lightweight live state for the packet (drives the running timer)."""
        if not self.active:
            return {"active": False}
        focuses = [s["f"] for s in self.samples]
        return {
            "active": True,
            "elapsed": round(time.time() - self.start_t, 1),
            "avg_focus": round(sum(focuses) / len(focuses), 1) if focuses else 0.0,
            "zone_outs": self.zone_outs,
        }

    def summary(self):
        start = self.start_t or time.time()
        end = self.end_t or time.time()
        duration = max(0.0, end - start)
        focuses = [s["f"] for s in self.samples]

        out = {"duration": round(duration, 1), "n_samples": len(self.samples),
               "zone_outs": self.zone_outs}

        if not focuses:
            out.update(avg_focus=0, peak_focus=0, pct_focused=0,
                       longest_streak=0, timeline=[], bands={})
            return out

        out["avg_focus"] = round(sum(focuses) / len(focuses), 1)
        out["peak_focus"] = round(max(focuses), 1)
        out["pct_focused"] = round(
            100.0 * sum(1 for f in focuses if f >= FOCUS_THRESHOLD) / len(focuses), 1)

        # Longest unbroken focused stretch (seconds), from sample timestamps.
        longest = 0.0
        run_start = None
        for s in self.samples:
            if s["f"] >= FOCUS_THRESHOLD:
                if run_start is None:
                    run_start = s["t"]
                longest = max(longest, s["t"] - run_start + self.sample_interval)
            else:
                run_start = None
        out["longest_streak"] = round(longest, 1)

        out["bands"] = {
            k: round(sum(b[k] for b in self.bands) / len(self.bands), 4)
            for k in _BAND_KEYS
        } if self.bands else {}

        out["timeline"] = self._downsample(self.samples, 180)
        return out

    @staticmethod
    def _downsample(samples, target):
        n = len(samples)
        if n <= target:
            return [{"t": s["t"], "f": round(s["f"], 1)} for s in samples]
        step = n / target
        out, i = [], 0.0
        while int(i) < n:
            s = samples[int(i)]
            out.append({"t": s["t"], "f": round(s["f"], 1)})
            i += step
        return out
