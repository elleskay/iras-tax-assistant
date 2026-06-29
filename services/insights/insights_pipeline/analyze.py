"""Turn clustered interactions into the three operational analyses.

The clusterer groups prompts purely by embedding similarity. We then describe
each cluster using the synthetic records that landed in it:

  - a human label (the dominant topic_label in the cluster)
  - size, retrieval health, eval health, and officer-effort metrics

From those cluster descriptors we derive:

  trainingNeeds        biggest clusters (most-asked) -> upskilling targets
  docGaps              clusters with poor retrieval and/or low eval scores
  processImprovements  clusters with the highest officer effort
"""

from __future__ import annotations

from collections import Counter
from statistics import mean
from typing import Sequence

import numpy as np


def _cluster_descriptors(records: Sequence[dict], labels: np.ndarray) -> list[dict]:
    """Aggregate per-cluster statistics."""

    by_cluster: dict[int, list[dict]] = {}
    for rec, lab in zip(records, labels):
        by_cluster.setdefault(int(lab), []).append(rec)

    descriptors: list[dict] = []
    for cid, recs in by_cluster.items():
        labels_in = Counter(r["topic_label"] for r in recs)
        dominant_label, _ = labels_in.most_common(1)[0]

        # representative example prompts: most "central" by frequency of
        # surface form, fall back to first few distinct prompts.
        prompt_counts = Counter(r["prompt"] for r in recs)
        examples = [p for p, _ in prompt_counts.most_common(3)]

        descriptors.append(
            {
                "cluster_id": cid,
                "label": dominant_label,
                "count": len(recs),
                "purity": labels_in.most_common(1)[0][1] / len(recs),
                "retrieval_hit_rate": mean(1.0 if r["retrieval_hit"] else 0.0 for r in recs),
                "avg_retrieval_score": mean(r["retrieval_score"] for r in recs),
                "avg_eval_score": mean(r["eval_score"] for r in recs),
                "avg_turns": mean(r["turn_count"] for r in recs),
                "avg_steps": mean(r["step_count"] for r in recs),
                "avg_time_seconds": mean(r["time_seconds"] for r in recs),
                "examples": examples,
            }
        )
    return descriptors


def _round(x: float, n: int = 1) -> float:
    return round(float(x), n)


def _training_recommendation(label: str, count: int) -> str:
    return (
        f"High query volume ({count} interactions) on “{label}”: add a "
        f"focused officer micro-training and a quick-reference job aid."
    )


def _doc_gap_reason(d: dict) -> str | None:
    hit_rate = d["retrieval_hit_rate"]
    eval_score = d["avg_eval_score"]
    if hit_rate < 0.5 and eval_score < 55:
        return (
            f"Low retrieval ({hit_rate * 100:.0f}% of queries hit the knowledge base) "
            f"and weak answers (avg eval {eval_score:.0f}/100): knowledge base is thin "
            f"or missing for this topic."
        )
    if hit_rate < 0.5:
        return (
            f"Only {hit_rate * 100:.0f}% of queries retrieve any source: documentation "
            f"coverage gap for this topic."
        )
    if eval_score < 55:
        return (
            f"Answers score poorly (avg eval {eval_score:.0f}/100) despite retrieval: "
            f"existing documentation is unclear or outdated."
        )
    return None


def analyse_workspace(
    records: Sequence[dict],
    labels: np.ndarray,
    *,
    top_training: int = 4,
    top_doc_gaps: int = 4,
    top_process: int = 4,
) -> dict:
    """Build trainingNeeds / docGaps / processImprovements for one workspace."""

    descriptors = _cluster_descriptors(records, labels)

    # ---- trainingNeeds: biggest clusters --------------------------------
    by_size = sorted(descriptors, key=lambda d: d["count"], reverse=True)
    training_needs = [
        {
            "label": d["label"],
            "count": d["count"],
            "examplePrompts": d["examples"],
            "recommendation": _training_recommendation(d["label"], d["count"]),
        }
        for d in by_size[:top_training]
    ]

    # ---- docGaps: poor retrieval and/or low eval ------------------------
    doc_candidates = []
    for d in descriptors:
        reason = _doc_gap_reason(d)
        if reason is not None:
            doc_candidates.append((d, reason))
    # worst first: lowest combined health
    doc_candidates.sort(key=lambda dr: dr[0]["retrieval_hit_rate"] + dr[0]["avg_eval_score"] / 100.0)
    doc_gaps = [
        {"topic": d["label"], "reason": reason, "count": d["count"]}
        for d, reason in doc_candidates[:top_doc_gaps]
    ]

    # ---- processImprovements: highest officer effort --------------------
    by_effort = sorted(
        descriptors,
        key=lambda d: (d["avg_turns"] + d["avg_steps"] + d["avg_time_seconds"] / 30.0),
        reverse=True,
    )
    process_improvements = [
        {
            "topic": d["label"],
            "avgTurns": _round(d["avg_turns"], 1),
            "avgSteps": _round(d["avg_steps"], 1),
            "avgTimeSeconds": _round(d["avg_time_seconds"], 0),
            "count": d["count"],
        }
        for d in by_effort[:top_process]
    ]

    return {
        "trainingNeeds": training_needs,
        "docGaps": doc_gaps,
        "processImprovements": process_improvements,
    }
