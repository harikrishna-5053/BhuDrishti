#!/usr/bin/env bash
# BhuDrishti Frontend Startup Script (Linux/macOS)
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( dirname "$SCRIPT_DIR" )"
cd "$PROJECT_ROOT/frontend"

echo "Starting BhuDrishti Vite Frontend..."
npm run dev
