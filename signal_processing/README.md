# Signal Processing

Python pipeline that turns raw EEG samples into a real-time focus score.

## Pipeline stages
1. **Input**: raw EEG samples from serial/BLE or exported from [Chords](https://chords.upsidedownlabs.tech/) recordings (CSV)
2. **Filtering**:
   - Bandpass filter 1–40Hz
   - Notch filter at 50/60Hz (powerline noise)
3. **Windowing**: sliding-window FFT (1–2s windows, overlapping)
4. **Band power extraction**:
   - Theta: 4–8Hz
   - Alpha: 8–12Hz
   - Beta: 12–30Hz
5. **Focus metric**: engagement index = beta / (alpha + theta)
6. **Smoothing/thresholding**: rolling average + per-user threshold to classify focused vs. zoned-out

## Artifact handling
- Amplitude-based rejection for eye blinks / jaw clenching / movement artifacts
- Baseline wander correction for dry-electrode drift

## TODO
- [ ] Serial reader + buffering logic
- [ ] Bandpass/notch filters (`scipy.signal`)
- [ ] Sliding-window FFT + band power extraction
- [ ] Focus score calculation
