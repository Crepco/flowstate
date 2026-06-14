# Dashboard

Flask server + live web UI. It runs a data source in a background thread, feeds
the [FocusPipeline](../signal_processing/pipeline.py), and streams results to the
browser over **Server-Sent Events** (20×/sec).

## Modules

- [app.py](app.py) — Flask server + `Engine` (owns the pipeline, the source
  thread, and the compute loop). Serves the UI and the REST/SSE endpoints.
- [sources.py](sources.py) — interchangeable data sources: `CSVReplaySource`
  (no-hardware demo) and `SerialSource` (live Arduino).
- [session.py](session.py) — study-session tracking and the end-of-session summary.
- [coach.py](coach.py) — the Gemini-powered focus coach (grounded in session data,
  with an offline fallback).
- [static/](static/) — the front end: `index.html`, `style.css`, `app.js`
  (vanilla JS + Canvas, no framework).

## Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET  | `/` | the dashboard UI |
| GET  | `/stream` | SSE: live focus / band / wave packets |
| GET  | `/api/status` | one-shot status |
| GET  | `/api/ports` | available serial ports |
| POST | `/api/source` | switch source (`csv` / `serial`) |
| POST | `/api/calibrate` · `/cancel` · `/reset` | calibration control |
| POST | `/api/session/start` · `/stop` | study sessions |
| POST | `/api/chat` | ask the AI focus coach |
| GET  | `/api/coach` | whether the coach (Gemini) is configured |

## Run

```bash
python -m dashboard.app                 # CSV demo (auto-detects a recording)
python -m dashboard.app --serial COM3   # live Arduino
```
