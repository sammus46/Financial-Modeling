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
        self.assertIn("goals.js?v=", html)

    def test_dashboard_links_to_goal_tracker(self):
        with app.test_client() as client:
            response = client.get("/")

        self.assertIn('/apps/goals', response.get_data(as_text=True))
