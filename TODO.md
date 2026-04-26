# TODO — Tax Calculation Improvements and Extensions

> **Purpose:** This root TODO is the tax-specific roadmap. General frontend UX/onboarding work lives in `frontend/TODO.md`; backend infrastructure/performance work lives in `backend/TODO.md`.
>
> Scope: UK tax modelling across backend simulation, API/schema, frontend configuration, reporting, and tests.
>
> Reviewed areas: `backend/simulation/tax/*`, `backend/simulation/engine_fast.py`, `backend/simulation/service.py`, `backend/schemas/*`, `backend/routers/config.py`, `frontend/src/components/config/*`, `frontend/src/types/index.ts`, and dashboard/chart tax outputs.
>
> Priority: **P0** = correctness bug / misleading output, **P1** = high-value model improvement, **P2** = medium-value extension, **P3** = polish / future work.
>
> Disclaimer: this app is a planning tool, not tax advice. Add clear UX copy wherever more realistic tax modelling is introduced.
>
> Last updated: 2026-04-26. Frontend copy/warnings for pension/state-pension tax assumptions have been partially implemented; core backend tax correctness items remain open unless noted below.

---

## Current Repository Status Notes

Recent repo changes that affect this roadmap:

- Frontend UX/onboarding has moved forward: `/intro`, reusable `Button`/`Card`, starter/sample scenarios, and a refreshed app shell are implemented. Track remaining UX work in `frontend/TODO.md`.
- Allocation projection now shows selected-percentile peak net worth, final net worth, and bankruptcy risk; bond override now preserves current extra spend, retirement-age offset, and percentile.
- Risk Analysis safe-withdrawal no longer silently shows `---` on backend failure; frontend surfaces the error and backend `/safe-withdrawal` has the missing `numpy` import fixed.
- Frontend tests: `npm test -- --run` passes with 253 tests across 23 files.
- Frontend production build now passes with `npm run build`; Vite emits only a non-blocking large-chunk warning. `frontend/TODO.md` item `4a` is complete.
- Backend tests were not run in this environment because `pytest`/runtime dependencies are unavailable; backend syntax checks for recently touched files passed via `python3 -m py_compile`. Frontend tests pass with `npm test -- --run` (253 tests / 23 files).
- P0.1 backend state-pension taxation is implemented in `engine_fast.py`: state pension is accumulated per person, taxed after salary/rental income, added to cash net of tax, included in `income_tax_paid`, and exposed as `state_pension_tax_paid` / `state_pension_tax_paid_median`. Frontend `SimulationResponse` now carries the optional field, inflation-adjusts it when present, includes it in Excel export, and shows state-pension tax in the dashboard tax breakdown.
- P0.2 backend private-pension drawdown taxation now processes eligible pension pots per owner/person in `engine_fast.py`, tracks each owner's taxable pension drawdown in-year, and includes a regression test for one-owner vs two-owner households with equal pension totals.
- P0.3 backend validation now rejects salary employee/employer pension contribution percentages when the salary's person has no matching pension asset/pot, preventing contributions from silently disappearing.

---

## Current Tax Model Snapshot

Verified against current code on 2026-04-26. The repo currently models:

- UK income tax bands with personal allowance tapering in `backend/simulation/tax/income_tax.py` and the JIT engine's internal `_calculate_income_tax()`.
- Class 1 employee National Insurance with annual thresholds in `backend/simulation/tax/national_insurance.py` and the JIT engine.
- Salary tax per person: salary less employee pension contribution is income-taxed; NI is applied to gross salary.
- Rental income is taxed at the person's marginal income tax rate, with no NI.
- Gift income is tax-free.
- Pension drawdown is modelled as 25% tax-free and 75% taxable.
- GIA/property disposals use a simplified proportional cost-basis model with a single annual CGT allowance and flat CGT rate.
- Tax year presets exist in `backend/simulation/tax/tax_config.py` and can be selected in `AssumptionsForm.tsx`.
- Frontend copy now states that state pension is taxable and that private pension withdrawals are modelled as 25% tax-free / 75% taxable, subject to simplifications.
- Frontend now warns about pension contributions with no matching pension asset and pension assets with no owner/default ownership.

Important current limitations/gaps:

