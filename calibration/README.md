# Calibration

Per-user baseline calibration routine and stored calibration data.

## Why
There's no universal "zoning out" signature — alpha increase can mean relaxed-focus, drowsiness, or mind-wandering. Calibration lets us frame results as a **relative change from personal baseline** rather than an absolute focused/unfocused classification.

## Routine
1. User does 1 minute of focused reading
2. User does 1 minute of deliberate zoning out (e.g. staring blankly, mind-wandering)
3. Compute baseline band powers and engagement index for both states
4. Use these to set personal thresholds for the focus score

## Storage
- `data/` — recorded calibration sessions per user (raw + processed)

## TODO
- [ ] Define calibration session file format
- [ ] Calibration script (record + compute baseline thresholds)
