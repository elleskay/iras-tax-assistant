"""Workspace-keyed RAG indexing and retrieval.

Multi-tenancy model
-------------------
Each ``workspace`` (tax type) is kept in its own isolated index:

* **pgvector backend**: one Postgres table per workspace. ``PGVectorStore`` is
  instantiated with ``table_name=f"rag_{workspace}"``. Physical table isolation
  is the cleanest, most LlamaIndex-idiomatic way to guarantee no cross-tenant
  leakage and keeps per-workspace deletion / listing simple. (LlamaIndex
  prefixes the table with ``data_`` internally, so the real relation is
  ``data_rag_<workspace>``.)
* **local backend**: one ``SimpleVectorStore`` persisted under
  ``<data_dir>/<workspace>/`` via the default ``StorageContext`` persistence.

In both backends every chunk also carries ``doc_id`` / ``filename`` metadata so
we can (a) cite sources and (b) delete or list by document.

The ``IndexManager`` caches one ``VectorStoreIndex`` per workspace per process.
Mutations (index/delete) are serialised per workspace; searches stay lock-free.
"""

from __future__ import annotations

import re
import threading
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlparse

from llama_index.core import (
    Document,
    StorageContext,
    VectorStoreIndex,
    load_index_from_storage,
)
from llama_index.core.node_parser import SentenceSplitter
from llama_index.core.schema import MetadataMode, TextNode
from llama_index.core.vector_stores.types import BasePydanticVectorStore

from .config import Settings
from .embeddings import build_embed_model
from .models import DocumentSummary, SearchResult, SourceRef

# Lowercase only: the workspace key doubles as a Postgres table suffix and a
# directory name, both created via `.replace("-", "_")`. Accepting mixed case
# and then lowercasing would silently merge "Corp" and "corp" into one index.
# ("a-b" and "a_b" still collide; the web app only ever produces hyphens.)
_WORKSPACE_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{0,62}$")

# libpq connection parameters that psycopg2 understands but asyncpg does not.
_LIBPQ_QUERY_PARAMS = {"sslmode", "channel_binding", "connect_timeout", "application_name"}


class WorkspaceValidationError(ValueError):
    """Raised for an invalid workspace key; mapped to HTTP 400 in main.py."""


def _validate_workspace(workspace: str) -> str:
    if not _WORKSPACE_RE.match(workspace):
        raise WorkspaceValidationError(
            "Invalid workspace key. Use 1-63 chars: lowercase letters, digits, "
            "'-' or '_', starting alphanumeric."
        )
    # Normalise to a Postgres-/path-safe table suffix.
    return workspace.replace("-", "_")


def _is_undefined_table(exc: Exception) -> bool:
    """True when the error is Postgres 42P01 (relation does not exist)."""
    code = getattr(exc, "pgcode", None) or getattr(exc, "sqlstate", None)
    return code == "42P01" or type(exc).__name__ == "UndefinedTable"


