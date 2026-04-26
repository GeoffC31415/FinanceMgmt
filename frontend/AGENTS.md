# AGENTS.md — FinanceMgmt Frontend

> Crystallized understanding of the frontend codebase for AI agents and developers.
> Use this as a reference when making changes, writing code, or reviewing PRs.

---

## 1. Project Overview

**FinanceMgmt Frontend** is a React 18 + TypeScript financial simulation dashboard. It runs Monte Carlo simulations (via a Python backend) to model personal/retirement finances over decades, showing ranges of outcomes (P10, median, P90) for net worth, income, expenses, and risk metrics.

### Tech Stack
- **React 18** with functional components and hooks
- **TypeScript** (strict mode)
- **Vite 6** for build/dev
- **Tailwind CSS 3** for styling (dark theme: slate-950 base)
- **Recharts** for all charting
- **React Hook Form + Zod** for form validation in ScenarioForm
- **React Router DOM v6** for routing
- **ExcelJS** for Excel export (lazy-loaded)
- **Vitest + Testing Library** for testing

### Architecture
```
frontend/
├── src/
│   ├── api/                    # API client layer
│   │   ├── client.ts           # HTTP client + typed endpoint functions
│   │   └── exportExcel.ts      # Excel export (lazy-loaded)
│   ├── components/
│   │   ├── Dashboard.tsx       # Main simulation dashboard (459 lines, refactored)
│   │   ├── Dashboard/          # Refactored Dashboard units
│   │   │   ├── useDashboardState.ts
│   │   │   ├── useDashboardData.ts
│   │   │   ├── utils.ts
│   │   │   ├── OverviewTab.tsx
│   │   │   ├── IncomeSpendingTab.tsx
│   │   │   ├── AssetsTab.tsx
│   │   │   ├── RiskTab.tsx
│   │   │   ├── AllocationTab.tsx
│   │   │   └── index.ts
│   │   ├── ComparisonDashboard.tsx  # Scenario comparison view
│   │   ├── OverviewInsights.tsx    # Auto-generated insights
│   │   ├── RiskSummaryPanel.tsx    # Risk analysis panel
│   │   ├── HelpPage.tsx            # Help documentation
│   │   ├── charts/               # Recharts chart components (8 files)
│   │   │   ├── NetWorthChart.tsx
│   │   │   ├── ExpensesChart.tsx
│   │   │   ├── IncomeChart.tsx
│   │   │   ├── AssetsChart.tsx
│   │   │   ├── AssetDetailChart.tsx
│   │   │   ├── SensitivityChart.tsx
│   │   │   ├── RiskTimelineChart.tsx
│   │   │   └── BondSweepChart.tsx
│   │   └── config/
│   │       ├── ScenarioConfigPage.tsx  # Scenario CRUD page
│   │       ├── ScenarioForm.tsx        # Full scenario editor (434 lines, refactored)
│   │       ├── ScenarioFormContext.tsx # Context provider for form state
│   │       ├── formSchema.ts           # Zod validation schema (87 lines)
│   │       ├── inputs.tsx             # Shared input components (213 lines)
│   │       ├── formConverters.ts      # Form value converters (231 lines)
│   │       ├── PropertiesForm.tsx     # Properties tab (367 lines)
│   │       ├── PeopleForm.tsx         # People tab (163 lines)
│   │       ├── IncomeForm.tsx         # Income tab (135 lines)
│   │       ├── AssetsForm.tsx         # Assets tab (202 lines)
│   │       ├── ExpensesForm.tsx       # Expenses tab (97 lines)
│   │       └── ConfigWizard.tsx       # Step-by-step scenario builder (1,569 lines)
│   ├── hooks/
│   │   ├── useScenario.ts      # Scenario CRUD hooks
│   │   └── useSimulation.ts    # Simulation session + bond sweep hooks
│   ├── types/
│   │   └── index.ts            # All TypeScript types
│   ├── utils/
│   │   └── chartFormatters.ts  # Currency tick formatting
│   ├── test/
│   │   ├── Dashboard.test.tsx  # Dashboard rendering (5 assertions)
│   │   └── setup.ts
│   ├── utils/__tests__/
│   │   ├── inflation.test.ts   # adjustForInflation + applyInflationAdjustment (17 tests)
│   │   └── chartFormatters.test.ts  # formatCompactCurrencyTick + getCurrencyAxisWidth (18 tests)
│   ├── hooks/__tests__/
│   │   ├── bondSweepRaceCondition.test.ts
│   │   └── useSimulation.test.tsx  # hook state transitions (19 tests)
│   ├── components/__tests__/
│   │   ├── bondAllocations.test.ts
│   │   └── OverviewInsights.test.tsx  # insight generation (19 tests)
│   ├── App.tsx                 # Router + navigation
│   ├── main.tsx                # Entry point
│   └── index.css               # Tailwind imports
├── package.json
├── vite.config.ts
├── tailwind.config.js
└── tsconfig.json
```

