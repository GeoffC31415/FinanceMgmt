# TODO — Frontend Improvements

> Prioritized list of improvements for the FinanceMgmt frontend.
> This file is a living document — check it before starting work and update status as items are done.

---

## P0 — High Impact / Low Effort

### [x] 1. Remove `as any` casts (5 of 6 done, 1 remaining)

**Why:** Loses TypeScript type safety, defeats the purpose of the type system.

**Where:**
- `frontend/src/components/config/ScenarioConfigPage.tsx` — multiple `as any` on `asset_type`, `withdrawal_priority`, `bond_allocation`
- `frontend/src/components/config/ScenarioForm.tsx` — `name={... as any}` in Controller, `asset_type: inferred as any`
- `frontend/src/components/config/ConfigWizard.tsx` — `asset_type: e.target.value as any`

**How:** Define proper types for the dynamic fields, or use type guards. The `AssetCreate.asset_type` is already typed as `"CASH" | "ISA" | "GIA" | "PENSION"` — the casts come from legacy data or `Record<string, unknown>` assumptions. Fix the type flow instead of casting.

**Remaining:** 1 cast in `ConfigWizard.tsx` (line 299) — `assumptions: {} as any` in `create_scenario()` call.

---

### [x] 2. Extract `applyInflationAdjustment` into a generic utility

**Why:** The function manually maps ~40 fields. A generic version is shorter, less error-prone, and easier to maintain.

**Where:** `frontend/src/components/Dashboard.tsx` (lines ~120-170)

**How:**
```ts
// In a new file: frontend/src/utils/inflation.ts
export function applyInflationAdjustment(
  result: SimulationResponse,
  inflationRate: number,
  startYear: number
): SimulationResponse {
  const adjust = (arr: number[]) =>
    arr?.length ? arr.map((v, i) => v / Math.pow(1 + inflationRate, i)) : arr;

  return Object.fromEntries(
    Object.entries(result).map(([k, v]) =>
      Array.isArray(v) ? [k, adjust(v)] : [k, v]
    )
  ) as unknown as SimulationResponse;
}
```
Then replace the inline `adjustForInflation` + the big spread in `Dashboard.tsx`.

---

### [x] 3. Make layout responsive

**Why:** `App.tsx` uses `w-[70%] min-w-[800px]` which breaks on small screens and looks bad on very wide screens.

**Where:** `frontend/src/App.tsx` header and main container

**How:** Replace with `max-w-7xl mx-auto px-4` pattern. Remove fixed widths and use Tailwind's responsive utilities.

---

### [x] 4. Add retry logic to API client

**Why:** Network failures during simulation initialization are fatal. A quick retry improves perceived reliability.

**Where:** `frontend/src/api/client.ts` — the `http<TResponse>()` function

**How:** Add a retry wrapper for GET/idempotent requests with exponential backoff (e.g., 3 retries, 250ms/500ms/1000ms delays).

---

## P1 — High Impact / Medium Effort

### [x] 5. Split `Dashboard.tsx` (1,180 lines) into smaller units

**Why:** Single responsibility, easier to test, easier to review.

**Done:** Extracted into:
- `frontend/src/components/Dashboard/useDashboardState.ts` — all `useState`/`useEffect` logic (scenario selection, simulation init/recalc, bond allocation handlers)
- `frontend/src/components/Dashboard/useDashboardData.ts` — inflation adjustment, derived metrics (`overview_metrics`, `bankruptcy_info`, `mortgage_payoff_year`, etc.)
- `frontend/src/components/Dashboard/utils.ts` — `getScenarioBondAllocations`, `format_currency_compact`
- `frontend/src/components/Dashboard/OverviewTab.tsx` (153 lines)
- `frontend/src/components/Dashboard/IncomeSpendingTab.tsx` (50 lines)
- `frontend/src/components/Dashboard/AssetsTab.tsx` (73 lines)
- `frontend/src/components/Dashboard/RiskTab.tsx` (72 lines)
- `frontend/src/components/Dashboard/AllocationTab.tsx` (245 lines)
- `frontend/src/components/Dashboard/index.ts` — barrel exports
- `frontend/src/components/__tests__/bondAllocations.test.ts` — 13 tests for utility functions

**Result:** `Dashboard.tsx` reduced from 1,180 → 459 lines (61% reduction). All 18 tests pass. Build succeeds.

---

### [~] 6. Break up `ScenarioForm.tsx` (753 lines)

**Why:** Same as #5 — maintainability and reviewability.

**Current status:**
- Schema → `formSchema.ts` (84 lines extracted, 7 tests)
- Phase 1: **COMPLETE** ✅
- Phase 2a: **COMPLETE** ✅ (PropertiesForm)
- Phase 2b: **COMPLETE** ✅ (PeopleForm)
- Phase 2c: **COMPLETE** ✅ (IncomeForm)
- Phase 2d: **COMPLETE** ✅ (AssetsForm)
- Phase 2e: **COMPLETE** ✅ (ExpensesForm, 10 tests, wired)
- Phase 3a: **COMPLETE** ✅ (ScenarioFormContext)
- Phase 3c: **COMPLETE** ✅ (Integration test, 18 tests)
- Remaining in-file: ~753 lines
- **Worth doing?** Yes — each tab is independently testable, but they share form state tightly.

