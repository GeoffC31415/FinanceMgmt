# TODO — Architectural Improvements (Priority-Ordered)

> Priority: **P0** (critical) → **P1** (high) → **P2** (medium) → **P3** (nice-to-have)
> Each item includes: impact, effort, and rationale.

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

### 0.2: Add Input Validation for Simulation Scenarios

**Impact**: Users can create scenarios that produce incorrect or silent failures in simulation (e.g., negative balances, impossible dates, zero volatility assets).

**Effort**: Low

**Details**:
- `SimulationRequest` validates iterations/seed but not scenario content
- No validation on `_build_simulation_scenario()` inputs
- Assets with `growth_rate_std = 0` produce degenerate results
- No check that pension access age < planned retirement age

**Tasks**:
- [ ] Add `SimulationScenarioValidator` class
- [ ] Validate: balance ≥ 0, growth_rate_std ≥ 0, retirement age > birth year
- [ ] Validate: pension access age ≤ planned retirement age
- [ ] Validate: no circular references between people and assets
- [ ] Return validation errors in API response (422)

---

## P1 — High

### 1.1: Extract OO Entity Classes from Engine for Testability

**Impact**: The `entities/` directory has OO classes that implement the same logic as the Numba engine but are **never used**. This is dead code that causes confusion.

**Effort**: Medium

**Details**:
- `entities/` has `AssetAccount`, `PensionPot`, `SalaryIncome`, etc. with `step()`, `get_balance_sheet()`, `get_cash_flows()` methods
- These implement the same financial logic as the Numba engine but as Python objects
- The fast engine bypasses them entirely, using flat `ArrayScenario` + `prange`
- **Option A**: Delete the `entities/` directory (cleanup)
- **Option B**: Use them as a reference implementation for testing the Numba engine
- **Option C**: Refactor to use entities as the primary model and compile a Numba path

**Recommendation**: The data classes (AssetAccount, PensionPot, etc.) are still needed as type definitions by `engine.py` and `routers/simulation.py`. However, the OO methods (`step()`, `get_balance_sheet()`, `get_cash_flows()`) inside these classes are dead code.

**Tasks**:
- [ ] Strip OO methods from entity classes (keep data class structure)
- [ ] Or: move data classes to `simulation/engine.py` and delete `entities/` entirely
- [ ] Update test fixtures that reference entity classes
- [ ] Add entity classes back as reference implementations in `tests/fixtures/` if needed

---

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

---

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

### 1.4: Add Comprehensive API Documentation

**Impact**: No OpenAPI/Swagger docs configured. No developer onboarding docs.

**Effort**: Low

**Details**:
- FastAPI auto-generates OpenAPI but no descriptions on endpoints/schemas
- No `docs_url` or `redoc_url` configured
- No API reference for frontend developers

**Tasks**:
- [ ] Configure `docs_url="/docs"` and `redoc_url="/redoc"` in `create_app()`
- [ ] Add `Field(description=...)` to all Pydantic models
- [ ] Add `summary` and `description` to all route decorators
- [ ] Add example request/response bodies
- [ ] Write API reference document

---

## P2 — Medium

### 2.1: Separate Simulation Engine from HTTP Layer

**Impact**: `routers/simulation.py` is ~500 lines mixing HTTP, data loading, scenario building, and response formatting.

**Effort**: Medium

**Details**:
- Extract `_build_simulation_scenario()` into a `ScenarioBuilder` class
- Extract `_response_from_matrices()` into a `ResponseFormatter` class
- Create a `SimulationService` that orchestrates the pipeline
- This makes the engine testable without HTTP fixtures

**Tasks**:
- [ ] Create `simulation/service.py` with `SimulationService` class
- [ ] Extract `_build_simulation_scenario()` → `ScenarioBuilder`
- [ ] Extract `_response_from_matrices()` → `ResponseFormatter`
- [ ] Extract `_build_scenario_from_cached()` → `ScenarioVariantBuilder`
- [ ] Refactor `routers/simulation.py` to use service
- [ ] Add unit tests for service layer

