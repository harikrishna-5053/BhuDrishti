# BhuDrishti Frontend Startup Script (PowerShell)
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir
Set-Location "$ProjectRoot\frontend"

Write-Host "Starting BhuDrishti Vite Frontend..." -ForegroundColor Green
npm run dev
