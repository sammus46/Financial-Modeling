import unittest

from app import app


class IngestionContractTests(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()

    def test_retirement_missing_required_field_fails_fast(self):
        resp = self.client.post("/api/retirement/calculate", json={"current_age": 30})
        self.assertEqual(resp.status_code, 400)
        self.assertIn("payload.retirement_age", resp.get_json()["error"])

    def test_retirement_non_finite_value_rejected(self):
        payload = {
            "current_age": 30,
            "retirement_age": 65,
            "contribution_mode": "percent",
            "annual_income": "NaN",
            "salary_growth_rate": 3,
            "inflation_rate": 2,
            "traditional_return_rate": 7,
            "roth_return_rate": 7,
            "brokerage_return_rate": 7,
            "retirement_spend_rate": 60,
            "desired_swr": 4,
            "traditional_retirement_tax_rate": 20,
            "brokerage_retirement_tax_rate": 15,
            "savings_rate": 10,
            "fixed_annual_contribution": 0,
        }
        resp = self.client.post("/api/retirement/calculate", json=payload)
        self.assertEqual(resp.status_code, 400)
        self.assertIn("finite", resp.get_json()["error"])

    def test_emergency_partial_record_rejected(self):
        payload = {"expenses": [{"name": "Rent"}]}
        resp = self.client.post("/api/emergency-fund/calculate", json=payload)
        self.assertEqual(resp.status_code, 400)
        self.assertIn("payload.expenses[0].frequency", resp.get_json()["error"])

    def test_debt_negative_value_rejected_with_path(self):
        payload = {
            "monthly_budget": 1000,
            "strategy": "avalanche",
            "debts": [{"name": "Card", "balance": -100, "annual_interest_rate": 20, "minimum_payment": 25}],
        }
        resp = self.client.post("/api/debt-tracker/calculate", json=payload)
        self.assertEqual(resp.status_code, 400)
        self.assertIn("payload.debts[0]", resp.get_json()["error"])

    def test_debt_non_monotonic_deferred_dates_rejected(self):
        payload = {
            "monthly_budget": 1000,
            "strategy": "avalanche",
            "debts": [
                {
                    "name": "Card A",
                    "balance": 500,
                    "annual_interest_rate": 20,
                    "minimum_payment": 25,
                    "deferred_interest_enabled": True,
                    "deferred_interest_date": "2026-12-01",
                },
                {
                    "name": "Card B",
                    "balance": 300,
                    "annual_interest_rate": 15,
                    "minimum_payment": 20,
                    "deferred_interest_enabled": True,
                    "deferred_interest_date": "2026-10-01",
                },
            ],
        }
        resp = self.client.post("/api/debt-tracker/calculate", json=payload)
        self.assertEqual(resp.status_code, 400)
        self.assertIn("monotonic", resp.get_json()["error"])


if __name__ == "__main__":
    unittest.main()
