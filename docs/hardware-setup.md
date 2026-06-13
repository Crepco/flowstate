# Hardware Setup

## Components
- BioAmp EXG Pill ([Upside Down Labs](https://upsidedownlabs.tech/))
- ESP32 dev board
- Electrodes (forehead Fp1/Fp2 + earlobe/mastoid reference)

## Wiring
| BioAmp EXG Pill | ESP32 |
|---|---|
| VCC | 3.3V |
| GND | GND |
| Output (yellow) | GPIO36 (VP) or GPIO39 (VN) |

Read via `analogRead(36)` or `analogRead(39)`.

Avoid ADC2 pins (0, 2, 4, 12-15, 25-27) — they conflict with WiFi when ADC2 is in use.

## Electrode placement
- Active electrodes on forehead (Fp1/Fp2)
- Reference electrode on earlobe or mastoid

## Visualization tool
[Chords](https://chords.upsidedownlabs.tech/) — Upside Down Labs' web app for visualizing and recording BioAmp signals directly from the board over WebSerial/WebBLE. Useful for quick signal checks and recording calibration data without custom firmware.
