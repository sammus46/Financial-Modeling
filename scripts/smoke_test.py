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

        emergency_payload = {
            "current_fund_amount": "5000",
            "expenses": [
                {
                    "enabled": True,
                    "expense_class": "Weekly Necessities",
                    "name": "Groceries",
                    "weekly_amount": "200",
                    "monthly_amount": "900",
                    "notes": "",
                },
                {
                    "enabled": True,
                    "expense_class": "Financial Obligations",
                    "name": "Rent",
                    "weekly_amount": "500",
                    "monthly_amount": "2000",
                    "notes": "",
                },
            ],
        }
        emergency_response = client.post("/api/emergency-fund/calculate", json=emergency_payload)
        assert_ok(emergency_response.status_code == 200, "POST /api/emergency-fund/calculate should return 200")
        emergency_data = emergency_response.get_json() or {}
        assert_ok("projections" in emergency_data, "emergency response should contain projections")
        assert_ok(len(emergency_data.get("projections", [])) == 4, "emergency response should include 3/6/9/12 month projections")

    print("Smoke test passed: dashboard + retirement + emergency fund endpoints are healthy.")


if __name__ == "__main__":
    try:
        run()
    except AssertionError as exc:
        print(f"Smoke test failed: {exc}")
        sys.exit(1)
