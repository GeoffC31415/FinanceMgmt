# TODO — FinanceMgmt Backend

> Priority: **P0** (critical) → **P1** (high) → **P2** (medium) → **P3** (nice-to-have)

**Tests**: Backend test suite not run in this environment (`pytest` command unavailable). Historical note said 134 passing; current repo contains 35 backend test functions plus parametrized cases.

_Last updated: 2026-04-26._

## Completed

| # | Item | Notes |
|---|------|-------|
| ✅ | P0.2: Input validation for simulation scenarios | `simulation/validator.py` with `ValidationReport` |
| ✅ | P1.1: Strip OO methods from `entities/` | All 11 classes are now frozen dataclasses; `SimContext`/`FinancialEntity` removed |
| ✅ | P1.4: API documentation | `Field(description=...)` on all schemas, `summary`/`description` on all 18 routes, docstrings on all models |
| ✅ | P2.2: Tax year presets endpoint | `GET /api/config/tax-years` |
| ✅ | P2.3: Data export | `GET /api/simulation/export?format=csv|json` |
| ✅ | P2.4: Scenario cloning | `POST /api/scenarios/{id}/clone` |
| ✅ | P2.5: Database indexing | Indexes on `scenario_id`, `person_id`, `created_at` in `database.py` |
| ✅ | P2.1: Separate simulation engine from HTTP layer | `routers/simulation.py` 1,072 → 383 lines (64% reduction). Extracted `ScenarioBuilder`, `ResponseFormatter`, `SimulationScenarioValidator`, `SimulationService` to `simulation/service.py`, `BondSweepService` to `simulation/bond_sweep.py` |
| ✅ | Q2: `docs_url="/docs"` | Swagger UI + ReDoc |
| ❌ | Q8: pytest-benchmark in CI | `pytest-benchmark` not installed, not in requirements.txt |
| ✅ | Q9: `__all__` exports | All `__init__.py` files have `__all__` |
| ✅ | Q10: Slow request logging | `log_slow_requests` middleware in `main.py` |
| ✅ | Perf: Speed up tests with `max_combos` cap | Bond sweep tests use `max_combos=20` — reduced from 9.5s → 3.1s (3x). Added `max_combos` field to `BondSweepRequest` schema. |
| ✅ | 1.3: Add Simulation Cancellation / Timeout | Async sweep, cancel endpoint, timeout middleware |
| ✅ | Risk analysis safe-withdrawal bug | Fixed `/api/simulation/safe-withdrawal` by importing `numpy` in `routers/simulation.py`; frontend now surfaces safe-withdrawal errors instead of silently showing `---`. |

---

## P0 — Critical

### 0.1: Replace In-Memory Session Cache with Persistent Store ✅ DONE

**Impact**: Simulation sessions are lost on process restart. No multi-worker support. Memory leaks in long-running processes.

**Effort**: Medium

**Details**:
- `_CACHE` in `returns_cache.py` was a plain `dict[str, CachedSession]` — volatile.
- `bond-sweep` stored progress in `_SWEEP_PROGRESS` — also volatile.
- Replaced with file-backed cache using pickle + JSON index.

**Done**:
- [x] Design cache backend interface (`SessionCache` protocol) with `FileBackedSessionCache` + `InMemorySessionCache` fallback
- [x] Implement TTL-aware serialization for `CachedSession` (pickle + JSON index, atomic writes)
- [x] Replace `_SWEEP_PROGRESS` with persistent `SweepProgressStore` (file-backed JSON)
- [x] Add health check for cache backend (`/health` returns cache status)
- [x] Wire cache into `main.py` lifespan (startup/shutdown)
- [x] Add `session_cache_dir` setting (`FINANCES_SESSION_CACHE_DIR` env var)
- [x] Background purge task (every 5 min) for expired sessions

**Files changed**:
- `backend/simulation/session_cache.py` — new: `SessionCache` protocol, `FileBackedSessionCache`, `InMemorySessionCache`, `create_session_cache()` factory
- `backend/simulation/sweep_progress.py` — new: `SweepProgressStore` with sync+async APIs
- `backend/simulation/returns_cache.py` — `create_session`/`get_session`/`delete_session` now async, delegate to cache
- `backend/simulation/bond_sweep.py` — `_SWEEP_PROGRESS` → `SweepProgressStore`
- `backend/main.py` — cache init in lifespan, shutdown cleanup
- `backend/settings.py` — `session_cache_dir` setting
- `backend/routers/simulation.py` — enhanced `/health` endpoint

**Remaining**: Redis backend for multi-worker deployments (future P1).

---

## P1 — High

### 1.2: Add Comprehensive Simulation Performance Benchmarks

**Impact**: No performance regression detection. No way to quantify improvement from engine changes.

**Effort**: Low

