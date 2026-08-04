import unittest
from pathlib import Path

from app import app


class GoalsPageTests(unittest.TestCase):
    def test_goals_page_contains_persistent_tracker_ui(self):
        with app.test_client() as client:
            response = client.get("/apps/goals")

        html = response.get_data(as_text=True)
        self.assertEqual(response.status_code, 200)
        self.assertIn('id="goal-form"', html)
        self.assertIn("novalidate", html)
        self.assertIn('id="goals-list"', html)
        self.assertIn('id="goals-total-current"', html)
        self.assertIn('id="goals-total-target"', html)
        self.assertIn('id="goals-remaining-gap"', html)
        self.assertIn('id="goals-completed-count"', html)
        self.assertIn('id="goal-form-message"', html)
        self.assertIn('role="alert"', html)
        self.assertIn('inputmode="decimal" placeholder="$25,000"', html)
        self.assertIn('inputmode="decimal" placeholder="$100,000"', html)
        self.assertIn("goals.js?v=", html)

    def test_dashboard_links_to_goal_tracker_without_top_tabs(self):
        with app.test_client() as client:
            response = client.get("/")

        html = response.get_data(as_text=True)
        self.assertIn('/apps/goals', html)
        self.assertNotIn('dashboard-tabs', html)
        self.assertNotIn('aria-label="Main navigation"', html)

    def test_tool_navs_include_all_available_tools(self):
        routes = [
            "/apps/retirement",
            "/apps/emergency-fund",
            "/apps/debt-tracker",
            "/apps/net-worth-tracker",
            "/apps/goals",
        ]
        expected_links = [
            "/apps/retirement",
            "/apps/emergency-fund",
            "/apps/debt-tracker",
            "/apps/net-worth-tracker",
            "/apps/goals",
        ]

        with app.test_client() as client:
            for route in routes:
                with self.subTest(route=route):
                    html = client.get(route).get_data(as_text=True)
                    self.assertIn('class="tool-nav"', html)
                    for link in expected_links:
                        self.assertIn(link, html)

    def test_goal_currency_inputs_format_while_typing(self):
        goals_js = Path("static/goals.js").read_text(encoding="utf-8")

        self.assertIn("formatCurrencyInputWhileTyping", goals_js)
        self.assertIn('input.addEventListener("input"', goals_js)
        self.assertNotIn("String(parseCurrency(input.value) || \"\")", goals_js)

    def test_goal_cards_include_status_and_remaining_gap_ui(self):
        goals_js = Path("static/goals.js").read_text(encoding="utf-8")

        self.assertIn("statusFor(goal)", goals_js)
        for label in ["Not started", "In progress", "Almost there", "Complete"]:
            self.assertIn(label, goals_js)
        self.assertIn("goal-card-metrics", goals_js)
        self.assertIn("<dt>Remaining</dt>", goals_js)
        self.assertIn("goals-remaining-gap", goals_js)
