# BhuDrishti Backend Startup Script (PowerShell)
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir
Set-Location $ProjectRoot

Write-Host "Starting BhuDrishti FastAPI Backend on http://127.0.0.1:8000..." -ForegroundColor Green
$env:PYTHONPATH = "$ProjectRoot\backend"
python -m uvicorn api.app:app --host 127.0.0.1 --port 8000 --workers 1
