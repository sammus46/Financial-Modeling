import unittest

from app import app


class DeterminismTests(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()
        self.base_payload = {
            "current_age": 30,
            "retirement_age": 65,
            "contribution_mode": "percent",
            "traditional_assets": 50000,
            "roth_assets": 25000,
            "brokerage_assets": 10000,
            "annual_income": 120000,
            "salary_growth_rate": 3,
            "savings_rate": 15,
            "fixed_annual_contribution": 0,
            "traditional_contribution_pct": 50,
            "roth_contribution_pct": 30,
            "brokerage_contribution_pct": 20,
            "inflation_rate": 2,
            "traditional_return_rate": 7,
            "roth_return_rate": 7,
            "brokerage_return_rate": 6,
            "retirement_spend_rate": 60,
            "desired_swr": 4,
            "traditional_retirement_tax_rate": 22,
            "brokerage_retirement_tax_rate": 15,
            "enable_monte_carlo": True,
            "monte_carlo_trials": 250,
            "monte_carlo_return_stddev": 10,
            "monte_carlo_inflation_stddev": 1,
        }

    def _run_retirement(self, **overrides):
        payload = dict(self.base_payload)
        payload.update(overrides)
        resp = self.client.post("/api/retirement/calculate", json=payload)
        self.assertEqual(resp.status_code, 200)
        return resp.get_json()

    def test_pipeline_is_deterministic_with_default_seed(self):
        runs = [self._run_retirement() for _ in range(3)]
        self.assertEqual(runs[0], runs[1])
        self.assertEqual(runs[1], runs[2])

    def test_pipeline_is_deterministic_with_explicit_seed(self):
        runs = [self._run_retirement(monte_carlo_seed=777) for _ in range(3)]
        self.assertEqual(runs[0], runs[1])
        self.assertEqual(runs[1], runs[2])

    def test_different_seeds_produce_different_monte_carlo_metrics(self):
        a = self._run_retirement(monte_carlo_seed=777)["monte_carlo"]
        b = self._run_retirement(monte_carlo_seed=778)["monte_carlo"]
        self.assertNotEqual(a["ending_values"], b["ending_values"])


if __name__ == "__main__":
    unittest.main()