- State pension is now taxed per person each year in the fast engine and added to cash net of state-pension tax. Dashboard tax-breakdown visibility and Excel export are implemented; broader source-specific tax reporting remains open under P1.1/P3.3.
- Private pension drawdown tax now processes eligible pots per owner in `engine_fast.py`, using each owner's own salary/rental/state-pension income and prior taxable pension drawdown in the year. Broader source-specific pension-tax reporting remains open under P1.1/P3.3.
- Tax settings beyond `tax_year` are backend-supported in assumptions but mostly hidden from the frontend.
- The simulation output now separates `state_pension_tax_paid`, but still does not separately expose CGT, pension drawdown tax, rental tax, and salary income tax.
- Some tax logic is duplicated across pure-Python modules, `fast_tax.py`, and internal JIT helpers in `engine_fast.py`. `fast_tax.py` now mirrors personal-allowance tapering and has parity tests for income tax and pension drawdown, but broader consolidation remains open.
- The selected tax year is applied statically across the whole simulation horizon.

---

## P0 — Correctness and Consistency Fixes

### P0.1 — Tax state pension as income per person

**Problem:** Historically, `engine_fast.py` added state pension income directly to cash and `total_income`, but did not include it in annual per-person income tax calculations unless pension drawdown occurred. This backend bug is now fixed; keep this section as the regression checklist and frontend follow-up tracker.

**Backend tasks:**

- [x] Track `per_person_state_pension` during each year.
- [x] Include state pension in each person's taxable income calculation even when there is no private pension drawdown.
- [x] Ensure state pension uses each person's own personal allowance and marginal bands.
- [x] Decide ordering for salary, rental, state pension, and drawdown tax calculation; document it. Current ordering: salary after employee pension contributions, then rental/property income, then state pension, then private pension drawdown.
- [x] Add output field(s): `state_pension_tax_paid`, or at minimum include it in a clearer `income_tax_salary_rental_state_pension` bucket.
- [x] Add unit/integration tests for:
  - [x] pensioner with only state pension below personal allowance = no tax;
  - [x] pensioner with state pension + rental income = tax on excess;
  - [x] two-person household where each state pension uses its own allowance;
  - [x] state pension + private drawdown marginal tax interaction.

**Frontend tasks:**

- [x] Update help text in `PeopleForm`, `AssumptionsForm`, `ConfigWizard`, and `HelpPage` to say state pension is taxable and modelled per person.
- [x] Add state-pension tax visibility in dashboard tax breakdown UI; backend now exposes `state_pension_tax_paid_median` and Excel export includes a State Pension Tax column.

**Acceptance criteria:** State pension is taxed every year it is received, independently of private pension drawdown. Backend fast-engine implementation is complete; frontend tax-breakdown visibility is now implemented in the dashboard.

---

### P0.2 — Calculate private pension drawdown tax per individual, not household aggregate

**Problem:** In `engine_fast.py`, eligible pension balances are aggregated and drawdown tax is calculated once using a single `other_taxable` figure. In a couple, this can incorrectly use one personal allowance/band structure for multiple people and misallocate marginal tax.

**Backend tasks:**

- [x] Refactor pension withdrawal to process eligible pension pots by owner/person.
- [x] For each pension owner, calculate `other_taxable_income` from that person only: salary after pension deduction, rental/property income allocation, state pension, and prior pension taxable income in the year.
- [x] Withdraw from pensions according to configured withdrawal priority while preserving per-person tax treatment. Current implementation processes owners in scenario order within the pension withdrawal bucket because pension pots have a shared priority.
- [x] Track annual pension taxable income and pension tax per person to avoid double-counting allowances.
- [x] Add tests for one-person vs two-person pension drawdown with equal household totals but different ownership.

**Frontend tasks:**

- [x] Show pension owner prominently in `AssetsForm` because ownership affects tax.
- [x] Show pension owner prominently in sell order UI because ownership affects tax.
- [x] Add warnings where pension assets have no owner or default to household/default ownership.

**Acceptance criteria:** Pension drawdown tax uses the pension owner’s own allowance/bands and correctly handles multi-person households. Implemented in the fast engine; backend tests could not be executed in this environment because `pytest` is unavailable, but syntax checks pass.

---

### P0.3 — Ensure pension contributions are not deducted unless they are actually invested

**Problem:** Salary employee contributions reduce salary net pay and taxable income. If a person has no pension asset/pot, contributions may be deducted without being added to a pension balance.

**Backend tasks:**

