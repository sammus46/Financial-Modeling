from __future__ import annotations

import random
from dataclasses import dataclass
from datetime import datetime
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
    enable_monte_carlo: bool
    monte_carlo_trials: int
    monte_carlo_return_stddev: float
    monte_carlo_inflation_stddev: float
    enable_contribution_escalation: bool
    contribution_escalation_rate: float
    enable_glidepath: bool
    glidepath_equity_start: float
    glidepath_equity_end: float
    glidepath_equity_return_rate: float
    glidepath_bond_return_rate: float


@dataclass
class EmergencyExpense:
    expense_class: str
    name: str
    weekly_amount: float
    monthly_amount: float
    frequency: str
    irregular_month: int | None
    notes: str
    enabled: bool


class ValidationError(ValueError):
    """Raised for invalid user input."""


def _static_version() -> int:
    static_dir = Path(app.root_path) / "static"
    tracked = ["styles.css", "app.js", "retirement.js", "emergency_fund.js", "dashboard.js", "debt_tracker.js"]
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


def _to_monthly_amount(weekly_amount: float, monthly_amount: float) -> float:
    if monthly_amount > 0:
        return monthly_amount
    if weekly_amount > 0:
        return weekly_amount * 52 / 12
    return 0.0


def _to_monthly_amount_with_frequency(expense: EmergencyExpense) -> float:
    if expense.frequency == "weekly":
        return expense.weekly_amount * 52 / 12
    if expense.frequency == "monthly":
        return expense.monthly_amount
    if expense.frequency == "quarterly":
        return expense.monthly_amount / 3
    if expense.frequency == "semiannual":
        return expense.monthly_amount / 6
    if expense.frequency == "annual":
        return expense.monthly_amount / 12
    return _to_monthly_amount(expense.weekly_amount, expense.monthly_amount)


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
            enable_monte_carlo=bool(payload.get("enable_monte_carlo", False)),
            monte_carlo_trials=int(_parse_float(payload, "monte_carlo_trials", default=1000.0)),
            monte_carlo_return_stddev=_parse_float(payload, "monte_carlo_return_stddev", default=12.0),
            monte_carlo_inflation_stddev=_parse_float(payload, "monte_carlo_inflation_stddev", default=1.0),
            enable_contribution_escalation=bool(payload.get("enable_contribution_escalation", False)),
            contribution_escalation_rate=_parse_float(payload, "contribution_escalation_rate", default=0.0),
            enable_glidepath=bool(payload.get("enable_glidepath", False)),
            glidepath_equity_start=_parse_float(payload, "glidepath_equity_start", default=70.0),
            glidepath_equity_end=_parse_float(payload, "glidepath_equity_end", default=50.0),
            glidepath_equity_return_rate=_parse_float(payload, "glidepath_equity_return_rate", default=9.0),
            glidepath_bond_return_rate=_parse_float(payload, "glidepath_bond_return_rate", default=4.0),
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

    if data.enable_monte_carlo:
        if not 100 <= data.monte_carlo_trials <= 20000:
            raise ValidationError("Monte Carlo trials must be between 100 and 20000.")
        if not 0 <= data.monte_carlo_return_stddev <= 100:
            raise ValidationError("Monte Carlo return std dev must be between 0 and 100.")
        if not 0 <= data.monte_carlo_inflation_stddev <= 100:
            raise ValidationError("Monte Carlo inflation std dev must be between 0 and 100.")

    if data.enable_contribution_escalation and not 0 <= data.contribution_escalation_rate <= 100:
        raise ValidationError("Contribution escalation rate must be between 0 and 100.")

    if data.enable_glidepath:
        if not 0 <= data.glidepath_equity_start <= 100:
            raise ValidationError("Glidepath equity start must be between 0 and 100.")
        if not 0 <= data.glidepath_equity_end <= 100:
            raise ValidationError("Glidepath equity end must be between 0 and 100.")
        if not 0 <= data.glidepath_equity_return_rate <= 100:
            raise ValidationError("Glidepath equity return must be between 0 and 100.")
        if not 0 <= data.glidepath_bond_return_rate <= 100:
            raise ValidationError("Glidepath bond return must be between 0 and 100.")

    return data


