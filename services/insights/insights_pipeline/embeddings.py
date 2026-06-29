"""Prompt embeddings with graceful, fully-offline fallbacks.

Three paths, tried in order. The one that ran is reported so the README / output
can document it:

  1. ``sentence-transformers`` (all-MiniLM-L6-v2)  -- best semantic quality.
  2. ``sklearn`` TF-IDF                            -- deterministic, offline.
  3. pure-numpy hashing + char n-gram TF-IDF       -- always available.

Every path returns an L2-normalised float32 matrix of shape (n_prompts, dim)
plus a string naming the path, so KMeans (cosine via normalised vectors) works
the same downstream regardless of which embedder ran.
"""

from __future__ import annotations

import re
from typing import Sequence

import numpy as np

_TOKEN_RE = re.compile(r"[a-z0-9]+")

# Domain stop-words: extremely common across tax prompts, carry little signal.
_STOPWORDS = frozenset(
    """
    a an the is are was were be been being do does did how what which when who
    whom whose why where can could should would will shall may might must of to
    in on at for from with by as and or not no if then this that these those it
    its their his her them they i you we he she my your our me us still after
    before within between over under into out about against tax taxable income
    company individual taxpayer applies apply applied claim compute computed
    treated treatment require required does still must walk through me full
    """.split()
)


def _tokenize(text: str) -> list[str]:
    return [t for t in _TOKEN_RE.findall(text.lower()) if t not in _STOPWORDS and len(t) > 1]


def _l2_normalize(mat: np.ndarray) -> np.ndarray:
    norms = np.linalg.norm(mat, axis=1, keepdims=True)
    norms[norms == 0.0] = 1.0
    return (mat / norms).astype(np.float32)


# ---------------------------------------------------------------------------
# Path 1: sentence-transformers
# ---------------------------------------------------------------------------


def _embed_sentence_transformers(prompts: Sequence[str]) -> np.ndarray | None:
    try:
        from sentence_transformers import SentenceTransformer
    except Exception:
        return None
    try:
        model = SentenceTransformer("all-MiniLM-L6-v2")
        vecs = model.encode(list(prompts), normalize_embeddings=True, show_progress_bar=False)
        return _l2_normalize(np.asarray(vecs, dtype=np.float32))
    except Exception:
        # model weights not cached locally / offline -> fall through
        return None


# ---------------------------------------------------------------------------
# Path 2: sklearn TF-IDF
# ---------------------------------------------------------------------------


def _embed_sklearn_tfidf(prompts: Sequence[str]) -> np.ndarray | None:
    try:
        from sklearn.feature_extraction.text import TfidfVectorizer
    except Exception:
        return None
    try:
        vec = TfidfVectorizer(
            tokenizer=_tokenize,
            preprocessor=lambda x: x,
            token_pattern=None,
            ngram_range=(1, 2),
            min_df=1,
        )
        mat = vec.fit_transform(prompts).astype(np.float32).toarray()
        return _l2_normalize(mat)
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Path 3: pure-numpy hashing TF-IDF (always works)
# ---------------------------------------------------------------------------


def _embed_numpy_hashing(prompts: Sequence[str], dim: int = 512) -> np.ndarray:
    """Deterministic hashing vectoriser with IDF weighting, pure numpy.

    Uses word unigrams + bigrams hashed into a fixed-width space, weighted by
    a smoothed inverse document frequency. No external deps, no randomness.
    """

    n = len(prompts)
    tokenized: list[list[str]] = []
    for p in prompts:
        toks = _tokenize(p)
        bigrams = [f"{a}_{b}" for a, b in zip(toks, toks[1:])]
        tokenized.append(toks + bigrams)

    # document frequency per hashed bucket (for IDF)
    df = np.zeros(dim, dtype=np.float64)
    for toks in tokenized:
        seen: set[int] = set()
        for tok in toks:
            seen.add(_stable_hash(tok) % dim)
        for h in seen:
            df[h] += 1.0
    idf = np.log((n + 1.0) / (df + 1.0)) + 1.0

    mat = np.zeros((n, dim), dtype=np.float32)
    for i, toks in enumerate(tokenized):
        for tok in toks:
            h = _stable_hash(tok) % dim
            mat[i, h] += 1.0
        mat[i] *= idf
    return _l2_normalize(mat)


def _stable_hash(s: str) -> int:
    """Deterministic 32-bit FNV-1a hash (Python's builtin hash is salted)."""
    h = 0x811C9DC5
    for ch in s.encode("utf-8"):
        h ^= ch
        h = (h * 0x01000193) & 0xFFFFFFFF
    return h


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------


def embed_prompts(
    prompts: Sequence[str],
    *,
    prefer: str = "auto",
) -> tuple[np.ndarray, str]:
    """Embed prompts, returning (matrix, path_name).

    prefer:
        "auto"     -> try sentence-transformers, then sklearn, then numpy.
        "sklearn"  -> skip sentence-transformers (start at TF-IDF).
        "numpy"    -> force the pure-numpy fallback (used by the smoke test).
    """

    if prefer not in {"auto", "sklearn", "numpy"}:
        raise ValueError(f"unknown prefer={prefer!r}")

    if prefer == "auto":
        vecs = _embed_sentence_transformers(prompts)
        if vecs is not None:
            return vecs, "sentence-transformers/all-MiniLM-L6-v2"

    if prefer in {"auto", "sklearn"}:
        vecs = _embed_sklearn_tfidf(prompts)
        if vecs is not None:
            return vecs, "sklearn/TfidfVectorizer"

    return _embed_numpy_hashing(prompts), "numpy/hashing-tfidf"
