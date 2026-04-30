import os
import re
import unittest
from pathlib import Path
from unittest.mock import patch

import app as app_module

REPO_ROOT = Path(__file__).resolve().parents[1]

# High-signal checks for committed secrets and insecure defaults.
FORBIDDEN_PATTERNS = [
    re.compile(r"AKIA[0-9A-Z]{16}"),  # AWS access key id
    re.compile(r"ASIA[0-9A-Z]{16}"),
    re.compile(r"ghp_[A-Za-z0-9]{36}"),  # GitHub personal access token
    re.compile(r"xox[baprs]-[A-Za-z0-9-]{10,}"),  # Slack tokens
    re.compile(r"-----BEGIN (?:RSA|EC|OPENSSH|DSA|PRIVATE) KEY-----"),
    re.compile(r"(?i)(api[_-]?key|secret|token|password)\s*[:=]\s*['\"][^'\"\n]{12,}['\"]"),
]

SKIP_DIRS = {".git", "__pycache__", ".pytest_cache", ".venv", "node_modules"}
SKIP_SUFFIXES = {".png", ".jpg", ".jpeg", ".gif", ".ico", ".pdf", ".svg"}


class SecurityGuardTests(unittest.TestCase):
    def test_repo_has_no_obvious_hardcoded_secrets(self):
        findings = []
        for path in REPO_ROOT.rglob("*"):
            if any(part in SKIP_DIRS for part in path.parts):
                continue
            if not path.is_file() or path.suffix.lower() in SKIP_SUFFIXES:
                continue
            text = path.read_text(encoding="utf-8", errors="ignore")
            for pattern in FORBIDDEN_PATTERNS:
                if pattern.search(text):
                    findings.append(f"{path.relative_to(REPO_ROOT)} matches {pattern.pattern}")

        self.assertFalse(findings, f"Potential secrets detected: {findings}")

    def test_runtime_config_defaults_are_safe(self):
        with patch.dict(os.environ, {}, clear=True):
            config = app_module.load_runtime_config()

        self.assertFalse(config.debug)
        self.assertFalse(config.testing)
        self.assertEqual(config.secret_key, "dev-insecure-key")

    def test_runtime_config_rejects_production_without_secret_key(self):
        env = {"FLASK_ENV": "production"}
        with patch.dict(os.environ, env, clear=True):
            with self.assertRaises(ValueError):
                app_module.load_runtime_config()


    def test_runtime_config_rejects_blank_production_secret_key(self):
        for secret in ("", "   ", "\n\t"):
            env = {"FLASK_ENV": "production", "SECRET_KEY": secret}
            with patch.dict(os.environ, env, clear=True):
                with self.assertRaises(ValueError):
                    app_module.load_runtime_config()


if __name__ == "__main__":
    unittest.main()