def parse_emergency_fund_inputs(payload: dict) -> tuple[list[EmergencyExpense], float, float, int, float, float]:
    expenses_payload = payload.get("expenses")
    if not isinstance(expenses_payload, list):
        raise ValidationError("Expenses must be provided as a list.")

    parsed_expenses: list[EmergencyExpense] = []
    for row in expenses_payload:
        if not isinstance(row, dict):
            raise ValidationError("Each expense row must be an object.")

        enabled = bool(row.get("enabled", True))
        weekly_amount = _parse_float(row, "weekly_amount", default=0.0)
        monthly_amount = _parse_float(row, "monthly_amount", default=0.0)

        if weekly_amount < 0 or monthly_amount < 0:
            raise ValidationError("Weekly and monthly amounts cannot be negative.")

        frequency = str(row.get("frequency", "monthly")).strip().lower()
        if frequency not in {"weekly", "monthly", "quarterly", "semiannual", "annual"}:
            frequency = "monthly"
        irregular_month_value = row.get("irregular_month")
        irregular_month = None
        if irregular_month_value not in (None, ""):
            irregular_month = int(_parse_float(row, "irregular_month", default=0.0))
            if not 1 <= irregular_month <= 12:
                raise ValidationError("Irregular month must be between 1 and 12.")

        parsed_expenses.append(
            EmergencyExpense(
                expense_class=str(row.get("expense_class", "")).strip(),
                name=str(row.get("name", "")).strip(),
                weekly_amount=weekly_amount,
                monthly_amount=monthly_amount,
                frequency=frequency,
                irregular_month=irregular_month,
                notes=str(row.get("notes", "")).strip(),
                enabled=enabled,
            )
        )

    included = [row for row in parsed_expenses if row.enabled]
    if not included:
        raise ValidationError("Select at least one expense row to include.")

    current_fund_amount = _parse_float(payload, "current_fund_amount", default=0.0)
    if current_fund_amount < 0:
        raise ValidationError("Current emergency fund amount cannot be negative.")

    monthly_contribution_amount = _parse_float(payload, "monthly_contribution_amount", default=0.0)
    if monthly_contribution_amount < 0:
        raise ValidationError("Monthly contribution amount cannot be negative.")

    contribution_months = int(_parse_float(payload, "contribution_months", default=0.0))
    if contribution_months < 0:
        raise ValidationError("Contribution months cannot be negative.")

    current_target_coverage_months = _parse_float(payload, "current_target_coverage_months", default=6.0)
    if current_target_coverage_months < 0:
        raise ValidationError("Current target coverage months cannot be negative.")

    return (
        included,
        current_fund_amount,
        monthly_contribution_amount,
        contribution_months,
        current_target_coverage_months,
    )


