"""Offline test configuration.

Forces the LOCAL fallback vector store (no DATABASE_URL) and deterministic
fake embeddings (no OPENAI_API_KEY, no network). Settings are read at import
time, so we set env vars *before* importing the app and reset cached singletons.
"""

from __future__ import annotations

import os
import tempfile
from pathlib import Path

import pytest


@pytest.fixture()
def client(monkeypatch: pytest.MonkeyPatch):
    tmp = Path(tempfile.mkdtemp(prefix="rag-test-"))

    monkeypatch.setenv("RAG_FAKE_EMBEDDINGS", "1")
    monkeypatch.setenv("RAG_DATA_DIR", str(tmp))
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    # Smaller vectors keep the fake embedding fast.
    monkeypatch.setenv("RAG_EMBED_DIM", "64")

    # Import after env is set, and clear caches so settings are re-read.
    from app.config import get_settings
    from app.indexer import reset_index_manager

    get_settings.cache_clear()
    reset_index_manager()

    from fastapi.testclient import TestClient

    from app.main import app

    with TestClient(app) as c:
        yield c

    get_settings.cache_clear()
    reset_index_manager()
