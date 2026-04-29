# Ingress schema contracts

## Ingestion boundaries

This service currently ingests data only via JSON API payloads:

1. `POST /api/retirement/calculate` (and alias `POST /calculate`)
2. `POST /api/emergency-fund/calculate`
3. `POST /api/debt-tracker/calculate`

No CSV, Parquet, or database ingestion paths exist in this repository at this time.

## Schema requirements by endpoint

### 1) Retirement calculation
- Path: `payload`
- Required fields:
  - `current_age` (int)
  - `retirement_age` (int)
  - `contribution_mode` (`percent` or `fixed`)
  - `annual_income` (finite number > 0)
  - `salary_growth_rate`, `inflation_rate`, `traditional_return_rate`, `roth_return_rate`, `brokerage_return_rate` (finite percent numbers in [0, 100])
  - `retirement_spend_rate`, `desired_swr`, `traditional_retirement_tax_rate`, `brokerage_retirement_tax_rate` (finite percent numbers in [0, 100], with `desired_swr > 0`)
- Range and semantic checks:
  - Age bounds and retirement age ordering
  - Non-negative asset balances
  - Contribution split sums to 100
  - Optional Monte Carlo/glidepath fields constrained to [0, 100] or bounded trial count

### 2) Emergency fund calculation
- Path: `payload`
- Required fields:
  - `expenses` (list)
- Per-row required fields:
  - `payload.expenses[i].name` (string)
  - `payload.expenses[i].frequency` (string)
- Constraints:
  - `weekly_amount` and `monthly_amount` finite and non-negative
  - `irregular_month` in [1, 12] when provided
  - At least one enabled row
  - Fund/contribution values finite and non-negative

### 3) Debt tracker calculation
- Path: `payload`
- Required fields:
  - `debts` (non-empty list)
  - `monthly_budget` (finite number > 0)
  - `strategy` (`avalanche` or `snowball`)
- Per-row required fields:
  - `payload.debts[i].name`
  - `payload.debts[i].balance` (finite, non-negative)
  - `payload.debts[i].annual_interest_rate` (finite, non-negative)
  - `payload.debts[i].minimum_payment` (finite, non-negative)
- Timestamp checks:
  - If `deferred_interest_enabled` is true, `deferred_interest_date` must be present, parse as `YYYY-MM-DD`, and be monotonic non-decreasing across rows.

## Failure behavior

Validation is fail-fast and returns HTTP 400 with an actionable message that includes the offending field path (for example, `payload.debts[1].deferred_interest_date`).
