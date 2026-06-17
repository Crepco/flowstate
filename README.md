# FlowState 🧠

**Real-time focus tracking from EEG sensor placed on the forehead.** FlowState reads
your brain activity through a [BioAmp EXG Pill](https://upsidedownlabs.tech/) on
an **Arduino UNO R4**, turns it into a live 0–100 focus score, and buzzes you the
moment you zone out while studying or in an online class.

Unlike webcam attention trackers — which only see your gaze and can be fooled by
a blank stare — FlowState measures a *physiological* correlate of engagement that
is much harder to fake. We report it honestly as a **relative, personalised
proxy**, not a medical measurement.

> 📄 Full write-up: [docs/problem-statement.md](docs/problem-statement.md)

---

## Quick start (no hardware needed)

```bash
pip install -r requirements.txt

# Launch the live dashboard — it replays a bundled EEG recording by default
python -m dashboard.app
#   then open http://127.0.0.1:5000
```

On Windows you can just double-click [run_dashboard.bat](run_dashboard.bat).

The whole product is demoable with **zero hardware** thanks to CSV replay mode, so
nothing on stage depends on a flaky USB connection.

---

## How it works

```
Brain → forehead electrodes → BioAmp EXG Pill (analog amp)
     → Arduino UNO R4 (14-bit ADC @ 500 Hz) → USB serial (one value per line)
        └─ OR a recorded CSV (the no-hardware demo path)
     → Python pipeline:
          clean_signal()  : 50 Hz notch + 100 Hz harmonic + 1–40 Hz bandpass
          band_powers()   : Welch PSD → theta / alpha / beta / gamma power
          engagement      : beta / (alpha + theta)
          focus score     : 0–100, one of three modes (below)
          smoothing+alert : EMA smoothing → zone-out alert
     → 20×/sec JSON pushed to the browser over Server-Sent Events
     → dashboard: focus gauge, live EEG trace, band graph, buzzer, session debrief
```

### Three scoring modes — best available wins

| Mode | Available | What it does |
|------|-----------|--------------|
| **Relative** | Instantly, no setup | Engagement z-scored against its own recent history → "more or less focused than your last few minutes?" |
| **Calibrated** | After recording both states | Linearly maps engagement between your *zoned* baseline (0) and *focused* baseline (100) |
| **ML model** | After both recordings | A per-user logistic-regression classifier (written from scratch in NumPy) outputs P(focused) and reports its training accuracy |

So it works the instant you open it, and gets smarter as it learns *your* brain.

---

## Features

- **Live focus gauge** over a real-time EEG waveform, with a brainwave-band graph.
- **Instant zone-out alert** — when focus drops **below 40 for one second**, a loud
  continuous buzzer fires (plus desktop notification + vibration) until you refocus.
- **Personal calibration** — *Capture focused* (read something hard) then
  *Capture zoned-out* (let your mind wander); FlowState trains a classifier on your
  two states. The model is saved to `calibration/model.json` and reloads on restart.
- **Study sessions + AI coach** — *Start session* tracks focus over time; the debrief
  shows a focus-over-time graph and stats (avg focus, % focused, zone-outs, longest
  streak), and a **Gemini-powered coach** you can chat with — grounded strictly in
  your real session data.

---

## Live mode (with the Arduino)

1. Build the circuit — see [docs/hardware-setup.md](docs/hardware-setup.md).
2. Flash [arduino/flowstate_eeg/flowstate_eeg.ino](arduino/flowstate_eeg/flowstate_eeg.ino)
   to your Arduino UNO R4.
3. Run with your serial port, or pick it in the UI and click **Go live**:

```bash
python -m dashboard.app --serial COM3            # Windows
python -m dashboard.app --serial /dev/ttyACM0    # Linux/Mac
```

---

## Enable the AI coach (optional)

Copy the example env file and add a [Google Gemini](https://aistudio.google.com/) key:

```bash
cp .env.example .env
# then edit .env:  GEMINI_API_KEY=your-key
```

Without a key the coach falls back to built-in, data-aware tips, so the demo still
works. `.env` is git-ignored — never commit your key.

---

## Verify the signal pipeline

```bash
python analyze_csv.py        # prints band powers before vs after filtering
```

It reports how many times smaller the 50 Hz powerline peak gets after filtering —
the quickest proof that real EEG is visible under the noise.

---

## Project layout

```
flowstate/
├── arduino/             Arduino UNO R4 sketch — streams A0 over USB serial
│   └── flowstate_eeg/flowstate_eeg.ino
├── signal_processing/   filtering · band power · classifier · focus pipeline
├── dashboard/           Flask server + SSE + the web UI (static/)
├── calibration/         per-user trained model + notes
├── sample_data/         a recorded EEG CSV so the demo runs with no hardware
├── docs/                hardware setup · signal pipeline · problem statement
├── analyze_csv.py       offline before/after filtering report
└── run_dashboard.bat    one-click Windows launcher
```

## Tech stack

- **Hardware:** BioAmp EXG Pill + Arduino UNO R4 (14-bit ADC, 500 Hz, 230400 baud)
- **Signal processing:** Python · NumPy · SciPy (Welch PSD, zero-phase filtering)
- **ML:** logistic regression implemented from scratch in NumPy
- **Backend:** Flask + Server-Sent Events
- **Frontend:** vanilla JS + Canvas (no framework)
- **AI coach:** Google Gemini (`google-genai`)

---

*FlowState reports a **relative, per-user** change in a physiological focus proxy —
not a diagnosis.*
