# Production board guide

> **Out of date since revision G (Oct 15).** The PDF pictures the old TODAY screen (strip, lanes, rail, counts). Its TODAY, huddle and ACK pages must be re-captured against the new wall before it is handed to staff; `capture.cjs` still drives the old test ids (`rail`, `counts-*`, `card-*`) and needs the new ones (`money`, `row-*`, `answer`). The other pages (Review, office tools, Scorecard, keeping it running) still match.

`SealTech_Production_Board_Guide.pdf` is the 16-page staff guide (v1.0, Oct 2026) in the house SOP style: cover, what we built, rules, one page per pathway (huddle, cannot invoice, review, ACK, office tools, scorecard, keep it running), day and week, troubleshooting, what comes next.

## Rebuild it

1. Start the service on the practice data and build the board:
   `npm run build -w apps/board`, then in `apps/service`:
   `DATA_DIR=/tmp/guide-data BOARD_DATA_SOURCE=fixtures FIXTURE_NOW=2026-10-14T13:30:00Z PORT=8795 npx tsx src/index.ts`
2. In this folder: `node capture.cjs http://localhost:8795` (drives the real board: owner change, ACK, PIN, FIX verdict, tools, scorecard; writes `shots/*.png` and `shots/boxes.json`). Copy `apps/board/e2e/__screenshots__/stale-wall-4k.png` to `shots/16_stale.png`.
3. `python3 make_assets.py && python3 make_guide.py && python3 preview.py out/SealTech_Production_Board_Guide.pdf previews` and look at every contact sheet.

Callout positions come from the controls' real positions (`boxes.json`), so a layout change moves the boxes with it.

## Log

- Verified on the running service with TESTVILLE practice data only: every flow pictured was driven end to end. No real Jobber, sheet or customer record was touched; nothing to clean up.
- Stated as not live yet (keep in step with the code): live Jobber jobs, Google Sheets writes, Jobber note writes (ACK/recap show `queued`), the 15-minute text (logged only).
- When a decision or screen changes: update the page, the rule, the cover tile and the troubleshooting line, and bump the version in `make_guide.py`.
