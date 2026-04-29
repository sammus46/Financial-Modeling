# Performance Static Audit and Benchmark Plan

## Scope
This review is a static inspection of compute/memory characteristics in the core pipeline paths in `app.py`:
- Retirement projection (`run_projection`, `calculate_projection`).
- Goal search (`find_required_additional_contribution`).
- Monte Carlo simulation (`run_monte_carlo`, `percentile_path`).
- Debt payoff engine (`calculate_debt_paydown`).
- Emergency fund calculator (`calculate_emergency_fund`).

## 1) Static inspection for O(n²)+ patterns

### Confirmed O(n²) hotspot
1. **`percentile_path(paths, q)` performs a sort for every time index**.
   - For each index `0..T-1`, it builds a list of trial values and sorts it.
   - Complexity: `O(T * N log N)` where `N=trials`, `T=years+1`.
   - With `N` and `T` both growing, this dominates percentile post-processing in Monte Carlo.  
   - Code location: `percentile_path` sorts per index (`values = sorted(...)`) inside an outer loop over indices.

### Compounding/near-quadratic patterns
2. **Repeated full projection calls during contribution search** in `find_required_additional_contribution`.
   - Binary search loops up to 60 iterations and each iteration invokes `run_projection` over all years.
   - Plus a doubling loop that can call `run_projection` multiple times before binary search starts.
   - Complexity: roughly `O((k + 60) * Y)` where `Y=years_to_retirement`, `k` is doubling steps.
   - Not pure quadratic on a single variable, but expensive nested iteration for long horizons.

3. **Monte Carlo invokes deterministic projection once per trial before per-year simulation**.
   - In `run_monte_carlo`, each trial currently calls `run_projection(...)` and then runs another per-year loop.
   - This adds avoidable `O(N * Y)` compute and duplicate path work.

4. **Debt strategy repeatedly sorts active debts each month**.
   - In `calculate_debt_paydown`, each month sorts active debts by ranking key.
   - Complexity ~ `O(M * D log D)`, where `M ≤ 360`, `D=#debts`.
   - Acceptable for current small `D`, but becomes significant for stress tests with many debts.

### No pandas-specific O(n²)+ risks observed
- No DataFrame joins/merge chains, rolling windows, or nested `groupby/apply` usage were found in this repository’s active pipeline code.
- Current code is list/dict based Python loops.

## 2) Memory pressure points

1. **Monte Carlo retains full path history for every trial**.
   - `paths: list[list[float]]` stores all years for all trials (`N * T` floats plus Python list overhead).
   - This is the dominant memory pressure point.

2. **Monte Carlo duplicates ending values and path storage**.
   - `ending_values` plus `paths` means both scalar terminal results and full trajectories are retained.
   - If only percentiles/success rates are needed, full path retention is avoidable.

3. **Projection endpoints retain multiple parallel full-length time series**.
   - `run_projection` stores `ages`, `pre_tax_balances`, `post_tax_balances`, `traditional_balances`, `roth_balances`, `brokerage_balances`.
   - For long horizons this is linear growth across 6+ arrays.

4. **Per-month debt timeline retains structured history**.
   - `allocations_timeline` stores a dict per month including per-debt snapshots.
   - In long horizons or large debt counts, this can become heavy.

5. **Derived response fields materialize additional full arrays**.
   - `goal_line` and `dynamic_goal_line` are full-length arrays duplicating the age horizon.

## 3) Benchmark case definitions

Benchmark dimensions:
- **Scale**: small / medium / large.
- **Shape**: wide feature-matrix style (many debt/expense rows) vs long time series (many years, many trials).

### A. Retirement baseline (deterministic)
- **Small**: 30-year horizon, no Monte Carlo, no glidepath/escalation.
- **Medium**: 45-year horizon, glidepath + escalation enabled.
- **Large**: 70-year horizon (edge), glidepath + escalation enabled.

### B. Goal search (required additional contribution)
- **Small**: 30-year horizon with early convergence.
- **Medium**: 45-year horizon with moderate target gap.
- **Large**: 70-year horizon with high target gap (forces several doubling iterations).

### C. Monte Carlo (long time-series stress)
- **Small**: 500 trials × 30 years.
- **Medium**: 2,500 trials × 45 years.
- **Large**: 10,000 trials × 70 years.

### D. Debt payoff (wide feature stress)
- **Small**: 5 debts, 60-month practical payoff.
- **Medium**: 30 debts, up to 180 months.
- **Large**: 100 debts, capped 360 months.

### E. Emergency fund (wide row stress)
- **Small**: 20 expense rows.
- **Medium**: 200 expense rows.
- **Large**: 1,000 expense rows.

## 4) Acceptance thresholds (latency and memory by stage)

All thresholds below are for a single API request on a standard dev workstation profile and should be measured as p95 across >=30 runs.

### Stage-level latency targets
- **Parse/validate (`parse_*` functions)**
  - Small: <= 20 ms
  - Medium: <= 40 ms
  - Large: <= 80 ms

- **Deterministic projection (`run_projection` + `calculate_projection` without Monte Carlo)**
  - Small: <= 30 ms
  - Medium: <= 80 ms
  - Large: <= 200 ms

- **Goal search (`find_required_additional_contribution`)**
  - Small: <= 100 ms
  - Medium: <= 250 ms
  - Large: <= 700 ms

- **Monte Carlo total (`run_monte_carlo`, including percentiles)**
  - Small: <= 250 ms
  - Medium: <= 1,200 ms
  - Large: <= 5,000 ms

- **Debt payoff (`calculate_debt_paydown`)**
  - Small: <= 40 ms
  - Medium: <= 180 ms
  - Large: <= 900 ms

- **Emergency fund (`calculate_emergency_fund`)**
  - Small: <= 10 ms
  - Medium: <= 25 ms
  - Large: <= 100 ms

### Memory targets (peak RSS delta per request)
- **Parse/validate**
  - Small/Medium/Large: <= 10 MB

- **Deterministic projection**
  - Small: <= 15 MB
  - Medium: <= 25 MB
  - Large: <= 40 MB

- **Goal search**
  - Small: <= 20 MB
  - Medium: <= 35 MB
  - Large: <= 60 MB

- **Monte Carlo**
  - Small: <= 80 MB
  - Medium: <= 300 MB
  - Large: <= 900 MB

- **Debt payoff**
  - Small: <= 15 MB
  - Medium: <= 50 MB
  - Large: <= 180 MB

- **Emergency fund**
  - Small: <= 10 MB
  - Medium: <= 20 MB
  - Large: <= 60 MB

## Recommended next optimization priorities
1. Replace per-index full sorts in `percentile_path` with a streaming/selection approach (or NumPy quantiles) to reduce `O(T * N log N)` cost.
2. Remove redundant `run_projection` call inside each Monte Carlo trial and reuse direct initial balances.
3. Add an option to disable returning full `paths` (retain only percentiles + success metrics) for lower memory mode.
4. In goal search, cache/reuse invariant conversions and consider early break heuristics when convergence band is met.
5. For debt stress cases, evaluate heap-based prioritization instead of full per-month sorting for large `D`.
