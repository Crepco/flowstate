# Signal Processing

Turns raw forehead-EEG samples into a real-time 0–100 focus score. Pure
Python + NumPy/SciPy, no heavy ML dependency.

## Pipeline (per 2-second sliding window, ~20×/sec)

1. **Filtering** ([filters.py](filters.py)) — `clean_signal()`: 50 Hz notch +
   100 Hz harmonic notch, then a 1–40 Hz Butterworth bandpass. Uses zero-phase
   `filtfilt` so wave peaks don't shift in time.
2. **Band power** ([bands.py](bands.py)) — Welch PSD integrated over the EEG
   bands (delta, theta, alpha, beta, gamma).
3. **Engagement index** — `beta / (alpha + theta)`, the standard attention proxy.
4. **Scoring** (best available wins):
   - **ML model** ([classifier.py](classifier.py)) — logistic regression trained
     from scratch on your focused vs zoned calibration windows; outputs P(focused)
     and reports a training accuracy.
   - **Calibrated** — linear map of engagement between your zoned/focused baselines.
   - **Relative** — engagement z-scored against recent history (works with no
     calibration).
5. **Smoothing + alert** ([pipeline.py](pipeline.py)) — EMA smoothing, then a
   sustained-low-score state machine: focus **below 40 for 1 second** raises a
   zone-out alert. Also computes a signal-quality estimate (powerline vs EEG power).

## Files

| File | Role |
|------|------|
| [filters.py](filters.py) | notch + bandpass cleanup |
| [bands.py](bands.py) | Welch band powers + engagement index |
| [classifier.py](classifier.py) | from-scratch logistic-regression focus classifier |
| [pipeline.py](pipeline.py) | the orchestrator: buffering, scoring, calibration, alerts |

## Note on threads

[`__init__.py`](__init__.py) pins BLAS/OpenMP to a single thread before NumPy
loads — the Flask server and the compute loop both call SciPy from different
threads, and multi-threaded OpenBLAS was exhausting its per-thread memory pool.
Our FFT windows are tiny, so single-threaded costs nothing.
