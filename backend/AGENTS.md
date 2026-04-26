# FinanceMgmt Backend — Architecture Reference

## 1. Overview

This is the backend for a **UK retirement planner** website. It provides:
- **Scenario CRUD** — users define financial scenarios (people, incomes, assets, properties, expenses)
- **Monte Carlo simulation** — runs thousands of retirement paths with stochastic returns
- **Optimization tools** — safe withdrawal rate analysis, bond allocation sweep

The backend is a **FastAPI** application backed by **SQLite** (async via `aiosqlite`), with a **Numba**-accelulated simulation engine at its core.

---

## 2. Tech Stack

| Layer | Technology |
|-------|-----------|
| Web framework | FastAPI 0.115 |
| ORM | SQLAlchemy 2.0 (async, declarative) |
| Database | SQLite (aiosqlite) |
| Migrations | Alembic + custom additive migrations (`migrations.py`) |
| Validation | Pydantic v2 |
| Simulation engine | Numba (`njit`/`prange`) + NumPy |
| Settings | pydantic-settings |
| HTTP client (tests) | httpx + pytest-asyncio |

---

## 3. Project Layout

```
backend/
├── main.py                  # FastAPI app factory, lifespan, health endpoints
├── database.py              # Async engine/session builder, init_db, provide_session
├── settings.py              # Pydantic Settings (FINANCES_ env prefix)
├── dependencies.py          # FastAPI dependency: get_db_session
├── migrations.py            # Custom SQLite additive migrations (ALTER TABLE)
├── requirements.txt
│
├── models/                  # SQLAlchemy ORM models
│   ├── base.py              # DeclarativeBase, TimestampMixin, utc_now()
│   ├── scenario.py          # Scenario (root aggregate, owns all children)
│   ├── person.py            # Person (adults + children)
│   ├── income.py            # Income (salary, rental, gift via `kind`)
│   ├── assets.py            # Asset (ISA/GIA/CASH/PENSION)
│   ├── expenses.py          # Expense (inflation-linked)
│   ├── property.py          # Property (with embedded mortgage)
│   └── __init__.py
│
├── schemas/                 # Pydantic request/response schemas
│   ├── scenario.py          # ScenarioCreate / ScenarioRead
│   ├── person.py            # PersonCreate / PersonRead
│   ├── assets.py            # AssetCreate / AssetRead + AssetType enum
│   ├── income.py            # IncomeCreate / IncomeRead
│   ├── expenses.py          # ExpenseCreate / ExpenseRead
│   ├── property.py          # PropertyCreate / PropertyRead
│   ├── simulation.py        # All simulation request/response models
│   └── admin.py             # Admin endpoint schemas (historical returns metadata)
│
├── routers/                 # FastAPI route handlers
│   ├── __init__.py          # Aggregates config + simulation + admin routers
│   ├── config.py            # Scenario CRUD + tax-year presets endpoint
│   ├── simulation.py        # Simulation endpoints (run, init, recalc, etc.)
│   └── admin.py             # Admin endpoints (historical returns upload, metadata)
│
├── simulation/              # Monte Carlo engine
│   ├── engine.py            # SimulationAssumptions, SimulationScenario, SimulationRunMatrices
│   ├── engine_fast.py       # Numba kernel (_simulate_all_iterations)
│   ├── array_scenario.py    # ArrayScenario: converts Scenario → flat numpy arrays
│   ├── returns_cache.py     # CachedSession, session TTL, returns matrix generation
│   ├── historical_returns.py # Historical S&P 500 + bond TSV data loader
│   ├── results.py           # (deprecated — output now uses SimulationRunMatrices)
│   ├── validator.py         # SimulationScenarioValidator — validates scenario inputs
│   ├── service.py           # ScenarioBuilder, ResponseFormatter, SimulationService
│   └── bond_sweep.py        # BondSweepService (coarse → refining → fine)
│   │
│   ├── entities/            # OO entity classes (legacy/unused by fast engine)
│   │   ├── base.py          # SimContext, FinancialEntity Protocol
│   │   ├── person.py        # PersonEntity
│   │   ├── asset.py         # AssetAccount (deposit/withdraw/growth)
│   │   ├── pension.py       # PensionPot
│   │   ├── property.py      # PropertyEntity
│   │   ├── salary.py        # SalaryIncome
│   │   ├── expense.py       # ExpenseItem
│   │   ├── cash.py          # Cash
│   │   ├── isa.py           # IsaAccount
│   │   ├── rental_income.py # RentalIncome
│   │   ├── gift_income.py   # GiftIncome
│   │   ├── state_pension.py # StatePension
│   │   └── __init__.py
│   │
│   └── tax/                 # UK tax calculations (Python + Numba)
│       ├── tax_config.py    # TaxYearConfig presets (2021/22 → 2025/26)
│       ├── income_tax.py    # Python income tax + _calculate_income_tax (Numba)
│       ├── national_insurance.py
│       ├── pension_drawdown.py # Python + fast (Numba) versions
│       ├── withdrawals.py   # GIA withdrawal with CGT, tax-free withdrawal
│       ├── pension_relief.py
│       ├── calculator.py    # TaxCalculator (combines income tax + NI)
│       └── fast_tax.py      # Standalone Numba tax functions; parity-tested with Python tax modules
│
├── alembic/
│   ├── env.py               # Async migration runner
│   └── versions/
│       ├── 62e8a9e7caec_initial_schema.py
│       └── 9f3f8b6a2d41_move_mortgage_to_properties.py
│
└── tests/
    ├── conftest.py          # anyio_backend fixture
    ├── test_api.py          # Integration tests (TestClient, in-memory SQLite)
    ├── test_engine_equivalence.py  # Engine output + tax equivalence tests
    ├── test_tax.py          # Tax calculation unit tests
    ├── test_schemas.py      # Pydantic validation tests
    ├── test_historical_returns.py
    ├── test_database_init.py
    ├── test_validator.py    # Simulation scenario validation tests
    └── benchmark_engine.py
    └── test_bond_sweep.py     # Bond sweep async/cancel/progress tests
```

