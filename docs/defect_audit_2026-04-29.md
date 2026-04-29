# Defect audit (math, indexing, null/time assumptions)

## Scope reviewed
- `app.py` retirement projection + Monte Carlo + debt paydown.
- `static/retirement.js` chart math modes and progress ratios.
- `static/debt_tracker.js` client-side parsing and rendering assumptions.

## Defects

### 1) Debt payoff can silently underpay minimums when budget < sum(minimum payments)
- **Category:** Math/financial logic + expected/actual mismatch.
- **Repro input shape:** 2+ debts where `sum(minimum_payment) > monthly_budget`.
  - Example: monthly_budget=100, debts=[{balance:1000, apr:20, minimum:80}, {balance:1000, apr:20, minimum:80}].
- **Actual behavior:** The loop always applies each debt minimum (capped by balance) regardless of budget, then clamps `remaining_budget = max(remaining_budget, 0.0)`. This permits payments exceeding the provided budget without error/warning and records those totals in `monthly_totals`.
- **Expected behavior:** Either (a) reject impossible budgets, or (b) pro-rate minimums within budget, or (c) explicitly model deficit/arrears.

### 2) Deferred-interest penalty likely over-accumulates by using current balance * deferred APR * elapsed months
- **Category:** Math correctness / unit assumptions.
- **Repro input shape:** debt with `deferred_interest_enabled=true`, future cliff date, nonzero deferred APR.
- **Actual behavior:** At cliff month, penalty is `balances[i] * deferred_monthly_rate * max(month_index, 1)`, i.e., simple-interest style using **current** balance multiplied by elapsed months. This can materially diverge from common deferred-interest contracts (which often use average-daily-balance/back-interest on promotional balance terms).
- **Expected behavior:** Policy-consistent deferred-interest formula documented and applied (or configurable policy).

### 3) `months_to_debt_free` is ambiguous at horizon cap and can misstate “debt free”
- **Category:** Indexing/horizon/off-by-one semantics.
- **Repro input shape:** low budget/high APR where balances remain positive beyond 360 months.
- **Actual behavior:** simulation stops at fixed `horizon_months = 360`; result returns `months_to_debt_free = len(monthly_totals)` even when debts are not paid off.
- **Expected behavior:** return explicit status flag (`paid_off=false`, `truncated_at_horizon=true`) and avoid naming it “to debt free”.

### 4) Division-by-zero/Inf displayed in retirement stats for extreme or zero after-tax projection
- **Category:** Division-by-zero and Inf propagation.
- **Repro input shape:** scenario that drives `future_portfolio_after_tax <= 0` (e.g., extreme negative returns via Monte Carlo-like deterministic assumptions not prevented in projection inputs over long horizon).
- **Actual behavior:** `actual_withdrawal_rate` becomes `float("inf")`; this is passed through stats and may reach frontend formatting/comparisons.
- **Expected behavior:** return nullable metric with explanatory status instead of infinite numeric payload.

### 5) Floating-point exactness assumption in chart crossover detection
- **Category:** Float comparison precision.
- **Repro input shape:** near-zero goal gap oscillating around 0 with tiny fp noise.
- **Actual behavior:** crossover logic uses strict `value === 0` and sign checks on raw float differences, which can miss/overcount crossings near zero.
- **Expected behavior:** epsilon-based comparisons for near-zero (`Math.abs(value) < eps`) before sign-change logic.

### 6) Timezone/naive datetime usage in debt deferred-interest month checks
- **Category:** Time assumptions.
- **Repro input shape:** run near month boundary in non-UTC local contexts.
- **Actual behavior:** uses naive `datetime.utcnow()` and naive parsed dates; no timezone normalization. Month comparison is done on naive year/month values.
- **Expected behavior:** explicit timezone-aware date handling (or pure date arithmetic without clock-time dependence) and documented timezone convention.

### 7) No market calendar/weekend/holiday handling where date semantics are user-visible
- **Category:** Time/business-day assumptions.
- **Repro input shape:** deferred-interest date set on weekend/holiday.
- **Actual behavior:** logic checks month equality only (`year/month`), ignoring business-day conventions entirely.
- **Expected behavior:** documented statement that model is month-bucketed and not business-day aware, or implement calendar rules if required by product expectations.

## Not found / out of scope notes
- No pandas `DataFrame`/rolling-window/lookback code exists in this repo, so DataFrame empty/slicing/duplicate timestamp checks are not directly applicable.
- List empty behavior is partially validated server-side for debts (`debts` list must be non-empty), but frontend still allows constructing inconsistent user intent before submit.
