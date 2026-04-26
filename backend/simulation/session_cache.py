"""Persistent session cache for simulation sessions.

Replaces the in-memory ``_CACHE`` dict in ``returns_cache.py`` with a
file-backed store so simulation sessions survive process restarts and
are shared across multiple workers (when deployed with uvicorn --workers).

Design decisions
----------------
* **File-backed pickle** — ``CachedSession`` contains ``numpy.ndarray``
  objects which pickle handles natively.  A parallel JSON index tracks
  metadata (session_id, scenario_id, created_at, ttl) for TTL expiry
  without deserializing the full pickle blob.
* **TTL expiry on access** — expired sessions are removed lazily when
  ``get_session`` is called, plus a periodic purge task.
* **Graceful degradation** — if the cache directory is unreadable or
  the pickle deserializes to a corrupted object, the session is
  silently treated as "not found" and the caller will re-initialize.

Usage
-----
The cache is wired into ``main.py`` via ``app.state.session_cache``.
Routes that need it do::

    cache = request.app.state.session_cache
    session_id = await cache.create(...)
    cached = await cache.get(session_id)

"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import pickle
import time
from abc import ABC, abstractmethod
from pathlib import Path
from typing import TYPE_CHECKING, Any
from uuid import uuid4

if TYPE_CHECKING:
    from backend.simulation.returns_cache import CachedSession, ReturnsMatrix

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Protocol
# ---------------------------------------------------------------------------

class SessionCache(ABC):
    """Interface for simulation session storage."""

    @abstractmethod
    async def create(
        self,
        session_id: str,
        scenario_id: str,
        base_scenario: Any,
        returns: ReturnsMatrix,
        ttl_s: float = 30 * 60,
    ) -> str:
        """Store a session. Returns session_id."""

    @abstractmethod
    async def get(self, session_id: str) -> CachedSession | None:
        """Retrieve a session, or None if expired/missing."""

    @abstractmethod
    async def delete(self, session_id: str) -> None:
        """Remove a session."""

    @abstractmethod
    async def purge_expired(self) -> int:
        """Remove all expired sessions. Returns count removed."""

    @abstractmethod
    async def size(self) -> int:
        """Return number of active sessions."""

    @abstractmethod
    async def close(self) -> None:
        """Clean up any background resources."""


# ---------------------------------------------------------------------------
# File-backed implementation
# ---------------------------------------------------------------------------

class FileBackedSessionCache(SessionCache):
    """File-backed session cache using pickle + JSON index.

    Sessions are stored as::

        <cache_dir>/
            index.json          # {session_id: {scenario_id, created_at, ttl}}
            <session_id>.pkl    # pickled CachedSession

    The index is written atomically (write to temp → rename) to avoid
    corruption on crash.
    """

    def __init__(self, cache_dir: str | Path = ".session_cache") -> None:
        self._cache_dir = Path(cache_dir)
        self._index_path = self._cache_dir / "index.json"
        self._lock = asyncio.Lock()
        # Ensure cache directory exists
        self._cache_dir.mkdir(parents=True, exist_ok=True)

    # -- public API --------------------------------------------------------

    async def create(
        self,
        session_id: str,
        scenario_id: str,
        base_scenario: Any,
        returns: ReturnsMatrix,
        ttl_s: float = 30 * 60,
    ) -> str:
        # Import here to avoid circular import with returns_cache.py
        from backend.simulation.returns_cache import CachedSession

        session = CachedSession(
            created_at_s=_now_s(),
            scenario_id=scenario_id,
            base_scenario=base_scenario,
            returns=returns,
        )
        async with self._lock:
            # Write pickle
            pkl_path = self._cache_dir / f"{session_id}.pkl"
            with open(pkl_path, "wb") as f:
                pickle.dump(session, f)
            # Update index
            await self._write_index_entry(session_id, scenario_id, ttl_s)
        return session_id

    async def get(self, session_id: str) -> CachedSession | None:
        async with self._lock:
            return self.get_sync(session_id)

    def get_sync(self, session_id: str) -> CachedSession | None:
        from backend.simulation.returns_cache import CachedSession

        entry = self._read_index_entry_sync(session_id)
        if entry is None:
            return None
        # Check TTL
        if (_now_s() - entry["created_at_s"]) > entry["ttl_s"]:
            self._remove_session_sync(session_id)
            return None
        # Read pickle
        pkl_path = self._cache_dir / f"{session_id}.pkl"
        if not pkl_path.exists():
            # Index out of sync with disk; clean up
            self._remove_index_entry_sync(session_id)
            return None
        try:
            with open(pkl_path, "rb") as f:
                session = pickle.load(f)
        except (pickle.UnpicklingError, EOFError, Exception) as exc:
            logger.warning("Corrupted session %s, removing: %s", session_id, exc)
            self._remove_session_sync(session_id)
            return None
        if not isinstance(session, CachedSession):
            logger.warning("Session %s is not a CachedSession, removing", session_id)
            self._remove_session_sync(session_id)
            return None
        return session

    async def delete(self, session_id: str) -> None:
        async with self._lock:
            await self._remove_session(session_id)

    def delete_sync(self, session_id: str) -> None:
        self._remove_session_sync(session_id)

    async def purge_expired(self) -> int:
        async with self._lock:
            index = await self._read_index()
            now = _now_s()
            expired = [
                sid
                for sid, entry in index.items()
                if (now - entry["created_at_s"]) > entry["ttl_s"]
            ]
            for sid in expired:
                await self._remove_session(sid)
            return len(expired)

    async def size(self) -> int:
        async with self._lock:
            index = await self._read_index()
            return len(index)

    async def close(self) -> None:
        # No background tasks to clean up
        pass

    # -- index helpers (must be called under self._lock) --------------------

    async def _read_index(self) -> dict[str, dict]:
        return self._read_index_sync()

    def _read_index_sync(self) -> dict[str, dict]:
        if not self._index_path.exists():
            return {}
        try:
            with open(self._index_path, "r") as f:
                return json.load(f)
        except (json.JSONDecodeError, OSError):
            logger.warning("Corrupted session cache index, rebuilding")
            return {}

    async def _read_index_entry(self, session_id: str) -> dict | None:
        return self._read_index_entry_sync(session_id)

    def _read_index_entry_sync(self, session_id: str) -> dict | None:
        index = self._read_index_sync()
        return index.get(session_id)

    async def _write_index_entry(self, session_id: str, scenario_id: str, ttl_s: float) -> None:
        index = await self._read_index()
        index[session_id] = {
            "scenario_id": scenario_id,
            "created_at_s": _now_s(),
            "ttl_s": ttl_s,
        }
        await self._write_index(index)

    async def _remove_index_entry(self, session_id: str) -> None:
        self._remove_index_entry_sync(session_id)

    def _remove_index_entry_sync(self, session_id: str) -> None:
        index = self._read_index_sync()
        index.pop(session_id, None)
        self._write_index_sync(index)

    async def _write_index(self, index: dict[str, dict]) -> None:
        """Write index atomically (temp file → rename)."""
        self._write_index_sync(index)

    def _write_index_sync(self, index: dict[str, dict]) -> None:
        """Write index atomically (temp file → rename)."""
        tmp_path = self._index_path.with_suffix(".json.tmp")
        with open(tmp_path, "w") as f:
            json.dump(index, f)
        os.replace(str(tmp_path), str(self._index_path))

    async def _remove_session(self, session_id: str) -> None:
        self._remove_session_sync(session_id)

    def _remove_session_sync(self, session_id: str) -> None:
        pkl_path = self._cache_dir / f"{session_id}.pkl"
        if pkl_path.exists():
            pkl_path.unlink(missing_ok=True)
        self._remove_index_entry_sync(session_id)


# ---------------------------------------------------------------------------
# In-memory fallback (for testing / dev)
# ---------------------------------------------------------------------------

class InMemorySessionCache(SessionCache):
    """In-memory session cache (same semantics as the old ``_CACHE``).

    Useful for testing where file I/O is undesirable, or as a
    development fallback.
    """

    def __init__(self) -> None:
        self._cache: dict[str, CachedSession] = {}
        self._lock = asyncio.Lock()

    async def create(
        self,
        session_id: str,
        scenario_id: str,
        base_scenario: Any,
        returns: ReturnsMatrix,
        ttl_s: float = 30 * 60,
    ) -> str:
        from backend.simulation.returns_cache import CachedSession

        async with self._lock:
            self._purge_expired(ttl_s=ttl_s)
            session = CachedSession(
                created_at_s=_now_s(),
                scenario_id=scenario_id,
                base_scenario=base_scenario,
                returns=returns,
            )
            self._cache[session_id] = session
        return session_id

    async def get(self, session_id: str) -> CachedSession | None:
        async with self._lock:
            return self.get_sync(session_id)

    def get_sync(self, session_id: str) -> CachedSession | None:
        self._purge_expired()
        session = self._cache.get(session_id)
        if session is None:
            return None
        if (_now_s() - session.created_at_s) > 30 * 60:
            self._cache.pop(session_id, None)
            return None
        return session

    async def delete(self, session_id: str) -> None:
        async with self._lock:
            self._cache.pop(session_id, None)

    def delete_sync(self, session_id: str) -> None:
        self._cache.pop(session_id, None)

    async def purge_expired(self) -> int:
        async with self._lock:
            self._purge_expired()
            return 0

    async def size(self) -> int:
        async with self._lock:
            return len(self._cache)

    async def close(self) -> None:
        self._cache.clear()

    def _purge_expired(self, *, ttl_s: float = 30 * 60) -> None:
        if ttl_s <= 0:
            return
        now = _now_s()
        expired = [k for k, v in self._cache.items() if (now - v.created_at_s) > ttl_s]
        for k in expired:
            self._cache.pop(k, None)


# ---------------------------------------------------------------------------
# Factory
# ---------------------------------------------------------------------------

async def create_session_cache(
    *,
    cache_dir: str | Path | None = None,
    use_file_backed: bool = True,
) -> SessionCache:
    """Create a session cache backend.

    Args:
        cache_dir: Directory for file-backed cache.  Defaults to
            ``.session_cache`` in the current working directory.
        use_file_backed: If True (default), use ``FileBackedSessionCache``.
            If False, use ``InMemorySessionCache``.

    Returns:
        A configured ``SessionCache`` instance.
    """
    if use_file_backed:
        if cache_dir is None:
            cache_dir = ".session_cache"
        cache = FileBackedSessionCache(cache_dir)
        logger.info("Session cache: file-backed at %s", cache_dir)
        return cache
    else:
        cache = InMemorySessionCache()
        logger.info("Session cache: in-memory (non-persistent)")
        return cache


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _now_s() -> float:
    """Return monotonic time in seconds (survives wall-clock changes)."""
    return time.monotonic()
