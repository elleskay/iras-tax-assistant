"""KMeans clustering over normalised embeddings.

Uses ``sklearn.cluster.KMeans`` when available; otherwise a deterministic,
pure-numpy KMeans with k-means++ seeding. Because the embeddings are
L2-normalised, Euclidean KMeans approximates spherical / cosine clustering.
"""

from __future__ import annotations

import numpy as np


def _sklearn_kmeans(mat: np.ndarray, k: int, seed: int) -> np.ndarray | None:
    try:
        from sklearn.cluster import KMeans
    except Exception:
        return None
    try:
        km = KMeans(n_clusters=k, random_state=seed, n_init=10)
        return km.fit_predict(mat).astype(int)
    except Exception:
        return None


def _numpy_kmeans(
    mat: np.ndarray,
    k: int,
    seed: int,
    *,
    max_iter: int = 100,
) -> np.ndarray:
    rng = np.random.default_rng(seed)
    n = mat.shape[0]
    k = min(k, n)

    # k-means++ seeding
    centers = np.empty((k, mat.shape[1]), dtype=np.float32)
    first = int(rng.integers(n))
    centers[0] = mat[first]
    closest = np.linalg.norm(mat - centers[0], axis=1) ** 2
    for c in range(1, k):
        probs = closest / closest.sum() if closest.sum() > 0 else None
        idx = int(rng.choice(n, p=probs)) if probs is not None else int(rng.integers(n))
        centers[c] = mat[idx]
        dist = np.linalg.norm(mat - centers[c], axis=1) ** 2
        closest = np.minimum(closest, dist)

    labels = np.zeros(n, dtype=int)
    for _ in range(max_iter):
        # assign
        dists = np.linalg.norm(mat[:, None, :] - centers[None, :, :], axis=2)
        new_labels = dists.argmin(axis=1)
        if np.array_equal(new_labels, labels):
            labels = new_labels
            break
        labels = new_labels
        # update
        for c in range(k):
            members = mat[labels == c]
            if len(members) > 0:
                centers[c] = members.mean(axis=0)
    return labels


def kmeans_cluster(
    mat: np.ndarray,
    *,
    k: int = 8,
    seed: int = 42,
) -> tuple[np.ndarray, str]:
    """Cluster ``mat`` into ``k`` groups. Returns (labels, path_name)."""

    k = max(1, min(k, mat.shape[0]))
    labels = _sklearn_kmeans(mat, k, seed)
    if labels is not None:
        return labels, "sklearn/KMeans"
    return _numpy_kmeans(mat, k, seed), "numpy/kmeans"
