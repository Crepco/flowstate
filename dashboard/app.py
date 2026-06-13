"""FlowState dashboard server.

Runs a data source in a background thread, feeds the FocusPipeline, and serves:

  GET  /                     the dashboard UI
  GET  /stream               Server-Sent Events: live focus/band/wave packets
  GET  /api/status           one-shot status
  GET  /api/ports            available serial ports
  POST /api/source           switch source: {"kind":"csv"|"serial", ...}
  POST /api/calibrate        {"label":"focused"|"zoned","seconds":60}
  POST /api/calibrate/cancel
  POST /api/calibrate/reset

Run:
    python -m dashboard.app                 # CSV demo (auto-detects a CSV)
    python -m dashboard.app --serial COM3   # live Arduino
"""

from __future__ import annotations

import argparse
import json
import threading
import time
from pathlib import Path

from flask import Flask, Response, jsonify, request, send_from_directory

from signal_processing import FocusPipeline
from .sources import CSVReplaySource, SerialSource, list_serial_ports

HERE = Path(__file__).resolve().parent
STATIC = HERE / "static"
ROOT = HERE.parent


class Engine:
    """Owns the pipeline + the active source thread, and the latest packet."""

    def __init__(self, fs=500, powerline=50.0):
        self.fs = fs
        self.powerline = powerline
        model_path = ROOT / "calibration" / "model.json"
        self.pipeline = FocusPipeline(fs=fs, powerline=powerline,
                                      model_path=model_path)
        self._lock = threading.Lock()
        self._latest = self.pipeline.compute()
        self._stop = threading.Event()
        self._thread = None
        self.source = None
        self.source_name = "none"
        self._compute_thread = threading.Thread(target=self._compute_loop, daemon=True)
        self._compute_thread.start()

    def set_source(self, source):
        # Stop any running source.
        if self._thread and self._thread.is_alive():
            self._stop.set()
            self._thread.join(timeout=2)
        self._stop = threading.Event()
        self.source = source
        self.source_name = source.name
        self.fs = source.fs
        self.pipeline.fs = source.fs
        self.pipeline.window_n = int(2.0 * source.fs)
        self._thread = threading.Thread(target=self._read_loop, daemon=True)
        self._thread.start()

    def _read_loop(self):
        try:
            for chunk in self.source.stream(self._stop):
                self.pipeline.add_samples(chunk)
        except Exception as exc:  # surface source errors in the packet
            with self._lock:
                self._latest = {**self._latest, "source_error": str(exc)}

    def _compute_loop(self):
        while True:
            packet = self.pipeline.compute()
            packet["source"] = self.source_name
            with self._lock:
                self._latest = packet
            time.sleep(0.05)  # 20 Hz UI updates

    def latest(self):
        with self._lock:
            return dict(self._latest)


engine = Engine()
app = Flask(__name__, static_folder=None)


# ----------------------------------------------------------------------- pages
@app.route("/")
def index():
    return send_from_directory(STATIC, "index.html")


@app.route("/static/<path:fname>")
def static_files(fname):
    return send_from_directory(STATIC, fname)


# ------------------------------------------------------------------------- API
@app.route("/stream")
def stream():
    def gen():
        last = 0.0
        while True:
            pkt = engine.latest()
            yield f"data: {json.dumps(pkt)}\n\n"
            time.sleep(0.05)
            last = pkt.get("t", last)
    return Response(gen(), mimetype="text/event-stream",
                    headers={"Cache-Control": "no-cache",
                             "X-Accel-Buffering": "no"})


@app.route("/api/status")
def status():
    return jsonify(engine.latest())


@app.route("/api/ports")
def ports():
    return jsonify({"ports": list_serial_ports()})


@app.route("/api/source", methods=["POST"])
def set_source():
    data = request.get_json(force=True, silent=True) or {}
    kind = data.get("kind", "csv")
    try:
        if kind == "csv":
            path = data.get("path") or _default_csv()
            if not path:
                return jsonify({"ok": False, "error": "no CSV found"}), 400
            fs = int(data.get("fs", 500))
            engine.set_source(CSVReplaySource(path, fs=fs))
        elif kind == "serial":
            port = data.get("port")
            if not port:
                return jsonify({"ok": False, "error": "port required"}), 400
            engine.set_source(SerialSource(port, baud=int(data.get("baud", 230400)),
                                           fs=int(data.get("fs", 500))))
        else:
            return jsonify({"ok": False, "error": f"unknown kind {kind}"}), 400
    except Exception as exc:
        return jsonify({"ok": False, "error": str(exc)}), 400
    return jsonify({"ok": True, "source": engine.source_name})


@app.route("/api/calibrate", methods=["POST"])
def calibrate():
    data = request.get_json(force=True, silent=True) or {}
    label = data.get("label")
    seconds = int(data.get("seconds", 60))
    try:
        engine.pipeline.start_calibration(label, seconds=seconds)
    except ValueError as exc:
        return jsonify({"ok": False, "error": str(exc)}), 400
    return jsonify({"ok": True, "label": label, "seconds": seconds})


@app.route("/api/calibrate/cancel", methods=["POST"])
def calibrate_cancel():
    engine.pipeline.cancel_calibration()
    return jsonify({"ok": True})


@app.route("/api/calibrate/reset", methods=["POST"])
def calibrate_reset():
    engine.pipeline.reset_calibration()
    return jsonify({"ok": True})


# ----------------------------------------------------------------------- utils
def _default_csv():
    """Find a CSV to demo with: project sample, then a ChordsWeb file in Downloads."""
    candidates = list((ROOT / "sample_data").glob("*.csv")) if (ROOT / "sample_data").exists() else []
    downloads = Path.home() / "Downloads"
    if downloads.exists():
        candidates += sorted(downloads.glob("ChordsWeb-*.csv"), reverse=True)
    return str(candidates[0]) if candidates else None


def main():
    ap = argparse.ArgumentParser(description="FlowState dashboard")
    ap.add_argument("--serial", help="serial port for live mode, e.g. COM3")
    ap.add_argument("--csv", help="CSV file to replay")
    ap.add_argument("--baud", type=int, default=230400)
    ap.add_argument("--fs", type=int, default=500)
    ap.add_argument("--powerline", type=float, default=50.0)
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=5000)
    args = ap.parse_args()

    engine.powerline = args.powerline
    engine.pipeline.powerline = args.powerline

    if args.serial:
        engine.set_source(SerialSource(args.serial, baud=args.baud, fs=args.fs))
    else:
        csv_path = args.csv or _default_csv()
        if csv_path:
            engine.set_source(CSVReplaySource(csv_path, fs=args.fs))
            print(f"[FlowState] Replaying {csv_path}")
        else:
            print("[FlowState] No CSV found - pick a source in the UI.")

    print(f"[FlowState] Dashboard at http://{args.host}:{args.port}")
    app.run(host=args.host, port=args.port, threaded=True, debug=False)


if __name__ == "__main__":
    main()