def calculate_emergency_fund(
    expenses: list[EmergencyExpense],
    current_fund_amount: float,
    monthly_contribution_amount: float,
    contribution_months: int,
    current_target_coverage_months: float,
) -> dict:
    monthly_amounts = [_to_monthly_amount_with_frequency(expense) for expense in expenses]
    total_monthly = sum(monthly_amounts)
    total_weekly = sum(monthly / 52 * 12 for monthly in monthly_amounts)

    projections = []
    previous_contributed_months = 0
    for months in range(3, 25, 3):
        contributed_months = min(months, contribution_months)
        period_contributed_months = max(contributed_months - previous_contributed_months, 0)
        contributions_for_period = monthly_contribution_amount * period_contributed_months
        projections.append(
            {
                "months": months,
                "target": total_monthly * months,
                "projected_fund": current_fund_amount + monthly_contribution_amount * contributed_months,
                "contributions_for_period": contributions_for_period,
            }
        )
        previous_contributed_months = contributed_months

    coverage_months = (current_fund_amount / total_monthly) if total_monthly > 0 else 0.0
    coverage_ratio = (coverage_months / current_target_coverage_months) if current_target_coverage_months > 0 else 0.0
    contribution_horizon_months = min(max(contribution_months, 0), 24)
    projected_horizon_fund = current_fund_amount + monthly_contribution_amount * contribution_horizon_months
    projected_horizon_coverage = (projected_horizon_fund / total_monthly) if total_monthly > 0 else 0.0
    contribution_ratio = (
        projected_horizon_coverage / current_target_coverage_months
        if current_target_coverage_months > 0
        else 0.0
    )

    strongest_ratio = max(coverage_ratio, contribution_ratio)

    if strongest_ratio >= 1.5:
        health_status = "Above Target (Excellent)"
    elif strongest_ratio >= 1.2:
        health_status = "Above Target (Strong)"
    elif coverage_ratio >= 1 and contribution_ratio >= 1:
        health_status = "On Target"
    elif coverage_ratio >= 0.85 or contribution_ratio >= 0.85:
        health_status = "Improving"
    elif coverage_ratio >= 0.6 or contribution_ratio >= 0.6:
        health_status = "Needs Attention"
    else:
        health_status = "At Risk"

    return {
        "total_weekly": total_weekly,
        "total_monthly": total_monthly,
        "coverage_months": coverage_months,
        "health_status": health_status,
        "projections": projections,
        "monthly_contribution_amount": monthly_contribution_amount,
        "contribution_months": contribution_months,
        "current_target_coverage_months": current_target_coverage_months,
        "projected_horizon_coverage_months": projected_horizon_coverage,
    }


