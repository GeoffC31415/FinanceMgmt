# TODO — Frontend Improvements

> Prioritized list of improvements for the FinanceMgmt frontend.
> This file is a living document — check it before starting work and update status as items are done.
>
> Last updated: 2026-04-26. Current frontend test suite: `npm test` passes with 249 tests across 22 files. `npm run build` is still blocked by known TypeScript issues (Recharts `isAnimationActive` props, field-array generic types, and a few test type mismatches).

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

### [ ] 4a. Restore TypeScript production build

**Why:** `npm test` passes, but `npm run build` currently fails. This makes deployment/release checks unreliable.

**Current known failures:**
- Recharts chart components pass `isAnimationActive` to chart containers where the installed type definitions do not allow it.
- `FieldArrayWithId<AssetCreate, "assets", ...>` style component props are typed against item types rather than the full form value type, producing `never` constraints.
- Some test files contain type-only mismatches (`state_pension_median` vs `state_pension_income_median`, nullable chart test data, relative imports).
- `AssumptionsForm.tsx` imports `TaxYearPreset` from `types` even though it is exported by `api/client`.

**Tasks:**
- [ ] Move `isAnimationActive={false}` to individual Recharts series elements or wrap with compatible props.
- [ ] Re-type extracted config form components around the full form schema type instead of per-item types.
- [ ] Fix test-only type mismatches and stale imports.
- [ ] Add `npm run build` to the regular validation checklist/CI once green.

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

**Result:** `Dashboard.tsx` reduced from 1,180 → ~459 lines at the time of refactor (later UI/onboarding work changed line counts). Dashboard tests pass. Full build is currently blocked by unrelated TypeScript issues tracked below.

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
- `src/hooks/__tests__/useSimulation.test.tsx` — 20 tests for hook state transitions (init, recalc, safe withdrawal, safe-withdrawal error handling, bond sweep)
- `src/components/__tests__/OverviewInsights.test.tsx` — 19 tests for insight generation (success rate tiers, safe spending, over-spending, children, retirement)

**Result:** 137 → 210 tests at the time of this milestone (now 249 tests). All tests pass.

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
- [x] Current total after risk-analysis error handling: 249 tests across 22 test files
- [x] Fixed Risk Analysis max-safe-spending display: frontend now tracks and displays safe-withdrawal calculation errors instead of silently showing `---`

---

# UX / Onboarding / Usability TODO

> Goal: make the frontend feel like a guided financial planning product rather than a technical simulation console.
>
> Priority: **UX-P0** = immediate usability blocker/high impact, **UX-P1** = major product improvement, **UX-P2** = polish/education, **UX-P3** = future enhancement.

---

## UX-P0 — First-Run Experience and Basic Usability

### [ ] UX-1. Add a proper first-run welcome / empty-state experience

**Status:** In progress — added `/intro`, reusable intro/welcome content, sample/starter scenario CTAs, and dashboard empty-state routing when no scenarios exist.

**Why:** The app currently opens on the simulation dashboard. If the user has no scenario, or does not understand what a scenario is, they are dropped into a dense technical UI.

**What to build:**

Show a friendly welcome state when no scenarios exist:

```text
Welcome to Finance Simulator

Model your household finances and stress-test retirement plans.

[Use Guided Setup]
[Start from Template]
[Create Blank Scenario]
[Load Sample Scenario]
```

**Tasks:**

- [x] Add an empty-state component for `Dashboard` when there are no scenarios.
- [x] Add a first-run welcome/intro route.
- [x] Add a refreshed first-run/setup panel in `ScenarioConfigPage`.
- [x] Add clear calls to action: walkthrough, starter template, sample scenario.
- [x] Avoid showing simulation sliders/charts until a scenario exists.
- [ ] Add tests for empty-state rendering.

**Likely files:**

- `src/components/Dashboard.tsx`
- `src/components/config/ScenarioConfigPage.tsx`
- New: `src/components/onboarding/WelcomePanel.tsx`
- New: `src/components/ui/EmptyState.tsx`

