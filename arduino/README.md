# Arduino

The firmware that turns raw forehead EEG into a serial stream the Python
pipeline can read. Target board: **Arduino UNO R4** (Renesas), which has a clean
14-bit ADC.

The sketch is intentionally dumb — all signal processing happens in Python. The
board just samples one pin at a precise rate and prints each reading.

## Sketch

[flowstate_eeg/flowstate_eeg.ino](flowstate_eeg/flowstate_eeg.ino)

- Reads the BioAmp EXG Pill output on **A0**
- Samples at a fixed **500 Hz** using `micros()` timing (not `delay`)
- 14-bit ADC resolution (`analogReadResolution(14)`)
- Prints one raw ADC value per line over USB serial at **230400 baud**

## Wiring (BioAmp EXG Pill → Arduino UNO R4)

| BioAmp EXG Pill | Arduino UNO R4 |
|-----------------|----------------|
| Output (yellow) | A0             |
| VCC (red)       | 3.3V           |
| GND (black)     | GND            |

**Electrodes:** two active on the forehead (Fp1/Fp2, above the eyebrows), one
reference on an earlobe or the mastoid bone.

## Flash and run

1. Open the sketch in the Arduino IDE and upload it to the UNO R4.
2. In FlowState, pick the board's serial port and click **Go live** — or run
   `python -m dashboard.app --serial COM3` (use your port).

## Recording calibration data without custom code

You can also use the [Upside Down Labs Chords](https://chords.upsidedownlabs.tech/)
web app to visualise and record BioAmp signals over WebSerial, then replay the
exported CSV through the dashboard.
