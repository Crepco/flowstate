# Firmware

ESP32 Arduino sketch for reading the BioAmp EXG Pill output and streaming raw EEG samples to a host machine.

## Hardware wiring
- BioAmp EXG Pill output (yellow) → ESP32 ADC1 pin: `GPIO36` (VP) or `GPIO39` (VN), read via `analogRead(36)` / `analogRead(39)`
- BioAmp VCC → ESP32 3.3V
- BioAmp GND → ESP32 GND
- Electrode placement: forehead (Fp1/Fp2), reference on earlobe/mastoid

Avoid ADC2 pins (0, 2, 4, 12-15, 25-27) — they conflict with WiFi.

## Streaming options
- **Chords app**: use the [Upside Down Labs Chords](https://chords.upsidedownlabs.tech/) web app with the standard BioAmp/Chords firmware for visualization and recording without writing custom code.
- **Custom sketch**: sample at 250–500Hz and stream raw ADC values over serial/BLE for our own Python pipeline.

## TODO
- [ ] Add ESP32 Arduino sketch (`flowstate_eeg.ino`)
- [ ] Decide serial baud rate / packet format for custom streaming
