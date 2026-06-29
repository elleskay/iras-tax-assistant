# syntax=docker/dockerfile:1

FROM python:3.12-slim AS base

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PORT=8080

WORKDIR /app

# System deps: build tools for psycopg/asyncpg wheels are not needed (binary
# wheels), but keep ca-certificates current for OpenAI/Neon TLS.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install python deps first for better layer caching.
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# App code.
COPY app ./app

# Local-fallback data dir (only used when DATABASE_URL is unset).
RUN mkdir -p /app/.data
ENV RAG_DATA_DIR=/app/.data

EXPOSE 8080

# Single warm instance; uvicorn serves the ASGI app.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