def run_projection(data: RetirementInputs, extra_fixed_contribution: float = 0.0) -> dict:
    years_to_retirement = data.retirement_age - data.current_age

    income = data.annual_income
    savings_rate = _to_decimal(data.savings_rate)
    growth_salary = _to_decimal(data.salary_growth_rate)
    trad_balance = data.traditional_assets
    roth_balance = data.roth_assets
    brokerage_balance = data.brokerage_assets

    weights = _safe_allocation_weights(trad_balance, roth_balance, brokerage_balance)

    ages = [data.current_age]
    pre_tax_balances = [trad_balance + roth_balance + brokerage_balance]
    post_tax_balances = [_after_tax_value(data, trad_balance, roth_balance, brokerage_balance)]
    traditional_balances = [trad_balance]
    roth_balances = [roth_balance]
    brokerage_balances = [brokerage_balance]

    for i in range(1, years_to_retirement + 1):
        percent_contribution = (income * savings_rate) if data.contribution_mode == "percent" else 0.0
        fixed_contribution = (
            data.fixed_annual_contribution + extra_fixed_contribution
            if data.contribution_mode == "fixed"
            else extra_fixed_contribution
        )
        if data.enable_contribution_escalation:
            escalation = (1 + _to_decimal(data.contribution_escalation_rate)) ** (i - 1)
            percent_contribution *= escalation
            fixed_contribution *= escalation
        total_contribution = percent_contribution + fixed_contribution

        trad_contrib = total_contribution * weights[0]
        roth_contrib = total_contribution * weights[1]
        brokerage_contrib = total_contribution * weights[2]

        if data.enable_glidepath:
            progress = (i - 1) / max(years_to_retirement, 1)
            equity_start = _to_decimal(data.glidepath_equity_start)
            equity_end = _to_decimal(data.glidepath_equity_end)
            equity_weight = equity_start + (equity_end - equity_start) * progress
            bond_weight = 1 - equity_weight
            blended_return = (
                equity_weight * _to_decimal(data.glidepath_equity_return_rate)
                + bond_weight * _to_decimal(data.glidepath_bond_return_rate)
            )
            trad_return = blended_return
            roth_return = blended_return
            brokerage_return = blended_return
        else:
            trad_return = _to_decimal(data.traditional_return_rate)
            roth_return = _to_decimal(data.roth_return_rate)
            brokerage_return = _to_decimal(data.brokerage_return_rate)

        trad_balance = trad_balance * (1 + trad_return) + trad_contrib
        roth_balance = roth_balance * (1 + roth_return) + roth_contrib
        brokerage_balance = brokerage_balance * (1 + brokerage_return) + brokerage_contrib

        ages.append(data.current_age + i)
        pre_tax_balances.append(trad_balance + roth_balance + brokerage_balance)
        post_tax_balances.append(_after_tax_value(data, trad_balance, roth_balance, brokerage_balance))
        traditional_balances.append(trad_balance)
        roth_balances.append(roth_balance)
        brokerage_balances.append(brokerage_balance)

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
        "traditional_balances": traditional_balances,
        "roth_balances": roth_balances,
        "brokerage_balances": brokerage_balances,
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
    required_extra_annual_contribution = find_required_additional_contribution(data, target_nest_egg)
    total_annual_contribution_needed = projection["starting_total_contribution"] + required_extra_annual_contribution
    savings_rate_needed_pct = (
        (total_annual_contribution_needed / data.annual_income) * 100
        if data.annual_income > 0
        else None
    )

    goal_line = [target_nest_egg for _ in projection["ages"]]
    trad_return = _to_decimal(data.traditional_return_rate)
    roth_return = _to_decimal(data.roth_return_rate)
    brokerage_return = _to_decimal(data.brokerage_return_rate)

    dynamic_goal_line = []
    total_years = len(projection["ages"]) - 1
    for index in range(len(projection["ages"])):
        years_remaining = total_years - index
        trad_balance_now = projection["traditional_balances"][index]
        roth_balance_now = projection["roth_balances"][index]
        brokerage_balance_now = projection["brokerage_balances"][index]
        weights = _safe_allocation_weights(trad_balance_now, roth_balance_now, brokerage_balance_now)

        initial_unit_total = 1.0
        unit_trad_start = initial_unit_total * weights[0]
        unit_roth_start = initial_unit_total * weights[1]
        unit_brokerage_start = initial_unit_total * weights[2]
        unit_after_tax_start = _after_tax_value(data, unit_trad_start, unit_roth_start, unit_brokerage_start)

        unit_trad_end = unit_trad_start * ((1 + trad_return) ** years_remaining)
        unit_roth_end = unit_roth_start * ((1 + roth_return) ** years_remaining)
        unit_brokerage_end = unit_brokerage_start * ((1 + brokerage_return) ** years_remaining)
        unit_after_tax_end = _after_tax_value(data, unit_trad_end, unit_roth_end, unit_brokerage_end)

        growth_factor = (
            (unit_after_tax_end / unit_after_tax_start)
            if unit_after_tax_start > 0
            else 1.0
        )
        required_after_tax_now = target_nest_egg / growth_factor if growth_factor > 0 else target_nest_egg
        dynamic_goal_line.append(required_after_tax_now)

    response = {
        "ages": projection["ages"],
        "post_tax_balances": projection["post_tax_balances"],
        "goal_line": goal_line,
        "dynamic_goal_line": dynamic_goal_line,
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
        "insights": {
            "starting_total_annual_contribution": projection["starting_total_contribution"],
            "required_additional_annual_contribution": required_extra_annual_contribution,
            "total_annual_contribution_needed": total_annual_contribution_needed,
            "estimated_savings_rate_needed_pct": savings_rate_needed_pct,
        },
    }
    if data.enable_monte_carlo:
        response["monte_carlo"] = run_monte_carlo(data, target_nest_egg)
    return response


