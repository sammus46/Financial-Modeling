from __future__ import annotations

from dataclasses import dataclass
from math import isclose
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app import DebtItem, EmergencyExpense, calculate_debt_paydown, calculate_emergency_fund


def almost_equal(a: float, b: float, tol: float = 1e-6) -> bool:
    return isclose(a, b, rel_tol=tol, abs_tol=tol)


def run_emergency_fund_doe() -> list[str]:
    logs: list[str] = []

    # Scenario 1: mixed frequencies and active contribution horizon
    expenses = [
        EmergencyExpense("core", "Rent", 0, 1800, "monthly", None, "", True),
        EmergencyExpense("core", "Groceries", 0, 600, "monthly", None, "", True),
        EmergencyExpense("core", "Fuel", 100, 0, "weekly", None, "", True),
        EmergencyExpense("core", "Insurance", 0, 1200, "annual", None, "", True),
    ]
    result = calculate_emergency_fund(expenses, 5000, 500, 12, 6)

    expected_monthly = 1800 + 600 + (100 * 52 / 12) + (1200 / 12)
    expected_weekly = expected_monthly * 12 / 52
    expected_cov = 5000 / expected_monthly
    expected_proj_12 = 5000 + 500 * 12
    expected_proj_24 = 5000 + 500 * 12  # capped at contribution_months

    assert almost_equal(result["total_monthly"], expected_monthly)
    assert almost_equal(result["total_weekly"], expected_weekly)
    assert almost_equal(result["coverage_months"], expected_cov)
    proj12 = next(p for p in result["projections"] if p["months"] == 12)
    proj24 = next(p for p in result["projections"] if p["months"] == 24)
    assert almost_equal(proj12["projected_fund"], expected_proj_12)
    assert almost_equal(proj24["projected_fund"], expected_proj_24)
    logs.append("Emergency scenario 1 PASS")

    # Scenario 2: already above target -> excellent
    expenses2 = [EmergencyExpense("core", "Base", 0, 2000, "monthly", None, "", True)]
    result2 = calculate_emergency_fund(expenses2, 20000, 0, 0, 6)
    assert result2["health_status"] == "Above Target (Excellent)"
    assert almost_equal(result2["coverage_months"], 10.0)
    logs.append("Emergency scenario 2 PASS")

    return logs


@dataclass
class DebtScenario:
    name: str
    debts: list[DebtItem]
    budget: float
    strategy: str
    expected_months: int
    expected_payoff_order: list[str]


def run_debt_doe() -> list[str]:
    logs: list[str] = []

    scenario1 = DebtScenario(
        name="single_no_interest",
        debts=[DebtItem("Loan", 1000, 0, 100, 0, False, "", 0)],
        budget=200,
        strategy="avalanche",
        expected_months=5,
        expected_payoff_order=["Loan"],
    )

    scenario2 = DebtScenario(
        name="avalanche_order",
        debts=[
            DebtItem("A", 500, 20, 50, 0, False, "", 20),
            DebtItem("B", 500, 5, 50, 0, False, "", 5),
        ],
        budget=200,
        strategy="avalanche",
        expected_months=6,
        expected_payoff_order=["A", "B"],
    )

    scenario3 = DebtScenario(
        name="snowball_order",
        debts=[
            DebtItem("BigHighAPR", 900, 25, 50, 0, False, "", 25),
            DebtItem("SmallLowAPR", 300, 5, 50, 0, False, "", 5),
        ],
        budget=200,
        strategy="snowball",
        expected_months=7,
        expected_payoff_order=["SmallLowAPR", "BigHighAPR"],
    )

    for sc in [scenario1, scenario2, scenario3]:
        result = calculate_debt_paydown(sc.debts, sc.budget, sc.strategy)
        assert result["months_to_debt_free"] == sc.expected_months, (
            sc.name,
            result["months_to_debt_free"],
            sc.expected_months,
        )
        assert result["payoff_order"] == sc.expected_payoff_order, (
            sc.name,
            result["payoff_order"],
            sc.expected_payoff_order,
        )
        logs.append(
            f"Debt {sc.name} PASS months={result['months_to_debt_free']} payoff={result['payoff_order']}"
        )

    return logs


if __name__ == "__main__":
    lines: list[str] = []
    lines.extend(run_emergency_fund_doe())
    lines.extend(run_debt_doe())
    print("DOE validation complete")
    for line in lines:
        print(f"- {line}")