---

### [ ] UX-2. Rename navigation and user-facing labels to plain English

**Status:** In progress — navigation labels and the config page title/intro have been updated.

**Why:** Current labels are functional but technical. `Config`, `Simulation`, `annual_spend_target`, `bond sweep`, etc. are not user-friendly.

**Suggested label changes:**

| Current | Recommended |
|---|---|
| Simulation | Projection |
| Config | Plan Setup |
| Compare | Compare Plans |
| Help | Learn |
| Scenario Simulation | Retirement Projection |
| Extra spend / fun fund | Extra retirement spending |
| annual_spend_target | Retirement lifestyle spending |
| Bankruptcy threshold | Severe shortfall threshold |
| Depletion | Assets depleted |
| Historical bootstrap | Historical returns |
| Parametric | Custom return assumptions |
| Bond allocation sweep | Find safer investment mix |
| GIA | Taxable investment account (GIA) |

**Tasks:**

- [x] Update nav labels in `App.tsx`.
- [x] Update dashboard headings and core projection framing.
- [x] Update config page heading and starter action labels.
- [ ] Update config form labels.
- [ ] Keep technical terms in tooltips/help where needed.
- [ ] Update tests that assert text labels.

**Likely files:**

- `src/App.tsx`
- `src/components/Dashboard.tsx`
- `src/components/Dashboard/*`
- `src/components/config/*`
- `src/components/HelpPage.tsx`

---

### [ ] UX-3. Fix stale or misleading helper copy

**Status:** In progress — fixed the pension withdrawal copy, stale setup page intro, and added pension/state-pension warning copy with tests.

**Why:** Some helper text does not match backend behaviour or is confusing.

**Known examples:**

- `AssetsForm.tsx` says 25% tax-free pension withdrawals are "not yet modelled here", but backend pension drawdown does model 25% tax-free / 75% taxable.
- `ScenarioConfigPage.tsx` says "Next step adds full tabbed forms" even though tabbed forms exist.
- Some labels expose internal concepts before explaining them.

**Tasks:**

- [ ] Audit all helper text in `src/components/config/*`.
- [x] Fix pension drawdown copy.
- [x] Fix stale configuration page intro copy.
- [x] Add tests for critical explanatory text.
- [ ] Keep language consistent with README and Help/Learn pages.

---

### [ ] UX-4. Add reusable UI primitives for visual consistency

**Status:** In progress — added initial `Button`/`ButtonLink` and `Card` primitives and used them on the intro/setup surfaces.

**Why:** The UI is mostly raw Tailwind classes repeated everywhere. This causes inconsistent spacing, button styles, cards, errors, and form controls.

**What to build:**

Create a small internal component library:

```text
src/components/ui/
├── Alert.tsx
├── Badge.tsx
├── Button.tsx
├── Callout.tsx
├── Card.tsx
├── EmptyState.tsx
├── Field.tsx
├── Input.tsx
├── PageHeader.tsx
├── ProgressSteps.tsx
├── Select.tsx
├── Slider.tsx
├── StatCard.tsx
├── Tabs.tsx
└── Tooltip.tsx
```

**Tasks:**

- [x] Implement `Button` with variants: primary, secondary, ghost, destructive.
- [x] Implement `Card`.
- [ ] Implement `PageHeader`.
- [ ] Implement `Alert`/`Callout` for errors, warnings, and education.
- [ ] Implement `StatCard` for dashboard metrics.
- [ ] Implement accessible `Tooltip` instead of relying on `title` attributes.
- [ ] Gradually replace duplicated Tailwind blocks in dashboard/config pages.

---

## UX-P1 — Guided Setup / Walkthrough Improvements

### [ ] UX-5. Rework `ConfigWizard` into a guided interview

**Why:** `ConfigWizard.tsx` exists, but it still feels like a long technical form. It should guide users through decisions in plain language.

