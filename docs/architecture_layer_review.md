# Architecture Layer & Abstraction Review

## 1) Inferred architectural layers and dependency direction

### Current inferred layers
1. **Transport/UI layer**
   - Flask routes in `app.py` (`index`, `calculate_retirement`, `emergency_fund_calculate`, `debt_tracker_calculate`).
   - Browser-side interaction in `static/*.js` and server-rendered views in `templates/*.html`.
2. **Application/service layer**
   - Use-case orchestration and calculators in `app.py` (`calculate_projection`, `run_monte_carlo`, `calculate_emergency_fund`, `calculate_debt_paydown`).
3. **Domain/model layer**
   - Data classes in `app.py` (`RetirementInputs`, `EmergencyExpense`, `DebtItem`).
   - Validation exception `ValidationError`.
4. **Infrastructure/adapters layer**
   - Flask framework adapters (`request`, `jsonify`, `render_template`) and filesystem cache-busting helper (`_static_version`).

### Expected dependency direction (target)
`domain models` → `domain/application services` → `transport/adapters`

### Observed direction (actual)
Most dependencies are **collapsed into one file (`app.py`)**, so the layering contract is implicit and easy to violate. Route handlers, parsing, domain rules, and numeric engines are co-located.

---

## 2) Violations and architecture risks

| Severity | File | Symbol(s) | Finding | Suggested refactor scope |
|---|---|---|---|---|
| **High** | `app.py` | `calculate_retirement`, `emergency_fund_calculate`, `debt_tracker_calculate` | Transport handlers directly invoke parsing + business calculators from same module, with no service boundary. This prevents independent testing and alternative adapters (CLI/batch/API v2). | **Medium-Large**: extract `services/retirement.py`, `services/emergency_fund.py`, `services/debt.py`; keep Flask routes as thin controllers only. |
| **High** | `app.py` | `RetirementInputs`, `EmergencyExpense`, `DebtItem` + parse functions + calculators | Domain objects, validation, and computation live with Flask app bootstrap; no explicit package boundaries. | **Large**: split into `domain/models.py`, `domain/validation.py`, `domain/calculators.py`, `web/routes.py`. |
| **Medium** | `static/retirement.js` | `getMetricStatus`, `renderChart` | UI layer contains metric-threshold logic and goal/progress semantics that are effectively business presentation rules; duplicates backend assumptions and risks drift. | **Medium**: return status/labels from API or centralize shared rule definitions. |
| **Medium** | `static/emergency_fund.js` | row normalization, frequency behavior, totals formatting flow | Significant workflow rules (frequency interpretation and data normalization behavior) live only client-side, while backend has separate conversion behavior. Divergence risk if one changes. | **Small-Medium**: backend should be source of truth for canonical frequency semantics and emit normalized representation. |
| **Medium** | `app.py` | `calculate_debt_paydown` | Date handling (`datetime.utcnow`) and deferred-interest cliff application are embedded directly in compute function; difficult deterministic testing and extension (calendar variants). | **Small-Medium**: inject clock/time provider + isolate interest policy into strategy objects. |
| **Low** | `app.py` | `_static_version` | Static file cache/version concern is mixed into same module as business code. | **Small**: move to web/infrastructure module. |

### Circular imports
- **No circular imports found** in current codebase because the Python backend is effectively a single module (`app.py`), and JS files are standalone script assets (no module import graph).
- Risk note: once split, circular dependencies are likely unless layering constraints are enforced (e.g., service depends on domain, web depends on service, never reverse).

### Data-access logic mixed into model classes
- No ORM/repository layer currently exists; therefore no classic “data-access in model class” issue observed.
- However, **domain classes are anemic structs while parsing/validation/computation are procedural and co-located with transport**; this is an adjacent design smell.

---

## 3) Abstractions for extensibility

| Area | Current state | Gap | Suggested abstraction |
|---|---|---|---|
| Model selection (retirement/debt strategy variants) | Conditional branching via flags (`enable_monte_carlo`, `enable_glidepath`, debt `strategy` strings). | New variants require editing monolithic functions and conditionals. | Introduce strategy interfaces: `ProjectionEngine`, `ReturnModel`, `DebtPrioritizationStrategy`, selected via factory. |
| Data provider interface | Inputs come from Flask JSON payload only, parsed by specific functions. | No adapter contract for alternate sources (CSV, DB, batch API). | Define `InputProvider`/DTO mappers; route adapter maps request → DTO. |
| Feature pipeline consistency | Parsing, validation, normalization, and calculation are repeated per feature with differing conventions. | Inconsistent pipeline contract and error structure across features. | Standardize `parse -> validate -> execute -> present` pipeline interfaces per feature module. |
| Monte Carlo extensibility | Simulation hardcoded in `run_monte_carlo` with fixed RNG seeding and normal distributions. | Cannot swap stochastic model/distribution without editing core function. | Use pluggable `ScenarioGenerator` interface and configurable distribution policies. |

---

## 4) Suggested refactor plan (sequenced)

1. **Create package boundaries** (`domain/`, `services/`, `web/`) and move route functions to `web/routes.py`.
2. **Extract feature services** for retirement, emergency fund, debt with pure-function or class-based interfaces.
3. **Introduce strategy/factory layer** for debt ordering and projection modes.
4. **Unify feature pipeline contract** (request DTO, validation result, domain output, presenter mapping).
5. **Add architecture guardrails** (import-lint or simple tests asserting dependency direction).

