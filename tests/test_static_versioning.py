import app as financial_app


def test_static_version_changes_when_tracked_asset_content_changes(tmp_path, monkeypatch):
    static_dir = tmp_path / "static"
    static_dir.mkdir()

    tracked_assets = {
        "styles.css": "body { color: black; }",
        "app.js": "console.log('app');",
        "retirement.js": "console.log('retirement');",
        "emergency_fund.js": "console.log('emergency');",
        "dashboard.js": "console.log('dashboard');",
        "debt_tracker.js": "console.log('debt');",
        "net_worth_tracker.js": "console.log('net-worth-v1');",
    }

    for filename, content in tracked_assets.items():
        (static_dir / filename).write_text(content, encoding="utf-8")

    monkeypatch.setattr(financial_app.app, "root_path", str(tmp_path))
    version_before = financial_app._static_version()

    (static_dir / "net_worth_tracker.js").write_text("console.log('net-worth-v2');", encoding="utf-8")
    version_after = financial_app._static_version()

    assert version_before != version_after
