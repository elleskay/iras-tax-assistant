# syntax=docker/dockerfile:1

FROM python:3.14-slim AS base

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

# Run as a non-root user: an RCE in any dependency should not get root.
# The local-fallback data dir (only used when DATABASE_URL is unset) is the
# one path the app writes to.
RUN useradd --system --uid 10001 --no-create-home app \
    && mkdir -p /app/.data \
    && chown app:app /app/.data
ENV RAG_DATA_DIR=/app/.data
USER app

EXPOSE 8080

# Single warm instance; uvicorn serves the ASGI app.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
