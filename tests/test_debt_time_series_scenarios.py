import copy
import unittest

from app import ValidationError, calculate_debt_paydown, parse_debt_inputs


class DebtTimelineScenarioTests(unittest.TestCase):
    """Scenario coverage for debt timeline ingestion and paydown stability."""

    def setUp(self):
        self.base_payload = {
            "monthly_budget": 1200,
            "strategy": "avalanche",
            "debts": [
                {
                    "name": "Card A",
                    "balance": 2000,
                    "annual_interest_rate": 19.9,
                    "minimum_payment": 75,
                    "deferred_interest_enabled": True,
                    "deferred_interest_date": "2026-10-01",
                },
                {
                    "name": "Card B",
                    "balance": 3500,
                    "annual_interest_rate": 24.9,
                    "minimum_payment": 125,
                    "deferred_interest_enabled": True,
                    "deferred_interest_date": "2026-12-01",
                },
            ],
        }

    def _payload(self):
        return copy.deepcopy(self.base_payload)

    def test_parameterized_dataset_size_and_volatility_shapes(self):
        """Expected behavior: parser should reject empty datasets and accept minimal/single-row datasets across calm and volatile APR profiles."""
        scenarios = [
            {"name": "empty dataset", "debts": [], "expect_error": "at least one debt"},
            {"name": "one-row minimal lookback", "debts": [self._payload()["debts"][0]], "expect_count": 1},
            {
                "name": "minimal lookback with constant APR",
                "debts": [
                    {
                        "name": "Fixed",
                        "balance": 1000,
                        "annual_interest_rate": 10,
                        "minimum_payment": 50,
                        "deferred_interest_enabled": True,
                        "deferred_interest_date": "2026-10-01",
                    },
                    {
                        "name": "Fixed2",
                        "balance": 2000,
                        "annual_interest_rate": 10,
                        "minimum_payment": 60,
                        "deferred_interest_enabled": True,
                        "deferred_interest_date": "2026-10-01",
                    },
                ],
                "expect_count": 2,
            },
            {
                "name": "high-volatility APR spikes",
                "debts": [
                    {
                        "name": "Promo",
                        "balance": 1500,
                        "annual_interest_rate": 0.0,
                        "minimum_payment": 35,
                        "deferred_interest_enabled": True,
                        "deferred_interest_date": "2026-10-01",
                        "deferred_interest_rate": 29.99,
                    },
                    {
                        "name": "Penalty",
                        "balance": 1700,
                        "annual_interest_rate": 34.99,
                        "minimum_payment": 40,
                        "deferred_interest_enabled": True,
                        "deferred_interest_date": "2026-11-01",
                    },
                ],
                "expect_count": 2,
            },
        ]
        for scenario in scenarios:
            with self.subTest(scenario=scenario["name"]):
                payload = self._payload()
                payload["debts"] = scenario["debts"]
                if "expect_error" in scenario:
                    with self.assertRaisesRegex(ValidationError, scenario["expect_error"]):
                        parse_debt_inputs(payload)
                else:
                    debts, _, _ = parse_debt_inputs(payload)
                    self.assertEqual(len(debts), scenario["expect_count"])

    def test_parameterized_timestamp_integrity(self):
        """Expected behavior: monotonic or duplicated deferred dates are accepted, while out-of-order records and malformed date intervals fail fast with explicit errors."""
        scenarios = [
            {
                "name": "duplicated timestamps accepted",
                "dates": ["2026-10-01", "2026-10-01"],
                "should_pass": True,
            },
            {
                "name": "missing interval with wide gap accepted",
                "dates": ["2026-10-01", "2027-10-01"],
                "should_pass": True,
            },
            {
                "name": "out-of-order records rejected",
                "dates": ["2026-12-01", "2026-10-01"],
                "should_pass": False,
                "error": "monotonic",
            },
            {
                "name": "bad timestamp format rejected",
                "dates": ["2026-10-01", "10/01/2026"],
                "should_pass": False,
                "error": "does not match format",
            },
        ]

        for scenario in scenarios:
            with self.subTest(scenario=scenario["name"]):
                payload = self._payload()
                for idx, dt in enumerate(scenario["dates"]):
                    payload["debts"][idx]["deferred_interest_date"] = dt
                if scenario["should_pass"]:
                    debts, _, _ = parse_debt_inputs(payload)
                    self.assertEqual(len(debts), 2)
                else:
                    with self.assertRaisesRegex(Exception, scenario["error"]):
                        parse_debt_inputs(payload)

    def test_parameterized_extreme_numeric_values_and_no_silent_coercion(self):
        """Expected behavior: very large finite values remain computable, negatives are rejected, and non-numeric object-like inputs are not silently coerced."""
        scenarios = [
            {
                "name": "very large balances",
                "balance": 1e15,
                "apr": 99.99,
                "minimum_payment": 1e12,
                "passes": True,
            },
            {
                "name": "tiny positive balances",
                "balance": 1e-9,
                "apr": 0.01,
                "minimum_payment": 1e-10,
                "passes": True,
            },
            {
                "name": "zero values where possible",
                "balance": 0.0,
                "apr": 0.0,
                "minimum_payment": 0.0,
                "passes": True,
            },
            {"name": "negative balance rejected", "balance": -1.0, "apr": 5.0, "minimum_payment": 1.0, "passes": False},
            {
                "name": "object-like dtype leak rejected",
                "balance": {"not": "numeric"},
                "apr": 5.0,
                "minimum_payment": 1.0,
                "passes": False,
            },
        ]
        for scenario in scenarios:
            with self.subTest(scenario=scenario["name"]):
                payload = self._payload()
                payload["debts"][0]["balance"] = scenario["balance"]
                payload["debts"][0]["annual_interest_rate"] = scenario["apr"]
                payload["debts"][0]["minimum_payment"] = scenario["minimum_payment"]
                if scenario["passes"]:
                    debts, budget, strategy = parse_debt_inputs(payload)
                    results = calculate_debt_paydown(debts, budget, strategy)
                    self.assertGreaterEqual(results["months_to_debt_free"], 0)
                    self.assertTrue(all(isinstance(x, (int, float)) for x in results["monthly_totals"]))
                else:
                    with self.assertRaises(Exception):
                        parse_debt_inputs(payload)

    def test_regime_shift_gap_and_sparse_liquidity_scenarios(self):
        """Expected behavior: bull→crash→recovery-like debt mix and sparse-liquidity budgets should still produce finite deterministic schedules."""
        payload = self._payload()
        payload["debts"] = [
            {
                "name": "Bull",
                "balance": 5000,
                "annual_interest_rate": 3.5,
                "minimum_payment": 40,
                "deferred_interest_enabled": True,
                "deferred_interest_date": "2026-08-01",
            },
            {
                "name": "Crash",
                "balance": 9000,
                "annual_interest_rate": 34.5,
                "minimum_payment": 90,
                "deferred_interest_enabled": True,
                "deferred_interest_date": "2026-12-01",
            },
            {
                "name": "Recovery",
                "balance": 4000,
                "annual_interest_rate": 8.0,
                "minimum_payment": 35,
                "deferred_interest_enabled": True,
                "deferred_interest_date": "2027-06-01",
            },
        ]
        payload["monthly_budget"] = 300  # sparse liquidity vs minimum payments
        debts, budget, strategy = parse_debt_inputs(payload)
        out_a = calculate_debt_paydown(debts, budget, strategy)
        out_b = calculate_debt_paydown(debts, budget, strategy)
        self.assertEqual(out_a["months_to_debt_free"], out_b["months_to_debt_free"])
        self.assertTrue(all(abs(v) < 1e20 for v in out_a["interest_paid_over_time"]))

    def test_corporate_action_like_discontinuities(self):
        """Expected behavior: split/dividend-like principal jumps introduced as separate debts should not break payoff ordering or numeric stability."""
        payload = self._payload()
        payload["debts"].append(
            {
                "name": "Split-Like Jump",
                "balance": 700,
                "annual_interest_rate": 0.0,
                "minimum_payment": 10,
                "deferred_interest_enabled": True,
                "deferred_interest_date": "2027-01-01",
                "deferred_interest_rate": 29.99,
            }
        )
        debts, budget, strategy = parse_debt_inputs(payload)
        result = calculate_debt_paydown(debts, budget, strategy)
        self.assertIsInstance(result["payoff_order"], list)
        self.assertEqual(len(result["monthly_totals"]), result["months_to_debt_free"])


if __name__ == "__main__":
    unittest.main()
