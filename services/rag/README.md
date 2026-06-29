# RAG microservice (`services/rag`)

A standalone, multi-tenant Retrieval-Augmented-Generation service for the IRAS
Tax Assistant platform. Each **workspace** is a tax type (e.g.
`individual-income`, `corporate`, `gst`) and has a fully isolated vector index.

**Stack:** FastAPI + LlamaIndex + pgvector (Postgres). Embeddings via OpenAI
`text-embedding-3-small`. When `DATABASE_URL` is unset, the service
automatically falls back to a local, file-persisted vector store so it runs with
**zero external dependencies**.

---

## Multi-tenancy model

Every operation is keyed by a `workspace` string and isolation is **physical**:

- **pgvector backend** — one Postgres table per workspace (`data_rag_<workspace>`).
  Separate tables guarantee no cross-tenant leakage and make per-workspace
  listing/deletion trivial. This is the cleaner, more LlamaIndex-idiomatic
  approach versus a single shared table with a `workspace` metadata filter on
  every query (which is also supported by LlamaIndex via `MetadataFilters`, but
  pushes correctness onto every read path).
- **local backend** — one `SimpleVectorStore` + `StorageContext` persisted under
  `./.data/<workspace>/`.

In both backends every chunk carries `doc_id`, `filename`, and `location`
metadata, used for citations and for delete/list-by-document.

Workspace keys are validated (`^[a-zA-Z0-9][a-zA-Z0-9_-]{0,62}$`) and normalised
(`-` → `_`, lowercased) into table/path-safe names.

---

## HTTP contract

All bodies are JSON. Base URL is the service root.

### `GET /health`
Response `200`:
```json
{ "status": "ok", "backend": "local" }
```
`backend` is `"local"` or `"pgvector"`.

### `POST /index`
Request:
```json
{
  "workspace": "individual-income",
  "documents": [
    { "doc_id": "doc-1", "filename": "reliefs.pdf", "text": "full plain text ..." }
  ]
}
```
Response `200`:
```json
{ "workspace": "individual-income", "indexed_docs": 1, "indexed_chunks": 7 }
```
Re-indexing an existing `doc_id` is an **upsert** (old chunks are removed first).

### `POST /search`
Request (`top_k` optional, default 5, range 1–50):
```json
{ "workspace": "individual-income", "query": "earned income relief", "top_k": 5 }
```
Response `200`:
```json
{
  "results": [
    {
      "text": "Earned Income Relief is granted to ...",
      "score": 0.83,
      "source": { "doc_id": "doc-1", "filename": "reliefs.pdf", "location": "chunk 2" }
    }
  ]
}
```

### `DELETE /documents`
Request:
```json
{ "workspace": "individual-income", "doc_id": "doc-1" }
```
Response `200`:
```json
{ "workspace": "individual-income", "doc_id": "doc-1", "deleted_chunks": 7 }
```

### `GET /workspaces/{workspace}/documents`
Response `200`:
```json
{
  "workspace": "individual-income",
  "documents": [
    { "doc_id": "doc-1", "filename": "reliefs.pdf", "chunk_count": 7 }
  ]
}
```

### Errors
- `400` — invalid input (e.g. bad workspace key): `{ "detail": "..." }`
- `422` — request body fails pydantic validation (FastAPI default).
- `500` — backend failure (DB/OpenAI): `{ "detail": "..." }`

---

## Environment variables

| Var | Required | Default | Purpose |
|-----|----------|---------|---------|
| `OPENAI_API_KEY` | yes (real embeddings) | – | OpenAI key for `text-embedding-3-small`. |
| `DATABASE_URL` | no | – | Postgres + pgvector connection string. **Unset → local fallback.** |
| `PORT` | no | `8000` | HTTP bind port. |
| `RAG_EMBED_MODEL` | no | `text-embedding-3-small` | Embedding model id. |
| `RAG_EMBED_DIM` | no | `1536` | Embedding dimensions (must match the model). |
| `RAG_CHUNK_SIZE` | no | `512` | Sentence-splitter chunk size (tokens). |
| `RAG_CHUNK_OVERLAP` | no | `64` | Chunk overlap (tokens). |
| `RAG_DATA_DIR` | no | `./.data` | Local fallback persistence dir. |
| `RAG_FAKE_EMBEDDINGS` | no | – | `1` → deterministic offline embeddings (tests only). |

