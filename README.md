# Retirement Calculator Visualizer

A simple Flask + vanilla JS retirement calculator for learning:

- Input your current financial assumptions.
- Visualize portfolio growth year by year.
- Review retirement metrics like withdrawal rate, retirement income, and savings goals.

## Run locally

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python app.py
```

Open `http://127.0.0.1:5000`.

## Smoke test

Run a quick backend/UI wiring smoke test:
- checks `GET /` returns 200
- checks cache-busted assets are present in HTML (`styles.css?v=`, `app.js?v=`)
- checks `POST /calculate` succeeds for both contribution modes (`percent` + `fixed`)

```bash
pip install -r requirements.txt
python scripts/smoke_test.py
```

Expected output:

```text
Smoke test passed: index + calculate (percent/fixed) are healthy.
```

## UI screenshots in Codex/CI

If you see a message like _“browser_container-style screenshot tool is not available”_, it means the runtime where the agent is executing does not have a browser screenshot capability enabled.

How to fix it:

1. **Enable a browser tool in your agent runtime** (for example a hosted browser/playwright container exposed to the agent).
2. If your environment supports feature flags/capabilities, turn on the browser/screenshot capability for this workspace.
3. Re-run the UI task; the agent can then capture and attach screenshots automatically.

If you cannot enable that runtime capability, use a local fallback:

```bash
python app.py
# open http://127.0.0.1:5000 in your browser and take a manual screenshot
```

Or automate screenshots locally with Playwright (outside this repo), then attach the image artifact in your PR.

### One-command local screenshot helper

This repo now includes a small helper script:

```bash
./scripts/capture_screenshot.sh
```

Default behavior:
- URL: `http://127.0.0.1:5000`
- Output image: `artifacts/ui-screenshot.png`

Custom URL/output:

```bash
./scripts/capture_screenshot.sh http://127.0.0.1:5000 artifacts/home.png
```

Notes:
- Ensure the Flask app is already running before executing the script.
- The script uses `npx playwright screenshot`, so Node.js must be installed.

## Merge conflict quick guide (Current vs Incoming vs Both)

When Git asks you to pick **Current**, **Incoming**, or **Both**:

- Choose **Current** if your branch has the newer/fixed version and incoming reverts it.
- Choose **Incoming** if the incoming change is the newer/fixed version and yours is outdated.
- Choose **Both** only if the edits are complementary and do not duplicate/break behavior.

For this project’s recent UI/submit-flow changes, conflicts often touch the same lines in:
- `static/app.js`
- `templates/index.html`
- `static/styles.css`
- `README.md`

Safe strategy:
1. Prefer the version that keeps **currency normalization + submit validation + summary rendering + cache-busted assets**.
2. If you pick **Both**, manually remove duplicate sections (common in `README.md` and UI markup).
3. Run smoke test before finalizing:

```bash
python scripts/smoke_test.py
```

Practical default for recent conflicts in this repo:
- `static/app.js`: usually **Incoming** (keeps latest submit/currency/safety logic).
- `templates/index.html`: usually **Incoming** (keeps single canonical header/button + summary cards + cache-busted asset URLs).
- `static/styles.css`: usually **Incoming** (latest sticky header + summary card/status styles).
- `app.py`: usually **Both**, then dedupe carefully to keep:
  - `_static_version` + `inject_static_version`
  - `_parse_float` currency cleanup
  - `/calculate` logging + validation handling
- `README.md`: often **Both**, then manually remove duplicate headings/sections.

Conflict resolution map for files changed in recent PRs:
- `CALCULATE_BUTTON_DEBUG_REPORT.md` → **Incoming** (doc-only, latest checklist).
- `README.md` → **Both** then manual dedupe.
- `app.py` → **Both** then manual dedupe.
- `scripts/capture_screenshot.sh` → **Incoming**.
- `scripts/smoke_test.py` → **Incoming**.
- `static/app.js` → **Incoming**.
- `static/styles.css` → **Incoming**.
- `templates/index.html` → **Incoming**.

## Current assumptions

This version keeps the model straightforward while adding a few practical levers:

- Inputs are grouped into personal, investment, and retirement sections.
- Contribution method is either:
  - `% of income saved`, or
  - `fixed annual contribution`.
- Each account type (traditional, Roth, brokerage) can use its own pre-tax annual return rate.
- Income can grow annually via an expected salary growth input.
- Contributions include both `% of paycheck` and a fixed annual dollar contribution.
- Each account type (traditional, Roth, brokerage) can use its own annual return rate.
- Retirement tax treatment is modeled as:
  - traditional: taxed by the user-provided retirement tax rate,
  - Roth: tax-free,
  - brokerage: taxed by the user-provided retirement tax rate.
- Portfolio chart shows post-tax portfolio value and a flat retirement goal line.
- Retirement spending target is based on today's income, retirement spending %, and inflation to retirement age.
- Retirement spending target is still based on today's income, retirement spending %, and inflation to retirement age.
