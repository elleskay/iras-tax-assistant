"""Runtime configuration for the RAG microservice.

Settings are read from environment variables once at import time. The single
most important switch is ``DATABASE_URL``: when present we use pgvector
(Postgres) as the vector store; when absent we fall back to a fully local,
file-persisted ``SimpleVectorStore`` so the service runs with zero external
dependencies (handy for tests and local demos).
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path


@dataclass(frozen=True, slots=True)
class Settings:
    """Immutable, typed view over the process environment."""

    openai_api_key: str | None
    database_url: str | None
    embed_model: str
    embed_dim: int
    chunk_size: int
    chunk_overlap: int
    data_dir: Path
    port: int

    @property
    def use_pgvector(self) -> bool:
        """True when a Postgres connection string is configured."""
        return bool(self.database_url)

    @property
    def storage_backend(self) -> str:
        return "pgvector" if self.use_pgvector else "local"


def _get_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return default
    try:
        return int(raw)
    except ValueError as exc:  # pragma: no cover - defensive
        raise ValueError(f"Environment variable {name} must be an integer, got {raw!r}") from exc


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return process-wide settings (cached)."""
    data_dir = Path(os.getenv("RAG_DATA_DIR", "./.data")).resolve()
    return Settings(
        openai_api_key=os.getenv("OPENAI_API_KEY"),
        database_url=os.getenv("DATABASE_URL"),
        embed_model=os.getenv("RAG_EMBED_MODEL", "text-embedding-3-small"),
        # text-embedding-3-small is 1536-dim. Keep this in sync with the model.
        embed_dim=_get_int("RAG_EMBED_DIM", 1536),
        # Small chunks so a citation pinpoints the specific fact/line, not the
        # whole short document. These guidance notes are only a few hundred
        # tokens, so 512 kept each file as a single chunk.
        chunk_size=_get_int("RAG_CHUNK_SIZE", 96),
        chunk_overlap=_get_int("RAG_CHUNK_OVERLAP", 16),
        data_dir=data_dir,
        port=_get_int("PORT", 8000),
    )