---

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

### 2.3: Add Data Export Functionality

**Impact**: No way to export simulation results for analysis. Users are locked into the frontend visualization.

**Effort**: Low

**Details**:
- `SimulationResponse` has all data needed for export
- Add CSV/JSON export endpoints
- Support percentile bands (p10, median, p90)

**Tasks**:
- [ ] Add `GET /simulation/{session_id}/export?format=csv` endpoint
- [ ] Add `GET /simulation/{session_id}/export?format=json` endpoint
- [ ] Include all 42 fields in export
- [ ] Add column headers for frontend consumption

---

### 2.4: Add Scenario Cloning / Duplication

**Impact**: Users can't easily create variant scenarios (e.g., "try retirement at 60 instead of 65").

**Effort**: Low

**Details**:
- Current workflow: create new scenario from scratch or use `/recalc` with offsets
- `/recalc` only works within a simulation session (30 min TTL)
- No way to persist scenario variants

**Tasks**:
- [ ] Add `POST /scenarios/{id}/clone` endpoint
- [ ] Deep-copy scenario + all children with new UUIDs
- [ ] Optionally allow name modification
- [ ] Add `POST /scenarios/{id}/compare` for side-by-side simulation

---

### 2.5: Add Database Indexing and Query Optimization

**Impact**: No indexes on foreign keys. `_scenario_query()` loads full eager-loaded trees on every request.

**Effort**: Low

**Details**:
- `Scenario` has 5 child relationships, all loaded eagerly via `selectinload`
- No database indexes on `scenario_id` columns
- `prAGMA table_info` queries in migrations run on every startup

**Tasks**:
- [ ] Add indexes on `scenario_id` in all child tables
- [ ] Add indexes on `person_id` in `assets`, `incomes`, `properties`
- [ ] Add index on `created_at` for scenario listing
- [ ] Optimize `_get_table_columns()` to cache PRAGMA results

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

### 3.2: Add Historical Return Data Management

**Impact**: TSV files are loaded at import time with no versioning. No way to update data without code changes.

**Effort**: Low

**Tasks**:
- [ ] Add `/admin/historical-returns` endpoint to upload new TSV files
- [ ] Add data source metadata (last updated, source URL)
- [ ] Validate data on upload (year continuity, no NaN)

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

### 3.5: Add Simulation Result Compression

**Impact**: `SimulationResponse` sends 50+ fields × n_years as lists. For 40 years × 2000 iterations, this is significant.

**Effort**: Low

**Tasks**:
- [ ] Add `?compress=true` query parameter
- [ ] Use zlib/gzip compression for response body
- [ ] Return `Content-Encoding: gzip` header

### 3.6: Add Webhook / Notification Support

**Impact**: No way to notify when long simulations complete.

**Effort**: Medium

**Tasks**:
- [ ] Add `POST /webhooks` endpoint
- [ ] Add `notification_url` to simulation requests
- [ ] Implement async task queue for simulation results
- [ ] Add retry logic for failed notifications

---

## Quick Wins (Low Effort, High Impact)

| # | Task | Effort | Status |
|---|------|--------|--------|
| Q1 | Delete `simulation/entities/` (dead code) | 1 hour | ⚠️ PARTIAL — data classes still needed by engine, OO methods are dead |
| Q2 | Add `docs_url="/docs"` to FastAPI app | 5 min | ✅ DONE |
| Q3 | Add `Field(description=...)` to all Pydantic models | 2 hours | |
| Q4 | Add database indexes on foreign keys | 30 min | ✅ DONE |
| Q5 | Add scenario clone endpoint | 1 hour | ✅ DONE |
| Q6 | Add CSV export endpoint | 1 hour | ✅ DONE |
| Q7 | Add simulation scenario validation | 2 hours | ✅ DONE |
| Q8 | Configure pytest-benchmark in CI | 1 hour | |
| Q9 | Add `__all__` exports to all `__init__.py` files | 30 min | ✅ DONE |
| Q10 | Add logging for slow requests (>1s) | 30 min | ✅ DONE |
