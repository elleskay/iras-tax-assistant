"""FastAPI application: the HTTP surface of the RAG microservice."""

from __future__ import annotations

import logging
import secrets
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.responses import JSONResponse

from .config import get_settings
from .indexer import WorkspaceValidationError, get_index_manager
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
    # Uvicorn only configures its own loggers; give the app logger a handler
    # so INFO lines actually appear. basicConfig is a no-op if already set.
    logging.basicConfig(level=logging.INFO)
    settings = get_settings()
    logger.info("RAG service starting, backend=%s", settings.storage_backend)
    if not settings.service_token:
        logger.warning(
            "RAG_SERVICE_TOKEN is not set: all endpoints are unauthenticated. "
            "Set it (and the same value in the web app) for any shared deployment."
        )
    # Eagerly construct the manager so embedding-model/config errors surface at boot.
    get_index_manager(settings)
    yield


def require_token(authorization: str | None = Header(default=None)) -> None:
    """Shared-secret bearer auth.

    Enforced only when RAG_SERVICE_TOKEN is configured, so local dev and the
    offline test suite keep working with zero setup. /health stays open for
    platform health checks.
    """
    token = get_settings().service_token
    if not token:
        return
    supplied = ""
    if authorization and authorization.startswith("Bearer "):
        supplied = authorization.removeprefix("Bearer ").strip()
    if not supplied or not secrets.compare_digest(supplied, token):
        raise HTTPException(status_code=401, detail="Invalid or missing bearer token.")


app = FastAPI(
    title="AI Tax Assistant RAG Service",
    version="0.1.0",
    description="Per-workspace (per-tax-type) retrieval-augmented-generation index.",
    lifespan=lifespan,
)


@app.exception_handler(WorkspaceValidationError)
async def _workspace_error_handler(_request, exc: WorkspaceValidationError) -> JSONResponse:
    return JSONResponse(status_code=400, content={"detail": str(exc)})


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(status="ok", backend=get_settings().storage_backend)


@app.post("/index", response_model=IndexResponse, dependencies=[Depends(require_token)])
def index_documents(req: IndexRequest) -> IndexResponse:
    manager = get_index_manager(get_settings())
    docs = [(d.doc_id, d.filename, d.text) for d in req.documents]
    try:
        indexed_docs, indexed_chunks = manager.index_documents(req.workspace, docs)
    except WorkspaceValidationError:
        raise
    except Exception as exc:  # pragma: no cover - backend dependent
        logger.exception("indexing failed")
        # Detail stays generic: raw driver/SDK messages can leak DB hosts or org ids.
        raise HTTPException(status_code=500, detail="Indexing failed") from exc
    return IndexResponse(
        workspace=req.workspace,
        indexed_docs=indexed_docs,
        indexed_chunks=indexed_chunks,
    )


@app.post("/search", response_model=SearchResponse, dependencies=[Depends(require_token)])
def search(req: SearchRequest) -> SearchResponse:
    manager = get_index_manager(get_settings())
    try:
        results = manager.search(req.workspace, req.query, req.top_k)
    except WorkspaceValidationError:
        raise
    except Exception as exc:  # pragma: no cover - backend dependent
        logger.exception("search failed")
        raise HTTPException(status_code=500, detail="Search failed") from exc
    return SearchResponse(results=results)


@app.delete("/documents", response_model=DeleteResponse, dependencies=[Depends(require_token)])
def delete_document(req: DeleteRequest) -> DeleteResponse:
    manager = get_index_manager(get_settings())
    try:
        deleted = manager.delete_document(req.workspace, req.doc_id)
    except WorkspaceValidationError:
        raise
    except Exception as exc:  # pragma: no cover - backend dependent
        logger.exception("delete failed")
        raise HTTPException(status_code=500, detail="Delete failed") from exc
    return DeleteResponse(workspace=req.workspace, doc_id=req.doc_id, deleted_chunks=deleted)


@app.get(
    "/workspaces/{workspace}/documents",
    response_model=DocumentListResponse,
    dependencies=[Depends(require_token)],
)
def list_documents(workspace: str) -> DocumentListResponse:
    manager = get_index_manager(get_settings())
    try:
        documents = manager.list_documents(workspace)
    except WorkspaceValidationError:
        raise
    except Exception as exc:  # pragma: no cover - backend dependent
        logger.exception("list failed")
        raise HTTPException(status_code=500, detail="List failed") from exc
    return DocumentListResponse(workspace=workspace, documents=documents)
