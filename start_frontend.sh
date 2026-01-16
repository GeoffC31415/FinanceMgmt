#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_root="${script_dir}"

if [[ ! -f "${repo_root}/.venv/bin/activate" ]]; then
  echo "Missing venv at ${repo_root}/.venv. Create it with: python -m venv .venv"
  exit 1
fi

cd "${repo_root}"
source "${repo_root}/.venv/bin/activate"
cd "${repo_root}/frontend"
exec npm run dev