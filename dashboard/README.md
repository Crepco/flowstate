# Dashboard

Live Streamlit/Flask dashboard for visualizing EEG signal and focus score.

## Planned features
- Live EEG trace (raw + filtered)
- Real-time focus score plot
- Band power breakdown (theta/alpha/beta)
- Visual/audio alert when focus score drops below threshold for N seconds
- Calibration mode toggle (uses baseline from [calibration/](../calibration/))

## TODO
- [ ] Choose Streamlit vs. Flask
- [ ] Live plot updates without blocking the data pipeline
- [ ] Alert mechanism (visual/audio)