---

## 2. Routing

| Route | Component | Purpose |
|-------|-----------|---------|
| `/` | `Dashboard` | Main simulation: scenario selection, controls, charts |
| `/compare` | `ComparisonDashboard` | Compare 2-3 scenarios side by side |
| `/config` | `ScenarioConfigPage` | CRUD scenarios with full form editor |
| `/config/wizard` | `ConfigWizard` | Step-by-step scenario builder |
| `/help` | `HelpPage` | Documentation |

---

## 3. API Layer (`src/api/client.ts`)

All API calls go through a typed `http<T>()` wrapper. Key endpoints:

### Scenarios (CRUD)
| Method | Path | Function |
|--------|------|----------|
| GET | `/config/scenarios` | `list_scenarios()` |
| GET | `/config/scenarios/:id` | `get_scenario(id)` |
| POST | `/config/scenarios` | `create_scenario(payload)` |
| PUT | `/config/scenarios/:id` | `update_scenario(id, payload)` |
| DELETE | `/config/scenarios/:id` | `delete_scenario(id)` |
| GET | `/config/tax-years` | `list_tax_years()` |

### Simulation
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/simulation/run` | `run_simulation()` — one-shot (not used) |
| POST | `/simulation/init` | `init_simulation()` — starts session (used) |
| POST | `/simulation/recalc` | `recalc_simulation()` — update params (used) |
| POST | `/simulation/safe-withdrawal` | `safe_withdrawal()` — find max safe fun fund |
| POST | `/simulation/bond-sweep` | `bond_sweep()` — find optimal bond allocation |
| GET | `/simulation/bond-sweep/progress` | `bond_sweep_progress(session_id)` |
| POST | `/simulation/bond-override` | `bond_override()` — test single allocation |
| GET | `/simulation/historical-returns` | `get_historical_returns()` |

### API Client Design Notes
- Base URL from `VITE_API_BASE_URL` env var or inferred from `window.location.hostname:8000`
- Returns `undefined` for 204 No Content responses
- Error messages include HTTP status + response body
- Network errors get a user-friendly message about CORS/host settings

---

## 4. Key Types (`src/types/index.ts`)

### ScenarioData (shared across create/read)
```ts
type ScenarioCreate = {
  name: string;
  assumptions: Assumptions;     // Record<string, unknown> — see §6
  people: PersonCreate[];
  incomes: IncomeCreate[];
  assets: AssetCreate[];
  properties: PropertyCreate[];
  expenses: ExpenseCreate[];
};
```

### SimulationResponse (main data shape)
Contains arrays indexed by year for:
- **Net worth**: `net_worth_p10`, `net_worth_median`, `net_worth_p90`
- **Income**: salary (gross/net), rental, gift, pension, state pension, investment returns, total
- **Expenses**: total, mortgage, pension contributions, fun fund
- **Tax**: income tax, optional state pension tax breakdown (`state_pension_tax_paid_median`, included in inflation adjustment and Excel export), NI, total tax
- **Asset balances**: ISA, pension, cash, GIA, property, total
- **Flows**: returns, contributions, withdrawals per asset type
- **Liabilities**: mortgage balance, debt balance, debt interest
- **Risk**: mortgage_paid_off %, is_depleted %, is_bankrupt %, debt_balance

### Special Response Types
- `SimulationInitResponse` = `SimulationResponse` + `session_id`
- `SafeWithdrawalResponse` = `{ max_safe_fun_fund, risk_threshold, sensitivity_curve }`
- `BondSweepResponse` = `{ asset_classes, optimal, top_combos, marginals, target_year, total_combos_tested }`

---

## 5. Core Data Flow

```
User selects scenario
       │
       ▼
