"""Screenshot a local page at the DESIGN.md check widths in light and dark, and flag basic breakage.

Usage:
    python tools/ui_snap.py http://127.0.0.1:8080/ [--out data/ui_snaps] [--chromium PATH]
    python tools/ui_snap.py web/static/preview.html

Writes <out>/<YYYYmmdd-HHMMSS>/<name>-<width>-<scheme>.png (never overwrites prior runs) and
prints one line per shot. Exit code 1 if any shot has horizontal overflow, a console error,
a failed request, an <img> without width/height, or banned vision wording (see DESIGN.md).

Only 127.0.0.1 / localhost / file targets are accepted: this tool is for checking our own
dashboard and must not be pointed at Jobber, CompanyCam, or any outside site.
"""

from __future__ import annotations

import argparse
import re
import sys
from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse
from zoneinfo import ZoneInfo

from playwright.sync_api import sync_playwright

WIDTHS = {"phone": (390, 844), "desktop": (1440, 900)}
SCHEMES = ("light", "dark")
# DESIGN.md hard rule 2. Matched as whole words, case-insensitive, in visible text only.
BANNED_WORDS = ("confirmed", "safe", "passed", "compliant")
ALLOWED_HOSTS = {"127.0.0.1", "localhost"}

PAGE_CHECKS_JS = """
() => {
  const doc = document.documentElement;
  const imgs = [...document.querySelectorAll('img')]
    .filter(i => !i.getAttribute('width') || !i.getAttribute('height'))
    .map(i => i.getAttribute('src') || '(no src)');
  return {
    overflow: doc.scrollWidth > doc.clientWidth,
    scrollWidth: doc.scrollWidth,
    clientWidth: doc.clientWidth,
    imgsNoSize: imgs,
    text: document.body ? document.body.innerText : '',
  };
}
"""


def resolve_target(target: str) -> str:
    path = Path(target)
    if path.exists():
        return path.resolve().as_uri()
    parsed = urlparse(target)
    if parsed.scheme in ("http", "https") and parsed.hostname in ALLOWED_HOSTS:
        return target
    raise SystemExit(f"refusing target {target!r}: only local files or 127.0.0.1/localhost URLs")


def banned_hits(text: str) -> list[str]:
    return [w for w in BANNED_WORDS if re.search(rf"\b{w}\b", text, re.IGNORECASE)]


def snap(target: str, out_root: Path, chromium: str | None = None) -> list[dict]:
    url = resolve_target(target)
    stamp = datetime.now(ZoneInfo("America/Detroit")).strftime("%Y%m%d-%H%M%S")
    out_dir = out_root / stamp
    out_dir.mkdir(parents=True, exist_ok=False)
    name = re.sub(r"[^A-Za-z0-9]+", "_", urlparse(url).path).strip("_") or "index"

    results = []
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=chromium) if chromium else p.chromium.launch()
        try:
            for label, (w, h) in WIDTHS.items():
                for scheme in SCHEMES:
                    ctx = browser.new_context(viewport={"width": w, "height": h}, color_scheme=scheme)
                    page = ctx.new_page()
                    errors: list[str] = []
                    page.on("console", lambda m, e=errors: m.type == "error" and e.append(m.text))
                    page.on("pageerror", lambda exc, e=errors: e.append(str(exc)))
                    page.on("requestfailed", lambda r, e=errors: e.append(f"request failed: {r.url}"))
                    page.goto(url, wait_until="networkidle")
                    checks = page.evaluate(PAGE_CHECKS_JS)
                    shot = out_dir / f"{name}-{w}-{scheme}.png"
                    page.screenshot(path=str(shot), full_page=True)
                    ctx.close()

                    problems = []
                    if checks["overflow"]:
                        problems.append(f"horizontal overflow {checks['scrollWidth']}>{checks['clientWidth']}px")
                    problems += [f"img missing width/height: {s}" for s in checks["imgsNoSize"]]
                    problems += [f"banned word: {b!r}" for b in banned_hits(checks["text"])]
                    problems += errors
                    results.append({"label": label, "width": w, "scheme": scheme,
                                    "path": shot, "problems": problems})
        finally:
            browser.close()
    return results


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("target")
    ap.add_argument("--out", default="data/ui_snaps")
    ap.add_argument("--chromium", help="path to a Chromium binary (skips Playwright's download)")
    args = ap.parse_args(argv)

    results = snap(args.target, Path(args.out), args.chromium)
    failed = False
    for r in results:
        status = "FAIL" if r["problems"] else "ok"
        failed |= bool(r["problems"])
        print(f"{status:4} {r['label']:7} {r['width']:>4} {r['scheme']:5} {r['path']}")
        for prob in r["problems"]:
            print(f"     - {prob}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
