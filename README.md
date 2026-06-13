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

## Project layout
- [firmware/](firmware/) — ESP32 Arduino sketch for ADC sampling and streaming
- [signal_processing/](signal_processing/) — filtering, FFT band power, focus score pipeline
- [dashboard/](dashboard/) — live Streamlit/Flask dashboard
- [calibration/](calibration/) — per-user baseline calibration routine and data
- [docs/](docs/) — hardware setup, signal pipeline notes, references

## Note
Focus scores are relative, calibrated per-user — EEG-based attention detection is a proxy signal, not a diagnostic tool.