Dashboard mounts → useScenarioList() fetches scenarios
       │
       ▼
User selects scenario → useEffect calls init_simulation()
       │
       ▼
Backend creates session, runs 2000 iterations
       │
       ▼
SimulationResponse returned → stored in useSimulation hook
       │
       ▼
Inflation adjustment (toggle) → applyInflationAdjustment()
       │
       ▼
Charts render with adjusted data
       │
       ▼
User adjusts controls (fun fund, retirement offset, percentile)
       │
       ▼
Debounced useEffect → recalc_simulation() (100ms debounce)
       │
       ▼
Updated response → charts re-render
```

### Safe Withdrawal Flow
```
Session created → debounced (300ms) → fetch_safe_withdrawal()
       │
       ▼
Backend runs binary search to find max safe fun fund
       │
       ▼
Sensitivity curve stored → SensitivityChart renders
```

### Bond Sweep Flow
```
User clicks "Run Bond Sweep"
       │
       ▼
POST /simulation/bond-sweep (blocking, starts background task)
       │
       ▼
Polling interval (500ms) → bond_sweep_progress()
       │
       ▼
ETA calculation: (total - completed) / runs_per_second
       │
       ▼
Result returned → BondSweepChart renders
```

---

## 6. State Management Pattern

The app uses **custom React hooks** with local state — no global state library.

### `useSimulation` hook
- `result`: latest `SimulationResponse | null`
- `session_id`: backend session ID (for recalc/bond operations)
- `safe_withdrawal_result`: SafeWithdrawalResponse | null
- `bond_sweep_result`: BondSweepResponse | null
- `sweep_progress`: { completed, total, phase, eta_seconds }
- `is_loading`, `error`: loading/error states

### `useScenarioList` hook
- `scenarios`: ScenarioRead[]
- `refresh()`: refetch from API

### `useScenarioDetail(scenario_id)` hook
- `scenario`: ScenarioRead | null
- `save(payload)`, `remove()`: CRUD operations

### Dashboard state (inline)
- `selected_id`, `annual_spend_target`, `end_year`, `retirement_age_offset`
- `show_real_values`, `percentile`, `risk_threshold`
- `bond_allocations`, `saved_bond_allocations`
- `active_tab` (tab navigation)

---

## 7. Key Components

### Dashboard (`Dashboard.tsx`) — 459 lines (was 1,180)
Refactored into smaller units in `Dashboard/` directory:
- `useDashboardState.ts` — all useState/useEffect logic
- `useDashboardData.ts` — inflation adjustment, derived metrics
- `utils.ts` — `getScenarioBondAllocations`, `format_currency_compact`
- `OverviewTab.tsx` (153 lines), `IncomeSpendingTab.tsx` (50 lines), `AssetsTab.tsx` (73 lines), `RiskTab.tsx` (72 lines), `AllocationTab.tsx` (245 lines)

Main simulation view with 5 tabs:
1. **Overview** — metric cards, auto-generated insights, net worth chart
2. **Income & Spending** — income chart, expenses/outgoings chart
3. **Assets** — asset classes chart, detailed asset breakdown with bond allocation controls
4. **Risk Analysis** — risk summary panel, sensitivity chart, risk timeline
5. **Allocation** — bond allocation optimiser (bond sweep)

**Key functions:**
- `applyInflationAdjustment()` — converts nominal → real values
- `format_currency_compact()` — £1.2m, £45k formatting
- `format_duration()` — human-readable duration for ETA

### ComparisonDashboard (`ComparisonDashboard.tsx`)
- Selects up to 3 scenarios
- Merges year data across scenarios for overlay charts
- Shows summary metrics table with color-coded risk

### ScenarioForm (`ScenarioForm.tsx`) — 434 lines (was 1,840)
Tabbed form with Zod validation (schema in `formSchema.ts`). Refactored into:
- `formSchema.ts` — Zod validation (87 lines, 7 tests)
- `inputs.tsx` — shared input components (213 lines, 12 tests)
- `formConverters.ts` — form value converters (231 lines, 18 tests)
- `ScenarioFormContext.tsx` — context + provider + `useScenarioForm()` hook
- `PropertiesForm.tsx` — 367 lines, 5 tests
- `PeopleForm.tsx` — 163 lines, 12 tests
- `IncomeForm.tsx` — 135 lines, 11 tests
- `AssetsForm.tsx` — 202 lines, 12 tests
- `ExpensesForm.tsx` — 97 lines, 10 tests

Tabbed form with Zod validation:
- **Assumptions** — tax year selector, return model, inflation, limits
- **People** — adults + children with retirement/cost fields
- **Income** — salary/rental/gift with pension contribution fields
- **Expenses** — monthly expenses with inflation toggle
- **Assets** — ISA/GIA/CASH/PENSION with bond allocation
- **Properties** — value, appreciation, mortgage, rental income
- **Housing** — display only
- **Sell Order** — withdrawal order visualization

### ConfigWizard (`ConfigWizard.tsx`) — 1,569 lines (not yet refactored)
8-step wizard: Start → People → Income → Assets → Property → Expenses → Assumptions → Summary
- Auto-saves after each step
- Progress bar with percentage
- Draft-based (not form-based) state management

### OverviewInsights (`OverviewInsights.tsx`)
Auto-generates insights based on simulation results:
- Safe spending limit (emerald/rose based on current spend vs safe max)
- Over-spending warning
- Success rate tier (emerald ≥99%, ≥95%, amber ≥90%, rose <90%)
- Peak net worth year
- Mortgage payoff year
- Children leaving home with cost savings
- Retirement timeline

### BondAllocationPanel
Three sliders for ISA/GIA/Pension bond percentages. Recalculates instantly on change via `bond_override`.

### BondSweepChart
- Risk heatmap strip (color-coded by safe fun fund)
- Per-class dual-axis charts (risk + safe fund)
- Top combinations table

---

## 8. Chart Patterns

All charts follow a consistent pattern:
1. **ResponsiveContainer** wrapping **ComposedChart**
2. **CartesianGrid** with `stroke="#1f2937"`
3. **XAxis** with `dataKey="year"`
4. **YAxis** with currency tick formatter (`formatCompactCurrencyTick`)
5. **Tooltip** with dark background (`#0b1220`)
6. **Legend** with custom formatter
7. **ReferenceLine** for retirement years
8. **Log scale** toggle on most charts (clamps at £10k minimum)