---

## 4. Data Flow

### 4.1 Scenario CRUD

```
HTTP Request → Pydantic Schema (schemas/) → SQLAlchemy Model (models/) → SQLite
HTTP Response ← Pydantic Schema ← SQLAlchemy Model ← SQLite
```

- **`routers/config.py`** handles all scenario CRUD
- **`_scenario_query()`** helper uses `selectinload` for all child collections
- **`ScenarioCreate`** is a nested schema — create/update sends the full tree
- Person IDs are preserved across updates to maintain income/asset assignments

### 4.2 Simulation Pipeline

```
1. POST /api/simulation/init
   ├── ScenarioBuilder.load_scenario() → SQLAlchemy Scenario
   ├── ScenarioBuilder.build() → SimulationScenario (Python objects)
   ├── SimulationScenarioValidator.validate() → errors if invalid
   ├── generate_returns_matrix() → ReturnsMatrix (pre-computed stochastic draws)
   ├── create_session() → session_id (TTL: 30 min)
   └── SimulationService.run_simulation() → formatted dict

2. POST /api/simulation/recalc (interactive tweaking)
   ├── get_session(session_id) → cached ReturnsMatrix
   ├── ScenarioBuilder.build_variant() → variant SimulationScenario
   ├── run_simulation() → new SimulationResponse

3. POST /api/simulation/bond-sweep (optimization)
   ├── BondSweepService.run() → BondSweepResponse
   ├── Coarse → Refining → Fine rounds
   ├── Binary search per combo
   └── Return optimal + marginals
```

### 4.3 Fast Engine Core

```
SimulationScenario + ReturnsMatrix
        ↓
build_array_scenario() → ArrayScenario (flat numpy arrays)
        ↓
_simulate_all_iterations() [Numba njit, prange(parallel)]
        ↓
SimulationRunMatrices (dict[str, ndarray] with shape (iterations, n_years))
        ↓
ResponseFormatter.format() → dict
        ↓
SimulationResponse (Pydantic)
```

