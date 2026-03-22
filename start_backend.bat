@echo off
setlocal

set "REPO_ROOT=%~dp0"
set "PYTHON_EXE=%REPO_ROOT%.venv\Scripts\python.exe"

if not exist "%PYTHON_EXE%" (
  echo Missing venv at %REPO_ROOT%.venv. Create it with: py -3 -m venv .venv
  exit /b 1
)

if "%FINANCES_BACKEND_HOST%"=="" set "FINANCES_BACKEND_HOST=127.0.0.1"
if "%FINANCES_BACKEND_PORT%"=="" set "FINANCES_BACKEND_PORT=8000"

cd /d "%REPO_ROOT%"
"%PYTHON_EXE%" -m uvicorn backend.main:app --reload --host %FINANCES_BACKEND_HOST% --port %FINANCES_BACKEND_PORT%
