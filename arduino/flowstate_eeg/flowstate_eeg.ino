/*
 * FlowState — simple EEG streamer for Arduino UNO R4 (Renesas)
 *
 * Reads the BioAmp EXG Pill on A0 at a fixed sample rate and prints one
 * raw ADC value per line over USB serial. The Python pipeline reads these
 * lines, filters them (50 Hz notch + 1-40 Hz bandpass) and computes focus.
 *
 * Wiring (BioAmp EXG Pill -> UNO R4):
 *   Yellow (signal out) -> A0
 *   Red    (VCC)        -> 3.3V
 *   Black  (GND)        -> GND
 *
 * Electrodes: 2 active on forehead (Fp1/Fp2, above the eyebrows),
 *             1 reference on an earlobe or mastoid bone.
 *
 * In the dashboard, choose this port and click "Go live".
 *   Baud: 230400   Sample rate: 500 Hz   ADC: 14-bit
 */

const int   EEG_PIN     = A0;
const long  BAUD        = 230400;
const int   SAMPLE_RATE = 500;                 // Hz
const unsigned long SAMPLE_US = 1000000UL / SAMPLE_RATE;

unsigned long nextSample = 0;

void setup() {
  Serial.begin(BAUD);
  analogReadResolution(14);                     // UNO R4 supports 14-bit ADC
  nextSample = micros();
}

void loop() {
  unsigned long now = micros();
  if ((long)(now - nextSample) >= 0) {
    nextSample += SAMPLE_US;
    int value = analogRead(EEG_PIN);
    Serial.println(value);
  }
}
