"""Bearer-token auth: enforced when RAG_SERVICE_TOKEN is set, open otherwise.

The `client` fixture (conftest.py) covers the open mode; every smoke test runs
without a token. This file covers the enforced mode.
"""

from __future__ import annotations

import tempfile
from pathlib import Path

import pytest

TOKEN = "test-secret-token"


@pytest.fixture()
def secured_client(monkeypatch: pytest.MonkeyPatch):
    tmp = Path(tempfile.mkdtemp(prefix="rag-auth-test-"))

    monkeypatch.setenv("RAG_FAKE_EMBEDDINGS", "1")
    monkeypatch.setenv("RAG_DATA_DIR", str(tmp))
    monkeypatch.setenv("RAG_SERVICE_TOKEN", TOKEN)
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.setenv("RAG_EMBED_DIM", "64")

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


def test_health_stays_open(secured_client):
    assert secured_client.get("/health").status_code == 200


def test_requests_without_token_are_rejected(secured_client):
    body = {"workspace": "gst", "query": "rates", "top_k": 1}
    assert secured_client.post("/search", json=body).status_code == 401
    assert (
        secured_client.post(
            "/search", json=body, headers={"Authorization": "Bearer wrong-token"}
        ).status_code
        == 401
    )
    assert secured_client.get("/workspaces/gst/documents").status_code == 401
    assert (
        secured_client.request(
            "DELETE", "/documents", json={"workspace": "gst", "doc_id": "d1"}
        ).status_code
        == 401
    )
    assert (
        secured_client.post(
            "/index",
            json={
                "workspace": "gst",
                "documents": [{"doc_id": "d1", "filename": "f.txt", "text": "x"}],
            },
        ).status_code
        == 401
    )


def test_requests_with_token_succeed(secured_client):
    headers = {"Authorization": f"Bearer {TOKEN}"}
    r = secured_client.post(
        "/index",
        json={
            "workspace": "gst",
            "documents": [
                {
                    "doc_id": "d1",
                    "filename": "f.txt",
                    "text": "Goods and Services Tax applies to most supplies.",
                }
            ],
        },
        headers=headers,
    )
    assert r.status_code == 200, r.text
    r = secured_client.post(
        "/search", json={"workspace": "gst", "query": "tax", "top_k": 1}, headers=headers
    )
    assert r.status_code == 200, r.text