The fast engine uses **43 output fields** stored as `float64` arrays. Boolean metrics use 0.0/1.0 for fast averaging.

---

## 5. Key Domain Concepts

### 5.1 Asset Types

| Type | Tax Treatment | Withdrawal |
|------|--------------|------------|
| **ISA** | Tax-free growth & withdrawal | Tax-free |
| **GIA** (General Investment) | CGT on gains | Taxed at marginal rate |
| **Pension** | Tax-free growth | 25% tax-free lump sum, 75% taxable |
| **CASH** | No growth (in engine) | N/A (holding account) |

### 5.2 Retirement Discretionary Spending

`annual_spend_target` / fun fund phases in by retired adult share in `engine_fast.py` (e.g. 1 of 2 adults retired means 50% of the configured amount is spent). The configured amount inflates annually.

### 5.3 Withdrawal Priority

Assets are withdrawn in priority order (higher = first):
1. **Pension** (priority 100) — only after pension access age
2. **ISA** (priority 50) — tax-free
3. **GIA** (priority 40) — taxable, CGT applied
4. **Property** (priority 15) — net after mortgage repayment
5. **Cash** (priority 0) — never withdrawn from

### 5.4 UK Tax Year Presets

Available: 2021/22, 2022/23, 2023/24, 2024/25, 2025/26

Each has:
- Income tax: PA, basic/higher/additional rate limits & rates
- NI: primary threshold, upper earnings limit, main/upper rates

### 5.5 Return Models

| Model | Description |
|-------|-------------|
| **parametric** | Normal distribution per asset class, per year |
| **historical_bootstrap** | Stationary block bootstrap on aligned S&P 500 + US 10Y Treasury data |

### 5.6 Simulation Session

- `init` generates returns + scenario → cached in `_CACHE` dict
- TTL: 30 minutes (monotonic clock)
- `recalc` reuses cached returns, only rebuilds scenario + runs engine
- `bond-sweep` and `bond-override` also require historical_bootstrap mode

---

## 6. Output Field Reference

The fast engine produces 43 fields per (iteration, year):

| Index | Field | Type | Notes |
|-------|-------|------|-------|
| 0 | net_worth | float64 | Assets − Liabilities |
| 1 | salary_gross | float64 | |
| 2 | salary_net | float64 | After tax + NI + employee pension |
| 3 | rental_income | float64 | Gross rental income |
| 4 | gift_income | float64 | Tax-free |
| 5 | pension_income | float64 | Net pension drawdown |
| 6 | state_pension_income | float64 | Gross state pension received |
| 7 | investment_returns | float64 | All asset + property + pension returns |
| 8 | total_income | float64 | Net cashflow income after income taxes/NI where modelled |
| 9 | total_expenses | float64 | |
| 10 | mortgage_payment | float64 | |
| 11 | pension_contributions | float64 | Employee + employer |
| 12 | fun_fund | float64 | Extra retirement spend |
| 13 | income_tax_paid | float64 | Legacy aggregate: income tax + pension drawdown tax + CGT |
| 14 | ni_paid | float64 | |
| 15 | total_tax | float64 | `income_tax_paid` plus NI |
| 16 | isa_balance | float64 | |
| 17 | pension_balance | float64 | |
| 18 | cash_balance | float64 | |
| 19 | total_assets | float64 | |
| 20 | mortgage_balance | float64 | Total property mortgage |
| 21 | total_liabilities | float64 | |
| 22 | mortgage_paid_off | float64 | 0/1 |
| 23 | is_depleted | float64 | 0/1 |
| 24 | is_bankrupt | float64 | 0/1 |
| 25 | debt_balance | float64 | |
| 26 | debt_interest_paid | float64 | |
| 27–30 | isa/gia/cash/pension_returns | float64 | Per-type returns |
| 31–32 | isa/gia_contributions | float64 | |
| 33 | pension_contributions_total | float64 | |
| 34–36 | isa/gia/pension_withdrawals | float64 | |
| 37 | gia_balance | float64 | |
| 38 | property_value | float64 | |
| 39 | property_rental_income | float64 | |
| 40 | property_maintenance | float64 | |
| 41 | property_returns | float64 | |
| 42 | state_pension_tax_paid | float64 | Income tax attributable to state pension after salary/rental income |

