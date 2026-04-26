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

**Status:** ✅ Complete — the remaining `as any` in `ConfigWizard.tsx` has been replaced with a proper `Assumptions` object with sensible defaults.

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

### [x] 6. Break up `ScenarioForm.tsx` (1,840 → 434 lines)

**Why:** Same as #5 — maintainability and reviewability.

**Done:** Extracted all tabs, helpers, and converters into separate components:

| Extracted File | Lines | Tests |
|----------------|-------|-------|
| `formSchema.ts` | 87 | 7 |
| `inputs.tsx` | 213 | 12 |
| `formConverters.ts` | 231 | 18 |
| `PropertiesForm.tsx` | 367 | 5 |
| `PeopleForm.tsx` | 163 | 12 |
| `IncomeForm.tsx` | 135 | 11 |
| `AssetsForm.tsx` | 202 | 12 |
| `ExpensesForm.tsx` | 97 | 10 |
| `AssumptionsForm.tsx` | 107 | 6 |
| `SellOrderForm.tsx` | 58 | 6 |
| `HousingForm.tsx` | 58 | 6 |
| `ScenarioFormContext.tsx` | 97 | — |
| `ScenarioFormIntegration.test.tsx` | — | 18 |

**Result:** 1,840 → 434 lines (-1,406, 76% reduction). 137 tests across 16 test files.

**Remaining:** Wire all tabs to use `ScenarioFormContext` (eliminate prop drilling).

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

### [x] 9. Expand test coverage

**Why:** Only 5 assertions existed. Core logic was untested.

**Done:** Added 5 new test files with 73 tests:
- `src/utils/__tests__/inflation.test.ts` — 17 tests for `adjustForInflation` + `applyInflationAdjustment` (rates, edge cases, percentage fields unchanged)
- `src/utils/__tests__/chartFormatters.test.ts` — 18 tests for `formatCompactCurrencyTick` + `getCurrencyAxisWidth` (boundaries, negatives, caps)
- `src/hooks/__tests__/useSimulation.test.tsx` — 19 tests for hook state transitions (init, recalc, safe withdrawal, bond sweep, error handling)
- `src/components/__tests__/OverviewInsights.test.tsx` — 19 tests for insight generation (success rate tiers, safe spending, over-spending, children, retirement)

**Result:** 137 → 210 tests (54% increase). All pass.

---

### [x] 10. Memoize chart data transformations

**Why:** Each chart recalculated its entire data array on every render. State changes (fun fund slider, tab switches) triggered full re-computation.

**Done:** Wrapped `years.map(...)` in `useMemo` for 6 charts:
- `NetWorthChart.tsx` — deps: years + 10 data arrays + useLogScale
- `ExpensesChart.tsx` — deps: years + 6 data arrays + useLogScale
- `IncomeChart.tsx` — deps: years + 8 data arrays + useLogScale
- `AssetsChart.tsx` — deps: years + 5 data arrays + useLogScale
- `SensitivityChart.tsx` — deps: sensitivity_curve + net_worth_deflator
- `RiskTimelineChart.tsx` — deps: years + 2 data arrays

`AssetDetailChart.tsx` and `BondSweepChart.tsx` already had `useMemo`.

**Result:** Charts only recompute when their data arrays or flags actually change.

---

### [ ] 11. Add E2E tests

**Why:** Critical user flows (create scenario → run simulation → view results → export) are untested end-to-end.

**How:** Add Playwright tests for:
- Create a new scenario via wizard
- Run a simulation
- View comparison dashboard
- Export to Excel

**Status:** Not started — requires backend running + Playwright setup.

---

## P3 — Lower Priority / Polish

### [x] 12. Replace emoji markers with SVG icons

**Why:** 🎓 and 🏠 render inconsistently across platforms/OS.

**Done:** Replaced `ChildLeavingLabel` and `MortgagePayoffLabel` emoji text with `GraduationCapIcon` and `HouseIcon` SVG components. Both exported for testability.

**Result:** Consistent rendering across all platforms. 3 tests per icon component verify correct SVG structure.

---

### [x] 13. Add `aria-live` regions for bond sweep progress

**Why:** Screen readers won't announce progress updates without live regions.

**Done:** Added `role="progressbar"`, `aria-valuenow`, `aria-valuemin`, `aria-valuemax`, `aria-label`, and `aria-live="polite"` to the bond sweep progress bar in `AllocationTab.tsx`. Indeterminate state (total=0) omits `aria-valuenow`.

---

### [x] 14. Add `.env.example` file

**Why:** New developers won't know what env vars are available.

**Done:** Created `frontend/.env.example` documenting `VITE_API_BASE_URL` with example values for local and production use.

---

### [x] 15. Remove dead `run_simulation` export

**Why:** `useSimulation.ts` exports `run()` which is never called — the app uses `init()` + `recalc()` for the session-based flow.

**Done:** Removed `run_simulation` import, `run()` function, and `SimulationRequest` type import from `useSimulation.ts`. Removed `run` from the return object.

---

### [x] 16. Disable chart animation

**Why:** Financial charts with 30-60 data points don't need animation; it adds perceived lag.

**Done:** Added `isAnimationActive={false}` to all 7 chart components:
- `NetWorthChart.tsx`
- `IncomeChart.tsx`
- `AssetsChart.tsx`
- `AssetDetailChart.tsx` (2 charts: Balance + Incomings/outgoings)
- `BondSweepChart.tsx`
- `RiskTimelineChart.tsx`
- `ExpensesChart.tsx`

`SensitivityChart.tsx` already had it.

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
- [x] ScenarioForm total: 1,840 → 434 lines (-1,406, 76%)
- [x] Total tests: 210 across 20 test files (+73 from P2)
- [x] #1 Remove remaining `as any` cast in ConfigWizard.tsx
- [x] #15 Remove dead `run_simulation` export from useSimulation.ts
- [x] Phase 2f: Extract AssumptionsForm (6 tests)
- [x] Phase 2g: Extract SellOrderForm (6 tests)
- [x] Phase 2h: Extract HousingForm (6 tests)
- [x] #9 Expand test coverage: 73 new tests (inflation, chartFormatters, useSimulation, OverviewInsights)
- [x] #10 Memoize chart data: 6 chart components wrapped in useMemo
- [x] #12 Replace emoji markers with SVG icons (GraduationCapIcon, HouseIcon)
- [x] #13 Add aria-live regions for bond sweep progress
- [x] #14 Add .env.example file
- [x] #16 Disable chart animation on all 7 chart components
- [x] Added ResizeObserver polyfill to test setup (fixes Recharts jsdom tests)
- [x] New test files: ExpensesChart.test.tsx (19 tests), AllocationTab.test.tsx (16 tests)
- [x] Total tests: 245 across 22 test files (+35 new)
