# Signal Pipeline Notes

## Sampling
- Sample EEG at 500Hz via the Arduino UNO R4 ADC (14-bit)
- Stream over USB serial to the laptop, or use [Chords](https://chords.upsidedownlabs.tech/) to record/export

## Filtering
- Bandpass filter 1–40Hz
- Notch filter at 50/60Hz (powerline noise)

## Feature extraction
- Sliding window FFT (1–2s windows, overlapping)
- Band powers:
  - Theta: 4–8Hz
  - Alpha: 8–12Hz
  - Beta: 12–30Hz
- Engagement index = beta / (alpha + theta)
- Smooth/threshold over time → focused vs. zoned-out

## Known challenges
- **Noise**: forehead EEG is noisy — eye blinks, jaw clenching, head movement create large artifacts. Need amplitude-based artifact rejection for blinks.
- **Electrode drift**: dry electrodes drift with sweat/contact changes → baseline wander.
- **ADC limits**: the UNO R4's onboard ADC, while 14-bit, is still noisier than a dedicated EEG ADC (an ADS1115 would help if available).
- **No universal "zoning out" signature**: alpha increase can mean relaxed-focus, drowsiness, OR mind-wandering — it's a proxy, not ground truth.
- **Real-time FFT**: careful buffering with overlapping windows; don't block the dashboard update loop.

## Demo framing
Present results as "relative change from personal baseline" rather than absolute focused/unfocused classification — more honest and defensible to judges.