def run_monte_carlo(data: RetirementInputs, target_nest_egg: float) -> dict:
    trials = data.monte_carlo_trials
    return_stddev = _to_decimal(data.monte_carlo_return_stddev)
    inflation_stddev = _to_decimal(data.monte_carlo_inflation_stddev)
    years_to_retirement = data.retirement_age - data.current_age
    paths: list[list[float]] = []
    ending_values: list[float] = []
    successful_trials = 0
    seed = (
        int(data.current_age * 31 + data.retirement_age * 17 + data.annual_income)
        + int(data.traditional_assets + data.roth_assets + data.brokerage_assets)
    )
    rng = random.Random(seed)

    for _ in range(trials):
        trial_projection = run_projection(data, extra_fixed_contribution=0.0)
        path = [trial_projection["post_tax_balances"][0]]
        trad_balance = data.traditional_assets
        roth_balance = data.roth_assets
        brokerage_balance = data.brokerage_assets
        income = data.annual_income
        savings_rate = _to_decimal(data.savings_rate)
        weights = _safe_allocation_weights(trad_balance, roth_balance, brokerage_balance)
        for year in range(1, years_to_retirement + 1):
            sampled_inflation = max(-0.05, rng.gauss(_to_decimal(data.inflation_rate), inflation_stddev))
            sampled_trad = max(-0.95, rng.gauss(_to_decimal(data.traditional_return_rate), return_stddev))
            sampled_roth = max(-0.95, rng.gauss(_to_decimal(data.roth_return_rate), return_stddev))
            sampled_brokerage = max(-0.95, rng.gauss(_to_decimal(data.brokerage_return_rate), return_stddev))
            percent_contribution = (income * savings_rate) if data.contribution_mode == "percent" else 0.0
            fixed_contribution = data.fixed_annual_contribution if data.contribution_mode == "fixed" else 0.0
            if data.enable_contribution_escalation:
                escalation = (1 + _to_decimal(data.contribution_escalation_rate)) ** (year - 1)
                percent_contribution *= escalation
                fixed_contribution *= escalation
            total_contribution = percent_contribution + fixed_contribution
            trad_contrib = total_contribution * weights[0]
            roth_contrib = total_contribution * weights[1]
            brokerage_contrib = total_contribution * weights[2]
            trad_balance = trad_balance * (1 + sampled_trad) + trad_contrib
            roth_balance = roth_balance * (1 + sampled_roth) + roth_contrib
            brokerage_balance = brokerage_balance * (1 + sampled_brokerage) + brokerage_contrib
            path.append(_after_tax_value(data, trad_balance, roth_balance, brokerage_balance))
            income *= 1 + max(-0.5, _to_decimal(data.salary_growth_rate) - sampled_inflation * 0.25)
        ending_value = path[-1]
        ending_values.append(ending_value)
        if ending_value >= target_nest_egg:
            successful_trials += 1
        paths.append(path)

    sorted_endings = sorted(ending_values)
    p10 = percentile(sorted_endings, 10)
    p50 = percentile(sorted_endings, 50)
    p90 = percentile(sorted_endings, 90)
    return {
        "enabled": True,
        "trials": trials,
        "success_probability_pct": (successful_trials / trials) * 100 if trials > 0 else 0.0,
        "ending_values": {
            "p10": p10,
            "p50": p50,
            "p90": p90,
        },
        "path_percentiles": {
            "p10": percentile_path(paths, 10),
            "p50": percentile_path(paths, 50),
            "p90": percentile_path(paths, 90),
        },
    }


def percentile(values: list[float], q: float) -> float:
    if not values:
        return 0.0
    if len(values) == 1:
        return values[0]
    rank = (q / 100) * (len(values) - 1)
    lower = int(rank)
    upper = min(lower + 1, len(values) - 1)
    fraction = rank - lower
    return values[lower] + (values[upper] - values[lower]) * fraction


def percentile_path(paths: list[list[float]], q: float) -> list[float]:
    if not paths:
        return []
    length = len(paths[0])
    result = []
    for index in range(length):
        values = sorted(path[index] for path in paths if len(path) > index)
        result.append(percentile(values, q))
    return result


