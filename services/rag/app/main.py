"""FastAPI application — the HTTP surface of the RAG microservice."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse

from .config import get_settings
from .indexer import get_index_manager
from .models import (
    DeleteRequest,
    DeleteResponse,
    DocumentListResponse,
    HealthResponse,
    IndexRequest,
    IndexResponse,
    SearchRequest,
    SearchResponse,
)

logger = logging.getLogger("rag")


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    logger.info("RAG service starting — backend=%s", settings.storage_backend)
    # Eagerly construct the manager so embedding-model/config errors surface at boot.
    get_index_manager(settings)
    yield


app = FastAPI(
    title="AI Tax Assistant — RAG Service",
    version="0.1.0",
    description="Per-workspace (per-tax-type) retrieval-augmented-generation index.",
    lifespan=lifespan,
)


@app.exception_handler(ValueError)
async def _value_error_handler(_request, exc: ValueError) -> JSONResponse:
    return JSONResponse(status_code=400, content={"detail": str(exc)})


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(status="ok", backend=get_settings().storage_backend)


@app.post("/index", response_model=IndexResponse)
def index_documents(req: IndexRequest) -> IndexResponse:
    manager = get_index_manager(get_settings())
    docs = [(d.doc_id, d.filename, d.text) for d in req.documents]
    try:
        indexed_docs, indexed_chunks = manager.index_documents(req.workspace, docs)
    except ValueError:
        raise
    except Exception as exc:  # pragma: no cover - backend dependent
        logger.exception("indexing failed")
        raise HTTPException(status_code=500, detail=f"Indexing failed: {exc}") from exc
    return IndexResponse(
        workspace=req.workspace,
        indexed_docs=indexed_docs,
        indexed_chunks=indexed_chunks,
    )


@app.post("/search", response_model=SearchResponse)
def search(req: SearchRequest) -> SearchResponse:
    manager = get_index_manager(get_settings())
    try:
        results = manager.search(req.workspace, req.query, req.top_k)
    except ValueError:
        raise
    except Exception as exc:  # pragma: no cover - backend dependent
        logger.exception("search failed")
        raise HTTPException(status_code=500, detail=f"Search failed: {exc}") from exc
    return SearchResponse(results=results)


@app.delete("/documents", response_model=DeleteResponse)
def delete_document(req: DeleteRequest) -> DeleteResponse:
    manager = get_index_manager(get_settings())
    try:
        deleted = manager.delete_document(req.workspace, req.doc_id)
    except ValueError:
        raise
    except Exception as exc:  # pragma: no cover - backend dependent
        logger.exception("delete failed")
        raise HTTPException(status_code=500, detail=f"Delete failed: {exc}") from exc
    return DeleteResponse(workspace=req.workspace, doc_id=req.doc_id, deleted_chunks=deleted)


@app.get("/workspaces/{workspace}/documents", response_model=DocumentListResponse)
def list_documents(workspace: str) -> DocumentListResponse:
    manager = get_index_manager(get_settings())
    try:
        documents = manager.list_documents(workspace)
    except ValueError:
        raise
    except Exception as exc:  # pragma: no cover - backend dependent
        logger.exception("list failed")
        raise HTTPException(status_code=500, detail=f"List failed: {exc}") from exc
    return DocumentListResponse(workspace=workspace, documents=documents)