**Recommended flow:**

1. **Goal** — what question are you trying to answer?
2. **Household** — adults, children, ages, retirement timing.
3. **Income** — salary, pension contributions, rental/gifts.
4. **Assets** — cash, ISA, taxable investments, pensions, property.
5. **Spending** — essential spending, mortgage, child costs, desired retirement lifestyle.
6. **Assumptions** — inflation, return model, tax year; hide advanced fields.
7. **Review** — summary, warnings, save and run.

**Tasks:**

- [ ] Add an initial "What are you trying to find out?" step.
- [ ] Split required/simple fields from advanced fields.
- [ ] Replace technical labels with plain-English prompts.
- [ ] Add education callouts on each step.
- [ ] Add a final review screen with totals and warnings.
- [ ] Add a "Save and Run Projection" final action.
- [ ] Surface autosave/progress status more clearly.

**Likely file:**

- `src/components/config/ConfigWizard.tsx`

**Future refactor:** break `ConfigWizard.tsx` into step components:

```text
src/components/onboarding/wizard/
├── WizardPage.tsx
├── GoalStep.tsx
├── HouseholdStep.tsx
├── IncomeStep.tsx
├── AssetsStep.tsx
├── SpendingStep.tsx
├── AssumptionsStep.tsx
├── ReviewStep.tsx
└── wizardDefaults.ts
```

---

### [ ] UX-6. Add scenario templates

**Why:** Users should not need to build everything from scratch. Templates reduce friction and teach the data model through examples.

**Suggested templates:**

- [ ] Single earner, no property.
- [ ] Couple with mortgage.
- [ ] Couple with children.
- [ ] FIRE / early retirement.
- [ ] Buy-to-let landlord.
- [ ] Already retired.
- [ ] High pension saver.
- [ ] ISA/GIA-heavy investor.

**Tasks:**

- [ ] Define template metadata: name, description, who it is for, assumptions.
- [ ] Add template picker UI.
- [ ] Let users preview template contents before creating.
- [ ] Use realistic but clearly labelled placeholder values.
- [ ] Add tests for template creation.

**Likely files:**

- New: `src/components/onboarding/TemplatePicker.tsx`
- New: `src/data/scenarioTemplates.ts`
- `src/components/config/ScenarioConfigPage.tsx`

---

### [ ] UX-7. Add a sample scenario / demo mode

**Why:** Users need a safe way to explore charts and controls before entering their own financial data.

**Tasks:**

- [ ] Add "Load sample scenario" CTA.
- [ ] Create a realistic sample household.
- [ ] Explain that values are fictional and for learning only.
- [ ] Optionally auto-run simulation after creating the sample.
- [ ] Add "Reset sample" / "Delete sample" handling.

---

### [ ] UX-8. Add a scenario readiness checklist

**Why:** Users can create scenarios that are technically valid but misleading: missing pension owner, no cash account, no expenses, pension contributions with no pension asset, retiring before pension access with no bridge assets, etc.

**Checklist examples:**

```text
Scenario readiness

✓ At least one adult added
✓ Income configured
✓ Cash account exists
✓ Expenses configured
⚠ Pension contributions entered but no pension account for Jane
⚠ Retiring before pension access age — bridge assets may be needed
⚠ No GIA/property cost basis provided — CGT may be inaccurate
```

**Tasks:**

- [ ] Add frontend-only lightweight checks first.
- [ ] Consider adding backend validation warnings endpoint later.
- [ ] Show checklist in wizard review step.
- [ ] Show checklist in `ScenarioConfigPage` beside selected scenario.
- [ ] Block only severe errors; allow warnings.

**Likely files:**

- New: `src/utils/scenarioReadiness.ts`
- New: `src/components/config/ScenarioReadinessPanel.tsx`
- `src/components/config/ConfigWizard.tsx`
- `src/components/config/ScenarioConfigPage.tsx`

---

## UX-P1 — Dashboard Improvements

