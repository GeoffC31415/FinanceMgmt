# Finance Planner

**A local-first retirement and household finance simulator for UK households.**

Finance Planner helps you turn a messy real-life money picture — salaries, pensions, ISAs, GIAs, mortgages, children, rental income, expenses, taxes, market returns, and retirement spending — into an interactive long-term projection.

It is built for questions like:

- *Can we retire at 58, or is 62 safer?*
- *How much extra discretionary spending can we afford in retirement?*
- *What happens if markets are poor around retirement?*
- *Are we too equity-heavy or too bond-heavy?*
- *Which scenario is more resilient: overpaying the mortgage, investing more, or retiring later?*

The app runs locally on your machine. Your scenarios live in a local SQLite database unless you choose to move/export them.

> **Important:** this is a planning tool, not financial, tax, or investment advice. UK tax and investment behaviour are simplified. Use it to explore assumptions, not to make irreversible decisions on its own.

---

## Highlights

### Scenario modelling

Model a household with:

- adults and children;
- salaries with growth, start/end years, and pension contributions;
- state pension ages and state pension income;
- cash, ISA, GIA, and private pension balances;
- buy-to-let or other properties with mortgages, rent, maintenance, and sale priority;
- recurring expenses, child costs, and inflation linking;
- gifts or other tax-free income;
- configurable retirement ages and extra retirement spending.

### Monte Carlo projections

Run thousands of simulated futures using either:

- **parametric returns** — normal distributions using each asset’s configured mean/std dev; or
- **historical bootstrap** — block bootstrap from historical S&P 500 and US 10-Year Treasury returns, preserving multi-year sequences more realistically than independent draws.

The hot loop is Numba-accelerated so recalculations stay interactive.

### UK-oriented tax modelling

The backend includes simplified UK tax logic for:

- income tax bands and personal allowance tapering;
- National Insurance on salary;
- salary pension contributions;
- taxable state pension, calculated per person;
- private pension drawdown, modelled as 25% tax-free and 75% taxable, calculated per pension owner;
- rental income tax;
- simplified CGT for GIA/property disposals;
- selectable UK tax-year presets.

### Interactive dashboard

Explore results through:

- net worth bands and representative percentile paths;
- income, spending, tax, and asset breakdowns;
- bankruptcy/depletion risk timelines;
- safe withdrawal analysis;
- bond allocation optimisation;
- scenario comparison;
- real-vs-nominal value toggle;
- Excel export.

---

## Screens and workflows

The app is organised around five main workflows:

1. **Intro / starter scenarios** — create a guided scenario, load a sample, or start from scratch.
2. **Scenario configuration** — edit people, incomes, expenses, assets, properties, assumptions, and sell order.
3. **Projection dashboard** — run the Monte Carlo simulation and inspect results.
4. **Risk analysis** — stress-test spending and shortfall risk.
5. **Allocation optimiser** — sweep bond allocations to search for more robust portfolios.

---

## Quick start

### Requirements

- Python 3.10+
- Node.js 18+
- npm
- Git

### 1. Clone

```bash
git clone <your-repo-url>
cd FinanceMgmt
```

