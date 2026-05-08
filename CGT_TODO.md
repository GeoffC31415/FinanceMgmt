# CGT (Capital Gains Tax) — Known Issues & Fix Plan

Derived from codebase review of the Numba-accelerated simulation engine's CGT modelling.

---

## Done

### ~~#5 — ISA cost basis tracked unnecessarily~~ ✅

**Location:** `engine_fast.py` ~line 1189–1191

**Problem:** When ISA contributions are made, `it_asset_cost_bases[a_idx]` is incremented. ISAs are tax-free — cost basis tracking is meaningless and misleading.

**Fix:** Remove the `it_asset_cost_bases[a_idx] += amount` line from the ISA contribution block.

**Status:** Fixed — line removed. ISAs no longer accumulate meaningless cost basis.

---

### ~~#7 — Dead bounds check on `gia_owner_lookup`~~ ✅

**Location:** `engine_fast.py` ~line 155

**Problem:**
```python
gia_owner_lookup[ai] = sc.asset_gia_owner_idx[ai] if ai < len(sc.asset_gia_owner_idx) else -1
```
The condition `ai < len(...)` is always true (loop is `range(n_assets)`). If `asset_gia_owner_idx` is -1 (unset), the fallback defaults to person 0 — potentially attributing CGT to the wrong person.

**Fix:** Remove the guard. Handle -1 explicitly in the engine body where the owner index is used.

**Status:** Fixed — dead guard removed; `gia_owner_lookup[ai] = sc.asset_gia_owner_idx[ai]`.

---

### ~~#8 — `cgt_rate` parameter is dead code~~ ✅

**Location:** `withdrawals.py::calculate_gia_withdrawal`

**Problem:** The `cgt_rate` parameter only applies as a fallback when `remaining_basic_rate_band` is 0. Since the engine always provides a band value, this parameter is never used.

**Fix:** Remove `cgt_rate` from the function signature and all call sites (tests, standalone callers).

**Status:** Fixed — `cgt_rate` removed from signature, fallback branch eliminated, all 7 test call sites updated.

---

### ~~#14 — `income_tax_paid` misleadingly includes CGT~~ ✅

**Location:** `engine_fast.py` ~line 1311

**Problem:**
```python
out[it, y_idx, F_INCOME_TAX_PAID] = income_tax + rental_income_tax + state_pension_tax + pension_income_tax + cgt_paid
```
CGT is not income tax. A separate `F_CAPITAL_GAINS_TAX_PAID` already exists.

**Fix:** Remove `cgt_paid` from the `F_INCOME_TAX_PAID` assignment.

**Status:** Fixed — `cgt_paid` removed from `F_INCOME_TAX_PAID`. CGT is now only tracked via its own field.

---

### ~~#15 — No direct tests for `_apply_cgt_tax`~~ ✅

**Location:** `engine_fast.py::_apply_cgt_tax`

**Problem:** The function actually used by the engine has zero direct test coverage. Only the standalone `calculate_gia_withdrawal` in `withdrawals.py` is tested.

**Fix:** Add a test class parameterizing the Numba `_apply_cgt_tax` function — same pattern as the existing `test_fast_income_tax_matches_python` tests.

**Status:** Fixed — added `TestApplyCgtTax` class with 16 tests covering: no-gains, within-allowance, exceeding-allowance, band-splitting, zero balance/gross, loss positions, basis reduction, allowance tracking, higher-rate-only, and parametric cross-validation against standalone `calculate_gia_withdrawal`.

---

### ~~#13 — No separate `gia_cgt_paid` / `property_cgt_paid` output~~ ✅

**Location:** `engine_fast.py`, `schemas/simulation.py`, `service.py`

**Problem:** Only a combined `capital_gains_tax_paid` is exposed. Users can't see how much CGT comes from GIA vs. property disposals.

**Fix:**
- Added `F_GIA_CGT_PAID` (56) and `F_PROPERTY_CGT_PAID` (57) field indices
- Added `gia_cgt_paid` / `property_cgt_paid` per-iteration tracking variables
- Incremented separately at all 4 GIA and 4 property CGT call sites (shortfall + debt repayment loops)
- Added output writes and field names to the engine
- Exposed `gia_cgt_paid_median` and `property_cgt_paid_median` in `SimulationResponse` schema
- Mapped in `ResponseFormatter`

**Status:** Fixed — CGT is now tracked and exposed separately for GIA and property disposals. `N_FIELDS` increased from 56 to 58.

---

### ~~#4 — Two divergent CGT implementations~~ ✅

**Location:** `withdrawals.py::calculate_gia_withdrawal` vs. `engine_fast.py::_apply_cgt_tax`

**Problem:** The standalone withdrawal calculator and fast-engine CGT helper had diverged around allowance/rate-band ordering.

