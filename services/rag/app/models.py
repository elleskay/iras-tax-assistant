"""Pydantic request/response models — the public HTTP contract.

Field names here are the JSON keys a client sends/receives. Keep them stable.
"""

from __future__ import annotations

from pydantic import BaseModel, Field


# --------------------------------------------------------------------------- #
# Shared / nested
# --------------------------------------------------------------------------- #
class DocumentInput(BaseModel):
    """A single source document to be chunked and embedded."""

    doc_id: str = Field(..., min_length=1, description="Stable, caller-owned document id.")
    filename: str = Field(..., min_length=1, description="Original file name, used for citation.")
    text: str = Field(..., min_length=1, description="Full plain-text content of the document.")


class SourceRef(BaseModel):
    """Where a retrieved chunk came from — used to render citations."""

    doc_id: str
    filename: str
    location: str = Field(
        ...,
        description="Human-readable position within the doc, e.g. 'chunk 3' or a page label.",
    )


class SearchResult(BaseModel):
    text: str = Field(..., description="The retrieved chunk text.")
    score: float = Field(..., description="Similarity score (higher is more relevant).")
    source: SourceRef


class DocumentSummary(BaseModel):
    doc_id: str
    filename: str
    chunk_count: int


# --------------------------------------------------------------------------- #
# /index
# --------------------------------------------------------------------------- #
class IndexRequest(BaseModel):
    workspace: str = Field(..., min_length=1, description="Tenant / tax-type workspace key.")
    documents: list[DocumentInput] = Field(..., min_length=1)


class IndexResponse(BaseModel):
    workspace: str
    indexed_docs: int
    indexed_chunks: int


# --------------------------------------------------------------------------- #
# /search
# --------------------------------------------------------------------------- #
class SearchRequest(BaseModel):
    workspace: str = Field(..., min_length=1)
    query: str = Field(..., min_length=1)
    top_k: int = Field(default=5, ge=1, le=50)


class SearchResponse(BaseModel):
    results: list[SearchResult]


# --------------------------------------------------------------------------- #
# DELETE /documents
# --------------------------------------------------------------------------- #
class DeleteRequest(BaseModel):
    workspace: str = Field(..., min_length=1)
    doc_id: str = Field(..., min_length=1)


class DeleteResponse(BaseModel):
    workspace: str
    doc_id: str
    deleted_chunks: int


# --------------------------------------------------------------------------- #
# GET /workspaces/{workspace}/documents
# --------------------------------------------------------------------------- #
class DocumentListResponse(BaseModel):
    workspace: str
    documents: list[DocumentSummary]


# --------------------------------------------------------------------------- #
# /health
# --------------------------------------------------------------------------- #
class HealthResponse(BaseModel):
    status: str = "ok"
    backend: str = Field(..., description="Active vector store backend: 'pgvector' or 'local'.")
