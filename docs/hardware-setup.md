# Hardware Setup

## Components
- BioAmp EXG Pill ([Upside Down Labs](https://upsidedownlabs.tech/))
- Arduino UNO R4 (Renesas) — chosen for its clean 14-bit ADC
- Electrodes (forehead Fp1/Fp2 + earlobe/mastoid reference)

## Wiring

| BioAmp EXG Pill | Arduino UNO R4 |
|-----------------|----------------|
| VCC (red)       | 3.3V           |
| GND (black)     | GND            |
| Output (yellow) | A0             |

Read in firmware via `analogRead(A0)` at 14-bit resolution.

## Electrode placement
- Two active electrodes on the forehead (Fp1/Fp2, above the eyebrows)
- One reference electrode on an earlobe or the mastoid bone

## Firmware
Flash [../arduino/flowstate_eeg/flowstate_eeg.ino](../arduino/flowstate_eeg/flowstate_eeg.ino).
It samples A0 at 500 Hz and prints one raw ADC value per line over USB serial at
230400 baud. See [../arduino/README.md](../arduino/README.md).

## Visualization / recording tool
[Chords](https://chords.upsidedownlabs.tech/) — Upside Down Labs' web app for
visualising and recording BioAmp signals directly from the board over WebSerial.
Useful for quick signal checks and for recording calibration data you can replay
through the dashboard as a CSV.
