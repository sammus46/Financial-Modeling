# DOE Validation — Debt Pay Down & Emergency Fund Calculators

Date: 2026-04-29

## Method
- Executed deterministic DOE scenarios against core calculation functions in `app.py` using simulated user inputs.
- Compared outputs against independent hand-calculated expectations for:
  - emergency fund normalization/projections/status
  - debt payoff timing/order under avalanche and snowball strategies

Command used:

```bash
python scripts/doe_calculator_validation.py
```

## Result Summary
All DOE scenarios passed.

### Emergency Fund Calculator
1. **Mixed-frequency expenses + capped contributions**
   - Inputs: monthly + weekly + annual expenses, current fund $5,000, $500/month contributions for 12 months, target 6 months coverage.
   - Verified:
     - monthly normalization is correct (`weekly * 52 / 12`, `annual / 12`)
     - weekly total back-conversion is correct
     - current coverage months is correct
     - projected fund at month 24 is capped by `contribution_months` and equals month 12 projection.

2. **Above-target status classification**
   - Inputs: $2,000 monthly expense, $20,000 fund, 6-month target.
   - Verified:
     - coverage = 10 months
     - health status = `Above Target (Excellent)`.

### Debt Pay Down Calculator
1. **Single debt, zero interest**
   - Inputs: $1,000 balance, $200 monthly budget, $100 minimum.
   - Verified:
     - debt-free in 5 months
     - payoff order contains the single debt.

2. **Avalanche prioritization**
   - Inputs: equal balances, APRs 20% vs 5%, $200 monthly budget.
   - Verified:
     - higher APR debt is paid first
     - debt-free in 6 months.

3. **Snowball prioritization**
   - Inputs: balances $900 vs $300, APRs 25% vs 5%, $200 monthly budget.
   - Verified:
     - smaller balance debt is paid first despite lower APR
     - debt-free in 7 months.

## Conclusion
For tested DOE scenarios, both calculators produced correct results consistent with the current implementation logic.