### [ ] UX-9. Redesign dashboard top section around answers, not controls

**Why:** The dashboard should immediately answer: "Am I okay?" Currently controls dominate the top of the page.

**What to show first:**

```text
Plan health: Good / Caution / High risk
Safe extra retirement spending: £X/year
Chance of severe shortfall: Y%
Median final net worth: £Z
```

**Tasks:**

- [ ] Add top-level `StatCard` row.
- [ ] Add plan health classification using bankruptcy/depletion thresholds.
- [ ] Add interpretation text below the cards.
- [ ] Move less-used controls into collapsible "Projection settings".
- [ ] Keep scenario selector and main spend/retirement controls visible.

**Likely files:**

- `src/components/Dashboard.tsx`
- `src/components/Dashboard/OverviewTab.tsx`
- `src/components/OverviewInsights.tsx`
- `src/components/RiskSummaryPanel.tsx`

---

### [ ] UX-10. Add "What this means" explanations to results

**Why:** Charts show data, but users need interpretation.

**Examples:**

- "Your main risk period is between retirement and state pension age."
- "Your plan is sensitive to discretionary spending above £X/year."
- "Most bankrupt outcomes happen after age 85."
- "You have high final wealth but poor pre-pension bridge liquidity."

**Tasks:**

- [ ] Extend `OverviewInsights` with more human-readable explanations.
- [ ] Add insight severity levels: good, warning, risk, info.
- [ ] Add links from insights to suggested actions.
- [ ] Add tests for insight generation.

---

### [ ] UX-11. Add suggested next actions

**Why:** After viewing results, users need clear next steps.

**Suggested actions:**

- [ ] Find safe spending level.
- [ ] Retire 2 years later.
- [ ] Compare against another plan.
- [ ] Run safer investment mix search.
- [ ] Open setup checklist.
- [ ] View Learn article for interpreting risk.

**Tasks:**

- [ ] Add a `NextActionsPanel` to dashboard overview.
- [ ] Trigger existing safe withdrawal / bond sweep flows from action cards.
- [ ] Use scenario conditions to decide which actions appear.

---

### [ ] UX-12. Improve simulation controls

**Why:** The sticky control panel is functional but dense.

**Tasks:**

- [ ] Split controls into "Main controls" and "Advanced projection settings".
- [ ] Keep visible: scenario, extra retirement spending, retirement age offset, real/nominal toggle.
- [ ] Move percentile, end year, risk threshold, bond target year into advanced/collapsible areas.
- [ ] Explain percentile presets inline:
  - P10 = poor market outcome;
  - P50 = typical/median outcome;
  - P90 = strong market outcome.
- [ ] Add reset-to-scenario-default controls.

---

### [ ] UX-13. Improve loading and long-running task states

**Why:** Simulation, first Numba compile, and bond sweep can feel slow or opaque.

**Tasks:**

- [ ] Add skeleton placeholders for charts.
- [ ] Add staged loading messages:
  - generating return paths;
  - running Monte Carlo simulation;
  - calculating risk metrics.
- [ ] For first run after backend startup, explain JIT compilation may take longer.
- [ ] Improve bond sweep progress with phase, progress bar, ETA, and cancel button.
- [ ] Add tests for loading/progress UI where practical.

---

## UX-P2 — Education / Learn Centre

### [ ] UX-14. Replace `HelpPage` with a structured Learn Centre

**Why:** The current help page is useful but reads like implementation documentation. It should teach financial concepts and app usage.

**Recommended sections:**

```text
Learn
├── Getting started
├── How the simulator works
├── Understanding the dashboard
├── UK tax assumptions
├── Common planning questions
└── Glossary
```

**Tasks:**

- [ ] Split `HelpPage.tsx` into smaller learn components.
- [ ] Add a landing page with cards for each topic.
- [ ] Add "Getting started" checklist.
- [ ] Add "Understanding P10/P50/P90" explanation.
- [ ] Add "Real vs nominal" explanation.
- [ ] Add "UK tax assumptions" section.
- [ ] Add "Common questions" section.

