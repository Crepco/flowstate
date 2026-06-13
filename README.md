# FlowState 🧠

Real-time attention monitoring using EEG signals from the [BioAmp EXG Pill](https://chords.upsidedownlabs.tech/) and ESP32. Detects when a user mentally "zones out" while reading/studying or attending an online class, and alerts them to refocus.

See [docs/problem-statement.md](docs/problem-statement.md) for the full problem statement and solution writeup.

## How it works
- Forehead EEG signal captured via BioAmp EXG Pill → ESP32 ADC → streamed to [Upside Down Labs Chords](https://chords.upsidedownlabs.tech/) (or our own serial pipeline)
- Python pipeline applies bandpass + notch filtering, then FFT-based band power analysis (theta/alpha/beta)
- Computes a real-time focus score (relative to a personal calibration baseline)
- Live dashboard visualizes brainwave activity and triggers alerts when attention drops

## Use cases
- **Self-study**: catch the moment you're reading without comprehending, and get nudged back on track
- **Online classes**: give students (or instructors) visibility into engagement levels during lectures

## Tech stack
- BioAmp EXG Pill + ESP32 (signal acquisition)
- [Chords](https://chords.upsidedownlabs.tech/) web app for signal visualization/recording
- Python (NumPy, SciPy for signal processing)
- Streamlit/Flask dashboard for live visualization

## Quick start

```bash
pip install -r requirements.txt

# 1) Sanity-check a recording (shows how much 50 Hz noise the filter removes)
python analyze_csv.py

# 2) Launch the live dashboard (replays the sample CSV by default)
python -m dashboard.app
#   then open http://127.0.0.1:5000
```

On Windows you can just double-click [run_dashboard.bat](run_dashboard.bat).

**Live mode (Arduino UNO R4):** flash [firmware/flowstate_eeg/flowstate_eeg.ino](firmware/flowstate_eeg/flowstate_eeg.ino), then run `python -m dashboard.app --serial COM3` (use your port), or pick the port in the UI and click **Go live**.

**Calibrate** for a personalised score: click *Record 60s focused* (read something hard), then *Record 60s zoned-out* (let your mind wander). Once both are recorded, FlowState **trains a logistic-regression classifier** on your two states (it reports its accuracy) and scores you with the learned model. Until then it falls back to a baseline-relative score, so it works immediately. The trained model is saved to `calibration/model.json` and reloads on restart.

**Nudges:** click *Enable nudges* to get a sound chime + desktop notification the moment you zone out (and a positive cue when you refocus).

**Sessions + AI coach:** click *Start session* to track focus over time. *End session* opens a debrief — a focus-over-time graph, your stats (avg focus, % focused, zone-outs, longest streak), and a **Gemini-powered focus coach** you can chat with about how to focus better. The coach is grounded in your actual session data.

To enable the coach, copy `.env.example` to `.env` and add your Google Gemini API key:

```bash
cp .env.example .env
# then edit .env:  GEMINI_API_KEY=your-key
```

Without a key, the coach falls back to built-in, data-aware tips so the demo still works. `.env` is git-ignored — never commit your key.

## Project layout
- [firmware/](firmware/) — Arduino UNO R4 sketch (`flowstate_eeg`) that streams A0 over serial
- [signal_processing/](signal_processing/) — filtering, FFT band power, focus score pipeline
- [dashboard/](dashboard/) — Flask server + live web dashboard (SSE, calibration, source switching)
- [calibration/](calibration/) — per-user baseline calibration notes and data
- [sample_data/](sample_data/) — a recorded EEG CSV so the demo runs with no hardware
- [analyze_csv.py](analyze_csv.py) — offline before/after filtering report
- [docs/](docs/) — hardware setup, signal pipeline notes, problem statement


