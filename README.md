# SealTech production board

A derived, read-mostly wall board for the SealTech office. It reads Jobber and two existing Google Sheets, shows today's visits by crew, the jobs that cannot be invoiced and why, and takes exactly three kinds of input back: review verdicts (to the Photo Review Queue sheet), issue flags (to the KPI Flags tab) and crew recaps / Problem acknowledgements (to Jobber visit notes). Nothing typed into the board exists only in the board.

The decisions behind every screen are in `docs/owner-decisions.md`. Read that before changing anything.

## Layout

| Path | What it is |
|---|---|
| `packages/domain` | Pure derivation rules and the snapshot schema. No I/O. Every rule takes `now` as a parameter. |
| `fixtures` | The TESTVILLE dataset (fictional jobs shaped like real ones) and scenario overlays; builds `fixtures/snapshot.json`. |
| `apps/service` | Node service: polls Jobber and the sheets, writes `data/snapshot.json`, serves the board, takes PIN-gated writes. |
| `apps/board` | Vite + React board. Renders only the snapshot. Designed on a 1920×1080 CSS grid shown at device scale 2 on the 55" 4K panel. |
| `docs` | Owner decisions, derivation rules, huddle card, owner daily routine, kiosk setup, sheet columns, Jobber app hand-off. |

## Quick start

```bash
npm ci
npm run typecheck && npm test        # domain rules
npm run fixtures                      # build fixtures/snapshot.json
npm run demo                          # the board on fixtures, no service (the laptop at the 7:00 huddle)
npm run service                       # the service in fixture mode on :8787
npm run e2e                           # Playwright screenshots at 4K and laptop scale
```

Copy `.env.example` to `.env` on the office PC only. See `docs/kiosk-setup.md` for the Windows service and the Chrome kiosk task.
