#!/usr/bin/env bash
cd "$(dirname "$0")"
exec .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port "${ML_PORT:-8001}"