### Chart Data Sanitization Pattern
```ts
const sanitize = (v: number | undefined | null): number => {
  const num = v ?? 0;
  return isNaN(num) || !isFinite(num) ? 0 : num;
};
const clampForLog = (v: number) => (useLogScale ? Math.max(v, 10000) : v);
```

### GIA Balance Computation
GIA is never directly stored — it's computed as:
```
gia = total_assets - isa - pension - cash - property
```

---

## 9. Form Patterns

### NumberInput
- Shows formatted value (locale-aware thousands separators)
- On focus: shows raw editable value
- On blur: formats and commits
- Handles empty → 0 conversion

### PercentInput
- Shows `value * 100` with `%` suffix
- On change: divides by 100 before calling `field.onChange`
- Same focus/blur pattern as NumberInput

### AnnualFromMonthlyInput
- Shows `monthly * 12`
- On change: divides by 12 before setting monthly value
- Used for property rental income display

### Field Arrays
Used via `useFieldArray` from react-hook-form:
- `people`, `incomes`, `expenses`, `assets`, `properties`
- All support add/remove with typed defaults

---

## 10. Known Issues & Technical Debt

| Issue | Location | Status | Impact |
|-------|----------|--------|--------|
| `run_simulation` exported but never called | `useSimulation.ts` | **Fixed** | Dead code |
| `Assumptions` type is `Record<string, unknown>` | `types/index.ts` | Fixed | No type safety for assumptions |
| `as any` casts across config components | `ConfigWizard` (1 remaining) | Open | Type safety loss |
| Fixed `w-[70%] min-w-[800px]` layout | `App.tsx` | Open | Not responsive |
| No retry on API failures | `api/client.ts` | Open | Fragile UX |
| Bond sweep polling race condition | `useSimulation.ts` | **Fixed** | Stale ETA |
| Emoji markers (🎓🏠) in charts | `ExpensesChart.tsx` | **Fixed** | Replaced with SVG icons (GraduationCapIcon, HouseIcon) |
| Only 5 test assertions | `Dashboard.test.tsx` | **Fixed** (245 tests) | Low confidence |
| Chart data not memoized | 6 chart components | **Fixed** | Unnecessary re-renders |
| `ScenarioForm.tsx` is 1,840 lines | `config/ScenarioForm.tsx` | **Partially fixed** (434 lines) | Hard to maintain |
| `Dashboard.tsx` is 1,180 lines | `components/Dashboard.tsx` | **Fixed** (459 lines) | Hard to maintain |
| No `.env.example` | root | **Fixed** | Created `.env.example` with `VITE_API_BASE_URL` |

