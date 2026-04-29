import unittest

from app import ValidationError, parse_inputs, app


class ExceptionHandlingTests(unittest.TestCase):
    def test_parse_inputs_raises_validation_error_with_context(self):
        with self.assertRaises(ValidationError) as ctx:
            parse_inputs({"current_age": "abc", "retirement_age": 65, "contribution_mode": "percent", "annual_income": 100000, "salary_growth_rate": 3, "inflation_rate": 2, "traditional_return_rate": 7, "roth_return_rate": 7, "brokerage_return_rate": 7, "retirement_spend_rate": 60, "desired_swr": 4, "traditional_retirement_tax_rate": 20, "brokerage_retirement_tax_rate": 15, "symbol": "AAPL", "start_date": "2026-01-01", "end_date": "2026-12-31", "model_id": "ret-v1", "input_source": "unit-test"})

        message = str(ctx.exception)
        self.assertIn("Invalid value in retirement payload", message)
        self.assertIn("symbol=AAPL", message)
        self.assertIn("date_range=2026-01-01->2026-12-31", message)
        self.assertIn("model_id=ret-v1", message)
        self.assertIn("input_source=unit-test", message)

    def test_retirement_api_missing_field_returns_contextual_message(self):
        client = app.test_client()
        payload = {
            "current_age": 30,
            "symbol": "MSFT",
            "start_date": "2026-01-01",
            "end_date": "2026-06-30",
            "model_id": "ret-v2",
            "input_source": "api-test",
        }
        resp = client.post("/api/retirement/calculate", json=payload)
        self.assertEqual(resp.status_code, 400)
        error = resp.get_json()["error"]
        self.assertIn("Missing required field", error)
        self.assertIn("symbol=MSFT", error)
        self.assertIn("model_id=ret-v2", error)


if __name__ == "__main__":
    unittest.main()
