"""Offline unit tests for the pgvector-only code paths.

These paths need no live Postgres: connection-string assembly is pure string
work, and `_pg_query`'s error handling is exercised with a stubbed driver.
"""

from __future__ import annotations

import sys
import types
from dataclasses import replace

import pytest


@pytest.fixture()
def manager(monkeypatch: pytest.MonkeyPatch, tmp_path):
    monkeypatch.setenv("RAG_FAKE_EMBEDDINGS", "1")
    monkeypatch.setenv("RAG_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("RAG_EMBED_DIM", "64")
    monkeypatch.delenv("DATABASE_URL", raising=False)

    from app.config import get_settings
    from app.indexer import IndexManager

    get_settings.cache_clear()
    settings = replace(
        get_settings(),
        database_url="postgresql://neon_user:p%40ss@ep-example.aws.neon.tech/appdb"
        "?sslmode=require&channel_binding=require",
    )
    yield IndexManager(settings)
    get_settings.cache_clear()


def test_connection_strings_preserve_libpq_params(manager):
    sync_url, async_url = manager._pg_connection_strings()
    # Neon-style URL has no explicit port; both URLs must gain the default.
    assert sync_url.startswith("postgresql+psycopg2://neon_user:p%40ss@ep-example.aws.neon.tech:5432/appdb")
    # libpq params (sslmode, channel_binding) reach the sync/psycopg2 URL only.
    assert "sslmode=require" in sync_url
    assert "channel_binding=require" in sync_url
    assert async_url == "postgresql+asyncpg://neon_user:p%40ss@ep-example.aws.neon.tech:5432/appdb"


def _fake_psycopg2(monkeypatch: pytest.MonkeyPatch, connect):
    mod = types.ModuleType("psycopg2")
    mod.connect = connect  # type: ignore[attr-defined]
    monkeypatch.setitem(sys.modules, "psycopg2", mod)


def test_pg_query_returns_empty_for_missing_table(manager, monkeypatch):
    class UndefinedTable(Exception):
        pgcode = "42P01"

    def connect(dsn):
        raise UndefinedTable("relation does not exist")

    _fake_psycopg2(monkeypatch, connect)
    assert manager._pg_query("SELECT 1") == []


def test_pg_query_propagates_other_errors(manager, monkeypatch):
    class OperationalError(Exception):
        pgcode = "08006"  # connection failure

    def connect(dsn):
        raise OperationalError("could not connect")

    _fake_psycopg2(monkeypatch, connect)
    # A transient DB failure must NOT be swallowed: returning [] here silently
    # turned upsert into insert-only and made deletes claim success.
    with pytest.raises(OperationalError):
        manager._pg_query("SELECT 1")
