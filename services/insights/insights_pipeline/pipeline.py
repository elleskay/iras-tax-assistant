"""End-to-end pipeline: synth data -> embed -> cluster -> analyse -> JSON."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

from .analyze import analyse_workspace
from .cluster import kmeans_cluster
from .datagen import WORKSPACES, generate_workspace_interactions
from .embeddings import embed_prompts


def run_pipeline(
    *,
    prefer: str = "auto",
    k: int = 14,
    seed: int = 42,
    n: int | None = None,
    verbose: bool = False,
) -> dict:
    """Run the full pipeline and return the insights dict (not yet written).

    prefer: embedding path preference, see embeddings.embed_prompts.
    k:      KMeans clusters per workspace.
    n:      interactions per workspace (None => random 300-600, seeded).
    """

    out: dict = {}
    embed_path = cluster_path = "n/a"

    for ws in WORKSPACES:
        records = generate_workspace_interactions(ws, n=n, seed=seed)
        prompts = [r["prompt"] for r in records]

        matrix, embed_path = embed_prompts(prompts, prefer=prefer)
        labels, cluster_path = kmeans_cluster(matrix, k=k, seed=seed)
        analyses = analyse_workspace(records, labels)

        out[ws.key] = {
            "name": ws.name,
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "synthetic": True,
            "totalInteractions": len(records),
            **analyses,
        }

        if verbose:
            print(
                f"[{ws.key}] {len(records)} interactions | embed={embed_path} | "
                f"cluster={cluster_path} | "
                f"training={len(analyses['trainingNeeds'])} "
                f"docGaps={len(analyses['docGaps'])} "
                f"process={len(analyses['processImprovements'])}"
            )

    # surface the chosen paths under a meta key (does not break the required shape)
    out["_meta"] = {
        "embeddingPath": embed_path,
        "clusterPath": cluster_path,
        "note": "Synthetic demo data. See services/insights/README.md.",
    }
    return out


def write_insights(data: dict, path: Path) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return path
