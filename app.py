from __future__ import annotations

from dataclasses import dataclass
from math import isclose
from pathlib import Path

from flask import Flask, jsonify, render_template, request

app = Flask(__name__)
HEADER_BLOCK = """<div class=\"panel-top\">
            <h1>Retirement Calculator</h1>
            <p class=\"subtitle\">Configure assumptions, then compare actual vs goal outcomes.</p>
            <div class=\"actions actions-top\">
              <button id=\"calculate-btn\" type=\"submit\">Calculate</button>
            </div>
          </div>"""


@dataclass
class RetirementInputs:
    current_age: int
    retirement_age: int
    traditional_assets: float
    roth_assets: float
    brokerage_assets: float
    annual_income: float
    salary_growth_rate: float
    contribution_mode: str
    savings_rate: float
    fixed_annual_contribution: float
    inflation_rate: float
    traditional_return_rate: float
    roth_return_rate: float
    brokerage_return_rate: float
    retirement_spend_rate: float
    desired_swr: float
    traditional_retirement_tax_rate: float
    brokerage_retirement_tax_rate: float


class ValidationError(ValueError):
    """Raised for invalid user input."""


def _static_version() -> int:
    static_dir = Path(app.root_path) / "static"
    tracked = ["styles.css", "app.js"]
    mtimes = []
    for filename in tracked:
        file_path = static_dir / filename
        if file_path.exists():
            mtimes.append(int(file_path.stat().st_mtime))
    return max(mtimes) if mtimes else 1


@app.context_processor
def inject_static_version() -> dict:
    return {"static_version": _static_version()}


def _to_decimal(percent: float) -> float:
    return percent / 100.0


def _dedupe_header_block(html: str) -> str:
    parts = html.split(HEADER_BLOCK)
    if len(parts) <= 2:
        return html
    app.logger.warning("Detected duplicate header/calculate blocks in rendered HTML; deduping.")
    return parts[0] + HEADER_BLOCK + "".join(parts[1:])


def _parse_float(payload: dict, key: str, default: float = 0.0) -> float:
    value = payload.get(key, default)
    if value is None or value == "":
        return default
    if isinstance(value, str):
        value = value.replace(",", "").replace("$", "").strip()
    return float(value)


def _safe_allocation_weights(
    traditional: float,
    roth: float,
    brokerage: float,
) -> tuple[float, float, float]:
    total = traditional + roth + brokerage
    if isclose(total, 0.0):
        return (1 / 3, 1 / 3, 1 / 3)
    return (traditional / total, roth / total, brokerage / total)


def _after_tax_value(data: RetirementInputs, traditional_balance: float, roth_balance: float, brokerage_balance: float) -> float:
    trad_tax = _to_decimal(data.traditional_retirement_tax_rate)
    brokerage_tax = _to_decimal(data.brokerage_retirement_tax_rate)
    trad_after_tax = traditional_balance * (1 - trad_tax)
    roth_after_tax = roth_balance
    brokerage_after_tax = brokerage_balance * (1 - brokerage_tax)
    return trad_after_tax + roth_after_tax + brokerage_after_tax