---

## 7. API Endpoints

### Config (`/api/config/`)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/tax-years` | Available UK tax year presets |
| GET | `/scenarios` | List all scenarios |
| GET | `/scenarios/{id}` | Get scenario with all children |
| POST | `/scenarios` | Create scenario (nested payload) |
| PUT | `/scenarios/{id}` | Update scenario (full replacement) |
| DELETE | `/scenarios/{id}` | Delete scenario |
| POST | `/scenarios/{id}/clone` | Clone scenario with all children |

### Simulation (`/api/simulation/`)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/historical-returns` | S&P 500 + bond historical data |
| POST | `/run` | Run simulation (no caching) |
| POST | `/init` | Initialize + run (caches returns) |
| POST | `/recalc` | Recalculate with spend/retirement changes |
| POST | `/safe-withdrawal` | Find max safe fun fund |
| POST | `/bond-sweep` | Bond allocation optimization (async, returns after completion). Use `max_combos` in request to cap combos (useful for testing). |
| GET | `/bond-sweep/progress` | Poll sweep progress |
| POST | `/bond-sweep/{session_id}/cancel` | Cancel a running bond sweep |
| POST | `/bond-override` | Apply bond overrides |
| GET | `/export` | Export results as CSV/JSON (add `?compress=true` for gzip) |

### Admin (`/api/admin/`)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/historical-returns/metadata` | View current historical data metadata |
| POST | `/historical-returns/upload` | Upload new equity return data (CSV/TSV) |
| POST | `/historical-returns/bond-upload` | Upload new bond return data (CSV/TSV) |

---

## 8. Testing

- **Integration tests** (`test_api.py`): FastAPI `TestClient` with in-memory SQLite
- **Engine tests** (`test_engine_equivalence.py`): Numba engine correctness, tax equivalence
- **Tax tests** (`test_tax.py`): UK tax calculations against known worked examples
- **Schema tests** (`test_schemas.py`): Pydantic validation edge cases
- **Validator tests** (`test_validator.py`): Simulation scenario validation
- **Benchmark** (`benchmark_engine.py`): Performance measurement

Run: `pytest` or `pytest -v`

---

## 9. Configuration

Environment variables (prefix: `FINANCES_`):
| Variable | Default | Description |
|----------|---------|-------------|
| `FINANCES_SQLITE_PATH` | `finances.db` | SQLite database path |
| `FINANCES_CORS_ORIGINS` | `["http://localhost:5173", ...]` | CORS allowed origins |

---

## 10. Database Schema

### Tables
- **scenarios** — root aggregate
- **people** — adults + children (scenario child)
- **incomes** — salary/rental/gift (scenario child)
- **assets** — ISA/GIA/CASH/Pension (scenario child)
- **properties** — rental properties with embedded mortgages (scenario child)
- **expenses** — inflation-linked expenses (scenario child)

All use UUID v4 as PK (string, 36 chars). `created_at`/`updated_at` timestamps on all tables.

---

## 11. Working Conventions — Maintain This Docs and TODO Aggressively

**This project loses context periodically.** Agents will restart from these files. Treat them as living documents:

- **Update `TODO.md` after every change.** Add completed items, remove stale ones, adjust priorities when context shifts.
- **Update `AGENTS.md` when the architecture changes.** Every new file, endpoint, model, or engine change should be reflected here.
- **Write tasks aggressively.** If you identify anything worth doing — no matter how small — add it to TODO.md with a clear description. Future-you will thank present-you.
- **Rerun tasks aggressively.** Don't leave TODO items half-done. If you start something, finish it or explicitly demote it. Stale open items create noise.
- **When context is lost, rely on these files.** They are the source of truth for the codebase state, architecture decisions, and remaining work.

## 12. Tasks and Tests — How They Work Together

