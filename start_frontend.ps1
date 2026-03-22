$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location (Join-Path $RepoRoot "frontend")
npm run dev