class IndexManager:
    """Owns per-workspace indices and the active vector-store backend."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._embed_model = build_embed_model(settings)
        self._splitter = SentenceSplitter(
            chunk_size=settings.chunk_size,
            chunk_overlap=settings.chunk_overlap,
        )
        self._indices: dict[str, VectorStoreIndex] = {}
        self._lock = threading.Lock()
        # One mutation lock per workspace: concurrent /index or /documents
        # DELETE calls for the same workspace would otherwise interleave
        # delete/insert and race the local persist() rewrite.
        self._ws_locks: dict[str, threading.Lock] = {}

    @property
    def backend(self) -> str:
        return self._settings.storage_backend

    # ------------------------------------------------------------------ #
    # Backend construction
    # ------------------------------------------------------------------ #
    def _pg_table(self, safe_ws: str) -> str:
        return f"rag_{safe_ws}"

    def _pg_connection_strings(self) -> tuple[str, str]:
        """Build explicit sync/async SQLAlchemy URLs from ``DATABASE_URL``.

        Assembling the URLs ourselves (instead of letting ``from_params``
        rebuild them) fixes two quirks: Neon's pooled endpoint has no explicit
        port, and libpq-only query params (sslmode, channel_binding) must reach
        the psycopg2 URL but would break asyncpg, so the async URL drops them.
        Dropping sslmode entirely (the previous behavior) silently downgraded
        TLS enforcement to psycopg2's default "prefer".
        """
        url = urlparse(self._settings.database_url or "")
        # urlparse does not percent-decode userinfo, so pass it through as-is.
        user = url.username or ""
        password = url.password or ""
        host = url.hostname or "localhost"
        port = url.port or 5432
        database = (url.path or "/postgres").lstrip("/") or "postgres"
        base = f"{user}:{password}@{host}:{port}/{database}"

        libpq_params = [(k, v) for k, v in parse_qsl(url.query) if k in _LIBPQ_QUERY_PARAMS]
        sync_query = f"?{urlencode(libpq_params)}" if libpq_params else ""
        return (
            f"postgresql+psycopg2://{base}{sync_query}",
            f"postgresql+asyncpg://{base}",
        )

    def _build_pg_store(self, safe_ws: str) -> BasePydanticVectorStore:
        from llama_index.vector_stores.postgres import PGVectorStore

        sync_url, async_url = self._pg_connection_strings()
        return PGVectorStore.from_params(
            connection_string=sync_url,
            async_connection_string=async_url,
            table_name=self._pg_table(safe_ws),
            embed_dim=self._settings.embed_dim,
        )

    def _local_dir(self, safe_ws: str) -> Path:
        return self._settings.data_dir / safe_ws

    def _load_or_create(self, safe_ws: str) -> VectorStoreIndex:
        """Return the index for a workspace, creating an empty one if needed."""
        if self._settings.use_pgvector:
            store = self._build_pg_store(safe_ws)
            storage = StorageContext.from_defaults(vector_store=store)
            # With an external vector store, the index is a thin handle; no
            # persisted docstore is required for our metadata-filtered flows.
            return VectorStoreIndex.from_vector_store(
                store,
                storage_context=storage,
                embed_model=self._embed_model,
            )

        # Local fallback: persist the full StorageContext to disk.
        persist_dir = self._local_dir(safe_ws)
        if (persist_dir / "docstore.json").exists():
            storage = StorageContext.from_defaults(persist_dir=str(persist_dir))
            return load_index_from_storage(storage, embed_model=self._embed_model)

        persist_dir.mkdir(parents=True, exist_ok=True)
        storage = StorageContext.from_defaults()
        index = VectorStoreIndex(
            nodes=[],
            storage_context=storage,
            embed_model=self._embed_model,
        )
        storage.persist(persist_dir=str(persist_dir))
        return index

    def _get_index(self, safe_ws: str) -> VectorStoreIndex:
        with self._lock:
            index = self._indices.get(safe_ws)
            if index is None:
                index = self._load_or_create(safe_ws)
                self._indices[safe_ws] = index
            return index

    def _ws_lock(self, safe_ws: str) -> threading.Lock:
        with self._lock:
            lock = self._ws_locks.get(safe_ws)
            if lock is None:
                lock = threading.Lock()
                self._ws_locks[safe_ws] = lock
            return lock

    def _persist_local(self, safe_ws: str, index: VectorStoreIndex) -> None:
        if not self._settings.use_pgvector:
            index.storage_context.persist(persist_dir=str(self._local_dir(safe_ws)))

    # ------------------------------------------------------------------ #
    # Public operations
    # ------------------------------------------------------------------ #
    def index_documents(
        self, workspace: str, documents: list[tuple[str, str, str]]
    ) -> tuple[int, int]:
        """Chunk, embed and upsert documents.

        ``documents`` is a list of ``(doc_id, filename, text)`` tuples.
        Returns ``(indexed_docs, indexed_chunks)``. Re-indexing the same
        ``doc_id`` first removes its existing chunks (upsert semantics).
        """
        safe_ws = _validate_workspace(workspace)
        index = self._get_index(safe_ws)

        total_chunks = 0
        with self._ws_lock(safe_ws):
            for doc_id, filename, text in documents:
                # Upsert: clear any prior version of this doc.
                self._delete_doc_nodes(index, doc_id)

                doc = Document(
                    text=text,
                    metadata={"doc_id": doc_id, "filename": filename},
                    # Keep ids out of the embedded/LLM text.
                    excluded_embed_metadata_keys=["doc_id", "filename"],
                    excluded_llm_metadata_keys=["doc_id", "filename"],
                )
                nodes = self._splitter.get_nodes_from_documents([doc])
                for i, node in enumerate(nodes):
                    node.metadata["doc_id"] = doc_id
                    node.metadata["filename"] = filename
                    node.metadata["location"] = f"chunk {i + 1}"
                if nodes:
                    index.insert_nodes(nodes)
                    total_chunks += len(nodes)

            self._persist_local(safe_ws, index)
        return len(documents), total_chunks

    def search(self, workspace: str, query: str, top_k: int) -> list[SearchResult]:
        safe_ws = _validate_workspace(workspace)
        index = self._get_index(safe_ws)
        retriever = index.as_retriever(similarity_top_k=top_k)
        nodes = retriever.retrieve(query)

        results: list[SearchResult] = []
        for scored in nodes:
            node = scored.node
            meta = node.metadata or {}
            results.append(
                SearchResult(
                    text=node.get_content(metadata_mode=MetadataMode.NONE),
                    score=float(scored.score) if scored.score is not None else 0.0,
                    source=SourceRef(
                        doc_id=str(meta.get("doc_id", "")),
                        filename=str(meta.get("filename", "")),
                        location=str(meta.get("location", "")),
                    ),
                )
            )
        return results

    def delete_document(self, workspace: str, doc_id: str) -> int:
        safe_ws = _validate_workspace(workspace)
        index = self._get_index(safe_ws)
        with self._ws_lock(safe_ws):
            deleted = self._delete_doc_nodes(index, doc_id)
            self._persist_local(safe_ws, index)
        return deleted

    def list_documents(self, workspace: str) -> list[DocumentSummary]:
        safe_ws = _validate_workspace(workspace)
        index = self._get_index(safe_ws)
        counts: dict[str, tuple[str, int]] = {}
        for node in self._iter_nodes(index):
            meta = node.metadata or {}
            doc_id = str(meta.get("doc_id", ""))
            filename = str(meta.get("filename", ""))
            if not doc_id:
                continue
            prev_name, prev_count = counts.get(doc_id, (filename, 0))
            counts[doc_id] = (prev_name or filename, prev_count + 1)
        return [
            DocumentSummary(doc_id=doc_id, filename=name, chunk_count=count)
            for doc_id, (name, count) in sorted(counts.items())
        ]

    # ------------------------------------------------------------------ #
    # Node helpers (backend-aware)
    # ------------------------------------------------------------------ #
    def _delete_doc_nodes(self, index: VectorStoreIndex, doc_id: str) -> int:
        """Delete all nodes for a doc_id; returns how many were removed."""
        node_ids = [n.node_id for n in self._iter_nodes(index, doc_id=doc_id)]
        if not node_ids:
            return 0
        index.delete_nodes(
            node_ids,
            delete_from_docstore=True,
        )
        return len(node_ids)

    def _iter_nodes(self, index: VectorStoreIndex, doc_id: str | None = None) -> list[TextNode]:
        """Return stored nodes for the index, backend-aware.

        Local ``SimpleVectorStore`` keeps full nodes in the docstore. pgvector
        stores nodes in the table; we read them back directly from that table
        (filtered by ``doc_id`` in SQL when given, so upsert/delete do not scan
        the whole workspace).
        """
        # Prefer the docstore (always populated for the local backend, and for
        # pgvector when delete_from_docstore kept it in sync within-process).
        docstore = index.storage_context.docstore
        nodes = [n for n in docstore.docs.values() if isinstance(n, TextNode)]
        if nodes:
            if doc_id is not None:
                return [n for n in nodes if (n.metadata or {}).get("doc_id") == doc_id]
            return nodes

        # pgvector keeps nodes in the per-workspace table with no persisted
        # docstore, so enumerate node id + metadata directly from that table.
        # (The vector store's get_nodes() needs ids/filters we do not have here.)
        store = index.vector_store
        table_name = getattr(store, "table_name", None)
        if not table_name:
            return []
        sql = f'SELECT node_id, metadata_ FROM "data_{table_name}"'
        params: tuple = ()
        if doc_id is not None:
            sql += " WHERE metadata_->>'doc_id' = %s"
            params = (doc_id,)
        rows = self._pg_query(sql, params)
        out: list[TextNode] = []
        for node_id, meta in rows:
            if isinstance(meta, dict):
                md = meta
            elif isinstance(meta, str):
                import json

                try:
                    md = json.loads(meta)
                except Exception:
                    md = {}
            else:
                md = {}
            out.append(TextNode(id_=str(node_id), text="", metadata=md))
        return out

    def _pg_query(self, sql: str, params: tuple = ()) -> list[tuple]:
        """Run a read-only SQL query against the configured Postgres.

        Returns [] when the driver is unavailable or the workspace's table does
        not exist yet (the first /index call creates it). Any other failure
        propagates: swallowing it here silently turned upsert into insert-only,
        made deletes report success without deleting, and listed an empty
        library during transient DB errors.
        """
        dsn = self._settings.database_url
        if not dsn:
            return []
        try:
            import psycopg2  # declared dependency of the pgvector store integration
        except ImportError:  # pragma: no cover - driver always present with pg extras
            return []
        conn = None
        try:
            conn = psycopg2.connect(dsn)
            with conn.cursor() as cur:
                cur.execute(sql, params or None)
                return list(cur.fetchall())
        except Exception as exc:
            if _is_undefined_table(exc):
                return []
            raise
        finally:
            if conn is not None:
                try:
                    conn.close()
                except Exception:  # pragma: no cover - best-effort close
                    pass


_manager: IndexManager | None = None
_manager_lock = threading.Lock()


def get_index_manager(settings: Settings) -> IndexManager:
    """Process-wide singleton manager."""
    global _manager
    if _manager is None:
        with _manager_lock:
            if _manager is None:
                _manager = IndexManager(settings)
    return _manager


def reset_index_manager() -> None:
    """Test hook: drop the cached manager so settings are re-read."""
    global _manager
    with _manager_lock:
        _manager = None


__all__ = [
    "IndexManager",
    "WorkspaceValidationError",
    "get_index_manager",
    "reset_index_manager",
]