**Fix:** Reconciled both implementations to deduct the annual exempt amount first, then apply 10% to taxable gains within remaining basic-rate band and 20% above it. Removed the stale unused `taxable_gains` path mismatch and updated tests.

**Status:** Fixed — both functions now match by direct parametrized tests.

---

### ~~#1 — Household-wide CGT allowance (overstates CGT for couples)~~ ✅

**Location:** `engine_fast.py`

**Problem:** A single `cgt_allowance_remaining` was initialized per year and shared across all GIA and property disposals.

**Fix:** Replaced the scalar with `cgt_allowance_remaining_by_person`, wired GIA/property owner lookup into each taxable disposal, added `AssetAccount.person_key`, and added an engine regression test showing two GIA owners each get their own allowance.

**Status:** Fixed — CGT allowance is now per person.

---

### ~~#2 — Remaining basic rate band calculated before pension drawdown~~ ✅

**Location:** `engine_fast.py`

**Problem:** CGT lower-rate band headroom was calculated before private pension drawdown and used gross salary rather than salary after employee pension contributions.

**Fix:** Added a shared `_remaining_basic_rate_band_for_cgt` helper, fixed the basic-band calculation to use the configured income-tax band width, salary after employee pension contributions, and recognized taxable pension drawdown at each disposal site.

**Status:** Fixed for the engine's withdrawal order — taxable disposals refresh the owner's CGT band immediately before CGT is applied.

---

## Trivial (≤30 min each)

### ~~#15 — No direct tests for `_apply_cgt_tax`~~ ✅

**Moved to Done section above.**

---

## Easy (1–2 hours each)

### ~~#13 — No separate `gia_cgt_paid` / `property_cgt_paid` output~~ ✅

**Moved to Done section above.**

---

### ~~#14 — `income_tax_paid` misleadingly includes CGT~~ ✅

**Moved to Done section above.**

---

### ~~#1 — Household-wide CGT allowance (overstates CGT for couples)~~ ✅

**Moved to Done section above.**

---

## Moderate (half-day to a day)

### ~~#4 — Two divergent CGT implementations~~ ✅

**Moved to Done section above.**

---

### #3 — No residential property CGT rates (18%/28%)

**Location:** `engine_fast.py::_apply_cgt_tax`

**Problem:** Hardcodes 10%/20% for all disposals. Residential property (non-main-residence) should use 18%/28%.

**Fix:** Pass a separate rate pair to `_apply_cgt_tax` for property disposals. Minor plumbing but touches multiple layers: `SimulationAssumptions` → `ArrayScenario` → engine kernel.

---

### ~~#2 — Remaining basic rate band calculated before pension drawdown~~ ✅

**Moved to Done section above.**

---

## Hard (needs design)

### #6 — Capital losses silently ignored

**Problem:** When `cost_basis > balance` (a loss-making asset), `_apply_cgt_tax` clamps `total_gains` to 0. Real CGT allows losses to offset gains or carry forward across years.

**Scope:** Requires cross-year loss carry-forward state, loss offset ordering rules.

---

### #9/#10 — No Private Residence Relief (PRR) / Letting Relief

**Problem:** Selling a main residence should be largely CGT-free. Properties once used as main residence may qualify for letting relief.

**Scope:** Significant UK tax domain logic, property usage history tracking.

---

### #11/#12 — CGT config in TaxYearConfig, per-year allowance changes

**Problem:** `TaxYearConfig` covers income tax and NI but has no CGT fields (allowance, rates). The £3,000 allowance is fixed for the entire simulation horizon.

**Scope:** Schema changes across assumptions → config → engine, plus year-aware allowance lookup.

---

## Dependency Graph

```
#4 ✅ (divergent impls) ─── DONE
#1 ✅ (per-person allowance) ─ DONE
#2 ✅ (band ordering) ─────── DONE
#15 ✅ (tests added) ──────── DONE

#13 ✅ (separate outputs) ─── DONE, independent
#5 ✅ #7 ✅ #8 ✅ #14 ✅      ─── DONE

#3 (property rates)      ─── independent future enhancement
```

## Recommended Fix Order

1. ~~**#5, #7, #8**~~ — ✅ Done — Dead code / harmless cleanup
2. ~~**#14**~~ — ✅ Done — Remove CGT from `income_tax_paid`
3. ~~**#15**~~ — ✅ Done — Added 16 tests for `_apply_cgt_tax`
4. ~~**#13**~~ — ✅ Done — Separate `gia_cgt_paid` / `property_cgt_paid` output
5. ~~**#4**~~ — ✅ Done — Reconciled CGT implementations
6. ~~**#1**~~ — ✅ Done — Per-person CGT allowance
7. ~~**#2**~~ — ✅ Done — Refresh CGT band headroom at disposal sites
8. **#3** — Property CGT rates (moderate refactor)
9. **#6, #9, #10, #11, #12** — Future enhancements (design needed)
