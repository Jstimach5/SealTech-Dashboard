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
npm run typecheck && npm test        # domain rules, fixtures, service: 760+ table tests
npm run fixtures                      # build fixtures/snapshot.json and fixtures/snapshots/*.json
npm run demo                          # the board on fixtures, no service: http://localhost:5173 (the laptop at the 7:00 huddle)
npm run service                       # the service in fixture mode on http://localhost:8787 (serves the built board)
npm run e2e                           # Playwright screenshots at 4K (device scale 2) and laptop scale
```

Demo scenarios: `?scenario=huddle-day` (07:00), `late-afternoon` (16:10), `stale`, `overflow` (five crews), `monday-scorecard`. The clock is frozen at the scenario's time so the same picture shows on any day. TESTVILLE PINs are `1234` for everyone in fixture mode only.

Copy `.env.example` to `.env` on the office PC only. See `docs/kiosk-setup.md` for the Windows service and the Chrome kiosk task.

## Docs

| Page | Read it when |
|---|---|
| `docs/owner-decisions.md` | before changing anything: the 48 decisions every screen follows |
| `docs/board-brief.md` | you touch the UI: zones, type tiers, palette, what was left out and why |
| `docs/derivation-rules.md` | you wonder why a word or number is on the wall |
| `docs/huddle-card.md` | you run the 7:00 huddle |
| `docs/owner-daily.md` | you own the board: daily, weekly, monthly, and what to check when it breaks |
| `docs/kiosk-setup.md` | you set up the office PC and the panel |
| `docs/http-api.md` | you change the service or the board's writes |
| `docs/sheet-columns.md` | you change what the board reads or appends in the two Google Sheets |
| `docs/jobber-app-handoff.md` | you are the Cowork session creating the Jobber developer app |
| `docs/jobber-assumptions.md` | the live source misbehaves: every unverified API assumption and its check |

## Milestones

| Done | Milestone |
|---|---|
| ✓ | M0 scaffold · M1 domain rules · M2 TESTVILLE fixtures · M3/M4 board screens · M5–M7 service (fixture-backed), REVIEW, FLAG, ACK, focus |
| | M8 live read-only Jobber (needs the developer app) · M9 scorecard job · M10 Jobber note writes + RECAP · M11 webhooks · M12 CompanyCam counts |

## Rules that never change

- No dollars, street addresses or phone numbers in any snapshot or on the wall. The schema sweep rejects them.
- No incidents, no names beside a quality number, no ranking on the TV.
- Fixture ids carry `-test-`; live writers refuse them.
- Secrets live only in `C:\SealTech\board\.env`.
