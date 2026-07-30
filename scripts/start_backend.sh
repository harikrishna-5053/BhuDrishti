#!/usr/bin/env bash
# BhuDrishti Backend Startup Script (Linux/macOS)
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( dirname "$SCRIPT_DIR" )"
cd "$PROJECT_ROOT"

echo "Starting BhuDrishti FastAPI Backend on http://127.0.0.1:8000..."
export PYTHONPATH="$PROJECT_ROOT/backend:$PYTHONPATH"
python -m uvicorn api.app:app --host 127.0.0.1 --port 8000 --workers 1