**Details**:
- `tests/benchmark_engine.py` exists but needs to be wired into CI
- Should benchmark: init time, recalc time, bond-sweep time
- Track: iterations × years × asset count as complexity metric

**Tasks**:
- [ ] Add `pytest-benchmark` to requirements
- [ ] Create benchmark suite with parametrized iteration/year counts
- [ ] Add CI integration (GitHub Actions)
- [ ] Set performance budgets (e.g., 2000 iterations × 40 years < 5s)

### 1.3: Add Simulation Cancellation / Timeout ✅ DONE

**Impact**: Bond sweep can take minutes (hundreds of simulation runs). No way to cancel. No timeout on long requests.

**Effort**: Medium

**Done**:
- `BondSweepService.run_async()` — async sweep with per-combo cancellation checks
- `POST /bond-sweep/cancel?session_id=...` endpoint — cancels running sweeps
- `REQUEST_TIMEOUT` middleware (3600s default) — safety net for all requests
- `GET /bond-sweep/{session_id}/progress` — async-safe progress polling with `_SWEEP_LOCK`
- `_SWEEP_TASKS` dict — tracks running tasks for cancellation
- `_SWEEP_PROGRESS` dict — async-safe progress updates via asyncio.Lock
- `BondSweepService.cancel()` — marks sweep as cancelled and cancels asyncio.Task
- `tests/test_bond_sweep.py` — 12 tests covering sync/async run, progress, cancel, router endpoints, timeout

**Tasks**:
- [x] Add `asyncio.create_task()` for long-running sweeps
- [x] Add `/bond-sweep/cancel?session_id=...` endpoint
- [x] Add request timeout middleware (3600s configurable)
- [x] Return progress polling via `/bond-sweep/progress` (async-safe)

---

## P2 — Medium

### 2.2: Add Tax Year Versioning with Migration Path

**Impact**: Tax year presets are hardcoded. No way to query historical tax bands. No migration path when UK tax changes.

**Effort**: Medium

**Details**:
- `tax_config.py` has 5 hardcoded presets (2021/22 to 2025/26)
- Adding new years requires code changes
- No way to store which tax year was active during a scenario

**Tasks**:
- [ ] Move tax year presets to a database table or JSON config file
- [ ] Add `tax_year` field to `Scenario.assumptions`
- [ ] Add endpoint to list available tax years
- [ ] Add admin endpoint to add/update tax year presets

---

## P3 — Nice-to-Have

### 3.1: Add Scenario Validation Rules Engine

**Impact**: No way to define custom validation rules (e.g., "total assets must be > £0", "at least one income source").

**Effort**: Medium

**Tasks**:
- [ ] Create `ValidationRule` base class
- [ ] Add built-in rules (balance checks, date consistency)
- [ ] Allow custom rules per scenario type
- [ ] Return structured validation errors

### 3.2: Add Historical Return Data Management ✅ DONE

**Impact**: TSV files are loaded at import time with no versioning. No way to update data without code changes.

**Done**:
- `routers/admin.py` — new admin router with upload endpoints
- `schemas/admin.py` — Pydantic schemas for metadata and validation responses
- `POST /admin/historical-returns/upload` — upload equity data (CSV/TSV)
- `POST /admin/historical-returns/bond-upload` — upload bond data (CSV/TSV)
- `GET /admin/historical-returns/metadata` — view current data metadata
- Validation on upload: NaN check, year gaps, duplicates, suspicious returns
- Metadata persisted to `data/historical_returns_metadata.json`

### 3.3: Add Multi-Currency Support

**Impact**: All values are implicitly GBP. No currency conversion for international scenarios.

**Effort**: Medium

**Tasks**:
- [ ] Add `currency` field to Scenario
- [ ] Add exchange rate API integration
- [ ] Convert all simulation values to base currency

### 3.4: Add Scenario Sharing / Public Links

**Impact**: No way to share scenarios with advisors or family.

**Effort**: Medium

**Tasks**:
- [ ] Add `share_token` field to Scenario
- [ ] Add `GET /scenarios/share/{token}` endpoint
- [ ] Add read-only mode for shared scenarios
- [ ] Add expiration on share tokens

### 3.5: Add Simulation Result Compression ✅ DONE

**Impact**: `SimulationResponse` sends 50+ fields × n_years as lists. For 40 years × 2000 iterations, this is significant.

**Done**:
- `?compress=true` query parameter on `GET /api/simulation/export`
- gzip compression via `zlib.compress()`
- `Content-Encoding: gzip` header on compressed responses
- `X-Content-Size` header with original uncompressed size

### 3.6: Add Webhook / Notification Support

**Impact**: No way to notify when long simulations complete.

**Effort**: Medium

**Tasks**:
- [ ] Add `POST /webhooks` endpoint
- [ ] Add `notification_url` to simulation requests
- [ ] Implement async task queue for simulation results
- [ ] Add retry logic for failed notifications
