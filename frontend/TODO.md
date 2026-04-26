# TODO — Frontend Improvements

> Prioritized list of improvements for the FinanceMgmt frontend.
> This file is a living document — check it before starting work and update status as items are done.

---

## P0 — High Impact / Low Effort

### [x] 1. Remove `as any` casts (6 occurrences)

**Why:** Loses TypeScript type safety, defeats the purpose of the type system.

**Where:**
- `frontend/src/components/config/ScenarioConfigPage.tsx` — multiple `as any` on `asset_type`, `withdrawal_priority`, `bond_allocation`
- `frontend/src/components/config/ScenarioForm.tsx` — `name={... as any}` in Controller, `asset_type: inferred as any`
- `frontend/src/components/config/ConfigWizard.tsx` — `asset_type: e.target.value as any`

**How:** Define proper types for the dynamic fields, or use type guards. The `AssetCreate.asset_type` is already typed as `"CASH" | "ISA" | "GIA" | "PENSION"` — the casts come from legacy data or `Record<string, unknown>` assumptions. Fix the type flow instead of casting.

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

### [~] 6. Break up `ScenarioForm.tsx` (1,840 lines)

**Why:** Same as #5 — maintainability and reviewability.

**Progress:** Schema extracted to `frontend/src/components/config/formSchema.ts` with 7 validation tests.

**Done:**
- `formSchema.ts` — extracted Zod schema + FormValues type (7 tests)
- Removed `as Assumptions` cast from `ScenarioForm.tsx`

**Remaining:** The tab components (PropertiesForm ~326 lines, AssetsForm ~173 lines, PeopleForm ~137 lines, etc.) are deeply intertwined with shared form state (field arrays, watched values, helper functions). A full extraction would require careful prop drilling or context. This is a larger effort best done incrementally.

**Next steps:**
1. Extract helper components (NumberInput, PercentInput, etc.) to shared file
2. Extract property mortgage calculation functions
3. Extract PropertiesForm (largest tab at ~326 lines)
4. Extract remaining tabs one by one

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
