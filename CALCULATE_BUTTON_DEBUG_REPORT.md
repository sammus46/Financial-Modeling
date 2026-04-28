# Calculate Button Debug Report

## Current status
- The button exists in the DOM and is correctly wired to the form via `form="retirement-form"`. 
- JavaScript now targets the button by ID (`calculate-btn`) and binds `handleSubmit` to the form submit event.
- The submit flow intentionally disables the button while a request is in flight and re-enables it in `finally`.
- Submit flow now also includes a client-side timeout (`AbortController`) and explicit non-JSON response handling.

## Why users may still say “Calculate does not work”

### 1) Backend/service not running
If `/calculate` cannot be reached, clicking Calculate appears broken.

Observed in this environment:
- `python app.py` fails with `ModuleNotFoundError: No module named 'flask'`.

Impact:
- Initial auto-submit and manual clicks both fail network calls.
- UI shows a generic error (`Something went wrong...`) and no chart update.

### 2) Validation errors from payload assumptions
The backend has strict rules:
- `percent` mode requires `savings_rate > 0` and `fixed_annual_contribution == 0`.
- `fixed` mode requires `fixed_annual_contribution > 0` and `savings_rate == 0`.

If values violate these constraints, `/calculate` returns 400 and users may perceive this as button failure.

### 3) Required/invalid form input blocks submission
Browser-native form validation can prevent submit if required fields are empty/invalid.

Examples:
- Empty annual income field.
- Non-numeric characters pasted into non-currency numeric fields.

### 4) Runtime JavaScript error aborts submit flow
Any uncaught JS exception before or during submit handling can make the button appear non-functional.

Likely sources:
- Missing expected DOM IDs/classes.
- Script loading order regressions.

### 5) Button remains disabled because request never resolves
Mitigated in Sprint A by adding a request timeout in `static/retirement.js` so hanging requests abort and the button is restored.

### 6) API returns non-JSON on error
Mitigated in Sprint A by checking `content-type` before parsing and gracefully surfacing text errors.

### 7) Ad blocker/CSP/proxy interference
Local/security tooling may block `/calculate` POST calls or alter responses.

### 8) Browser extension or cached stale JS
Users may be running cached older JS after deployment; hard refresh required.

## Suggested debug checklist (fast)
1. Open devtools Console and Network tab.
2. Click Calculate and confirm a POST to `/calculate` appears.
3. If no request:
   - check console for JS errors
   - verify the button is not disabled before click
   - verify form validation messages
4. If request exists but fails:
   - inspect response status/body (400 vs 500 vs network)
   - confirm backend process is running and Flask dependencies are installed
5. Hard-refresh browser to avoid stale JS.

## File-level references
- Button markup and form association: `templates/index.html`
- Submit handling + fetch + disable/re-enable logic: `static/app.js`
- Validation rules and `/calculate` endpoint behavior: `app.py`