- [x] In scenario validation, warn/error when salary pension contribution percentages are non-zero but the person has no pension asset.
- [x] Decide automatic behaviour: create implicit pension pot, reject scenario, or treat contribution as unavailable cash outflow only. Current behaviour: reject the scenario with a validation error.
- [x] Prefer explicit validation: require a pension asset for any non-zero employee/employer pension contribution.
- [x] Add tests covering missing pension asset with non-zero contribution.

**Frontend tasks:**

- [x] In `IncomeForm`, warn when employee/employer pension % is set and the selected person has no matching pension asset.
- [x] In `ConfigWizard`, offer to auto-add a pension account when pension contributions are entered.

**Acceptance criteria:** Contributions never silently disappear from the balance sheet.

---

### P0.4 — Unify duplicated tax implementations

**Problem:** Tax calculation exists in multiple places:

- `backend/simulation/tax/income_tax.py`
- `backend/simulation/tax/national_insurance.py`
- `backend/simulation/tax/pension_drawdown.py`
- `backend/simulation/tax/fast_tax.py`
- internal JIT helpers in `backend/simulation/engine_fast.py`

`fast_tax.py` does not currently mirror personal allowance tapering while `income_tax.py` and `engine_fast.py` do. Even if some code paths are unused, this creates regression risk.

**Backend tasks:**

- [ ] Define one canonical tax specification with examples in tests.
- [ ] Decide whether `fast_tax.py` is used. If unused, remove it or mark it clearly as deprecated.
- [x] If retained, make `fast_tax.py` match pure-Python calculations exactly, including personal allowance tapering.
- [x] Add property-based or parametrized parity tests comparing pure-Python functions to JIT-compatible helpers across income ranges. Current coverage: `calculate_income_tax_fast` and `calculate_pension_drawdown_fast` vs pure-Python tax modules.
- [x] Add tests around boundary values: £12,570, £50,270, £100,000, £125,140, and additional-rate thresholds.

**Acceptance criteria:** All tax calculation paths return equivalent values for the same inputs.

---

### P0.5 — Correct misleading frontend pension tax copy

**Problem:** `AssetsForm.tsx` currently states that 25% tax-free pension withdrawal is "not yet modelled here", but backend drawdown models 25% tax-free / 75% taxable.

**Frontend tasks:**

- [x] Update copy to say: "Pension withdrawals are modelled as 25% tax-free and 75% taxable income, subject to simplifications."
- [x] Link to limitations/help text explaining that lifetime PCLS/Lump Sum Allowance limits are not modelled yet.
- [x] Add a frontend test so the stale wording does not reappear.

**Acceptance criteria:** UI accurately reflects backend pension drawdown behaviour.

---

## P1 — High-Value Backend Tax Model Improvements

### P1.1 — Add structured tax breakdown fields to simulation output

**Problem:** `income_tax_paid` currently includes income tax plus CGT and pension tax in one field, while `total_tax` adds NI. Users cannot understand which tax drives outcomes.

**Backend tasks:**

- [x] Add separate output fields in `engine_fast.py` and response schemas for:
  - [x] salary_income_tax_paid;
  - [x] rental_income_tax_paid;
  - [x] state_pension_tax_paid;
  - [x] pension_drawdown_tax_paid;
  - [x] capital_gains_tax_paid;
  - [x] national_insurance_paid (already separate);
  - [x] total_tax_paid (already `total_tax`).
- [x] Update `ResponseFormatter` and `backend/schemas/simulation.py`.
- [x] Update Excel export to include the breakdown.
- [x] Preserve backward compatibility for existing fields (`income_tax_paid` still bundled).

**Frontend tasks:**

- [x] Add TypeScript types for new fields.
- [ ] Add a stacked tax chart: Income Tax, NI, CGT, Pension Drawdown Tax.
- [ ] Add tax columns to Excel export.
- [ ] Add tooltips explaining each tax bucket.

**Acceptance criteria:** Backend now exposes per-source tax fields; frontend types and Excel export updated. Frontend charts/export to follow.

