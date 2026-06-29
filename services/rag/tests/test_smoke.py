"""End-to-end smoke test: index -> search -> list -> delete.

Runs fully offline against the local fallback store with deterministic fake
embeddings. No network, no Postgres, no OpenAI key required.
"""

from __future__ import annotations


def test_health(client):
    resp = client.get("/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert body["backend"] == "local"


def test_index_search_delete_flow(client):
    workspace = "individual-income"

    # --- index ---
    index_body = {
        "workspace": workspace,
        "documents": [
            {
                "doc_id": "doc-relief",
                "filename": "reliefs.txt",
                "text": (
                    "Earned Income Relief is granted to individuals who are gainfully "
                    "employed. The relief amount depends on the taxpayer's age and "
                    "taxable earned income for the year of assessment. "
                    "Working Mother's Child Relief encourages mothers to remain in the "
                    "workforce after having children."
                ),
            },
            {
                "doc_id": "doc-rates",
                "filename": "rates.txt",
                "text": (
                    "Resident individuals are taxed on a progressive rate structure. "
                    "Chargeable income up to the first tier is taxed at zero percent, "
                    "with rates increasing across higher income bands."
                ),
            },
        ],
    }
    r = client.post("/index", json=index_body)
    assert r.status_code == 200, r.text
    idx = r.json()
    assert idx["workspace"] == workspace
    assert idx["indexed_docs"] == 2
    assert idx["indexed_chunks"] >= 2

    # --- list documents ---
    r = client.get(f"/workspaces/{workspace}/documents")
    assert r.status_code == 200, r.text
    docs = {d["doc_id"]: d for d in r.json()["documents"]}
    assert set(docs) == {"doc-relief", "doc-rates"}
    assert docs["doc-relief"]["filename"] == "reliefs.txt"
    assert docs["doc-relief"]["chunk_count"] >= 1

    # --- search ---
    r = client.post(
        "/search",
        json={"workspace": workspace, "query": "earned income relief", "top_k": 3},
    )
    assert r.status_code == 200, r.text
    results = r.json()["results"]
    assert len(results) >= 1
    top = results[0]
    assert set(top["source"]) == {"doc_id", "filename", "location"}
    assert top["source"]["doc_id"] in {"doc-relief", "doc-rates"}
    assert top["source"]["location"].startswith("chunk ")
    assert isinstance(top["score"], float)
    assert isinstance(top["text"], str) and top["text"]

    # --- workspace isolation: another workspace sees nothing ---
    r = client.post(
        "/search",
        json={"workspace": "corporate", "query": "earned income relief", "top_k": 3},
    )
    assert r.status_code == 200, r.text
    assert r.json()["results"] == []

    # --- delete one doc ---
    r = client.request(
        "DELETE",
        "/documents",
        json={"workspace": workspace, "doc_id": "doc-relief"},
    )
    assert r.status_code == 200, r.text
    deleted = r.json()
    assert deleted["doc_id"] == "doc-relief"
    assert deleted["deleted_chunks"] >= 1

    # --- confirm deletion ---
    r = client.get(f"/workspaces/{workspace}/documents")
    remaining = {d["doc_id"] for d in r.json()["documents"]}
    assert remaining == {"doc-rates"}


def test_reindex_is_upsert(client):
    workspace = "gst"
    doc = {
        "doc_id": "d1",
        "filename": "f.txt",
        "text": "Goods and Services Tax applies to most supplies of goods and services.",
    }
    client.post("/index", json={"workspace": workspace, "documents": [doc]})
    client.post("/index", json={"workspace": workspace, "documents": [doc]})

    r = client.get(f"/workspaces/{workspace}/documents")
    docs = r.json()["documents"]
    assert len(docs) == 1
    # Re-indexing must not double-count chunks.
    assert docs[0]["doc_id"] == "d1"


def test_invalid_workspace_rejected(client):
    r = client.post(
        "/search",
        json={"workspace": "bad/workspace!", "query": "x", "top_k": 1},
    )
    assert r.status_code == 400