**Done — Phase 1 (COMPLETE):**

**1a. Extract helper components** → `src/components/config/inputs.tsx` ✅ (213 lines)
- `NumberInput`, `PercentInput`, `AnnualFromMonthlyInput`, `RentalSection`, `InfoTip`
- Tests: 12 tests in `inputs.test.tsx`

**1b. Extract form converters** → `src/components/config/formConverters.ts` ✅ (231 lines)
- `to_form_values`, `to_scenario_create`, `normalize_person_id`, `property_mortgage_balance`, `property_mortgage_monthly_payment`
- Pure functions: `parse_number_input`, `format_number_input`, `parse_percent_input`, `format_percent_input`
- Tests: 18 tests (9 converters + 9 form value tests)

**Done — Phase 2a (COMPLETE):**

**2a. Extract PropertiesForm** → `src/components/config/PropertiesForm.tsx` ✅ (367 lines)
- Portfolio summary bar with total value/equity/debt
- Property cards with collapse/expand
- Value & appreciation fields
- Rental income section (uses RentalSection)
- Mortgage config (LTV, rate, term) with computed metrics
- Maintenance & costs
- Net cashflow summary
- Add/remove property controls
- Tests: 5 tests in `PropertiesForm.test.tsx`

**Done — Phase 2b (COMPLETE):**

**2b. Extract PeopleForm** → `src/components/config/PeopleForm.tsx` ✅ (163 lines)
- People & Children section heading + description
- Person cards with name, DoB, and conditional fields
- Adult fields: planned retirement age, state pension age
- Child fields: annual cost (£), leaves household at age
- Add adult / Add child buttons with smart defaults
- Tests: 12 tests in `PeopleForm.test.tsx`

**Done — Phase 2c (COMPLETE):**

**2c. Extract IncomeForm** → `src/components/config/IncomeForm.tsx` ✅ (135 lines)
- Income section heading + annual total
- Income types helper (Salary/Rental/Gift explanation)
- Income rows with person dropdown, type selector, gross annual, growth rate
- Pension contribution fields (opacity-40 for non-salary)
- Add income button
- Tests: 11 tests in `IncomeForm.test.tsx`

**Done — Phase 2d (COMPLETE):**

**2d. Extract AssetsForm** → `src/components/config/AssetsForm.tsx` ✅ (202 lines)
- Assets section heading + total balance
- Withdrawal priority helper (ISA/GIA/Pension)
- Pension note with age restriction info
- Asset rows: person dropdown, name, type (CASH/ISA/GIA/Pension), priority, balance, contribution cap
- Growth rate + volatility fields (opacity-40 for CASH when using bootstrap)
- Bond allocation field (only visible for equity assets with bootstrap)
- "End at retire" checkbox
- Add asset button
- Tests: 12 tests in `AssetsForm.test.tsx`

**Phase 2e (COMPLETE):**

**2e. Extract ExpensesForm** → `src/components/config/ExpensesForm.tsx` ✅ (97 lines, 10 tests)
- Expenses section heading + annual total
- Expense rows: name, monthly amount, annual amount, inflation toggle
- Add expense button
- Tests: 10 tests in `ExpensesForm.test.tsx`
- Wiring: ✅ Done

**Remaining tabs to extract:**
- Assumptions (~107 lines) — tax year selector, return model, inflation, limits
- Sell Order (~58 lines) — withdrawal order visualization
- Housing (~58 lines) — property mortgage display

**ScenarioForm.tsx reduction:** 1,840 → **753 lines** (-1,087 lines total, 59% reduction)

#### Phase 3: Wiring (medium risk)

**3a. Create `ScenarioFormContext`** — wrap shared form state so tabs can access it without prop drilling ✅
- `ScenarioFormContext.tsx` — context + provider + `useScenarioForm()` hook
- Full types for all field arrays, computed totals, and form methods

**3b. Wire all tabs into ScenarioForm** ✅
- All tabs now use the extracted component pattern
- ExpensesForm wired in (was the last Phase 2 tab)

**3c. Integration test** — verify form validates, saves, loads correctly ✅
- `ScenarioFormIntegration.test.tsx` — 18 tests covering all tabs, switching, validation, editing

**Remaining:**
- Extract Assumptions, Sell Order, Housing tabs (still inline in ScenarioForm.tsx)
- Wire all tabs to use `ScenarioFormContext` to eliminate prop drilling

**Risk assessment:**

| Phase | Risk | Effort | Payoff |
|-------|------|--------|--------|
| 1a (inputs) | Low | Small | Reusable components |
| 1b (converters) | Low | Small | Testable pure functions |
| 2a (PropertiesForm) | Medium | Medium | Biggest line count win |
| 2b-2c (People/Income) | Medium | Medium | Field array patterns |
| 2d (AssetsForm) | Medium | Medium | Bond allocation logic |
| 2e (remaining) | Low | Small | Cleanup |
| 3a-3c (wiring) | Medium | Medium | End-to-end |

