# Repository Architecture & Risk Review Matrix

## Top-level modules/packages and purpose classification

| Path | Classification | Purpose |
|---|---|---|
| `app.py` | Serving, Modeling, Evaluation, Utilities | Flask application entrypoint; routes/templates rendering; retirement/emergency/debt calculation and validation logic. |
| `templates/` | Serving | HTML views for dashboard and three tools. |
| `static/` | Serving, Utilities | Frontend application logic, chart rendering, form persistence, and UI behavior. |
| `scripts/` | Evaluation, Utilities, Infra | Smoke/stress tests and screenshot automation helper. |
| `docs/` | Utilities | Design notes and operational guidance. |
| `requirements.txt` | Infra | Python dependency manifest (Flask + numerical/data libs). |

## Module-by-module risk inventory

### `app.py`
- **Entry points**: `python app.py`; Flask routes for `/`, `/apps/*`, and API endpoints under `/api/*` and `/calculate`.
- **High-risk components**:
  - Retirement projection loops and after-tax transformations.
  - Monte Carlo simulation path generation.
  - Debt payoff optimization/ranking and monthly amortization calculations.
  - Emergency fund coverage projection logic.
  - Input parsing/validation that gates all calculations.
- **Third-party touchpoints**: Flask request/response lifecycle; JSON payload contracts with browser clients.

### `templates/`
- **Entry points**: Browser-served app pages (`index.html`, `retirement.html`, `emergency_fund.html`, `debt_tracker.html`).
- **High-risk components**: Form-field naming and IDs that must align with JS payload construction and backend validators.
- **Third-party touchpoints**: CDN/static asset loading patterns and browser runtime behavior.

### `static/`
- **Entry points**:
  - `retirement.js`, `emergency_fund.js`, `debt_tracker.js`, `dashboard.js` loaded by templates.
- **High-risk components**:
  - Payload construction and normalization before API calls.
  - Chart rendering modes and derived metrics shown to users.
  - Debt export flow (`debt_tracker.js`) and local state persistence.
- **Third-party touchpoints**:
  - Chart.js global (`Chart`) dependency.
  - Browser APIs (`fetch`, `localStorage`, `Intl.NumberFormat`).
  - XLSX export library hook in debt tracker UI.

### `scripts/`
- **Entry points**:
  - `python scripts/smoke_test.py`
  - `python scripts/stress_test_inputs.py`
  - `./scripts/capture_screenshot.sh`
- **High-risk components**: Coverage quality for end-to-end API behavior; false confidence risk if cases are narrow.
- **Third-party touchpoints**:
  - Flask test client.
  - Playwright CLI via `npx` in screenshot script.

### `docs/`
- **Entry points**: Manual review/documentation consumption.
- **High-risk components**: Low direct runtime risk; medium process risk if stale guidance is followed.
- **Third-party touchpoints**: None direct.

## Review matrix

| Path | Owner (if known) | Business Criticality | Change Frequency | Test Coverage | Risk Level |
|---|---|---|---|---|---|
| `app.py` | Unknown | **High** (core financial outcomes + APIs) | Medium-High | Medium (`scripts/smoke_test.py`, `scripts/stress_test_inputs.py`) | **High** |
| `static/retirement.js` | Unknown | **High** (primary retirement UX + model inputs) | High | Low-Medium (indirect via backend smoke tests) | **High** |
| `static/debt_tracker.js` | Unknown | **High** (debt strategy + payoff UX) | High | Low-Medium (indirect API checks) | **High** |
| `static/emergency_fund.js` | Unknown | Medium-High | High | Low-Medium (indirect API checks) | Medium-High |
| `templates/retirement.html` | Unknown | High | Medium | Low (no template-specific tests) | Medium-High |
| `templates/debt_tracker.html` | Unknown | High | Medium | Low | Medium-High |
| `templates/emergency_fund.html` | Unknown | Medium-High | Medium | Low | Medium |
| `static/app.js` | Unknown | Medium (shared dashboard behavior) | Medium | Low | Medium |
| `scripts/smoke_test.py` | Unknown | High (quality gate) | Medium | N/A (is test harness) | Medium |
| `scripts/stress_test_inputs.py` | Unknown | Medium-High (validation guardrails) | Low-Medium | N/A (is test harness) | Medium |
| `templates/index.html` | Unknown | Medium | Medium | Low | Low-Medium |
| `static/dashboard.js` | Unknown | Low-Medium | Low-Medium | Low | Low |
| `docs/` | Unknown | Low | Low | N/A | Low |
| `requirements.txt` | Unknown | High (runtime dependency set) | Low-Medium | Medium (implicit through app/tests) | Medium |

## Prioritized review order (Risk × Criticality)

### Blocking modules for first-pass deep review
1. `app.py` (**Blocker**) — highest combined risk and business criticality.
2. `static/retirement.js` (**Blocker**) — user input/presentation coupling for the main planning workflow.
3. `static/debt_tracker.js` (**Blocker**) — debt ranking/amortization UX and export interactions.

### Second wave
4. `static/emergency_fund.js`
5. `templates/retirement.html`
6. `templates/debt_tracker.html`
7. `scripts/smoke_test.py`
8. `scripts/stress_test_inputs.py`

### Third wave
9. `templates/emergency_fund.html`
10. `static/app.js`
11. `templates/index.html`
12. `requirements.txt`
13. `static/dashboard.js`
14. `docs/`