@dataclass
class DebtItem:
    name: str
    balance: float
    annual_interest_rate: float
    minimum_payment: float
    strategy_weight: float
    deferred_interest_enabled: bool
    deferred_interest_date: str
    deferred_interest_rate: float


def parse_debt_inputs(payload: dict) -> tuple[list[DebtItem], float, str]:
    debts_payload = payload.get("debts")
    if not isinstance(debts_payload, list) or not debts_payload:
        raise ValidationError("Please include at least one debt.")
    monthly_budget = _parse_float(payload, "monthly_budget", default=0.0)
    if monthly_budget <= 0:
        raise ValidationError("Monthly debt budget must be greater than 0.")
    strategy = str(payload.get("strategy", "avalanche")).strip().lower()
    if strategy not in {"avalanche", "snowball"}:
        raise ValidationError("Strategy must be avalanche or snowball.")

    debts: list[DebtItem] = []
    for row in debts_payload:
        balance = _parse_float(row, "balance")
        apr = _parse_float(row, "annual_interest_rate")
        minimum_payment = _parse_float(row, "minimum_payment")
        if balance < 0 or apr < 0 or minimum_payment < 0:
            raise ValidationError("Debt values cannot be negative.")
        deferred_interest_enabled = bool(row.get("deferred_interest_enabled", False))
        deferred_interest_date = str(row.get("deferred_interest_date", "")).strip()
        deferred_interest_rate = _parse_float(row, "deferred_interest_rate", default=apr)
        if deferred_interest_enabled and not deferred_interest_date:
            raise ValidationError("Deferred interest date is required when deferred interest is enabled.")
        if deferred_interest_enabled:
            datetime.strptime(deferred_interest_date, "%Y-%m-%d")
        debts.append(
            DebtItem(
                name=str(row.get("name", "Debt")).strip() or "Debt",
                balance=balance,
                annual_interest_rate=apr,
                minimum_payment=minimum_payment,
                strategy_weight=0.0,
                deferred_interest_enabled=deferred_interest_enabled,
                deferred_interest_date=deferred_interest_date,
                deferred_interest_rate=deferred_interest_rate,
            )
        )
    return debts, monthly_budget, strategy


