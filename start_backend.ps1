$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$PythonExe = Join-Path $RepoRoot ".venv\Scripts\python.exe"

if (-not (Test-Path $PythonExe)) {
    Write-Host "Missing venv at $RepoRoot\.venv. Create it with: py -3 -m venv .venv"
    exit 1
}

if (-not $env:FINANCES_BACKEND_HOST) { $env:FINANCES_BACKEND_HOST = "127.0.0.1" }
if (-not $env:FINANCES_BACKEND_PORT) { $env:FINANCES_BACKEND_PORT = "8000" }

Set-Location $RepoRoot
& $PythonExe -m uvicorn backend.main:app --reload --host $env:FINANCES_BACKEND_HOST --port $env:FINANCES_BACKEND_PORT
