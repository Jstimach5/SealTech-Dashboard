import os
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
import ui_snap  # noqa: E402

CHROMIUM = os.environ.get("UI_SNAP_CHROMIUM")  # e.g. /opt/pw-browsers/chromium; unset = Playwright default

GOOD = """<!doctype html><html><head><meta name="viewport" content="width=device-width">
<style>:root{color-scheme:light dark}body{margin:0;padding:16px;font:16px system-ui}</style></head>
<body><h1>Visit 123</h1><p>Possible gap near attic hatch.</p><p>No detected issues.</p></body></html>"""

BAD = """<!doctype html><html><head><meta name="viewport" content="width=device-width"></head>
<body><div style="width:2000px">Combustion test passed. Leak confirmed.</div>
<img src="x.png"></body></html>"""


def run(tmp_path, html):
    page = tmp_path / "page.html"
    page.write_text(html, encoding="utf-8")
    return ui_snap.snap(str(page), tmp_path / "out", CHROMIUM)


def test_clean_page_four_shots_no_problems(tmp_path):
    results = run(tmp_path, GOOD)
    assert [(r["width"], r["scheme"]) for r in results] == [
        (390, "light"), (390, "dark"), (1440, "light"), (1440, "dark")]
    assert all(r["path"].stat().st_size > 0 for r in results)
    assert all(r["problems"] == [] for r in results), results


def test_bad_page_flags_overflow_wording_and_image(tmp_path):
    results = run(tmp_path, BAD)
    phone = results[0]["problems"]
    assert any("horizontal overflow" in p for p in phone)
    assert any("'passed'" in p for p in phone)
    assert any("'confirmed'" in p for p in phone)
    assert any("img missing width/height" in p for p in phone)
    assert any("request failed" in p for p in phone)


def test_possible_is_not_banned():
    assert ui_snap.banned_hits("Possible void. Unsafe? No detected issues.") == []


def test_refuses_external_hosts():
    for url in ("https://api.getjobber.com/", "https://app.companycam.com/", "http://10.0.0.5:8080/"):
        with pytest.raises(SystemExit):
            ui_snap.resolve_target(url)
    assert ui_snap.resolve_target("http://127.0.0.1:8080/") == "http://127.0.0.1:8080/"
