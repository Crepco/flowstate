"""Offline sanity check for a ChordsWeb CSV.

Loads a recording, shows band powers BEFORE and AFTER filtering, and reports
how much the 50 Hz powerline peak shrank. This is the quickest way to confirm
real EEG is visible under the noise.

    python analyze_csv.py                      # auto-find a CSV
    python analyze_csv.py path/to/file.csv     # specific file
    python analyze_csv.py file.csv --fs 500 --powerline 50

Add --plot to save a before/after PSD figure (needs matplotlib).
"""

from __future__ import annotations

import argparse
import csv
from pathlib import Path

import numpy as np

from signal_processing import band_powers, clean_signal, engagement_index
from signal_processing.bands import BANDS


def load_csv(path, column="Channel1"):
    vals = []
    with open(path, newline="") as f:
        reader = csv.DictReader(f)
        col = column if column in (reader.fieldnames or []) else (reader.fieldnames or [""])[-1]
        for row in reader:
            try:
                vals.append(float(row[col]))
            except (ValueError, KeyError, TypeError):
                continue
    return np.asarray(vals, dtype=float)


def find_csv():
    here = Path(__file__).resolve().parent
    cand = list((here / "sample_data").glob("*.csv")) if (here / "sample_data").exists() else []
    dl = Path.home() / "Downloads"
    if dl.exists():
        cand += sorted(dl.glob("ChordsWeb-*.csv"), reverse=True)
    return str(cand[0]) if cand else None


def line_power(sig, fs, f0):
    return band_powers(sig, fs, bands={"line": (f0 - 1.5, f0 + 1.5)})["line"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("csv", nargs="?", help="CSV file (auto-detected if omitted)")
    ap.add_argument("--fs", type=int, default=500)
    ap.add_argument("--powerline", type=float, default=50.0)
    ap.add_argument("--plot", action="store_true")
    args = ap.parse_args()

    path = args.csv or find_csv()
    if not path:
        raise SystemExit("No CSV found. Pass a path: python analyze_csv.py file.csv")

    raw = load_csv(path)
    if raw.size < args.fs:
        raise SystemExit(f"Only {raw.size} samples — need at least ~{args.fs}.")
    print(f"\nFile: {path}")
    print(f"Samples: {raw.size}  ({raw.size / args.fs:.1f}s @ {args.fs} Hz)\n")

    cleaned = clean_signal(raw, args.fs, powerline=args.powerline)

    raw_p = band_powers(raw, args.fs)
    cln_p = band_powers(cleaned, args.fs)

    print(f"{'band':<8}{'raw':>14}{'filtered':>14}")
    print("-" * 36)
    for name in BANDS:
        print(f"{name:<8}{raw_p[name]:>14.3e}{cln_p[name]:>14.3e}")

    lr = line_power(raw, args.fs, args.powerline)
    lc = line_power(cleaned, args.fs, args.powerline)
    print("-" * 36)
    print(f"{args.powerline:.0f}Hz line{lr:>10.3e}{lc:>14.3e}")
    if lc > 0:
        print(f"\n50 Hz noise reduced ~{lr / lc:.0f}x by filtering.")
    print(f"Engagement (filtered): {engagement_index(cln_p):.3f}")
    print("  (only meaningful relative to YOUR calibration baseline)\n")

    if args.plot:
        try:
            import matplotlib.pyplot as plt
            from scipy.signal import welch
            fr, pr = welch(raw, fs=args.fs, nperseg=min(raw.size, args.fs))
            fc, pc = welch(cleaned, fs=args.fs, nperseg=min(cleaned.size, args.fs))
            plt.figure(figsize=(9, 4))
            plt.semilogy(fr, pr, label="raw", alpha=.6)
            plt.semilogy(fc, pc, label="filtered")
            plt.xlim(0, 60); plt.xlabel("Hz"); plt.ylabel("PSD"); plt.legend()
            plt.title("PSD before/after filtering"); plt.tight_layout()
            out = Path(path).with_suffix(".psd.png")
            plt.savefig(out, dpi=120)
            print(f"Saved plot -> {out}")
        except ImportError:
            print("matplotlib not installed — skipping plot.")


if __name__ == "__main__":
    main()
