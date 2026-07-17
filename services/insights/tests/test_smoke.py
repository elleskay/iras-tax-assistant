"""Offline smoke test for the insights pipeline.

Forces the deterministic pure-numpy embedding + numpy KMeans fallback so the
test runs with no optional dependencies installed, then asserts the output JSON
has all three analysis sections for both workspaces.

Run from services/insights/:
    pytest -q
"""

from __future__ import annotations

import json

# Package import path is handled by services/insights/conftest.py.
from insights_pipeline.datagen import WORKSPACES
from insights_pipeline.pipeline import run_pipeline, write_insights

_WORKSPACE_KEYS = {"individual-income", "corporate"}
_SECTIONS = ("trainingNeeds", "docGaps", "processImprovements")


def test_workspaces_defined():
    keys = {ws.key for ws in WORKSPACES}
    assert keys == _WORKSPACE_KEYS


def test_pipeline_runs_offline_fallback():
    data = run_pipeline(prefer="numpy", k=8, seed=7, n=400)

    # deterministic fallback should be reported
    assert data["_meta"]["embeddingPath"] == "numpy/hashing-tfidf"
    assert data["_meta"]["clusterPath"] in {"numpy/kmeans", "sklearn/KMeans"}

    for key in _WORKSPACE_KEYS:
        assert key in data, f"missing workspace {key}"
        ws = data[key]
        assert ws["synthetic"] is True
        assert ws["totalInteractions"] == 400
        assert isinstance(ws["generatedAt"], str) and ws["generatedAt"]

        for section in _SECTIONS:
            assert section in ws, f"{key} missing {section}"
            assert isinstance(ws[section], list)
            assert len(ws[section]) >= 1, f"{key}.{section} is empty"

        # shape checks
        for tn in ws["trainingNeeds"]:
            assert {"label", "count", "examplePrompts", "recommendation"} <= tn.keys()
            assert isinstance(tn["examplePrompts"], list) and tn["examplePrompts"]
            assert isinstance(tn["count"], int) and tn["count"] > 0
        for dg in ws["docGaps"]:
            assert {"topic", "reason", "count"} <= dg.keys()
        for pi in ws["processImprovements"]:
            assert {"topic", "avgTurns", "avgSteps", "avgTimeSeconds", "count"} <= pi.keys()

        # clusters sharing a dominant label are merged, so no section may list
        # the same topic twice (the pre-merge pipeline shipped duplicates)
        training_labels = [tn["label"] for tn in ws["trainingNeeds"]]
        assert len(training_labels) == len(set(training_labels))
        for section in ("docGaps", "processImprovements"):
            topics = [item["topic"] for item in ws[section]]
            assert len(topics) == len(set(topics)), f"{key}.{section} has duplicate topics"


def test_process_improvements_reflect_high_effort(tmp_path):
    """The story should hold: process-improvement topics cost real effort."""
    data = run_pipeline(prefer="numpy", k=8, seed=7, n=500)
    for key in _WORKSPACE_KEYS:
        ws = data[key]
        top_process_turns = max(pi["avgTurns"] for pi in ws["processImprovements"])
        # process improvements should reflect genuinely high effort
        assert top_process_turns >= 3.0

    # JSON round-trips and is writeable
    out = tmp_path / "insights.json"
    write_insights(data, out)
    reloaded = json.loads(out.read_text(encoding="utf-8"))
    assert set(_WORKSPACE_KEYS) <= set(reloaded.keys())