**Done:**
- [x] Added `F_SALARY_INCOME_TAX_PAID`, `F_RENTAL_INCOME_TAX_PAID`, `F_PENSION_DRAWDOWN_TAX_PAID`, `F_CAPITAL_GAINS_TAX_PAID` field indices in engine_fast.py
- [x] Engine loop now writes individual tax fields alongside the legacy bundled `income_tax_paid`
- [x] Added `salary_income_tax_paid_median`, `rental_income_tax_paid_median`, `pension_drawdown_tax_paid_median`, `capital_gains_tax_paid_median` to `SimulationResponse` schema
- [x] Updated `ResponseFormatter` to expose new fields
- [x] Updated CSV export columns
- [x] Updated frontend TypeScript types and all test mocks (253 tests pass)

---

### P1.2 — Model rental and property income profit instead of taxing gross rent

**Problem:** Rental income is taxed on gross rent. Property maintenance is treated as a household expense, not an income-tax deduction. Mortgage interest relief/restriction is not modelled.

**Backend tasks:**

- [ ] Split property cashflow into gross rent, allowable expenses, finance costs, taxable rental profit, and post-tax rental cashflow.
- [ ] Add fields to property model/schema for:
  - [ ] allowable annual costs;
  - [ ] letting/management fees;
  - [ ] insurance/service charges/ground rent;
  - [ ] mortgage interest tax-credit treatment;
  - [ ] owner allocation for jointly owned properties.
- [ ] Implement UK residential finance cost restriction: mortgage interest not directly deductible for individuals, but basic-rate tax reducer applies.
- [ ] Support negative rental profit carry-forward as a future extension.
- [ ] Add tests for gross rent vs profit taxation.

**Frontend tasks:**

- [ ] Expand `PropertiesForm` with "Rental tax settings" / "Allowable expenses" section.
- [ ] Show taxable rental profit in summaries.
- [ ] Add help text explaining simplified property income tax.

**Acceptance criteria:** Rental tax is based on taxable profit, not gross rent, and output shows gross vs net rental cashflow.

---

### P1.3 — Improve CGT modelling for GIAs and properties

**Problem:** CGT uses a flat `cgt_rate`, one allowance, and proportional disposals. It does not distinguish basic-rate/higher-rate CGT bands, residential property rates, owner-specific allowances, losses, or annual exempt amount changes.

**Backend tasks:**

- [ ] Make CGT allowance per individual, not household-wide.
- [ ] Calculate CGT rate from taxable income band headroom:
  - [ ] non-residential assets/GIA rates;
  - [ ] residential property rates;
  - [ ] configurable rates by tax year.
- [ ] Track realized losses and allow same-year/future offset where configured.
- [ ] Add separate `property_cgt_paid` and `gia_cgt_paid` outputs.
- [ ] Add per-asset `cost_basis` to DB/schema/frontend instead of defaulting cost basis to current value in `ScenarioBuilder`.
- [ ] For property sales, consider full sale vs partial sale. Current partial-sale behaviour is unrealistic for most properties.
- [ ] Add tests for CGT allowance consumption across multiple disposals in the same year.

**Frontend tasks:**

- [ ] Add cost basis/acquisition value fields to GIA assets and properties.
- [ ] Let users choose whether a property is main residence, buy-to-let, or other.
- [ ] Show realized gains and CGT in asset detail/export.

**Acceptance criteria:** CGT reflects owner, asset type, allowance use, and marginal tax-rate-dependent rates.

---

### P1.4 — Make tax policy year-aware across the simulation horizon

**Problem:** A selected tax year preset is applied to every simulated year. Long retirement projections become sensitive to a single static tax regime.

**Backend tasks:**

- [ ] Introduce `tax_policy_mode` assumption:
  - [ ] `static_selected_year` — current behaviour;
  - [ ] `known_year_presets_then_indexed` — use known presets, then index thresholds;
  - [ ] `index_thresholds_to_inflation`;
  - [ ] `freeze_thresholds_nominal`.
- [ ] Store tax presets in data/JSON or DB instead of hardcoding only in `tax_config.py`.
- [ ] Add `TaxYearConfig` fields for CGT, dividend, savings, pension annual allowance, ISA limit, and state pension uplift assumptions.
- [ ] Pass year-specific tax config arrays into `engine_fast.py` rather than single scalar thresholds.
- [ ] Add regression tests comparing static vs indexed policy.

**Frontend tasks:**

- [ ] Add a tax policy selector in `AssumptionsForm`.
- [ ] Explain that tax thresholds can be static, frozen, or inflation-indexed.
- [ ] Display selected tax policy in scenario summary and exported workbook.

