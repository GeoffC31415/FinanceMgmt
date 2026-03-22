#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_root="${script_dir}"
venv_activate="${repo_root}/.venv/bin/activate"
python_bin="${repo_root}/.venv/bin/python"
host="${FINANCES_BACKEND_HOST:-127.0.0.1}"
port="${FINANCES_BACKEND_PORT:-8000}"

if [[ ! -f "${venv_activate}" ]]; then
  echo "Missing venv at ${repo_root}/.venv. Create it with: python -m venv .venv"
  exit 1
fi

if ! FINANCES_BACKEND_HOST_CHECK="${host}" FINANCES_BACKEND_PORT_CHECK="${port}" "${python_bin}" - <<'PY'
import os
import socket
import sys

host = os.environ["FINANCES_BACKEND_HOST_CHECK"]
port = int(os.environ["FINANCES_BACKEND_PORT_CHECK"])

sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
try:
    sock.bind((host, port))
except OSError:
    sys.exit(1)
finally:
    sock.close()
PY
then
  echo "Port ${port} on ${host} is already in use."
  if command -v ss >/dev/null 2>&1; then
    echo
    echo "Current listeners for port ${port}:"
    ss -ltnp 2>/dev/null | grep ":${port}\b" || true
  fi
  echo
  echo "Stop the existing process or change FINANCES_BACKEND_PORT before retrying."
  exit 1
fi

cd "${repo_root}"
source "${venv_activate}"
exec uvicorn backend.main:app --reload --host "${host}" --port "${port}"