def calculate_debt_paydown(debts: list[DebtItem], monthly_budget: float, strategy: str) -> dict:
    horizon_months = 360
    now = datetime.utcnow()
    balances = [debt.balance for debt in debts]
    payoff_order: list[str] = []
    monthly_totals: list[float] = []
    allocations_timeline: list[dict] = []
    total_interest_paid = 0.0

    def ranking_key(index: int) -> tuple[float, float]:
        debt = debts[index]
        if strategy == "snowball":
            return (balances[index], -debt.annual_interest_rate)
        return (-debt.annual_interest_rate, balances[index])

    for month_index in range(horizon_months):
        if all(balance <= 0.01 for balance in balances):
            break

        monthly_payments = [0.0 for _ in debts]
        remaining_budget = monthly_budget
        active_indices = [i for i, balance in enumerate(balances) if balance > 0.01]

        for i in active_indices:
            minimum = min(debts[i].minimum_payment, balances[i])
            monthly_payments[i] += minimum
            balances[i] -= minimum
            remaining_budget -= minimum

        remaining_budget = max(remaining_budget, 0.0)
        sorted_indices = sorted(active_indices, key=ranking_key)
        for i in sorted_indices:
            if remaining_budget <= 0 or balances[i] <= 0.01:
                continue
            extra = min(remaining_budget, balances[i])
            monthly_payments[i] += extra
            balances[i] -= extra
            remaining_budget -= extra

        for i in active_indices:
            debt = debts[i]
            if balances[i] <= 0:
                balances[i] = 0
                if debt.name not in payoff_order:
                    payoff_order.append(debt.name)
                continue
            monthly_rate = _to_decimal(debt.annual_interest_rate) / 12
            interest_charge = balances[i] * monthly_rate
            total_interest_paid += interest_charge
            balances[i] += interest_charge
            if debt.deferred_interest_enabled:
                cliff_date = datetime.strptime(debt.deferred_interest_date, "%Y-%m-%d")
                year = now.year + ((now.month - 1 + month_index) // 12)
                month = ((now.month - 1 + month_index) % 12) + 1
                check_date = datetime(year=year, month=month, day=1)
                if check_date.year == cliff_date.year and check_date.month == cliff_date.month and balances[i] > 0:
                    deferred_monthly_rate = _to_decimal(debt.deferred_interest_rate) / 12
                    deferred_penalty = balances[i] * deferred_monthly_rate * max(month_index, 1)
                    total_interest_paid += deferred_penalty
                    balances[i] += deferred_penalty

        monthly_totals.append(sum(monthly_payments))
        allocations_timeline.append(
            {
                "month": month_index + 1,
                "total_payment": sum(monthly_payments),
                "payments": [
                    {
                        "name": debts[i].name,
                        "payment": monthly_payments[i],
                        "remaining_balance": balances[i],
                    }
                    for i in range(len(debts))
                ],
            }
        )

    ranked_debts = []
    for idx in sorted(range(len(debts)), key=ranking_key):
        ranked_debts.append(
            {
                "name": debts[idx].name,
                "starting_balance": debts[idx].balance,
                "apr": debts[idx].annual_interest_rate,
                "minimum_payment": debts[idx].minimum_payment,
                "deferred_interest_enabled": debts[idx].deferred_interest_enabled,
                "deferred_interest_date": debts[idx].deferred_interest_date,
            }
        )

    return {
        "strategy": strategy,
        "ranked_order": ranked_debts,
        "payoff_order": payoff_order,
        "allocations_timeline": allocations_timeline,
        "monthly_totals": monthly_totals,
        "max_horizon_months": len(monthly_totals),
        "total_interest_paid": total_interest_paid,
        "months_to_debt_free": len(monthly_totals),
    }


@app.route("/", methods=["GET"])
def index() -> str:
    rendered = render_template("index.html")
    return _dedupe_header_block(rendered)


@app.route("/apps/retirement", methods=["GET"])
def retirement_app() -> str:
    return render_template("retirement.html")


@app.route("/apps/emergency-fund", methods=["GET"])
def emergency_fund_app() -> str:
    return render_template("emergency_fund.html")


@app.route("/apps/debt-tracker", methods=["GET"])
def debt_tracker_app() -> str:
    return render_template("debt_tracker.html")


@app.route("/api/retirement/calculate", methods=["POST"])
@app.route("/calculate", methods=["POST"])
def calculate_retirement() -> tuple:
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


@app.route("/api/emergency-fund/calculate", methods=["POST"])
def emergency_fund_calculate() -> tuple:
    payload = request.get_json(silent=True) or {}
    try:
        (
            expenses,
            current_fund_amount,
            monthly_contribution_amount,
            contribution_months,
            current_target_coverage_months,
        ) = parse_emergency_fund_inputs(payload)
        result = calculate_emergency_fund(
            expenses,
            current_fund_amount,
            monthly_contribution_amount,
            contribution_months,
            current_target_coverage_months,
        )
    except ValidationError as exc:
        return jsonify({"error": str(exc)}), 400

    return jsonify(result), 200


@app.route("/api/debt-tracker/calculate", methods=["POST"])
def debt_tracker_calculate() -> tuple:
    payload = request.get_json(silent=True) or {}
    try:
        debts, monthly_budget, strategy = parse_debt_inputs(payload)
        result = calculate_debt_paydown(debts, monthly_budget, strategy)
    except (ValidationError, ValueError) as exc:
        return jsonify({"error": str(exc)}), 400
    return jsonify(result), 200


if __name__ == "__main__":
    app.run(debug=True)