**Acceptance criteria:** Long-run simulations can model evolving thresholds instead of one permanent preset.

---

### P1.5 — Add pension tax rules beyond simple 25% per-withdrawal tax-free treatment

**Problem:** The model treats 25% of every pension withdrawal as tax-free indefinitely. UK pension rules are more constrained by lump sum allowances and crystallisation behaviour.

**Backend tasks:**

- [ ] Add pension drawdown mode:
  - [ ] simple 25% tax-free per withdrawal — current behaviour;
  - [ ] UFPLS-like withdrawals;
  - [ ] drawdown after taking PCLS upfront;
  - [ ] fully taxable drawdown after tax-free cash exhausted.
- [ ] Track tax-free cash used per pension/person.
- [ ] Add Lump Sum Allowance / tax-free cash cap configuration.
- [ ] Add pension annual allowance and employer+employee contribution checks.
- [ ] Add tapered annual allowance for high earners.
- [ ] Add Money Purchase Annual Allowance once taxable flexible access starts.
- [ ] Add tests for tax-free cash cap and taxable-only drawdown after exhaustion.

**Frontend tasks:**

- [ ] Add pension withdrawal strategy settings.
- [ ] Display remaining tax-free cash allowance.
- [ ] Warn when contributions exceed annual allowance assumptions.

**Acceptance criteria:** Pension drawdown can approximate common UK retirement withdrawal strategies and allowance limits.

---

### P1.6 — Model pension contribution methods and relief accurately

**Problem:** The current model assumes net-pay/salary-sacrifice-like treatment for employee pension contributions: taxable salary is reduced by the contribution and NI is unchanged. Real schemes may use net pay, relief at source, or salary sacrifice, each with different tax/NI effects.

**Backend tasks:**

- [ ] Add `pension_contribution_method` per salary/income:
  - [ ] `net_pay`;
  - [ ] `relief_at_source`;
  - [ ] `salary_sacrifice`.
- [ ] For salary sacrifice, reduce gross taxable pay and NI-able pay.
- [ ] For relief at source, model basic-rate gross-up and optional higher-rate relief.
- [ ] Track employee net cost vs gross pension contribution.
- [ ] Add annual allowance calculations including employer contributions.
- [ ] Add tests for all contribution methods.

**Frontend tasks:**

- [ ] Add contribution method selector to `IncomeForm` and `ConfigWizard`.
- [ ] Show tooltips explaining each method.
- [ ] Show gross contribution, employee net cost, employer contribution, and tax relief.

**Acceptance criteria:** Users can model common UK pension contribution arrangements without overstating/understating cashflow.

---

## P2 — Additional UK Tax Extensions

### P2.1 — Support dividend tax and savings interest tax

**Backend tasks:**

- [ ] Split investment returns into growth vs income where relevant.
- [ ] Add dividend yield assumptions for GIA holdings.
- [ ] Model dividend allowance and dividend tax rates by band.
- [ ] Model savings interest for cash accounts.
- [ ] Add Personal Savings Allowance and starting rate for savings.
- [ ] Add tax outputs: `dividend_tax_paid`, `savings_tax_paid`.

**Frontend tasks:**

- [ ] Add optional dividend yield / interest income fields.
- [ ] Add help text explaining that ISA interest/dividends remain tax-free.
- [ ] Add charts/export fields for savings/dividend tax.

---

### P2.2 — Add Scottish/Welsh tax regime support

**Backend tasks:**

- [ ] Add `tax_residency` per person: England/NI, Scotland, Wales.
- [ ] Implement Scottish income tax bands/rates for non-savings, non-dividend income.
- [ ] Keep NI UK-wide.
- [ ] Handle cross-source differences: savings/dividend income remains UK bands.
- [ ] Extend tax year presets with regional data.

**Frontend tasks:**

- [ ] Add tax residency selector in `PeopleForm`.
- [ ] Show selected regional bands in tax-year preview.

---

### P2.3 — Add student loan and postgraduate loan repayments

**Backend tasks:**

- [ ] Add loan plan type(s) per person: Plan 1, Plan 2, Plan 4, Plan 5, Postgraduate.
- [ ] Add thresholds/rates by tax year.
- [ ] Calculate repayments from salary and relevant income.
- [ ] Track outstanding student loan balances optionally.

**Frontend tasks:**

- [ ] Add optional student loan section per person.
- [ ] Show repayments separately from tax/NI.

