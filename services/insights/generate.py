#!/usr/bin/env python3
"""CLI: run the operational-insights pipeline and write insights.json.

Usage:
    python generate.py                     # auto embed path, write default output
    python generate.py --prefer numpy      # force offline fallback
    python generate.py --out path.json     # custom output path
    python generate.py --k 8 --seed 42     # tuning knobs
"""

from __future__ import annotations

import argparse
from pathlib import Path

from insights_pipeline.pipeline import run_pipeline, write_insights

# default output: apps/web/public/insights.json relative to repo root
_DEFAULT_OUT = (
    Path(__file__).resolve().parents[2] / "apps" / "web" / "public" / "insights.json"
)


def main() -> None:
    ap = argparse.ArgumentParser(description="Operational-insights pipeline.")
    ap.add_argument(
        "--prefer",
        choices=["auto", "sklearn", "numpy"],
        default="auto",
        help="embedding path preference (default: auto)",
    )
    ap.add_argument("--k", type=int, default=14, help="KMeans clusters per workspace")
    ap.add_argument("--seed", type=int, default=42, help="random seed")
    ap.add_argument(
        "--n",
        type=int,
        default=None,
        help="interactions per workspace (default: random 300-600, seeded)",
    )
    ap.add_argument("--out", type=Path, default=_DEFAULT_OUT, help="output JSON path")
    args = ap.parse_args()

    data = run_pipeline(prefer=args.prefer, k=args.k, seed=args.seed, n=args.n, verbose=True)
    written = write_insights(data, args.out)
    print(f"\nWrote {written}")
    print(f"  embedding path: {data['_meta']['embeddingPath']}")
    print(f"  cluster path:   {data['_meta']['clusterPath']}")


if __name__ == "__main__":
    main()
