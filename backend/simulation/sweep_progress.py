"""Persistent bond sweep progress store.

Replaces the in-memory ``_SWEEP_PROGRESS`` dict in ``bond_sweep.py``
with a file-backed store so sweep progress survives process restarts.

This allows a new process to:
- Detect in-progress sweeps and either resume or notify the client.
- Avoid stale "orphaned" sweeps that appear to be running but are
  actually dead.

Design
------
A single JSON file stores all active sweeps::

    <cache_dir>/sweep_progress.json
    {
        "<session_id>": {
            "completed": 0,
            "total": 500,
            "phase": "Coarse scan (25% steps)",
            "cancelled": false,
            "started_at": 1745689200.0
        }
    }

Sweeps older than 24 hours are considered orphaned and removed on load.

"""
from __future__ import annotations

import asyncio
import json
import logging
import os
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

# Sweep progress is considered stale after this many seconds (8 hours).
_STALE_AFTER_S = 8 * 3600

# Default sweep progress file location (same dir as session cache).
_DEFAULT_SWEEP_PROGRESS_FILE = ".session_cache/sweep_progress.json"


class SweepProgressStore:
    """File-backed persistent store for bond sweep progress.

    All public methods are async-safe (use an internal lock).
    """

    def __init__(self, progress_file: str | Path | None = None) -> None:
        self._progress_file = Path(
            progress_file or _DEFAULT_SWEEP_PROGRESS_FILE
        )
        self._progress_file.parent.mkdir(parents=True, exist_ok=True)
        self._lock = asyncio.Lock()
        self._data: dict[str, dict] = {}
        self._load()

    # -- public API --------------------------------------------------------

    async def get_progress(self, session_id: str) -> dict:
        """Get sweep progress for a session."""
        async with self._lock:
            prog = self._data.get(session_id)
            if prog is None:
                return {"completed": 0, "total": 0, "phase": "", "running": False}
            return {
                "completed": prog["completed"],
                "total": prog["total"],
                "phase": prog["phase"],
                "running": prog["completed"] < prog["total"],
            }

    async def set_progress(
        self,
        session_id: str,
        completed: int,
        total: int,
        phase: str,
    ) -> None:
        """Set sweep progress for a session."""
        async with self._lock:
            self._data[session_id] = {
                "completed": completed,
                "total": total,
                "phase": phase,
                "cancelled": False,
                "started_at": _now_ts(),
            }
            self._save()

    async def is_cancelled(self, session_id: str) -> bool:
        """Check if a sweep has been cancelled."""
        async with self._lock:
            prog = self._data.get(session_id)
            if prog is None:
                return True
            return prog.get("cancelled", False)

    async def cancel(self, session_id: str) -> None:
        """Mark a sweep as cancelled."""
        async with self._lock:
            if session_id in self._data:
                self._data[session_id]["cancelled"] = True
                self._save()

    async def remove(self, session_id: str) -> None:
        """Remove progress data for a completed/cancelled sweep."""
        async with self._lock:
            self._data.pop(session_id, None)
            self._save()

    async def remove_expired(self) -> int:
        """Remove stale/orphaned sweeps. Returns count removed."""
        async with self._lock:
            now = _now_ts()
            expired = [
                sid
                for sid, prog in self._data.items()
                if (now - prog.get("started_at", now)) > _STALE_AFTER_S
            ]
            for sid in expired:
                logger.info(
                    "Sweep progress: removing stale sweep %s", sid
                )
                del self._data[sid]
            if expired:
                self._save()
            return len(expired)

    async def size(self) -> int:
        """Return number of active sweeps."""
        async with self._lock:
            return len(self._data)

    # -- sync API (for synchronous sweep path) -----------------------------

    def get_progress_sync(self, session_id: str) -> dict:
        """Get sweep progress (sync version)."""
        with self._lock:
            prog = self._data.get(session_id)
            if prog is None:
                return {"completed": 0, "total": 0, "phase": "", "running": False}
            return {
                "completed": prog["completed"],
                "total": prog["total"],
                "phase": prog["phase"],
                "running": prog["completed"] < prog["total"],
            }

    def set_progress_sync(self, session_id: str, completed: int, total: int, phase: str) -> None:
        """Set sweep progress (sync version)."""
        with self._lock:
            self._data[session_id] = {
                "completed": completed,
                "total": total,
                "phase": phase,
                "cancelled": False,
                "started_at": _now_ts(),
            }
            self._save()

    def is_cancelled_sync(self, session_id: str) -> bool:
        """Check if a sweep has been cancelled (sync version)."""
        with self._lock:
            prog = self._data.get(session_id)
            if prog is None:
                return True
            return prog.get("cancelled", False)

    def cancel_sync(self, session_id: str) -> None:
        """Mark a sweep as cancelled (sync version)."""
        with self._lock:
            if session_id in self._data:
                self._data[session_id]["cancelled"] = True
                self._save()

    def remove_sync(self, session_id: str) -> None:
        """Remove progress data (sync version)."""
        with self._lock:
            self._data.pop(session_id, None)
            self._save()

    # -- file I/O (caller must hold self._lock) ---------------------------

    def _load(self) -> None:
        """Load progress from disk."""
        if not self._progress_file.exists():
            self._data = {}
            return
        try:
            with open(self._progress_file, "r") as f:
                self._data = json.load(f)
        except (json.JSONDecodeError, OSError) as exc:
            logger.warning(
                "Corrupted sweep progress file, starting fresh: %s", exc
            )
            self._data = {}

    def _save(self) -> None:
        """Save progress to disk atomically."""
        tmp_path = self._progress_file.with_suffix(".json.tmp")
        try:
            with open(tmp_path, "w") as f:
                json.dump(self._data, f)
            os.replace(str(tmp_path), str(self._progress_file))
        except OSError as exc:
            logger.warning("Failed to save sweep progress: %s", exc)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _now_ts() -> float:
    """Return wall-clock time in seconds (used for sweep timestamps)."""
    import time
    return time.time()
