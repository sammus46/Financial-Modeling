# Severity Rubric and Merge Policy

## Severity definitions

- **Blocker**: Security/compliance failures, data corruption risk, production outage, or critical financial calculation correctness defect.
- **High**: Major user-flow breakage, materially incorrect outputs in common scenarios, or significant performance regressions.
- **Medium**: Non-critical functional issues, edge-case correctness gaps, or maintainability problems with user-visible impact.
- **Low**: Minor UX, docs, or internal improvements with negligible risk.

## Merge policy by severity

- **Blocker**
  - Must not merge until fixed and validated.
  - Requires full-suite pass, explicit reviewer sign-off from code owners, and incident note if applicable.
- **High**
  - Must not merge with open high-severity defects.
  - Requires lint + type + unit + coverage gates passing and at least one senior reviewer approval.
- **Medium**
  - Merge allowed only with an issue/ticket linked and remediation plan.
  - Standard CI gates must pass.
- **Low**
  - Merge allowed with standard review and CI pass.

## Required quality gates

All severities require these baseline gates:

1. Linting gate (`ruff check .`)
2. Typing gate (`mypy app.py`)
3. Unit tests (`pytest`)
4. Coverage threshold (minimum 85%)
5. Changed-files targeted test workflow for PR validation
6. Mandatory full-suite cadence via scheduled runs (daily and weekly)