### Running Tests

```bash
# All tests
pytest

# Specific files
pytest tests/test_api.py
pytest tests/test_engine_equivalence.py
pytest tests/test_tax.py
pytest tests/test_schemas.py
pytest tests/test_validator.py

# With verbose output
pytest -v

# Benchmark (requires pytest-benchmark)
pytest --benchmark-only
```

### Task-Test Relationship

- **Every TODO item that changes behavior must have a test.** New features → new tests. Bug fixes → regression tests. Refactors → verify existing tests still pass.
- **When completing a TODO item:**
  1. Write or update the test first (or alongside the code)
  2. Run `pytest` to confirm green
  3. Mark the item as done in TODO.md
  4. Update AGENTS.md if architecture changed
- **When context is lost and you restart:** Check TODO.md for the last known state. Run `pytest` immediately to verify the codebase is in a working state before making changes.
- **Stale tests are as bad as stale TODO items.** If a test no longer reflects reality, update it — don't leave broken tests lying around.

### Test Coverage Strategy

| Layer | Test File | What to Test |
|-------|-----------|-------------|
| API | `test_api.py` | CRUD correctness, HTTP status codes, validation errors |
| Engine | `test_engine_equivalence.py` | Numba output correctness, tax equivalence, deterministic behavior |
| Tax | `test_tax.py` | Known worked examples, boundary conditions, marginal rates |
| Schemas | `test_schemas.py` | Pydantic validation, edge cases, invalid inputs |
| Data | `test_historical_returns.py` | TSV loading, alignment, stats |
| DB | `test_database_init.py` | Migration paths, schema correctness |

### Adding New Tests

- New simulation features → add to `test_engine_equivalence.py`
- New API endpoints → add to `test_api.py`
- New tax logic → add to `test_tax.py`
- New schema fields → add to `test_schemas.py`
- Use the existing fixture patterns (`_make_test_scenario()`, `_minimal_scenario_payload()`)

## 13. Important Implementation Notes

1. **Dual entity model**: `entities/` has OO classes (Protocol-based) but the fast engine uses flat `ArrayScenario` + Numba arrays. The OO entities are **not used** by the production engine.

2. **Session caching**: `_CACHE` is an in-memory dict. No persistence. TTL is 30 minutes using `monotonic()` clock.

3. **Bond sweep**: Runs 3 rounds (coarse 25%, refining 5%, fine 1%) with binary search per combo. Total combos = 5^n + 5^n + 7^n where n = active asset classes.

4. **CGT simplification**: Uses a flat CGT rate with annual allowance, proportional cost basis reduction on disposal. Real CGT is more complex (per-disposal rules, loss offsets).

5. **Pension drawdown**: Uses binary search (20 iterations in `engine_fast.py`) to find gross withdrawal that delivers target net income, accounting for 25% tax-free portion and marginal tax rates. Current tax ordering in the fast engine is salary after employee pension contributions → rental/property income → state pension → private pension drawdown. State pension tax is per person and exposed as `state_pension_tax_paid`; private pension drawdown is now processed per pension owner, with each owner using their own allowance/bands and prior taxable pension drawdown in the year.

6. **Historical data**: Loaded from TSV files in `data/` directory. Aligned to overlapping years between S&P 500 (1928+) and US 10Y bonds (1960+).

7. **Migration strategy**: Alembic for schema changes + `migrations.py` for additive column migrations on existing databases. SQLite `ALTER TABLE` is limited, so table recreation is used for column drops.

8. **Bond sweep cancellation**: `BondSweepService.run_async()` runs in a background task with per-combo cancellation checks. `POST /bond-sweep/{session_id}/cancel` marks the sweep as cancelled and cancels the asyncio.Task. `_SWEEP_LOCK` ensures thread-safe progress updates. `_SWEEP_TASKS` tracks running tasks.

9. **Request timeout middleware**: `REQUEST_TIMEOUT` (3600s default) in `main.py` provides a safety net for long-running requests. Returns 504 on timeout. Configurable via environment or code.
