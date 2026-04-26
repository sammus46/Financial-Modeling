#!/usr/bin/env python3
"""Stress tests for user input handling on /calculate."""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app import app


def build_base_payload() -> dict[str, Any]:
    return {
        "current_age": "30",
        "retirement_age": "65",
        "traditional_assets": "$50,000",
        "roth_assets": "$25,000",
        "brokerage_assets": "$10,000",
        "annual_income": "$120,000",
        "salary_growth_rate": "3",
        "contribution_mode": "percent",
        "savings_rate": "20",
        "fixed_annual_contribution": "0",
        "inflation_rate": "2.5",
        "traditional_return_rate": "10",
        "roth_return_rate": "10",
        "brokerage_return_rate": "10",
        "retirement_spend_rate": "70",
        "desired_swr": "4",
        "traditional_retirement_tax_rate": "22",
        "brokerage_retirement_tax_rate": "15",
    }


def expect_status(client, payload: dict[str, Any], expected: int, label: str) -> None:
    response = client.post("/calculate", json=payload)
    if response.status_code != expected:
        raise AssertionError(f"{label}: expected {expected}, got {response.status_code}")


def run() -> None:
    with app.test_client() as client:
        # Baseline should remain healthy.
        expect_status(client, build_base_payload(), 200, "baseline")

        # Stress/abuse cases should fail validation (400) rather than trigger 500.
        huge_horizon = build_base_payload()
        huge_horizon["retirement_age"] = "1000000"
        expect_status(client, huge_horizon, 400, "huge retirement horizon")

        zero_swr = build_base_payload()
        zero_swr["desired_swr"] = "0"
        expect_status(client, zero_swr, 400, "zero desired swr")

        too_old_current_age = build_base_payload()
        too_old_current_age["current_age"] = "121"
        expect_status(client, too_old_current_age, 400, "current age upper bound")

        too_old_retirement_age = build_base_payload()
        too_old_retirement_age["retirement_age"] = "131"
        expect_status(client, too_old_retirement_age, 400, "retirement age upper bound")

    print("Stress test passed: malformed/extreme inputs are rejected with 400 responses.")


if __name__ == "__main__":
    run()