---

## Run locally

### Without Postgres (local fallback, zero deps beyond pip)
```bash
cd services/rag
python -m venv .venv && . .venv/Scripts/activate   # PowerShell: .venv\Scripts\Activate.ps1
pip install -r requirements.txt

export OPENAI_API_KEY=sk-...        # needed for real embeddings
# DATABASE_URL intentionally unset -> local ./.data store
uvicorn app.main:app --reload --port 8000
```

### With Postgres + pgvector
```bash
# 1. Have a Postgres with the pgvector extension:
#    CREATE EXTENSION IF NOT EXISTS vector;
export DATABASE_URL="postgresql://user:pass@localhost:5432/rag?sslmode=disable"
export OPENAI_API_KEY=sk-...
uvicorn app.main:app --reload --port 8000
```
Tables are created automatically on first index per workspace.

### Quick check
```bash
curl localhost:8000/health
curl -X POST localhost:8000/index -H 'content-type: application/json' \
  -d '{"workspace":"individual-income","documents":[{"doc_id":"d1","filename":"a.txt","text":"Earned income relief is granted to employed individuals."}]}'
curl -X POST localhost:8000/search -H 'content-type: application/json' \
  -d '{"workspace":"individual-income","query":"income relief","top_k":3}'
```

---

## Tests (offline)

The smoke test uses the local fallback + deterministic fake embeddings — no
network, no DB, no API key.

```bash
cd services/rag
pip install -r requirements-dev.txt
RAG_FAKE_EMBEDDINGS=1 pytest        # the fixture also sets this automatically
```

---

## Deploy to Fly.io backed by Neon Postgres (pgvector)

1. **Create the Neon database and enable pgvector.**
   - Create a project at <https://neon.tech>, copy the pooled connection string.
   - In the Neon SQL editor run:
     ```sql
     CREATE EXTENSION IF NOT EXISTS vector;
     ```

2. **Create the Fly app** (uses the bundled `fly.toml` / `Dockerfile`):
   ```bash
   cd services/rag
   fly launch --no-deploy        # accept the existing fly.toml; pick an app name/region
   ```

3. **Set secrets** (never commit these):
   ```bash
   fly secrets set OPENAI_API_KEY=sk-...
   fly secrets set DATABASE_URL="postgresql://USER:PASSWORD@HOST/DB?sslmode=require"
   ```

4. **Deploy:**
   ```bash
   fly deploy
   ```
   `fly.toml` keeps exactly **one always-warm machine** (`min_machines_running = 1`,
   auto stop/start disabled) and health-checks `GET /health` on internal port
   `8080`.

5. **Verify:**
   ```bash
   fly status
   curl https://<your-app>.fly.dev/health
   ```

> Note: on Fly the container filesystem is ephemeral. Always set `DATABASE_URL`
> in production so vectors live in Neon, not the local `.data` dir.

---

## Layout

```
services/rag/
├── app/
│   ├── __init__.py
│   ├── config.py       # env-driven Settings; pgvector-vs-local switch
│   ├── models.py       # pydantic request/response models (the contract)
│   ├── embeddings.py   # OpenAI embeddings + offline deterministic fake
│   ├── indexer.py      # IndexManager: per-workspace index/search/delete/list
│   └── main.py         # FastAPI app + routes
├── tests/
│   ├── conftest.py     # forces local + fake embeddings
│   └── test_smoke.py   # index -> search -> list -> delete, offline
├── requirements.txt
├── requirements-dev.txt
├── Dockerfile
├── fly.toml
├── .env.example
└── README.md
```
