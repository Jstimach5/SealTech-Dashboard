# Board service HTTP API

One Node process (`apps/service`) on `PORT` (default 8787) serves the built board, the snapshot and the few writes the board makes. The board never talks to Jobber or Google directly. All responses are JSON unless noted. Errors are `{ "ok": false, "error": "<plain sentence>" }` with a 4xx/5xx status.

## Reads

| Method | Path | Returns |
|---|---|---|
| GET | `/` and any non-API path | the built board (`apps/board/dist`), SPA fallback to `index.html` |
| GET | `/snapshot.json` | the current `Snapshot` (zod-validated). `ETag` is the snapshot's `generatedAt`; `If-None-Match` → 304. `Cache-Control: no-store`. |
| GET | `/health` | `{ ok, build, mode, generatedAt, boardDate, sources, queued }` where `queued` is the number of queued writes |

The board polls `/snapshot.json` every `CONFIG.RENDER_TICK_SEC` seconds. In fixture mode the service rebuilds the snapshot on every poll tick and immediately after any write, so a tap shows on the wall within one tick.

## Identity

Writes that need a person carry `Authorization: Bearer <token>`. A token comes from a PIN check and lasts 8 hours or until the service restarts.

| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/api/pin` | `{ "userId": "<jobberUserId>", "pin": "1234" }` | 200 `{ ok: true, token, person: { jobberUserId, lastName, initials, role, reviewPass } }`; 401 `{ ok: false, error, attemptsLeft }`; 423 `{ ok: false, error, lockedForSec }` after 3 failures (60 s per user) |
| GET | `/api/people` | — | `{ ok: true, people: [{ jobberUserId, lastName, initials, role, reviewPass }] }` (the PIN screen's name tiles; no hashes) |

The roster lives in `ROSTER_PATH` (`data/roster.json`): `{ people: Person[] }` with `pinHash = sha256("<jobberUserId>:<pin>")` (use `sha256Hex` from the domain). In fixture mode with no roster file the service writes one for the TESTVILLE people with PIN `1234` and logs that it did.

## Writes

All writes are idempotent through `submissionId` (domain `submissionId(kind, targetId, pass, payload)`); a repeat inside the dedupe window returns 200 with `deduped: true` and changes nothing. A target id containing `-test-` is refused in live mode (409). A target not present in the current snapshot is refused (404).

| Method | Path | Body | Rules | Returns |
|---|---|---|---|---|
| POST | `/api/review` | `{ jobId, pass: 1\|2, verdict: "READY"\|"FIX"\|"HOLD", fixPick?, holdReason?, notes? }` | token required; `person.reviewPass` must equal `pass`; FIX needs `fixPick` from `FIX_PICKLIST`; HOLD needs `holdReason`; a pass-2 READY needs an existing pass-1 READY row for the job (409 otherwise); same job+pass+reviewer+verdict within `CONFIG.REVIEW_DEDUPE_MIN` → deduped | `{ ok: true, rowIndex, deduped }` |
| POST | `/api/recap` | `{ visitId, result, missReason?, note? }` | token required (crew lead or owner); `missReason` required when result is `Return needed`, `Problem` or `Not started`; `recapDecision`: accept / supersede (replace the queued note) / refuse 409 (already in Jobber) | `{ ok: true, status: "queued"\|"superseded" }` |
| POST | `/api/ack` | `{ visitId }` | token required (office or owner); visit must show result `Problem`; queues the note line `ACK H:MM II` | `{ ok: true, status: "queued" }` |
| POST | `/api/focus` | `{ text }` | token required (office or owner); ≤ 30 characters, uppercased | `{ ok: true }` |
| POST | `/api/responder` | `{ initials }` | token required (office or owner); who answers Problems today | `{ ok: true }` |
| POST | `/api/flag` | `{ issue, jobNumber, employee, crewOnReport, notes, rr: "Y"\|"N" }` | token required (office or owner); `issue` from `ISSUE_TYPES`; appends to the KPI `Flags` tab; nothing of it enters the snapshot | `{ ok: true }` |
| POST | `/api/owner` | `{ jobId, initials }` | token required; huddle override for a cannot-invoice line (decision 33); writes `OWNER:XX YYYY-MM-DD` to the Review sheet's Owner notes on the job's latest row, or stores it locally when the job has no row | `{ ok: true }` |
| POST | `/api/tap` | `{ screen, target }` | no token; the 30-day audit record (decision 38) | `{ ok: true }` |

## Queued writes

Jobber note writes (`recap`, `ack`) go to the `queued_writes` table and appear in `snapshot.queuedWrites`; the card shows `queued`. They drain to Jobber only when `JOBBER_WRITES=on` and the developer app exists (milestone M10). In fixture mode they are applied to an in-service overlay of note lines so the prototype shows the effect (the ACK clears the red border; the recap sets the result) without touching Jobber.

Sheet writes (`review`, `flag`, `owner`) flush immediately: in live mode to Google Sheets by header name, in fixture mode to the service's own tables so a restart keeps them.

## Status codes

200 ok · 304 unchanged snapshot · 400 bad body · 401 no or bad token / bad PIN · 403 role not allowed · 404 target not in snapshot · 409 rule refused (pass-2 before pass-1, recap already in Jobber, `-test-` id in live mode) · 423 PIN locked · 503 no snapshot yet