### 2. Backend setup

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r backend/requirements.txt
```

On Windows PowerShell:

```powershell
py -3 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r backend\requirements.txt
```

### 3. Frontend setup

```bash
cd frontend
npm install
cd ..
```

### 4. Run the app

Start the backend:

```bash
./start_backend.sh
```

Start the frontend in another terminal:

```bash
./start_frontend.sh
```

Windows alternatives are included:

```powershell
.\start_backend.ps1
.\start_frontend.ps1
```

or:

```bat
start_backend.bat
start_frontend.bat
```

Then open:

```text
http://localhost:5173
```

Backend health checks:

```text
http://localhost:8000/health
http://localhost:8000/ready
```

---

## How the simulation works

Each simulation path advances one year at a time.

At a high level, each year:

1. Salary, rental income, gifts, state pension, and pension contributions are calculated.
2. Income tax, National Insurance, state-pension tax, pension drawdown tax, and CGT are applied where relevant.
3. Mortgages, expenses, property maintenance, child costs, and retirement discretionary spending are paid.
4. If cash falls below the emergency-fund target, assets are withdrawn in priority order.
5. If cash is above the emergency-fund target, surplus is automatically invested.
6. Asset, property, and pension growth is applied.
7. Debt interest and bankruptcy/depletion status are updated.

### Surplus cash is invested automatically

A key modelling choice: after outflows, the engine keeps an emergency fund and invests excess cash.

The order is:

1. cash buffer / emergency fund;
2. ISA contributions up to the configured ISA limit and per-asset caps;
3. GIA contributions for any remaining surplus.

This means projections can look very strong if current spending is understated. If your configured expenses only include essentials, the model assumes the rest of your income is saved or invested rather than spent.

### Retirement discretionary spending phases in

The `annual_spend_target` / “Extra spend (retired)” value is extra discretionary spending on top of configured expenses.

It now phases in by adult retirement share:

- 0 of 2 adults retired → 0%;
- 1 of 2 adults retired → 50%;
- 2 of 2 adults retired → 100%;
- 1 of 1 adult retired → 100%.

The amount inflates each year.

### Representative percentile paths

The dashboard’s selected percentile is a coherent path selected by final net worth. For example, the default “median” path is the simulation run whose final net worth is around the 50th percentile.

That makes income, spending, tax, and asset lines internally consistent, but it is not the same as taking the year-by-year median of every field independently.

---

## Return models

### Historical bootstrap

Historical bootstrap samples aligned historical equity and bond returns using blocks of contiguous years. This helps preserve sequences like bull markets, crashes, and recoveries.

Current historical sources in `data/`:

- S&P 500 annual returns;
- US 10-Year Treasury annual returns.

The model uses nominal returns. The dashboard can display values in nominal terms or adjusted back to today’s purchasing power using the scenario inflation assumption.

### Parametric returns

Parametric mode samples annual returns from normal distributions configured on each asset or pension:

- expected return / mean;
- standard deviation.

This is simpler and more controllable, but less realistic around fat tails and historical sequences.

---

## UK tax model

The app currently models:

- income tax personal allowance, bands, and personal allowance tapering;
- Class 1 employee National Insurance;
- salary taxation per person;
- salary pension contributions reducing taxable salary;
- rental income taxed as income, no NI;
- state pension taxed per person;
- private pension drawdown as 25% tax-free and 75% taxable;
- per-owner pension drawdown tax treatment;
- simplified CGT for GIA/property disposals;
- tax-year presets for recent UK tax years.

Known simplifications include:

- no dividend tax yet;
- no savings interest tax yet;
- no Scottish/Welsh income-tax regimes yet;
- simplified CGT rates and allowance treatment;
- no full pension lump-sum allowance / lifetime PCLS modelling yet;
- no student loan repayments;
- no child benefit high-income charge;
- tax policy is static across the projection horizon unless assumptions are manually changed.

See `TODO.md` for the tax roadmap.

---

## What can make results look bullish?

If projections look high, check these first:

1. **Current expenses may be too low.** Any surplus above the emergency fund is automatically invested.
2. **Extra retirement spending is not current lifestyle spending.** It is additional spending that phases in as adults retire.
3. **No investment/platform/advice fees are deducted yet.** A 0.5%–1.0% annual fee drag can matter a lot over decades.
4. **Historical returns may be generous.** Long-run S&P 500 and Treasury returns can produce strong real outcomes.
5. **The selected percentile path is final-net-worth based.** A representative median-final path can have strong intermediate years.
6. **Behaviour is disciplined by assumption.** The model does not add lifestyle creep unless you explicitly model it as expenses.

A good practice is to run multiple scenarios:

- higher expenses;
- lower investment returns;
- later/earlier retirement;
- higher inflation;
- lower state pension;
- added investment fees as a manual reduction to expected returns;
- pessimistic percentile views such as P10/P25.

---

## Safe withdrawal analysis

The safe withdrawal tool searches for the maximum annual extra retirement spending that keeps bankruptcy risk below a chosen threshold.

It reuses the same cached return paths as the current simulation session, which makes comparisons responsive and consistent.

Use it to answer questions like:

- “How much extra annual spending is safe at 5% bankruptcy risk?”
- “How sensitive is my plan to an extra £5k/year?”
- “Does retiring two years later materially improve the safe spend?”

---

## Bond allocation optimiser

In historical-bootstrap mode, the optimiser searches across bond allocations for ISA, GIA, and pension assets.

It uses a coarse-to-fine sweep and ranks combinations by the safe fun fund achievable at your selected risk threshold.

This is useful for exploring sequence-risk mitigation, especially around retirement.

---

## Excel export

The dashboard can export simulation results to an `.xlsx` workbook including:

- year-by-year net worth;
- income and spending breakdowns;
- tax fields including state pension tax;
- balances by asset class;
- returns, contributions, withdrawals;
- liabilities and risk fields.

Excel export is lazy-loaded so it does not slow down the initial app load.

---

## Project structure

```text
FinanceMgmt/
├── backend/                 # FastAPI backend, SQLAlchemy models, simulation engine
│   ├── routers/             # API routes
│   ├── schemas/             # Pydantic schemas
│   ├── models/              # SQLAlchemy ORM models
│   ├── simulation/          # Monte Carlo engine, tax logic, services
│   └── tests/               # Backend tests
├── frontend/                # React + TypeScript + Vite frontend
│   ├── src/api/             # API client and Excel export
│   ├── src/components/      # Dashboard, charts, config forms, help
│   ├── src/hooks/           # Scenario/simulation hooks
│   ├── src/types/           # TypeScript types
│   └── src/utils/           # Shared utilities
├── data/                    # Historical return data
├── scripts/                 # Maintenance scripts
├── TODO.md                  # Tax and modelling roadmap
├── backend/AGENTS.md        # Backend architecture notes
└── frontend/AGENTS.md       # Frontend architecture notes
```

---

## Development commands

### Frontend

```bash
cd frontend
npm run dev
npm run build
npm test -- --run
```

### Backend

```bash
source .venv/bin/activate
pytest
python -m py_compile backend/simulation/engine_fast.py
```

### Line endings

The repo is normalised to LF line endings. Check or fix with:

```bash
python3 scripts/normalize_line_endings.py --check
python3 scripts/normalize_line_endings.py
```

---

## API overview

Main endpoints live under `/api`.

### Scenarios

- `GET /api/config/scenarios`
- `GET /api/config/scenarios/{id}`
- `POST /api/config/scenarios`
- `PUT /api/config/scenarios/{id}`
- `DELETE /api/config/scenarios/{id}`
- `POST /api/config/scenarios/{id}/clone`
- `GET /api/config/tax-years`

### Simulation

- `POST /api/simulation/init`
- `POST /api/simulation/recalc`
- `POST /api/simulation/safe-withdrawal`
- `POST /api/simulation/bond-sweep`
- `GET /api/simulation/bond-sweep/progress`
- `POST /api/simulation/bond-sweep/{session_id}/cancel`
- `POST /api/simulation/bond-override`
- `GET /api/simulation/historical-returns`

---

## Current validation status

At the time of this README rewrite:

- frontend build passes with `npm run build`;
- frontend tests pass with `npm test -- --run`;
- backend syntax checks pass in the current environment;
- backend pytest availability depends on installed environment dependencies.

---

## Roadmap

See:

- `TODO.md` — tax/modelling roadmap;
- `frontend/TODO.md` — frontend UX, typing, tests, and dashboard work;
- `backend/TODO.md` — backend infrastructure/performance work if present.

Near-term high-value ideas include:

- richer tax breakdown fields;
- investment/platform fee assumptions;
- dividend and savings tax;
- rental profit rather than gross-rent taxation;
- more realistic CGT modelling;
- year-aware tax policy;
- additional retirement drawdown strategies;
- better current-year tax previews.

---

## Disclaimer

Finance Planner is an educational and planning aid. It simplifies tax law, investment returns, pensions, property, and household behaviour. Outputs are only as good as the assumptions entered.

Before making financial decisions, consider professional financial/tax advice and compare against official sources such as GOV.UK, HMRC guidance, and regulated financial planning tools.
