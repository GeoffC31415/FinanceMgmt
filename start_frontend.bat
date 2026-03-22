@echo off
setlocal

set "REPO_ROOT=%~dp0"
set "NPM_CMD=npm"

cd /d "%REPO_ROOT%frontend"
%NPM_CMD% run dev