def parse_inputs(payload: dict) -> RetirementInputs:
    try:
        current_age = int(payload["current_age"])
        retirement_age = int(payload["retirement_age"])

        data = RetirementInputs(
            current_age=current_age,
            retirement_age=retirement_age,
            traditional_assets=_parse_float(payload, "traditional_assets"),
            roth_assets=_parse_float(payload, "roth_assets"),
            brokerage_assets=_parse_float(payload, "brokerage_assets"),
            annual_income=_parse_float(payload, "annual_income"),
            salary_growth_rate=_parse_float(payload, "salary_growth_rate"),
            contribution_mode=str(payload["contribution_mode"]),
            savings_rate=_parse_float(payload, "savings_rate"),
            fixed_annual_contribution=_parse_float(payload, "fixed_annual_contribution"),
            inflation_rate=_parse_float(payload, "inflation_rate"),
            traditional_return_rate=_parse_float(payload, "traditional_return_rate"),
            roth_return_rate=_parse_float(payload, "roth_return_rate"),
            brokerage_return_rate=_parse_float(payload, "brokerage_return_rate"),
            retirement_spend_rate=_parse_float(payload, "retirement_spend_rate"),
            desired_swr=_parse_float(payload, "desired_swr"),
            traditional_retirement_tax_rate=_parse_float(payload, "traditional_retirement_tax_rate"),
            brokerage_retirement_tax_rate=_parse_float(payload, "brokerage_retirement_tax_rate"),
        )
    except (KeyError, TypeError, ValueError) as exc:
        raise ValidationError("Please enter valid numeric inputs for all required fields.") from exc

    if not 0 <= current_age <= 120:
        raise ValidationError("Current age must be between 0 and 120.")
    if not 1 <= retirement_age <= 130:
        raise ValidationError("Retirement age must be between 1 and 130.")
    if retirement_age <= current_age:
        raise ValidationError("Retirement age must be greater than current age.")
    if retirement_age - current_age > 100:
        raise ValidationError("Years to retirement must be 100 or less.")
    if data.annual_income <= 0:
        raise ValidationError("Annual income must be greater than 0.")

    if data.contribution_mode not in {"percent", "fixed"}:
        raise ValidationError("Contribution mode must be either percent or fixed.")

    if data.contribution_mode == "percent":
        if data.savings_rate <= 0:
            raise ValidationError("Savings rate must be greater than 0 when using percent mode.")
        if not isclose(data.fixed_annual_contribution, 0.0):
            raise ValidationError("Fixed annual contribution must be 0 in percent mode.")
    else:
        if data.fixed_annual_contribution <= 0:
            raise ValidationError("Fixed annual contribution must be greater than 0 in fixed mode.")
        if not isclose(data.savings_rate, 0.0):
            raise ValidationError("Savings rate must be 0 in fixed mode.")

    percent_fields = {
        "salary growth rate": data.salary_growth_rate,
        "savings rate": data.savings_rate,
        "inflation rate": data.inflation_rate,
        "traditional pre-tax return rate": data.traditional_return_rate,
        "roth pre-tax return rate": data.roth_return_rate,
        "brokerage pre-tax return rate": data.brokerage_return_rate,
        "retirement spending percent": data.retirement_spend_rate,
        "desired SWR": data.desired_swr,
        "traditional retirement tax rate": data.traditional_retirement_tax_rate,
        "brokerage retirement tax rate": data.brokerage_retirement_tax_rate,
    }
    for field_name, value in percent_fields.items():
        if not 0 <= value <= 100:
            raise ValidationError(f"{field_name.title()} must be between 0 and 100.")
    if isclose(data.desired_swr, 0.0):
        raise ValidationError("Desired SWR must be greater than 0.")

    for field_name, value in {
        "traditional assets": data.traditional_assets,
        "roth assets": data.roth_assets,
        "brokerage assets": data.brokerage_assets,
    }.items():
        if value < 0:
            raise ValidationError(f"{field_name.title()} cannot be negative.")

    return data


def run_projection(data: RetirementInputs, extra_fixed_contribution: float = 0.0) -> dict:
    years_to_retirement = data.retirement_age - data.current_age

    income = data.annual_income
    savings_rate = _to_decimal(data.savings_rate)
    growth_salary = _to_decimal(data.salary_growth_rate)
    trad_return = _to_decimal(data.traditional_return_rate)
    roth_return = _to_decimal(data.roth_return_rate)
    brokerage_return = _to_decimal(data.brokerage_return_rate)

    trad_balance = data.traditional_assets
    roth_balance = data.roth_assets
    brokerage_balance = data.brokerage_assets

    weights = _safe_allocation_weights(trad_balance, roth_balance, brokerage_balance)

    ages = [data.current_age]
    pre_tax_balances = [trad_balance + roth_balance + brokerage_balance]
    post_tax_balances = [_after_tax_value(data, trad_balance, roth_balance, brokerage_balance)]

    for i in range(1, years_to_retirement + 1):
        percent_contribution = (income * savings_rate) if data.contribution_mode == "percent" else 0.0
        fixed_contribution = (
            data.fixed_annual_contribution + extra_fixed_contribution
            if data.contribution_mode == "fixed"
            else extra_fixed_contribution
        )
        total_contribution = percent_contribution + fixed_contribution

        trad_contrib = total_contribution * weights[0]
        roth_contrib = total_contribution * weights[1]
        brokerage_contrib = total_contribution * weights[2]

        trad_balance = trad_balance * (1 + trad_return) + trad_contrib
        roth_balance = roth_balance * (1 + roth_return) + roth_contrib
        brokerage_balance = brokerage_balance * (1 + brokerage_return) + brokerage_contrib

        ages.append(data.current_age + i)
        pre_tax_balances.append(trad_balance + roth_balance + brokerage_balance)
        post_tax_balances.append(_after_tax_value(data, trad_balance, roth_balance, brokerage_balance))

        income *= 1 + growth_salary

    starting_total_contribution = (
        (data.annual_income * savings_rate if data.contribution_mode == "percent" else 0.0)
        + (data.fixed_annual_contribution if data.contribution_mode == "fixed" else 0.0)
        + extra_fixed_contribution
    )

    return {
        "ages": ages,
        "pre_tax_balances": pre_tax_balances,
        "post_tax_balances": post_tax_balances,
        "traditional_balance": trad_balance,
        "roth_balance": roth_balance,
        "brokerage_balance": brokerage_balance,
        "projected_income_at_retirement": income,
        "starting_total_contribution": starting_total_contribution,
    }


