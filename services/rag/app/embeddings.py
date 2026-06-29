"""Embedding model selection.

Production uses OpenAI ``text-embedding-3-small``. For offline tests we expose
a tiny deterministic fake embedding (hash-based) that requires no network and
no API key. The fake is selected via ``RAG_FAKE_EMBEDDINGS=1`` so the pytest
smoke test can run fully offline.
"""

from __future__ import annotations

import hashlib
import os

from llama_index.core.base.embeddings.base import BaseEmbedding

from .config import Settings


class DeterministicFakeEmbedding(BaseEmbedding):
    """A seeded, dependency-free embedding for offline testing.

    Produces a stable pseudo-random unit vector per input string by hashing the
    text. Same text -> same vector, so similarity search is meaningful enough
    for a smoke test without contacting any provider.
    """

    def __init__(self, dim: int = 1536, **kwargs: object) -> None:
        super().__init__(embed_dim=dim, model_name="deterministic-fake", **kwargs)

    # Pydantic v2 (LlamaIndex BaseEmbedding) — declare the extra field.
    embed_dim: int = 1536

    def _vector(self, text: str) -> list[float]:
        dim = self.embed_dim
        out: list[float] = []
        counter = 0
        # Expand the hash stream until we have `dim` floats.
        while len(out) < dim:
            digest = hashlib.sha256(f"{counter}:{text}".encode("utf-8")).digest()
            for i in range(0, len(digest), 4):
                if len(out) >= dim:
                    break
                chunk = int.from_bytes(digest[i : i + 4], "big")
                out.append((chunk / 0xFFFFFFFF) * 2.0 - 1.0)  # -> [-1, 1]
            counter += 1
        # L2-normalise so cosine similarity behaves.
        norm = sum(v * v for v in out) ** 0.5 or 1.0
        return [v / norm for v in out]

    def _get_query_embedding(self, query: str) -> list[float]:
        return self._vector(query)

    async def _aget_query_embedding(self, query: str) -> list[float]:
        return self._vector(query)

    def _get_text_embedding(self, text: str) -> list[float]:
        return self._vector(text)


def build_embed_model(settings: Settings) -> BaseEmbedding:
    """Return the embedding model appropriate for the current environment."""
    if os.getenv("RAG_FAKE_EMBEDDINGS") == "1":
        return DeterministicFakeEmbedding(dim=settings.embed_dim)

    if not settings.openai_api_key:
        raise RuntimeError(
            "OPENAI_API_KEY is not set. Set it, or set RAG_FAKE_EMBEDDINGS=1 for "
            "offline testing with deterministic fake embeddings."
        )

    # Imported lazily so the fake path has no hard dependency on the OpenAI integration.
    from llama_index.embeddings.openai import OpenAIEmbedding

    return OpenAIEmbedding(
        model=settings.embed_model,
        api_key=settings.openai_api_key,
    )
