"""Data sources that feed raw EEG samples into the pipeline.

Both expose the same interface: a generator ``stream()`` yielding small numpy
chunks of samples, paced roughly at the real sample rate. The dashboard runs
whichever source in a background thread.

* ``CSVReplaySource``  -- replays a ChordsWeb CSV (loops forever). Works with
  no hardware, so the dashboard is fully demoable right now.
* ``SerialSource``     -- reads the live Arduino stream (one number per line).
"""

from __future__ import annotations

import csv
import time

import numpy as np


class CSVReplaySource:
    """Replay a ChordsWeb-style CSV at real time, looping."""

    def __init__(self, path, fs=500, column="Channel1", loop=True, speed=1.0):
        self.path = path
        self.fs = int(fs)
        self.column = column
        self.loop = loop
        self.speed = speed
        self.name = f"CSV replay ({path})"
        self._samples = self._load()

    def _load(self):
        vals = []
        with open(self.path, newline="") as f:
            reader = csv.DictReader(f)
            col = self.column if self.column in (reader.fieldnames or []) else None
            if col is None:
                # Fall back to the last column.
                col = (reader.fieldnames or ["Channel1"])[-1]
            for row in reader:
                try:
                    vals.append(float(row[col]))
                except (ValueError, KeyError, TypeError):
                    continue
        if not vals:
            raise ValueError(f"No numeric data found in {self.path}")
        return np.asarray(vals, dtype=float)

    def stream(self, stop_flag):
        chunk = max(1, int(self.fs / 50))          # ~50 chunks/sec
        period = chunk / (self.fs * self.speed)     # seconds per chunk
        i = 0
        n = len(self._samples)
        while not stop_flag.is_set():
            start = time.perf_counter()
            end = i + chunk
            if end <= n:
                yield self._samples[i:end]
                i = end
            else:
                part = self._samples[i:n]
                if part.size:
                    yield part
                if not self.loop:
                    return
                i = 0
            sleep = period - (time.perf_counter() - start)
            if sleep > 0:
                time.sleep(sleep)


class SerialSource:
    """Read the live Arduino stream: one integer (analogRead) per line."""

    def __init__(self, port, baud=230400, fs=500):
        self.port = port
        self.baud = baud
        self.fs = int(fs)
        self.name = f"Serial ({port} @ {baud})"

    def stream(self, stop_flag):
        import serial  # imported lazily so CSV mode needs no pyserial

        ser = serial.Serial(self.port, self.baud, timeout=1)
        time.sleep(2.0)  # let the board reset
        ser.reset_input_buffer()
        buf = []
        try:
            while not stop_flag.is_set():
                line = ser.readline().decode("ascii", "ignore").strip()
                if not line:
                    continue
                try:
                    buf.append(float(line.split(",")[-1]))
                except ValueError:
                    continue
                if len(buf) >= max(1, int(self.fs / 50)):
                    yield np.asarray(buf, dtype=float)
                    buf = []
        finally:
            ser.close()


def list_serial_ports():
    """Return available serial port names (best-effort)."""
    try:
        from serial.tools import list_ports
        return [p.device for p in list_ports.comports()]
    except Exception:
        return []
