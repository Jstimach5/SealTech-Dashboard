# PROJECT_STATUS — SealTech Jobsite QC Audit

Truth about what actually works. When this disagrees with REQUIREMENTS.md, this wins and REQUIREMENTS gets a note.
Updated at the end of every session. Timezone America/Detroit.

## Completed

## Tested (with results)
- 2026-10-15 `tools/ui_snap.py`: `pytest tests/test_ui_snap.py` → 4 passed (cloud container, Chromium 1194, playwright 1.64). Not yet run on the workstation.

## Limitations

## Blockers

## Needs Jack
- Activate staged UI skills: see `docs/ui-skills/README.md` (agent blocked from writing `.claude/skills/`).
- SealTech logo (SVG) for the dashboard header. Colors done.
- Approve two CLAUDE.md lines pointing at `docs/DESIGN.md` and `docs/BROWSER_RULES.md`.

## Next
- Session 1 step 2: add `playwright` and `pytest` to `requirements.txt`. Run ui_snap with `--chromium "C:\Program Files\Google\Chrome\Application\chrome.exe"` to avoid `playwright install` (an unapproved ~150 MB browser download).

## Prototype-vs-production compromises

## Decisions log
- 2026-10-14 (Jack): Session 1 runs locally on the Windows workstation, not in the cloud container. Cloud container could not reach api.getjobber.com / api.companycam.com and cannot see a local .env.
- 2026-10-14 (Jack): .claude/settings.json approved; git push allowed without asking.
- 2026-10-14 (Jack): Pin Python >=3.12 (3.12 per spec on the workstation).
- 2026-10-15: Added `docs/DESIGN.md` (dashboard + email design rules; token contrast checked ≥4.5:1 light and dark). Staged web-design-guidelines + playwright-cli skills in `docs/ui-skills/`. Rejected taste-skill (self-declared not for dashboards), image-to-code, awesome-design-md brand copies.
- 2026-10-15: Reviewed 5-MCP video. Adopted Claude in Chrome for read-only GraphiQL lookups (`docs/BROWSER_RULES.md`) and Python Playwright screenshots (`tools/ui_snap.py`). Rejected Perplexity (paid, redundant), Firecrawl (paid cloud scraping, customer-data risk), Playwright MCP (redundant), HyperFrames (out of scope).
- 2026-10-15: Applied SealTech SOP-guide colors and Inter to `docs/DESIGN.md` (contrast-checked; #e5322d/#d98b00 restricted to bars, fail as text). Added answer-first layout rule.