---

## 11. File Size Reference (Updated)

| File | Lines | Size |
|------|-------|------|
| `ScenarioForm.tsx` | 434 | ~13KB (was 1,840) |
| `Dashboard.tsx` | 459 | ~15KB (was 1,180) |
| `ConfigWizard.tsx` | 1,569 | ~50KB (truncated) |
| `PropertiesForm.tsx` | 367 | ~10KB |
| `AssetsForm.tsx` | 202 | ~5KB |
| `inputs.tsx` | 213 | ~5KB |
| `formConverters.ts` | 231 | ~5KB |
| `BondSweepChart.tsx` | ~200 | |
| `AssetDetailChart.tsx` | ~250 | |
| `ScenarioConfigPage.tsx` | ~350 | |
| `client.ts` | ~130 | |
| `useSimulation.ts` | ~180 | |
| `types/index.ts` | ~200 | |
| `exportExcel.ts` | ~250 | |
| **Total source** | **~5,500+** | |
| **Total tests** | **245** | (22 test files)

---

## 12. Development Commands

```bash
# Development
npm run dev           # Vite dev server
npm run build         # tsc -b && vite build
npm run preview       # Preview production build

# Testing
npm test              # Vitest run
npm run test:watch    # Vitest watch mode

# Backend (separate)
./start_backend.sh    # Linux/Mac
start_backend.bat     # Windows
```

---

## 13. TODO Expansion Convention

When AGENTS.md references work from TODO.md (refactoring plans, tech debt items, feature requests), the detailed breakdown must live in a **standalone referenced file** — never inlined in AGENTS.md itself.

**Rule:** If a TODO item has more than ~15 lines of detail, extract it to its own file and reference it by path.

**Example:**
```markdown
### ScenarioForm Refactoring
**Goal:** Reduce `ScenarioForm.tsx` from 1,840 → ~500 lines.
See `TODO.md` §6 for full task breakdown and status.
```

**Why:** AGENTS.md is a reference for the *current state* of the codebase. Detailed task tracking is operational metadata that belongs in TODO.md (or project-management tools). Inlining it causes:
- AGENTS.md to bloat with stale process history
- Confusion between "what is" and "what was planned"
- Harder maintenance when TODO items change

## 14. Style Conventions

- **Naming**: camelCase for variables/functions, PascalCase for components/types
- **Components**: Exported as named function components (not default exports)
- **Props**: Defined as a `type Props` interface at the top
- **Tailwind**: Dark theme with `slate-950` base, `slate-800` borders/cards
- **Colors**: Semantic (emerald=good, amber=warning, rose=error, cyan=info)
- **Charts**: Consistent dark tooltip (`#0b1220`), grid (`#1f2937`), axis (`#94a3b8`)
- **Error display**: `border border-rose-800 bg-rose-950` containers
- **Success display**: `border border-emerald-800 bg-emerald-950` containers
- **No default exports** — all named exports for tree-shaking and consistency
- **ESLint**: `react-hooks/exhaustive-deps` is set (see `Dashboard.tsx` eslint-disable comment)
