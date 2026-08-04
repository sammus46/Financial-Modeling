import unittest

from app import app


class GoalsPageTests(unittest.TestCase):
    def test_goals_page_contains_persistent_tracker_ui(self):
        with app.test_client() as client:
            response = client.get("/apps/goals")

        html = response.get_data(as_text=True)
        self.assertEqual(response.status_code, 200)
        self.assertIn('id="goal-form"', html)
        self.assertIn('id="goals-list"', html)
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
