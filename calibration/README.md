# Calibration

Per-user calibration and the stored model. EEG differs hugely between people, so
an absolute focus threshold would be meaningless — calibration tunes the score to
*your* brain and lets us report a relative change from your personal baseline.

## Routine (from the dashboard)

1. Click **Capture focused** and do ~60s of hard focused reading.
2. Click **Capture zoned-out** and let your mind wander for ~60s.
3. FlowState records the engagement baseline and feature windows for each state.
4. Once both states have enough windows, it trains a logistic-regression
   classifier on them and switches the score to the learned model.

You can re-record either state at any time to retrain, or **Reset / retrain** to
start over.

## Storage

- `model.json` — the trained per-user model (baselines + classifier weights).
  Written after calibration and reloaded on restart. Git-ignored.
- `data/` — scratch space for recorded calibration sessions. Git-ignored
  (except `.gitkeep`).

## Why this matters

There's no universal "zoning out" signature — an alpha increase can mean
relaxed focus, drowsiness, *or* mind-wandering. Calibrating against your own two
states is what makes the score meaningful and honest.