**Likely structure:**

```text
src/components/help/
├── HelpPage.tsx
├── GettingStarted.tsx
├── Concepts.tsx
├── TaxAssumptions.tsx
├── DashboardGuide.tsx
├── CommonQuestions.tsx
└── Glossary.tsx
```

---

### [ ] UX-15. Add contextual education callouts throughout setup and dashboard

**Why:** Users should learn at the point they need the concept, not only on a separate help page.

**Tasks:**

- [ ] Add `Callout` component variants: info, tip, warning, example.
- [ ] Add "Why this matters" sections to complex fields.
- [ ] Add "Learn more" links to relevant Learn Centre sections.
- [ ] Replace many `title`-only tooltips with accessible popovers/callouts.

**Good places for callouts:**

- Pension access age.
- State pension age.
- Retirement spending.
- ISA/GIA/Pension asset types.
- Withdrawal order.
- Real vs nominal values.
- Percentiles.
- Safe withdrawal.
- Bond allocation.

---

### [ ] UX-16. Add glossary and inline term definitions

**Why:** Terms like Monte Carlo, P10, depletion, CGT, GIA, and real/nominal are unfamiliar to many users.

**Tasks:**

- [ ] Create `src/data/glossary.ts`.
- [ ] Add glossary page.
- [ ] Add inline `GlossaryTerm` component for popovers.
- [ ] Use glossary terms in dashboard and config forms.

**Initial terms:**

- Monte Carlo.
- Percentile.
- P10/P50/P90.
- Net worth.
- Safe withdrawal.
- Depletion.
- Severe shortfall / bankruptcy threshold.
- ISA.
- GIA.
- Pension access age.
- State pension.
- CGT.
- National Insurance.
- Real vs nominal.
- Historical returns.
- Volatility.
- Bond allocation.

---

### [ ] UX-17. Add common planning question workflows

**Why:** Users often arrive with specific questions, not a desire to manipulate raw simulation controls.

**Guided workflows:**

- [ ] Can I retire earlier?
- [ ] How much can I safely spend?
- [ ] What if markets perform badly?
- [ ] What if I sell a property?
- [ ] What investment mix reduces risk?
- [ ] How much bridge money do I need before pension/state pension age?

**Tasks:**

- [ ] Add `GuidedWorkflowsPage` or dashboard action cards.
- [ ] Reuse existing simulation, safe withdrawal, comparison, and bond sweep APIs.
- [ ] Present results as before/after summaries rather than raw charts only.

---

## UX-P2 — Forms and Visual Design

### [ ] UX-18. Add simple/advanced mode to configuration forms

**Why:** The forms expose many advanced modelling fields immediately: growth rates, volatility, contribution caps, withdrawal priorities, start/end years, bond allocation, etc.

**Tasks:**

- [ ] Show essential fields by default.
- [ ] Collapse advanced fields behind "Advanced assumptions" per section.
- [ ] Remember user preference in local storage.
- [ ] Keep advanced fields visible for power users.

**Suggested essential fields:**

- People: name, date/year of birth, retirement age, state pension age.
- Income: type, owner, gross annual amount, pension contribution.
- Assets: type, owner, current balance.
- Expenses: name/category, monthly amount.
- Assumptions: inflation, return model, tax year, projection end year.

---

### [ ] UX-19. Improve currency and percent inputs

**Why:** Raw number inputs are error-prone and visually harsh.

**Tasks:**

- [ ] Format currency values with commas while editing or on blur.
- [ ] Display percentage values as `5%` while storing `0.05`.
- [ ] Add consistent prefix/suffix affordances: `£`, `%`, `/yr`, `/mo`.
- [ ] Add validation errors directly below fields.
- [ ] Add tests for parsing/formatting.

**Likely files:**