**Total remaining reduction:** ~1,200 lines → ScenarioForm drops to ~500 lines.

---

### [x] 7. Define proper `Assumptions` type

**Why:** `Assumptions = Record<string, unknown>` loses all type safety. Every access requires casting.

**Done:** The `Assumptions` type was already properly defined in `types/index.ts`. Cleaned up unnecessary casts:
- `ScenarioForm.tsx`: Removed `as Assumptions` cast (line 454)
- `useDashboardState.ts`: Removed `as Record<string, unknown>` cast, now uses proper `Assumptions` type directly

Added `src/types/__tests__/Assumptions.test.ts` with 4 tests verifying the type structure.

---

### [x] 8. Fix bond sweep polling race condition

**Why:** If the polling interval fires after `finally` clears `sweep_started_at_ms_ref` but before the next render, it could produce stale/zero ETA.

**Done:** Added `sweep_cancelled_ref` (useRef) that is:
- Set to `false` at the start of each sweep
- Checked at the top of the polling interval (`if (sweep_cancelled_ref.current) return`)
- Set to `true` in the `finally` block before clearing the interval

**Result:** Polling is now safely cancelled before any state updates in `finally`, preventing stale updates.

---

## P2 — Medium Impact / Medium Effort

### [ ] 9. Expand test coverage

**Why:** Only 5 assertions exist. Core logic is untested.

**What to add:**
- `useSimulation` hook tests (mock fetch, test state transitions, error handling)
- `applyInflationAdjustment` utility tests (various rates, edge cases)
- `OverviewInsights` generated insights tests (success rate thresholds, warnings)
- `exportExcel` column formatting tests
- `chartFormatters` utility tests (`formatCompactCurrencyTick`, `getCurrencyAxisWidth`)

**Where:** `frontend/src/test/` — add new test files

---

### [ ] 10. Memoize chart data transformations

**Why:** Each chart recalculates its entire data array on every render. Several charts are re-rendered frequently due to state changes.

**Where:** All chart components:
- `NetWorthChart.tsx`
- `ExpensesChart.tsx`
- `IncomeChart.tsx`
- `AssetsChart.tsx`
- `AssetDetailChart.tsx`
- `SensitivityChart.tsx`
- `RiskTimelineChart.tsx`
- `BondSweepChart.tsx`

**How:** Wrap the `years.map(...)` data computation in `useMemo` with appropriate dependencies.

---

### [ ] 11. Add E2E tests

**Why:** Critical user flows (create scenario → run simulation → view results → export) are untested end-to-end.

**How:** Add Playwright tests for:
- Create a new scenario via wizard
- Run a simulation
- View comparison dashboard
- Export to Excel

---

## P3 — Lower Priority / Polish

### [ ] 12. Replace emoji markers with SVG icons

**Why:** 🎓 and 🏠 render inconsistently across platforms/OS.

**Where:** `frontend/src/components/charts/ExpensesChart.tsx` — `ChildLeavingLabel` and `MortgagePayoffLabel`

**How:** Replace with consistent SVG icons (graduation cap, house).

---

### [ ] 13. Add `aria-live` regions for bond sweep progress

**Why:** Screen readers won't announce progress updates without live regions.

**Where:** `frontend/src/components/Dashboard.tsx` — bond sweep progress section

---

### [ ] 14. Add `.env.example` file

**Why:** New developers won't know what env vars are available.

**How:** Create `frontend/.env.example` documenting `VITE_API_BASE_URL`.

---

### [ ] 15. Remove dead `run_simulation` export

**Why:** `useSimulation.ts` exports `run()` which is never called — the app uses `init()` + `recalc()` for the session-based flow.

**Where:** `frontend/src/hooks/useSimulation.ts`

---

### [ ] 16. Consider disabling chart animation

**Why:** Financial charts with 30-60 data points don't need animation; it adds perceived lag.

**How:** Add `isAnimationActive={false}` to `<ResponsiveContainer>` or `<LineChart>` in all chart components.

---

## Completed

- [x] Initial codebase review and analysis
- [x] TODO.md created
- [x] AGENTS.md created
- [x] #5 Split `Dashboard.tsx` into smaller units (1,180 → 459 lines)
- [x] #7 Define proper `Assumptions` type
- [x] #8 Fix bond sweep polling race condition
- [x] ScenarioForm Phase 1: Extract inputs + formConverters (30 tests)
- [x] ScenarioForm Phase 2a: Extract PropertiesForm (5 tests)
- [x] ScenarioForm Phase 2b: Extract PeopleForm (12 tests)
- [x] ScenarioForm Phase 2c: Extract IncomeForm (11 tests)
- [x] ScenarioForm Phase 2d: Extract AssetsForm (12 tests)
- [x] ScenarioForm Phase 2e: Extract ExpensesForm (10 tests ✅)
- [x] ScenarioForm Phase 3a: Create ScenarioFormContext (context + provider + hook)
- [x] ScenarioForm Phase 3c: Integration test (18 tests)
- [x] ScenarioForm total: 1,840 → 753 lines (-1,087, 59%)
- [x] Total tests: 119 across 13 test files
