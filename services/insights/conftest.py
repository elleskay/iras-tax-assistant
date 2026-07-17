"""Make the insights_pipeline package importable when pytest runs from
services/insights/ (or from the repo root)."""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
