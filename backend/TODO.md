# TODO — FinanceMgmt Backend

> Priority: **P0** (critical) → **P1** (high) → **P2** (medium) → **P3** (nice-to-have)

**Tests**: 134 passing ✓

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

---

## P0 — Critical

### 0.1: Replace In-Memory Session Cache with Persistent Store

**Impact**: Simulation sessions are lost on process restart. No multi-worker support. Memory leaks in long-running processes.

**Effort**: Medium

**Details**:
- `_CACHE` in `returns_cache.py` is a plain `dict[str, CachedSession]` — volatile.
- `bond-sweep` stores progress in `_SWEEP_PROGRESS` — also volatile.
- Add a TTL-based eviction that's more robust (currently uses `monotonic()` which doesn't survive restarts).
- Consider Redis for multi-worker deployments, or at least a simple file-backed cache for single-worker.

**Tasks**:
- [ ] Design cache backend interface (Redis + fallback to in-memory)
- [ ] Implement TTL-aware serialization for `CachedSession`
- [ ] Replace `_SWEEP_PROGRESS` with persistent progress store
- [ ] Add health check for cache backend

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

### 1.3: Add Simulation Cancellation / Timeout

**Impact**: Bond sweep can take minutes (hundreds of simulation runs). No way to cancel. No timeout on long requests.

**Effort**: Medium

**Details**:
- `bond_sweep()` runs synchronously with no cancellation
- Long sweeps block the event loop
- No progress tracking endpoint that works reliably

**Tasks**:
- [ ] Add `asyncio.create_task()` for long-running sweeps
- [ ] Add `/bond-sweep/{session_id}/cancel` endpoint
- [ ] Add request timeout middleware (e.g., 60s)
- [ ] Return progress polling via `/bond-sweep/progress` (already exists, needs async support)

---

## P2 — Medium

### 2.1: Separate Simulation Engine from HTTP Layer ✅ DONE

**Impact**: `routers/simulation.py` reduced from 1,072 → 383 lines (64% reduction).

**Done**:
- `simulation/service.py` — `ScenarioBuilder` (DB → SimulationScenario), `ResponseFormatter` (matrices → dict), `SimulationScenarioValidator`, `SimulationService` (orchestrator)
- `simulation/bond_sweep.py` — `BondSweepService` (coarse → refining → fine sweep)
- Router now delegates to services; only specialized logic remains inline (safe-withdrawal binary search, CSV/JSON export)
- All 134 tests pass

**Remaining**: Add unit tests for `SimulationService` and `ResponseFormatter` (separate from HTTP fixtures).

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