---

### P2.4 — Add child benefit high income charge and family tax interactions

**Backend tasks:**

- [ ] Add child benefit receipt assumption.
- [ ] Calculate High Income Child Benefit Charge based on adjusted net income.
- [ ] Model threshold/rate changes by tax year.
- [ ] Add output field for `child_benefit_charge_paid`.

**Frontend tasks:**

- [ ] Add family benefits section in assumptions/children UI.
- [ ] Warn high earners when child benefit charge likely applies.

---

### P2.5 — Add Marriage Allowance and additional allowances

**Backend tasks:**

- [ ] Add optional Marriage Allowance transfer between spouses/partners.
- [ ] Add Blind Person's Allowance as configurable person-level option.
- [ ] Consider personal allowance withdrawal interactions with adjusted net income.

**Frontend tasks:**

- [ ] Add household relationship / partner fields if needed.
- [ ] Add allowance toggles in advanced tax settings.

---

### P2.6 — Make ISA limits per person and age-aware

**Problem:** `isa_annual_limit` is currently a scenario-level value. UK ISA subscriptions are per individual and differ for Junior ISAs/Lifetime ISAs.

**Backend tasks:**

- [ ] Track ISA subscription allowance per person per tax year.
- [ ] Allocate ISA contributions to asset owners, not household total.
- [ ] Add optional Junior ISA/Lifetime ISA account types.
- [ ] Add tests for two adults each using their own ISA allowance.

**Frontend tasks:**

- [ ] Show ISA owner and remaining annual ISA allowance.
- [ ] Update contribution guidance in `AssetsForm`.

---

## P3 — Frontend UX and Tooling Enhancements

### P3.1 — Add advanced tax settings UI

**Problem:** Backend accepts assumptions such as `cgt_annual_allowance`, `cgt_rate`, `emergency_fund_months`, and tax band overrides, but the frontend only exposes tax year selection and core assumptions.

**Frontend tasks:**

- [ ] Add collapsible "Advanced tax settings" in `AssumptionsForm`.
- [ ] Expose editable fields for:
  - [ ] personal allowance;
  - [ ] basic/higher/additional thresholds and rates;
  - [ ] NI primary threshold, upper earnings limit, main/upper rates;
  - [ ] CGT annual exempt amount;
  - [ ] CGT rates;
  - [ ] tax policy mode once backend supports it.
- [ ] Add "Reset to selected tax year" button.
- [ ] Add Zod validation for all tax override fields.
- [ ] Update `Assumptions` TypeScript type with optional tax override fields.

**Backend tasks:**

- [ ] Add Pydantic schema for assumptions instead of untyped `dict[str, Any]`.
- [ ] Validate tax fields centrally with sensible bounds.

---

### P3.2 — Add tax estimate / preview panel in scenario configuration

**Frontend tasks:**

- [ ] Add a lightweight "Current-year tax estimate" panel for each adult.
- [ ] Show gross income, pension contributions, taxable income, income tax, NI, rental tax, and estimated net income.
- [ ] Flag likely issues: missing pension asset, high marginal tax band, pension contribution over annual allowance.

**Backend/API tasks:**

- [ ] Add endpoint `POST /api/tax/estimate` or `POST /api/config/tax-preview`.
- [ ] Reuse canonical backend tax functions rather than duplicating logic in TypeScript.
- [ ] Return per-person breakdown and household totals.

---

### P3.3 — Improve dashboard and export tax reporting

**Frontend tasks:**

- [ ] Add a dedicated "Tax" tab or expandable panel.
- [ ] Add stacked area chart by tax type.
- [ ] Add effective tax rate chart: total tax / gross taxable income.
- [ ] Add marginal tax-rate notes for major events: pension access, state pension start, property sale.
- [ ] Add tax breakdown worksheets to Excel export.

**Backend tasks:**

- [ ] Include enough gross/taxable income fields to calculate effective rates accurately.
- [ ] Include per-source tax fields listed in P1.1.

---

### P3.4 — Improve tax help/documentation

**Tasks:**

- [ ] Add a "Tax assumptions" section to `HelpPage.tsx`.
- [ ] Update README limitations after implementation changes.
- [ ] Include examples:
  - [ ] salary + pension contribution;
  - [ ] rental income;
  - [ ] state pension taxation;
  - [ ] GIA sale with CGT;
  - [ ] private pension drawdown.