- `src/components/config/inputs.tsx`
- New: `src/utils/numberFormatting.ts`

---

### [ ] UX-20. Add live summaries in setup forms

**Why:** Users need feedback that their inputs make sense.

**Examples:**

- Household annual gross income.
- Estimated annual pension contributions.
- Total current assets.
- Total current debts/mortgage.
- Current net worth.
- Monthly and annual expenses.
- Retirement bridge years before pension access/state pension.

**Tasks:**

- [ ] Add summary sidebar to `ScenarioForm`.
- [ ] Add summary cards to wizard review step.
- [ ] Add warning when retirement starts before pension access age and bridge assets are low.

---

### [ ] UX-21. Improve visual style and hierarchy

**Why:** The dark theme is usable but flat and box-heavy. It needs clearer hierarchy and less visual clutter.

**Tasks:**

- [ ] Reduce excessive borders; use elevation/background contrast selectively.
- [ ] Increase spacing between major sections.
- [ ] Standardize heading sizes and text colours.
- [ ] Standardize card padding and corner radius.
- [ ] Use consistent accent colours:
  - Indigo/blue = primary action;
  - Emerald = good/safe;
  - Amber = caution;
  - Rose = risk/error.
- [ ] Improve chart colour palette for readability and colour-blind safety.
- [ ] Add icons only where they clarify meaning.
- [ ] Consider a refined light mode later.

---

### [ ] UX-22. Improve responsive/mobile layout

**Why:** The app is likely desktop-first. Finance setup and dashboard controls should remain usable on tablets/smaller screens.

**Tasks:**

- [ ] Audit every page at mobile/tablet widths.
- [ ] Convert top nav to a responsive menu if needed.
- [ ] Make sticky dashboard controls less tall on small screens.
- [ ] Ensure charts have readable heights and scroll behaviour.
- [ ] Ensure wizard progress steps wrap or collapse cleanly.
- [ ] Add responsive tests or Storybook viewport checks if Storybook is added.

---

## UX-P3 — Future Enhancements

### [ ] UX-23. Add onboarding progress persistence and resume flow

**Tasks:**

- [ ] Show autosave state: saving, saved, failed.
- [ ] Show "Last saved X seconds ago".
- [ ] Warn before leaving with unsaved changes.
- [ ] Allow users to resume an incomplete walkthrough.
- [ ] Distinguish draft scenarios from completed scenarios.

---

### [ ] UX-24. Add plan comparison storytelling

**Why:** Compare currently overlays results, but users need the app to explain differences.

**Tasks:**

- [ ] Add comparison summary cards.
- [ ] Show delta in final net worth, bankruptcy risk, safe spending, retirement age.
- [ ] Highlight which scenario is safer / higher spending / higher final wealth.
- [ ] Add "duplicate scenario and change one thing" flow.

---

### [ ] UX-25. Add optional product analytics / local event logging

**Why:** If this becomes more than a local tool, it would help identify where users get stuck. For a local/privacy-first app, keep this local-only unless explicitly opted in.

**Tasks:**

- [ ] Track local-only events for wizard abandonment, validation warnings, failed simulations.
- [ ] Add developer debug panel for UX events.
- [ ] Do not send data externally without explicit opt-in.

---

## Suggested UX Implementation Order

1. **Quick copy/navigation fixes**: UX-2, UX-3.
2. **Reusable UI primitives**: UX-4.
3. **First-run empty state**: UX-1.
4. **Scenario templates/sample scenario**: UX-6, UX-7.
5. **Dashboard answer-first redesign**: UX-9, UX-10, UX-11, UX-12.
6. **Wizard guided interview**: UX-5, UX-8.
7. **Learn Centre/glossary/contextual education**: UX-14, UX-15, UX-16.
8. **Form polish and simple/advanced mode**: UX-18, UX-19, UX-20.
9. **Full visual polish/responsive audit**: UX-21, UX-22.
10. **Guided workflows and comparison storytelling**: UX-17, UX-24.
