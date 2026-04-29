#!/usr/bin/env python3
"""Lightweight smoke tests for dashboard + calculator endpoints."""

from __future__ import annotations

import sys
from typing import Any
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app import app


def assert_ok(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def build_base_payload() -> dict[str, Any]:
    return {
        "current_age": "30",
        "retirement_age": "65",
        "traditional_assets": "$50,000",
        "roth_assets": "$25,000",
        "brokerage_assets": "$10,000",
        "annual_income": "$120,000",
        "salary_growth_rate": "3",
        "inflation_rate": "2.5",
        "traditional_return_rate": "10",
        "roth_return_rate": "10",
        "brokerage_return_rate": "10",
        "retirement_spend_rate": "70",
        "desired_swr": "4",
        "traditional_retirement_tax_rate": "22",
        "brokerage_retirement_tax_rate": "15",
    }


def run() -> None:
    with app.test_client() as client:
        dashboard_response = client.get("/")
        assert_ok(dashboard_response.status_code == 200, "GET / should return 200")
        dashboard_html = dashboard_response.get_data(as_text=True)
        assert_ok("styles.css?v=" in dashboard_html, "dashboard should include cache-busted styles.css")

        retirement_page = client.get("/apps/retirement")
        assert_ok(retirement_page.status_code == 200, "GET /apps/retirement should return 200")
        retirement_html = retirement_page.get_data(as_text=True)
        assert_ok("retirement.js?v=" in retirement_html, "retirement page should include retirement.js")

        emergency_page = client.get("/apps/emergency-fund")
        assert_ok(emergency_page.status_code == 200, "GET /apps/emergency-fund should return 200")
        emergency_html = emergency_page.get_data(as_text=True)
        assert_ok("emergency_fund.js?v=" in emergency_html, "emergency page should include emergency_fund.js")

        debt_page = client.get("/apps/debt-tracker")
        assert_ok(debt_page.status_code == 200, "GET /apps/debt-tracker should return 200")
        debt_html = debt_page.get_data(as_text=True)
        assert_ok("debt_tracker.js?v=" in debt_html, "debt page should include debt_tracker.js")

        percent_payload = build_base_payload()
        percent_payload.update(
            {
                "contribution_mode": "percent",
                "savings_rate": "20",
                "fixed_annual_contribution": "0",
            }
        )
        percent_response = client.post("/api/retirement/calculate", json=percent_payload)
        assert_ok(percent_response.status_code == 200, "percent mode POST /api/retirement/calculate should return 200")
        percent_data = percent_response.get_json() or {}
        assert_ok("stats" in percent_data, "percent mode response should contain stats")
        assert_ok(len(percent_data.get("ages", [])) > 1, "percent mode response should contain projection ages")

        fixed_payload = build_base_payload()
        fixed_payload.update(
            {
                "contribution_mode": "fixed",
                "savings_rate": "0",
                "fixed_annual_contribution": "$15,000",
            }
        )
        fixed_response = client.post("/api/retirement/calculate", json=fixed_payload)
        assert_ok(fixed_response.status_code == 200, "fixed mode POST /api/retirement/calculate should return 200")
        fixed_data = fixed_response.get_json() or {}
        assert_ok("stats" in fixed_data, "fixed mode response should contain stats")
        assert_ok(len(fixed_data.get("post_tax_balances", [])) > 1, "fixed mode should contain balances")

        monte_payload = build_base_payload()
        monte_payload.update(
            {
                "contribution_mode": "percent",
                "savings_rate": "20",
                "fixed_annual_contribution": "0",
                "enable_monte_carlo": True,
                "monte_carlo_trials": 1000,
            }
        )
        monte_response = client.post("/api/retirement/calculate", json=monte_payload)
        assert_ok(monte_response.status_code == 200, "Monte Carlo retirement request should return 200")
        monte_data = monte_response.get_json() or {}
        assert_ok("monte_carlo" in monte_data, "Monte Carlo response should include monte_carlo payload")

        bool_string_payload = build_base_payload()
        bool_string_payload.update(
            {
                "contribution_mode": "percent",
                "savings_rate": "20",
                "fixed_annual_contribution": "0",
                "enable_monte_carlo": "false",
                "enable_contribution_escalation": "false",
                "enable_glidepath": "false",
            }
        )
        bool_string_response = client.post("/api/retirement/calculate", json=bool_string_payload)
        assert_ok(bool_string_response.status_code == 200, "String boolean flags should be parsed correctly")

        emergency_payload = {
            "current_fund_amount": "5000",
            "expenses": [
                {
                    "enabled": True,
                    "expense_class": "Weekly Necessities",
                    "name": "Groceries",
                    "frequency": "weekly",
                    "weekly_amount": "200",
                    "monthly_amount": "900",
                    "notes": "",
                },
                {
                    "enabled": True,
                    "expense_class": "Financial Obligations",
                    "name": "Rent",
                    "frequency": "monthly",
                    "weekly_amount": "0",
                    "monthly_amount": "2000",
                    "notes": "",
                },
                {
                    "enabled": True,
                    "expense_class": "Irregular",
                    "name": "Annual membership",
                    "frequency": "annual",
                    "weekly_amount": "0",
                    "monthly_amount": "1200",
                    "irregular_month": "9",
                    "notes": "",
                },
            ],
        }
        emergency_response = client.post("/api/emergency-fund/calculate", json=emergency_payload)
        assert_ok(emergency_response.status_code == 200, "POST /api/emergency-fund/calculate should return 200")
        emergency_data = emergency_response.get_json() or {}
        assert_ok("projections" in emergency_data, "emergency response should contain projections")
        projections = emergency_data.get("projections", [])
        assert_ok(len(projections) == 8, "emergency response should include 3-month projections through 24 months")
        assert_ok(
            [item.get("months") for item in projections] == [3, 6, 9, 12, 15, 18, 21, 24],
            "emergency response projections should be 3..24 in 3-month increments",
        )

        debt_payload = {
            "strategy": "avalanche",
            "monthly_budget": "1500",
            "debts": [
                {
                    "name": "Credit Card A",
                    "balance": "3500",
                    "annual_interest_rate": "24.99",
                    "minimum_payment": "100",
                    "deferred_interest_enabled": False,
                },
                {
                    "name": "Store Promo Card",
                    "balance": "1200",
                    "annual_interest_rate": "19.99",
                    "minimum_payment": "35",
                    "deferred_interest_enabled": True,
                    "deferred_interest_date": "2026-12-01",
                    "deferred_interest_rate": "29.99",
                },
            ],
        }
        debt_response = client.post("/api/debt-tracker/calculate", json=debt_payload)
        assert_ok(debt_response.status_code == 200, "POST /api/debt-tracker/calculate should return 200")
        debt_data = debt_response.get_json() or {}
        assert_ok("ranked_order" in debt_data, "debt response should include ranked order")
        assert_ok("monthly_totals" in debt_data, "debt response should include monthly totals")
        assert_ok(debt_data.get("max_horizon_months", 0) > 0, "debt response should include a positive horizon")

    print("Smoke test passed: dashboard + retirement + emergency fund + debt tracker endpoints are healthy.")


if __name__ == "__main__":
    try:
        run()
    except AssertionError as exc:
        print(f"Smoke test failed: {exc}")
        sys.exit(1)