- [ ] Clearly label simplified areas and link to official GOV.UK pages where appropriate.

---

## Testing Plan

### Backend tests

- [ ] Expand `backend/tests/test_tax.py` with golden examples for:
  - [x] state pension taxation in engine-level regression tests (`backend/tests/test_engine_equivalence.py`);
  - [ ] pure tax-module state pension examples if/when source-specific helpers are added;
  - [ ] multi-person household allowances;
  - [ ] pension drawdown ownership;
  - [ ] CGT allowance use across GIA and property disposals;
  - [ ] salary sacrifice/net pay/relief-at-source pension contributions;
  - [ ] rental profit taxation.
- [ ] Add engine-level tests to ensure pure tax modules match `engine_fast.py` outputs.
- [ ] Add parity tests across pure-Python and JIT-compatible tax functions.
- [ ] Add regression tests around tax threshold boundaries.
- [ ] Add property-based tests for monotonicity: increasing income should not reduce total tax except where explicitly modelled due to credits/allowances.

### Frontend tests

- [ ] Add tests for advanced tax settings validation.
- [ ] Add tests that tax-year preset selection displays all relevant thresholds/rates.
- [ ] Add tests for stale/misleading tax copy.
- [ ] Add chart tests for tax breakdown rendering once fields are added.
- [ ] Add API contract/type tests for new tax fields.

### End-to-end/manual scenarios

- [ ] Single adult, salary only.
- [ ] Couple, one earner, one non-earner.
- [ ] Couple, both receiving state pension.
- [ ] Salary + rental property with mortgage interest.
- [ ] GIA-heavy retiree realizing gains annually.
- [ ] Pension-heavy retiree drawing before and after state pension age.
- [ ] High earner around £100k personal allowance taper.
- [ ] High earner with pension contributions reducing adjusted net income.

---

## Suggested Implementation Order

1. **Fix correctness bugs first**: P0.1 state pension tax, P0.2 per-person pension drawdown, P0.3 missing pension pot validation.
2. **Unify tax logic**: P0.4 before adding many new rules.
3. **Expose clear outputs**: P1.1 tax breakdown fields; frontend charts/export can then follow.
4. **Improve property/rental and CGT**: P1.2 and P1.3.
5. **Add frontend advanced tax controls**: P3.1 once backend schemas/validation are stable.
6. **Add year-aware tax policy**: P1.4 for long-run accuracy.
7. **Add specialized UK features**: P1.5/P1.6 and P2 items.

---

## Files Likely to Change

### Backend

- `backend/simulation/engine_fast.py`
- `backend/simulation/tax/income_tax.py`
- `backend/simulation/tax/national_insurance.py`
- `backend/simulation/tax/pension_drawdown.py`
- `backend/simulation/tax/withdrawals.py`
- `backend/simulation/tax/tax_config.py`
- `backend/simulation/tax/fast_tax.py`
- `backend/simulation/service.py`
- `backend/simulation/validator.py`
- `backend/schemas/simulation.py`
- `backend/schemas/scenario.py`
- `backend/schemas/assets.py`
- `backend/schemas/property.py`
- `backend/schemas/income.py`
- `backend/models/assets.py`
- `backend/models/property.py`
- `backend/models/income.py`
- `backend/routers/config.py`
- `backend/tests/test_tax.py`
- `backend/tests/test_engine_equivalence.py`
- `backend/tests/test_validator.py`

### Frontend

- `frontend/src/types/index.ts`
- `frontend/src/api/client.ts`
- `frontend/src/api/exportExcel.ts`
- `frontend/src/components/config/AssumptionsForm.tsx`
- `frontend/src/components/config/IncomeForm.tsx`
- `frontend/src/components/config/AssetsForm.tsx`
- `frontend/src/components/config/PropertiesForm.tsx`
- `frontend/src/components/config/PeopleForm.tsx`
- `frontend/src/components/config/ConfigWizard.tsx`
- `frontend/src/components/config/formSchema.ts`
- `frontend/src/components/charts/ExpensesChart.tsx`
- `frontend/src/components/Dashboard/IncomeSpendingTab.tsx`
- `frontend/src/components/Dashboard/OverviewTab.tsx`
- `frontend/src/components/HelpPage.tsx`
- relevant frontend tests under `frontend/src/**/__tests__`