def find_required_additional_contribution(data: RetirementInputs, target_nest_egg: float) -> float:
    baseline_projection = run_projection(data, extra_fixed_contribution=0.0)
    baseline_after_tax = baseline_projection["post_tax_balances"][-1]

    if baseline_after_tax >= target_nest_egg:
        return 0.0

    low = 0.0
    high = max(1_000.0, data.annual_income)

    while run_projection(data, high)["post_tax_balances"][-1] < target_nest_egg:
        high *= 2
        if high > 10_000_000:
            return high

    for _ in range(60):
        mid = (low + high) / 2
        value_mid = run_projection(data, mid)["post_tax_balances"][-1]
        if value_mid >= target_nest_egg:
            high = mid
        else:
            low = mid

    return high


def calculate_projection(data: RetirementInputs) -> dict:
    years_to_retirement = data.retirement_age - data.current_age
    inflation = _to_decimal(data.inflation_rate)
    retirement_spend_rate = _to_decimal(data.retirement_spend_rate)
    desired_swr = _to_decimal(data.desired_swr)

    projection = run_projection(data, extra_fixed_contribution=0.0)
    future_portfolio_pre_tax = projection["pre_tax_balances"][-1]
    future_portfolio_after_tax = projection["post_tax_balances"][-1]

    first_year_retirement_spending = (
        data.annual_income * retirement_spend_rate * ((1 + inflation) ** years_to_retirement)
    )

    target_nest_egg = (
        first_year_retirement_spending / desired_swr
        if not isclose(desired_swr, 0.0)
        else float("inf")
    )

    actual_withdrawal_rate = (
        first_year_retirement_spending / future_portfolio_after_tax
        if future_portfolio_after_tax > 0
        else float("inf")
    )

    yearly_salary_at_retirement = future_portfolio_after_tax * desired_swr
    retirement_goal_achieved_pct = (
        (future_portfolio_after_tax / target_nest_egg) * 100
        if target_nest_egg not in (0, float("inf"))
        else 0.0
    )

    goal_line = [target_nest_egg for _ in projection["ages"]]

    return {
        "ages": projection["ages"],
        "post_tax_balances": projection["post_tax_balances"],
        "goal_line": goal_line,
        "stats": {
            "future_value_pre_tax_at_retirement": {
                "actual": future_portfolio_pre_tax,
                "goal": None,
            },
            "future_value_after_tax_at_retirement": {
                "actual": future_portfolio_after_tax,
                "goal": target_nest_egg,
            },
            "traditional_balance_at_retirement": {
                "actual": projection["traditional_balance"],
                "goal": None,
            },
            "roth_balance_at_retirement": {
                "actual": projection["roth_balance"],
                "goal": None,
            },
            "brokerage_balance_at_retirement": {
                "actual": projection["brokerage_balance"],
                "goal": None,
            },
            "total_balance_at_retirement": {
                "actual": (
                    projection["traditional_balance"]
                    + projection["roth_balance"]
                    + projection["brokerage_balance"]
                ),
                "goal": target_nest_egg,
            },
            "projected_income_at_retirement": {
                "actual": projection["projected_income_at_retirement"],
                "goal": None,
            },
            "first_year_retirement_spending": {
                "actual": first_year_retirement_spending,
                "goal": None,
            },
            "actual_withdrawal_rate": {
                "actual": actual_withdrawal_rate * 100,
                "goal": data.desired_swr,
            },
            "yearly_salary_at_retirement": {
                "actual": yearly_salary_at_retirement,
                "goal": first_year_retirement_spending,
            },
            "retirement_goal_achieved_pct": {
                "actual": retirement_goal_achieved_pct,
                "goal": 100.0,
            },
        },
    }


@app.route("/", methods=["GET"])
def index() -> str:
    rendered = render_template("index.html")
    return _dedupe_header_block(rendered)


@app.route("/calculate", methods=["POST"])
def calculate() -> tuple:
    payload = request.get_json(silent=True) or {}
    app.logger.info(
        "Calculate request received.",
        extra={
            "payload_keys": sorted(payload.keys()),
            "contribution_mode": payload.get("contribution_mode"),
        },
    )

    try:
        data = parse_inputs(payload)
        result = calculate_projection(data)
    except ValidationError as exc:
        app.logger.warning("Calculate validation error: %s", str(exc))
        return jsonify({"error": str(exc)}), 400

    app.logger.info(
        "Calculate response prepared.",
        extra={
            "ages_count": len(result.get("ages", [])),
            "post_tax_count": len(result.get("post_tax_balances", [])),
        },
    )
    return jsonify(result), 200


if __name__ == "__main__":
    app.run(debug=True)
