"""Operational-insights pipeline for the IRAS Tax Assistant platform demo.

Mines the platform's own (synthetic) officer-interaction telemetry to produce
operational intelligence per workspace (tax type):

  - trainingNeeds        most-asked prompt clusters
  - docGaps              clusters with poor retrieval / low eval scores
  - processImprovements  clusters with the highest officer effort

The data is clearly labelled ``synthetic`` because live usage is too sparse
for a demo.
"""

from .datagen import WORKSPACES, generate_workspace_interactions
from .embeddings import embed_prompts
from .cluster import kmeans_cluster
from .analyze import analyse_workspace
from .pipeline import run_pipeline

__all__ = [
    "WORKSPACES",
    "generate_workspace_interactions",
    "embed_prompts",
    "kmeans_cluster",
    "analyse_workspace",
    "run_pipeline",
]
