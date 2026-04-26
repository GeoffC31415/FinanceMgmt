# Finances Simulator

A local web application for modelling household finances and simulating long-term retirement outcomes. Built around a Monte Carlo simulation engine, it projects net worth, income, spending, taxes, and risk metrics across thousands of possible futures — helping you answer questions like "How much can I safely spend in retirement?" and "What asset allocation minimises my risk of running out of money?"

The simulator is designed for UK-based households and includes built-in UK tax logic (income tax bands, National Insurance, pension relief, capital gains tax, and pension drawdown taxation).

---

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
- [Configuration](#configuration)
- [Usage Guide](#usage-guide)
  - [Creating a Scenario](#creating-a-scenario)
  - [Running a Simulation](#running-a-simulation)
  - [Reading the Dashboard](#reading-the-dashboard)
  - [Safe Withdrawal Analysis](#safe-withdrawal-analysis)
  - [Bond Allocation Sweep](#bond-allocation-sweep)
  - [Comparing Scenarios](#comparing-scenarios)
  - [Exporting to Excel](#exporting-to-excel)
- [How the Simulation Works](#how-the-simulation-works)
  - [Yearly Sequence](#yearly-sequence)
  - [Income Types and Tax Treatment](#income-types-and-tax-treatment)
  - [Surplus Allocation](#surplus-allocation)
  - [Shortfall and Withdrawal Order](#shortfall-and-withdrawal-order)
  - [Retirement Discretionary Spending](#retirement-discretionary-spending)
  - [Return Models](#return-models)
  - [UK Tax Model](#uk-tax-model)
- [API Reference](#api-reference)
- [Project Structure](#project-structure)
- [Development](#development)
- [Simplifications and Limitations](#simplifications-and-limitations)

---

## Features

- **Household modelling** — Define people (adults and children), salaries, pensions, rental income, gifts, ISAs, GIAs, cash accounts, properties with mortgages, and recurring expenses.
- **Monte Carlo simulation** — Run 2,000+ iterations with either parametric (normal distribution) or historical bootstrap (S&P 500 + US 10-Year Treasury) return models, powered by a Numba JIT-accelerated engine.
- **Session-based recalculation** — Initialise a simulation session once, then instantly recalculate with different spending targets, retirement ages, or percentile views without regenerating the underlying return matrices.
- **Safe withdrawal analysis** — Binary-search for the maximum discretionary "fun fund" spending that keeps bankruptcy risk below a configurable threshold.
- **Bond allocation sweep** — Adaptive coarse-to-fine combinatorial search across ISA, GIA, and pension bond allocations to find the mix that maximises safe withdrawal (historical bootstrap only).
- **Scenario comparison** — Compare up to three scenarios side-by-side with overlaid net worth charts.
- **Rich visualisations** — Net worth (with P10/P90 uncertainty bands), income breakdown, expense breakdown, asset balances, per-asset-type detail, risk timeline (depletion and bankruptcy probability), sensitivity curves, and bond allocation marginal curves.
- **Real vs nominal toggle** — Switch all charts between nominal and inflation-adjusted (real) values.
- **Percentile selection** — View the simulation from any percentile perspective (P10 through P90).
- **Excel export** — Export full simulation results to a formatted `.xlsx` workbook.
- **UK tax presets** — Select a tax year preset (e.g. 2024/25) or manually configure all tax bands, NI thresholds, and rates.
- **Config wizard** — Guided multi-step scenario builder for new users.

---

## Architecture

The application is a client-server web app running entirely on your local machine:

```
┌──────────────────────┐         ┌──────────────────────┐
│   React SPA (Vite)   │  HTTP   │   FastAPI Backend     │
│   localhost:5173      │◄───────►│   localhost:8000      │
│                      │         │                      │
│  - Dashboard         │         │  - REST API          │
│  - Config wizard     │         │  - Monte Carlo engine│
│  - Charts (Recharts) │         │  - UK tax calculator │
│  - Excel export      │         │  - SQLite database   │
└──────────────────────┘         └──────────────────────┘
```

- **Frontend**: React 18 single-page application built with Vite, styled with Tailwind CSS, with Recharts for data visualisation.
- **Backend**: FastAPI (Python) with async SQLite via SQLAlchemy 2.0, Numba-accelerated Monte Carlo engine, and Pydantic v2 for request/response validation.
- **Database**: SQLite file (`finances.db` by default) with Alembic migrations applied automatically at startup.

---

## Tech Stack

### Backend

| Technology | Purpose |
|---|---|
| Python 3.10+ | Runtime |
| FastAPI 0.115 | Async API framework |
| Uvicorn 0.30 | ASGI server |
| SQLAlchemy 2.0 | Async ORM (aiosqlite driver) |
| Pydantic 2.10 | Request/response validation and settings |
| NumPy 2.1 | Numerical arrays and statistics |
| Numba ≥0.58 | JIT compilation for Monte Carlo hot loops |
| Alembic ≥1.13 | Database migrations |
| pytest / httpx | Testing |

### Frontend

| Technology | Purpose |
|---|---|
| React 18 | UI framework |
| Vite 6 | Dev server and build tool |
| TypeScript 5.7 | Type safety |
| Tailwind CSS 3.4 | Utility-first styling |
| Recharts 2.13 | Charting library |
| React Hook Form + Zod | Form handling and validation |
| React Router 6 | Client-side routing |
| ExcelJS 4.4 | Excel workbook generation |
| Vitest + Testing Library | Frontend testing |

---

## Getting Started

These instructions work from a **fresh clone** on both **Linux** and **Windows**.

### Prerequisites

Install the following first:

- Python 3.10 or later
- Node.js 18 or later
- npm
- Git

Check your versions:

```bash
python --version
node --version
npm --version
```

If `python` is not available on Linux, use `python3` in the commands below.
On Windows, if `python` is not available, use `py -3` instead.

### 1. Clone the repository

```bash
git clone <YOUR-REPO-URL>
cd FinanceMgmt
```

### 2. Create and activate a Python virtual environment

#### Linux / macOS

```bash
python3 -m venv .venv
source .venv/bin/activate
```

#### Windows PowerShell

```powershell
py -3 -m venv .venv
.\.venv\Scripts\Activate.ps1
```

If PowerShell blocks activation, run this once in PowerShell and then activate again:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

#### Windows Command Prompt

```bat
py -3 -m venv .venv
.venv\Scripts\activate.bat
```

### 3. Install backend dependencies

With the virtual environment activated:

```bash
python -m pip install --upgrade pip
python -m pip install -r backend/requirements.txt
```

### 4. Install frontend dependencies

In a second terminal, or after backend setup:

```bash
cd frontend
npm install
cd ..
```

### 5. Start the backend

#### Linux / macOS

```bash
source .venv/bin/activate
./start_backend.sh
```

#### Windows PowerShell

```powershell
.\start_backend.ps1
```

#### Windows Command Prompt

```bat
start_backend.bat
```

The backend will be available at `http://127.0.0.1:8000`.
On first startup, the SQLite database is created automatically and migrations are applied.

Verify the backend:

```bash
curl http://127.0.0.1:8000/health
curl http://127.0.0.1:8000/ready
```

If `curl` is not available on Windows, open these URLs in your browser instead:

- `http://127.0.0.1:8000/health`
- `http://127.0.0.1:8000/ready`

You should see:

```json
{"status":"ok"}
```

for `/health`, and:

```json
{"status":"ok","database":"ok"}
```

for `/ready`.

If port `8000` is already in use, `start_backend.sh` prints a clearer message showing the conflict instead of only surfacing raw `Errno 98` output.

### 6. Start the frontend

Open another terminal in the repo root.

#### Linux / macOS

```bash
./start_frontend.sh
```

#### Windows PowerShell

```powershell
.\start_frontend.ps1
```

#### Windows Command Prompt

```bat
start_frontend.bat
```

The frontend will be available at `http://127.0.0.1:5173`.

### Local development notes

- Keep the backend running on `127.0.0.1:8000`.
- Open the frontend at `http://127.0.0.1:5173` or `http://localhost:5173`.
- The frontend talks to `http://{current-hostname}:8000/api` by default, so using localhost/127.0.0.1 for both is the simplest setup.
- Unix-like shells can use `start_backend.sh` and `start_frontend.sh`.
- Windows can use `start_backend.bat`, `start_frontend.bat`, `start_backend.ps1`, or `start_frontend.ps1`.

### Production Build

```bash
cd frontend
npm run build
npm run preview
```

---

## Configuration

### Environment Variables

All environment variables are optional. Defaults work out of the box for local development.

| Variable | Default | Description |
|---|---|---|
| `FINANCES_SQLITE_PATH` | `finances.db` | Path to the SQLite database file |
| `FINANCES_CORS_ORIGINS` | `["http://localhost:5173", "http://127.0.0.1:5173", "http://wsl.localhost:5173"]` | Allowed CORS origins (JSON list) |
| `VITE_API_BASE_URL` | `http://{hostname}:8000/api` | API base URL used by the frontend |

---

## Usage Guide

### Creating a Scenario

A scenario represents your complete household financial picture. You can create one from the **Config** page or use the step-by-step **Config Wizard**.

A scenario contains:

1. **People** — Adults (with birth dates, planned retirement ages, and state pension ages) and optionally children (with annual costs and the age they leave the household).
2. **Income** — One or more income sources per person:
   - **Salary**: Employment income with gross amount, growth rate, and employee/employer pension contribution percentages. Automatically stops at retirement age.
   - **Rental**: Property rental income subject to income tax only (no NI). Can continue past retirement.
   - **Gift**: Tax-free income (e.g. family gifts, expected inheritance). Can be one-off or recurring.
3. **Assets** — Financial accounts of four types:
   - **Cash**: Low-risk, liquid savings.
   - **ISA**: Tax-free investment wrapper with an annual contribution limit (default £20,000).
   - **GIA**: General investment account, subject to CGT on withdrawals.
   - **Pension**: Workplace or personal pension pots, accessible from pension access age (default 55). Supports bond allocation.
   - Each asset has a balance, growth rate (mean and standard deviation), optional annual contribution cap, withdrawal priority, and bond allocation percentage.
4. **Properties** — Real estate with value, appreciation rates, mortgage details (LTV, rate, term), rental income, occupancy rate, and maintenance costs.
5. **Expenses** — Recurring household expenses (monthly amounts). Each can be marked as inflation-linked or fixed.
6. **Assumptions** — Global simulation parameters including:
   - Return model (parametric or historical bootstrap)
   - Inflation rate, ISA annual limit, state pension amount
   - Tax bands and NI thresholds (or a tax year preset)
   - Pension access age, emergency fund months
   - Debt interest rate, bankruptcy threshold
   - Simulation time horizon (start year, end year)
   - Annual discretionary spend target

### Running a Simulation

1. Navigate to the **Simulation** dashboard (home page).
2. Select a scenario from the dropdown.
3. Adjust the **spend target** (annual discretionary retirement spending) and **retirement age offset** (shift retirement earlier or later) using the sliders.
4. The simulation runs automatically when you change the scenario or adjust parameters. It initialises a session on first load, then uses fast recalculation for subsequent parameter changes.
5. Use the **percentile selector** (P10–P90) to view different outcome scenarios. P10 represents a pessimistic outcome, P50 is the median, and P90 is optimistic.

### Reading the Dashboard

The dashboard is organised into tabs:

- **Overview** — Net worth chart with P10/P90 uncertainty bands, key insights panel, and risk summary showing depletion and bankruptcy probabilities.
- **Income & Spending** — Stacked area charts breaking down income sources (salary, rental, gift, pension, state pension, investment returns) and expenses (bills, mortgage, pension contributions, fun fund, taxes).
- **Assets** — Stacked area chart of asset balances by type (cash, ISA, GIA, pension, property) with a detailed per-asset-type view showing returns, contributions, and withdrawals.
- **Risk Analysis** — Risk timeline showing the probability of asset depletion and bankruptcy over time, plus sensitivity analysis (see below).
- **Allocation** — Bond allocation sweep results (see below).

All charts support a **Real / Nominal** toggle to switch between inflation-adjusted and nominal values. Retirement years are marked with vertical dashed lines.

### Safe Withdrawal Analysis

The safe withdrawal feature answers: "What is the maximum I can spend each year in retirement without an unacceptable risk of going broke?"

1. On the **Risk Analysis** tab, click **Find Safe Withdrawal**.
2. The engine sweeps spending values from £0 up to a configurable maximum, running the full simulation at each level.
3. It then uses binary search to refine the result to approximately ±£1 precision.
4. The result shows:
   - The **maximum safe fun fund** — the highest annual discretionary spend where bankruptcy risk stays below your threshold (default 5%).
   - A **sensitivity curve** plotting bankruptcy probability and P10 final net worth against spending level.

### Bond Allocation Sweep

The bond sweep finds the optimal mix of equities and bonds across your ISA, GIA, and pension to maximise your safe withdrawal amount. This feature requires the **historical bootstrap** return model.

1. On the **Allocation** tab, click **Run Bond Sweep**.
2. The engine performs an adaptive three-round search:
   - **Round 1**: Coarse scan at 25% steps (0%, 25%, 50%, 75%, 100% bonds for each asset class).
   - **Round 2**: Medium scan at 5% steps around the best result from round 1.
   - **Round 3**: Fine scan at 1% steps around the best result from round 2.
3. Progress is displayed in real-time as the sweep runs.
4. Results show:
   - The **optimal allocation** — the bond percentages for each asset class that maximise safe withdrawal.
   - **Top 10 combinations** ranked by maximum safe fun fund.
   - **Marginal curves** for each asset class, showing how varying its bond allocation (averaged across all other combos) affects the maximum safe withdrawal.

### Comparing Scenarios

1. Navigate to the **Compare** page.
2. Select up to three scenarios.
3. The simulator runs each scenario and overlays their net worth charts for visual comparison.
4. A summary table shows median final net worth for each scenario.

This is useful for comparing decisions like "retire at 55 vs 60", "pay off mortgage early vs invest", or "add buy-to-let income".

### Exporting to Excel

Click the **Export** button on the dashboard to download a `.xlsx` workbook containing the full simulation output: yearly time series for net worth, all income sources, expenses, tax paid, asset balances, returns, contributions, withdrawals, liabilities, and risk metrics.

---

## How the Simulation Works

### Yearly Sequence

The engine simulates year-by-year from the start year to the end year. Each year follows this sequence:

1. **Salary income** is applied for each person who has not yet retired (can be limited by income start/end year).
2. **Rental income** is applied (subject to income tax, no NI). Continues into retirement if configured.
3. **Gift income** is applied (tax-free). Continues into retirement if configured.
4. **Tax is calculated**: salary has income tax + NI; rental has income tax only; gifts are untaxed. Pension contributions (employee share) reduce taxable income.
5. **Mortgage payments** are deducted. **Expenses** are stepped (inflation-linked expenses grow each year).
6. **Cash** pays all outflows (expenses + mortgage + discretionary retirement spend if applicable).
7. **If cash is negative**, withdrawals happen from assets in withdrawal priority order (highest priority first), then pension drawdown if still short and the person has reached pension access age.
8. **If cash exceeds the emergency fund target**, surplus is allocated to investments (ISA first up to the annual limit, then GIA).
9. **Growth** is applied to all assets and pensions at the end of the year.
10. **Child costs** are applied for any children still in the household.
11. **State pension** income is added for anyone who has reached state pension age.
12. **Net worth** is calculated and checked against the bankruptcy threshold.

### Income Types and Tax Treatment

| Income Type | Income Tax | National Insurance | Pension Contributions | Ends at Retirement |
|---|---|---|---|---|
| Salary | Yes | Yes | Yes (employee + employer) | Yes |
| Rental | Yes | No | No | No (configurable) |
| Gift | No | No | No | No (configurable) |
| State Pension | Yes | No | No | N/A (starts at state pension age) |
| Pension Drawdown | Yes (75% taxable) | No | No | N/A |

### Surplus Allocation

After paying yearly outflows, remaining cash is allocated in this order:

1. **Emergency fund** — Cash is topped up until it reaches `emergency_fund_months × (annual outflows / 12)`.
2. **ISA** — Surplus is deposited into ISA assets, up to the `isa_annual_limit` per year (default £20,000). If an individual ISA asset has an `annual_contribution` cap, that limit is respected.
3. **GIA** — Any remaining surplus is deposited into GIA assets.

### Shortfall and Withdrawal Order

If cash goes negative after paying outflows:

1. **Non-pension assets** are withdrawn in descending `withdrawal_priority` order (higher number = withdrawn first).
2. **ISA withdrawals** are tax-free.
3. **GIA withdrawals** apply a simplified CGT model: gains above the annual CGT allowance are taxed at a flat CGT rate.
4. **Pension drawdown** happens last, only once the person has reached the pension access age. Withdrawals use the 25% tax-free / 75% taxable split, with income tax applied to the taxable portion.
5. **If all assets are exhausted**, a debt balance accumulates at the configured `debt_interest_rate` (default 8%).
6. **Bankruptcy** is flagged if net worth falls below the `bankruptcy_threshold` (default -£100,000).

### Retirement Discretionary Spending

The `annual_spend_target` (controlled by the "Spend Target" slider on the dashboard) is extra discretionary spending added on top of your configured expenses once **all adults** in the household have retired. Think of it as a "fun fund" for travel, hobbies, dining, etc. Set it to £0 if your configured expenses already cover everything.

### Return Models

The simulator supports two return models:

- **Parametric** — Each asset generates returns from a normal distribution with the specified mean and standard deviation. Returns are independent across years.
- **Historical Bootstrap** — Returns are sampled (with replacement) from actual historical data:
  - **Equities**: S&P 500 total returns (1928–present), stored in `data/historical_returns.tsv`.
  - **Bonds**: US 10-Year Treasury returns (1960–present), stored in `data/historical_bond_returns.tsv`.
  - The bond allocation on each asset determines the weighted blend of equity and bond returns. A 30% bond allocation means 70% equity return + 30% bond return for that year.
  - Year sequences are consistent across assets within each iteration, preserving real-world correlations.

### UK Tax Model

The simulator includes a simplified UK tax model with configurable bands:

- **Income Tax**: Three-band system (basic rate, higher rate, additional rate) with a personal allowance. Pension contributions reduce taxable income.
- **National Insurance**: Two-tier system (main rate up to upper earnings limit, then upper rate above). Applied to salary only.
- **Pension Relief**: Employee pension contributions receive tax relief at marginal rate. Employer contributions are pre-tax.
- **Pension Drawdown Tax**: 25% of each withdrawal is tax-free; the remaining 75% is taxed as income.
- **Capital Gains Tax**: Simplified model applied to GIA withdrawals — gains above the annual CGT allowance are taxed at a flat rate.

Tax year presets are available (e.g. 2024/25 UK rates) or you can manually set all thresholds and rates in the scenario assumptions.

---

## API Reference

### Health

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Application liveness check |
| `GET` | `/ready` | Application readiness check including database connectivity |

### Config — `/api/config`

| Method | Path | Description |
|---|---|---|
| `GET` | `/tax-years` | List available UK tax year presets |
| `GET` | `/scenarios` | List all scenarios |
| `GET` | `/scenarios/{id}` | Get a single scenario with all related data |
| `POST` | `/scenarios` | Create a new scenario |
| `PUT` | `/scenarios/{id}` | Update a scenario |
| `DELETE` | `/scenarios/{id}` | Delete a scenario |

### Simulation — `/api/simulation`

| Method | Path | Description |
|---|---|---|
| `GET` | `/historical-returns` | S&P 500 and 10-Year Treasury historical returns data and summary statistics |
| `POST` | `/run` | Run a one-shot simulation (no session caching) |
| `POST` | `/init` | Initialise a simulation session: generate return matrices, run the simulation, and return a `session_id` for subsequent recalculations |
| `POST` | `/recalc` | Recalculate using a cached session with a new spend target, retirement age offset, or percentile — without regenerating returns |
| `POST` | `/safe-withdrawal` | Find the maximum safe fun fund for a given risk threshold by sweeping spend values and binary-search refinement |
| `POST` | `/bond-sweep` | Adaptive coarse-to-fine combinatorial sweep of bond allocations across ISA/GIA/pension |
| `GET` | `/bond-sweep/progress` | Poll the progress of a running bond sweep (returns completed/total counts and current phase) |

### Key Request Parameters

**Simulation Init / Run:**
- `scenario_id` (required) — ID of the scenario to simulate
- `iterations` (default: 2000, range: 10–20,000) — Number of Monte Carlo iterations
- `seed` (default: 0) — Random seed for reproducibility
- `annual_spend_target` (optional) — Override the scenario's spend target
- `end_year` (optional) — Override the simulation end year

**Recalc:**
- `session_id` (required) — Session ID from a previous `/init` call
- `annual_spend_target` (optional) — New spend target
- `retirement_age_offset` (default: 0, range: -30 to +30) — Shift all retirement ages by this many years
- `percentile` (default: 50, range: 1–99) — Which percentile iteration to use for the representative output

**Safe Withdrawal:**
- `session_id` (required) — Session ID from a previous `/init` call
- `risk_threshold` (default: 5.0) — Maximum acceptable bankruptcy probability (%)
- `max_spend` (default: 200,000) — Upper bound of the spend sweep
- `steps` (default: 25) — Number of coarse sweep steps

**Bond Sweep:**
- `session_id` (required) — Session ID from a previous `/init` call
- `risk_threshold` (default: 5.0) — Maximum acceptable bankruptcy probability (%)
- `target_year` (optional) — Year at which to evaluate risk (default: final year)
- `max_spend` (default: 200,000) — Upper bound for safe withdrawal search

---

## Project Structure

```
FinanceMgmt/
├── backend/
│   ├── main.py                    # FastAPI app, lifespan, CORS setup
│   ├── settings.py                # Pydantic settings (env vars)
│   ├── database.py                # Async SQLite engine and session factory
│   ├── dependencies.py            # FastAPI dependency injection (DB session)
│   ├── migrations.py              # Lightweight additive schema migrations
│   ├── routers/
│   │   ├── config.py              # Scenario CRUD and tax year endpoints
│   │   ├── simulation.py          # Simulation, safe withdrawal, bond sweep
│   │   └── admin.py               # Admin endpoints
│   ├── models/                    # SQLAlchemy ORM models (split by domain)
│   │   ├── base.py                # Base model class
│   │   ├── scenario.py            # Scenario model
│   │   ├── person.py              # Person model
│   │   ├── income.py              # Salary, Rental, Gift income models
│   │   ├── assets.py              # Cash, ISA, GIA, Pension models
│   │   ├── property.py            # Property model
│   │   ├── expenses.py            # Expense model
│   │   └── __init__.py
│   ├── schemas/                   # Pydantic request/response schemas (split by domain)
│   │   ├── __init__.py
│   │   ├── admin.py               # Admin schema
│   │   ├── scenario.py            # Scenario schemas
│   │   ├── person.py              # Person schemas
│   │   ├── income.py              # Income schemas
│   │   ├── assets.py              # Asset schemas
│   │   ├── property.py            # Property schemas
│   │   ├── expenses.py            # Expense schemas
│   │   └── simulation.py          # Simulation schemas
│   ├── simulation/
│   │   ├── engine.py              # SimulationScenario and SimulationAssumptions dataclasses
│   │   ├── engine_fast.py         # Numba JIT-compiled Monte Carlo engine
│   │   ├── array_scenario.py      # Scenario-to-array conversion for Numba
│   │   ├── service.py             # High-level simulation service layer
│   │   ├── validator.py           # Input validation logic
│   │   ├── results.py             # Simulation result dataclasses
│   │   ├── bond_sweep.py          # Bond allocation sweep algorithm
│   │   ├── historical_returns.py  # Historical S&P 500 and bond return data loader
│   │   ├── returns_cache.py       # Session-based return matrix caching
│   │   ├── entities/              # Domain entities (split by type)
│   │   │   ├── base.py            # Entity base class
│   │   │   ├── person.py          # PersonEntity
│   │   │   ├── salary.py          # SalaryIncome entity
│   │   │   ├── rental_income.py   # RentalIncome entity
│   │   │   ├── gift_income.py    # GiftIncome entity
│   │   │   ├── state_pension.py   # StatePension entity
│   │   │   ├── pension.py         # PensionPot entity
│   │   │   ├── asset.py           # AssetAccount entity
│   │   │   ├── isa.py             # ISA account entity
│   │   │   ├── cash.py            # Cash account entity
│   │   │   ├── property.py        # PropertyEntity
│   │   │   ├── expense.py         # ExpenseItem
│   │   │   └── __init__.py
│   │   └── tax/                   # UK tax calculation modules
│   │       ├── __init__.py
│   │       ├── calculator.py      # Unified tax calculator
│   │       ├── income_tax.py      # Income tax bands
│   │       ├── national_insurance.py  # NI contributions
│   │       ├── pension_relief.py  # Pension contribution tax relief
│   │       ├── pension_drawdown.py    # Pension withdrawal taxation
│   │       ├── withdrawals.py     # Asset withdrawal with CGT
│   │       ├── tax_config.py      # Tax year presets and config
│   │       └── fast_tax.py        # Numba-optimised tax functions
│   ├── alembic/                   # Alembic migration versions
│   │   ├── versions/              # Migration scripts
│   │   ├── env.py                 # Migration environment
│   │   └── script.py.mako         # Migration template
│   ├── alembic.ini                # Alembic configuration
│   └── tests/                     # Backend test suite (pytest)
│       ├── conftest.py            # Test fixtures
│       ├── test_api.py            # API integration tests
│       ├── test_engine_equivalence.py  # Engine correctness tests
│       ├── test_bond_sweep.py     # Bond sweep tests
│       ├── test_tax.py            # Tax calculation tests
│       ├── test_validator.py      # Validation tests
│       ├── test_schemas.py        # Schema tests
│       ├── test_database_init.py  # Database init tests
│       └── benchmark_engine.py    # Performance benchmarks
├── frontend/
│   ├── src/
│   │   ├── main.tsx               # React entry point
│   │   ├── App.tsx                # Routes and layout
│   │   ├── index.css              # Global styles (Tailwind)
│   │   ├── api/
│   │   │   ├── client.ts          # API client (fetch wrappers)
│   │   │   └── exportExcel.ts     # Excel export logic
│   │   ├── components/
│   │   │   ├── Dashboard.tsx      # Main dashboard shell
│   │   │   ├── Dashboard/         # Dashboard tab components
│   │   │   │   ├── OverviewTab.tsx
│   │   │   │   ├── IncomeSpendingTab.tsx
│   │   │   │   ├── AssetsTab.tsx
│   │   │   │   ├── RiskTab.tsx
│   │   │   │   ├── AllocationTab.tsx
│   │   │   │   ├── useDashboardData.ts
│   │   │   │   ├── useDashboardState.ts
│   │   │   │   ├── utils.ts
│   │   │   │   └── index.ts
│   │   │   ├── ComparisonDashboard.tsx  # Multi-scenario comparison
│   │   │   ├── HelpPage.tsx       # Help documentation
│   │   │   ├── OverviewInsights.tsx     # Key insights panel
│   │   │   ├── RiskSummaryPanel.tsx     # Risk summary component
│   │   │   ├── config/            # Scenario configuration components
│   │   │   │   ├── ScenarioConfigPage.tsx  # Scenario list and CRUD
│   │   │   │   ├── ScenarioForm.tsx        # Full scenario editor
│   │   │   │   ├── ScenarioFormContext.tsx # Form state context
│   │   │   │   ├── ConfigWizard.tsx        # Step-by-step wizard
│   │   │   │   ├── PeopleForm.tsx
│   │   │   │   ├── IncomeForm.tsx
│   │   │   │   ├── AssetsForm.tsx
│   │   │   │   ├── HousingForm.tsx
│   │   │   │   ├── PropertiesForm.tsx
│   │   │   │   ├── ExpensesForm.tsx
│   │   │   │   ├── AssumptionsForm.tsx
│   │   │   │   ├── SellOrderForm.tsx
│   │   │   │   ├── formSchema.ts
│   │   │   │   ├── formConverters.ts
│   │   │   │   └── inputs.tsx
│   │   │   └── charts/            # Chart components
│   │   │       ├── NetWorthChart.tsx       # Net worth with P10/P90 bands
│   │   │       ├── IncomeChart.tsx         # Income breakdown
│   │   │       ├── ExpensesChart.tsx       # Expense breakdown
│   │   │       ├── AssetsChart.tsx         # Asset balances by type
│   │   │       ├── AssetDetailChart.tsx    # Per-asset-type detail
│   │   │       ├── SensitivityChart.tsx    # Safe withdrawal sensitivity curve
│   │   │       ├── RiskTimelineChart.tsx   # Depletion/bankruptcy over time
│   │   │       ├── BondSweepChart.tsx      # Bond allocation results
│   │   │       └── BondAllocationPanel.tsx # Bond allocation input panel
│   │   ├── hooks/
│   │   │   ├── useScenario.ts     # Scenario data fetching
│   │   │   └── useSimulation.ts   # Simulation session management
│   │   ├── types/                 # TypeScript type definitions
│   │   │   └── index.ts
│   │   └── utils/
│   │       ├── chartFormatters.ts
│   │       ├── inflation.ts
│   │       └── __tests__/
│   ├── public/
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   └── .env.example
├── data/
│   ├── historical_returns.tsv     # S&P 500 annual returns (1928–present)
│   └── historical_bond_returns.tsv  # US 10-Year Treasury returns (1928–present)
├── .github/workflows/ci.yml       # CI/CD pipeline
├── finances.db                    # SQLite database (created on first run)
├── start_backend.sh / .bat / .ps1  # Backend startup scripts
├── start_frontend.sh / .bat / .ps1 # Frontend startup scripts
└── README.md
```

---

## Development

### Running Tests

**Backend:**

```bash
source .venv/bin/activate
pytest backend/tests/
```

**Frontend:**

```bash
cd frontend
npm run test          # Single run
npm run test:watch    # Watch mode
```

### Database

The SQLite database is created and migrated automatically on backend startup. The migration strategy is two-fold:

1. **Alembic migrations** — Standard versioned migrations in `backend/alembic/`.
2. **Lightweight additive migrations** — `backend/migrations.py` handles adding new columns to existing tables without requiring formal migration scripts. These run at startup and are idempotent.

To reset the database, delete `finances.db` and restart the backend.

### Numba JIT Compilation

The Monte Carlo engine (`backend/simulation/engine_fast.py`) uses Numba's `@njit` decorator for performance-critical loops. The first simulation run after startup will be slower due to JIT compilation. Subsequent runs use the compiled code and are significantly faster.

---

## Simplifications and Limitations

The simulator uses simplified models in several areas. It is intended as a planning and exploration tool, not a precise tax calculator.

- **Income tax**: Uses a three-band system. Tapered personal allowance (above £100k) is not modelled.
- **Dividend tax**: Not modelled separately — all investment returns are treated as growth, not income.
- **Capital gains tax**: Uses a simplified flat-rate model on GIA withdrawals. Full CGT rules (different rates for different asset types, bed-and-breakfasting, etc.) are not modelled.
- **National Insurance**: Simplified to two tiers. Class 2/4 NI for self-employment is not modelled.
- **Pension lifetime/annual allowance**: Not enforced.
- **Inheritance tax**: Not modelled.
- **Stamp duty / SDLT**: Not modelled on property purchases.
- **Inflation**: Applied as a single flat rate across all expenses. Differential inflation (e.g. housing vs food) is not modelled.
- **Property**: Appreciation uses a normal distribution. Rental income is simplified (flat occupancy rate, no void periods modelling).
- **Salary growth**: Applied as a fixed annual percentage, not accounting for promotions, career changes, or market conditions.
- **Correlations**: In parametric mode, asset returns are independent. Historical bootstrap preserves real-world equity/bond correlations within each sampled year.
