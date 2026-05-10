# Repository Guidelines

## Project Overview

This is a Flask + vanilla JavaScript financial modeling app suite. The backend lives in
`app.py`, templates live in `templates/`, and app-specific frontend logic lives in
`static/`.

Primary user-facing tools:

- Dashboard: `/`
- Retirement Planner: `/apps/retirement`
- Emergency Fund Calculator: `/apps/emergency-fund`
- Debt Tracker: `/apps/debt-tracker`
- Net Worth Tracker: `/apps/net-worth-tracker`

API endpoints are defined in `app.py`. Preserve existing endpoint names and response
shapes unless the user explicitly asks for a breaking change.

## Local Setup

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python app.py
```

Open `http://127.0.0.1:5000`.

## Testing

Use the standard-library unittest suite:

```bash
python -m unittest discover -s tests
```

Run the project smoke test after endpoint, template, or static asset changes:

```bash
python scripts/smoke_test.py
```

The smoke test checks dashboard/app routes, cache-busted static assets, and calculator
POST flows for retirement, emergency fund, debt tracker, and Monte Carlo retirement
scenarios.

## Backend Notes

- Keep calculator parsing and validation centralized in `app.py` helpers such as
  `_parse_float`, `_parse_bool`, `_require_keys`, and `ValidationError`.
- Reject non-finite numeric inputs and include useful field/path context in validation
  errors.
- Preserve the legacy `/calculate` retirement route alongside
  `/api/retirement/calculate`.
- Runtime configuration is intentionally strict in production: `SECRET_KEY` must be set
  and `FLASK_DEBUG` must be disabled.
- Avoid hardcoded secrets. `tests/test_security_guards.py` scans committed text files for
  common token/key patterns.
- Monte Carlo behavior should remain deterministic when a seed is supplied.

## Frontend Notes

- Use app-specific static bundles:
  - `static/dashboard.js`
  - `static/retirement.js`
  - `static/emergency_fund.js`
  - `static/debt_tracker.js`
  - `static/net_worth_tracker.js`
- `static/app.js` is only a legacy compatibility shim that loads `retirement.js`; do not
  put new canonical retirement logic there.
- Keep template asset URLs cache-busted with `v=static_version`.
- Reuse existing CSS conventions in `static/styles.css` and existing template structure
  instead of introducing a frontend framework.

## Change Guidance

- Keep edits focused; this repo is intentionally small and direct.
- Update or add unittest coverage when changing calculation rules, validation contracts,
  or error behavior.
- For UI wiring changes, run `python scripts/smoke_test.py`.
- If merge conflicts touch recent submit-flow or asset-versioning code, preserve currency
  normalization, submit validation, summary rendering, and cache-busted assets.
