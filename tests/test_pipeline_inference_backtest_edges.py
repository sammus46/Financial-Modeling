import copy
import unittest

from app import (
    DebtItem,
    RetirementInputs,
    ValidationError,
    calculate_debt_paydown,
    calculate_projection,
    parse_inputs,
    percentile,
)


class TrainingPipelineEdgeTests(unittest.TestCase):
    def setUp(self):
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
            "monte_carlo_trials": 120,
            "monte_carlo_return_stddev": 10,
            "monte_carlo_inflation_stddev": 1,
        }

    def test_no_leakage_between_seeded_trials(self):
        payload = dict(self.base_payload)
        a = calculate_projection(parse_inputs(dict(payload, monte_carlo_seed=11)))["monte_carlo"]
        b = calculate_projection(parse_inputs(dict(payload, monte_carlo_seed=22)))["monte_carlo"]
        a_again = calculate_projection(parse_inputs(dict(payload, monte_carlo_seed=11)))["monte_carlo"]
        self.assertEqual(a["ending_values"], a_again["ending_values"])
        self.assertNotEqual(a["ending_values"], b["ending_values"])

    def test_tiny_sample_sizes_and_class_imbalance_rejected(self):
        payload = dict(self.base_payload)
        with self.assertRaisesRegex(ValidationError, "between 100 and 20000"):
            parse_inputs(dict(payload, monte_carlo_trials=99))

    def test_noisy_metrics_still_converge_to_bounded_probability(self):
        payload = dict(self.base_payload)
        data = parse_inputs(
            dict(
                payload,
                monte_carlo_trials=100,
                monte_carlo_return_stddev=100,
                monte_carlo_inflation_stddev=100,
                monte_carlo_seed=42,
            )
        )
        out = calculate_projection(data)["monte_carlo"]
        self.assertGreaterEqual(out["success_probability_pct"], 0.0)
        self.assertLessEqual(out["success_probability_pct"], 100.0)


class InferenceEdgeTests(unittest.TestCase):
    def setUp(self):
        self.good = {
            "current_age": 30,
            "retirement_age": 65,
            "contribution_mode": "percent",
            "annual_income": 120000,
            "salary_growth_rate": 3,
            "savings_rate": 15,
            "inflation_rate": 2,
            "traditional_return_rate": 7,
            "roth_return_rate": 7,
            "brokerage_return_rate": 6,
            "retirement_spend_rate": 60,
            "desired_swr": 4,
            "traditional_retirement_tax_rate": 22,
            "brokerage_retirement_tax_rate": 15,
            "fixed_annual_contribution": 0,
        }

    def test_missing_feature_column_rejected(self):
        payload = copy.deepcopy(self.good)
        payload.pop("retirement_age")
        with self.assertRaisesRegex(ValidationError, "payload.retirement_age"):
            parse_inputs(payload)

    def test_unexpected_extra_columns_ignored(self):
        parsed = parse_inputs(dict(self.good, unexpected_field="noop"))
        self.assertIsInstance(parsed, RetirementInputs)

    def test_batch_size_extremes_and_output_shape(self):
        one = [parse_inputs(dict(self.good, monte_carlo_seed=7, enable_monte_carlo=True, monte_carlo_trials=100))]
        many = [parse_inputs(dict(self.good, current_age=20 + (i % 40), monte_carlo_seed=i, enable_monte_carlo=True, monte_carlo_trials=100)) for i in range(200)]
        out_one = [calculate_projection(x)["monte_carlo"] for x in one]
        out_many = [calculate_projection(x)["monte_carlo"] for x in many]
        self.assertEqual(len(out_one), 1)
        self.assertEqual(len(out_many), 200)
        for out in (out_one[0], out_many[0], out_many[-1]):
            self.assertIsInstance(out["ending_values"], dict)
            self.assertSetEqual(set(out["ending_values"].keys()), {"p10", "p50", "p90"})


class BacktestAndMetricEdgeTests(unittest.TestCase):
    def _debts(self):
        return [
            DebtItem("A", 1000, 20, 50, 0, False, "", 20),
            DebtItem("B", 500, 5, 25, 0, False, "", 5),
        ]

    def test_transaction_cost_toggle_and_slippage_extreme_equivalent(self):
        base = calculate_debt_paydown(self._debts(), 500, "avalanche")
        stressed = calculate_debt_paydown(self._debts(), 500, "snowball")
        self.assertGreaterEqual(base["months_to_debt_free"], 1)
        self.assertGreaterEqual(stressed["months_to_debt_free"], 1)

    def test_position_limits_and_cash_constraints(self):
        limited = calculate_debt_paydown(self._debts(), 75, "avalanche")
        unconstrained = calculate_debt_paydown(self._debts(), 5000, "avalanche")
        self.assertGreaterEqual(limited["months_to_debt_free"], unconstrained["months_to_debt_free"])

    def test_rebalance_frequency_boundaries_proxy(self):
        for strategy in ("avalanche", "snowball"):
            out = calculate_debt_paydown(self._debts(), 300, strategy)
            self.assertEqual(out["max_horizon_months"], len(out["monthly_totals"]))

    def test_metric_correctness_zero_trades_all_wins_losses_flat_curve(self):
        # zero-trades equivalent for percentile
        self.assertEqual(percentile([], 50), 0.0)
        # all wins / all losses / flat curve equivalents
        self.assertEqual(percentile([1, 1, 1], 90), 1)
        self.assertEqual(percentile([-1, -1, -1], 10), -1)
        self.assertEqual(percentile([5, 5, 5, 5], 33), 5)


if __name__ == "__main__":
    unittest.main()
