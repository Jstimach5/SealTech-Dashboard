# Board service HTTP API

One Node process (`apps/service`) on `HOST`:`PORT` (default `127.0.0.1:8787`) serves the built board, the snapshot and the few writes the board makes. The board PC is the only client, so the service binds loopback; it listens on another address (e.g. `0.0.0.0`) only when `HOST` is set. The board never talks to Jobber or Google directly. All responses are JSON unless noted. Errors are `{ "ok": false, "error": "<plain sentence>" }` with a 4xx/5xx status (the one exception is `/health`, below).

Request bodies are JSON, at most 64 KB (larger → 400). A path called with the wrong method is 405 with an `Allow` header naming the right one(s) (`GET, HEAD` for reads, `POST` or `GET` for an `/api/*` route).

All instants the service stores and returns are UTC `…Z` strings (`toISOString` form). `FIXTURE_NOW` may be given with an offset; it is normalised to that form on start.

## Reads

| Method | Path | Returns |
|---|---|---|
| GET | `/` and any non-API path | the built board (`apps/board/dist`), SPA fallback to `index.html` |
| GET | `/snapshot.json` | the current `Snapshot` (zod-validated). `ETag` is always `"<generatedAt>;<body hash>"` (16 hex characters of the body's sha256), so a tag names exactly one body, also across restarts and under a frozen clock (`FIXTURE_NOW`); `If-None-Match` → 304. `Cache-Control: no-store`. 503 with `Retry-After: 5` until there is a snapshot. |
| GET | `/health` | `{ ok, build, mode, generatedAt, boardDate, sources, queued, error? }` where `queued` is the number of queued Jobber note writes. Status is 200 whenever a snapshot exists, even when `ok` is false (the last poll failed and the last good snapshot is being served); then `error` says why. 503 before the first snapshot. |

`error` (in `/health` and in `sources.<name>.error`) never carries record text: a load refused by the decision-4 privacy check reads `a record failed the privacy check (money, address or phone); last good snapshot kept (at <field path>)`, and any other error message that itself looks like money, an address or a phone number is replaced by a fixed sentence.

On start the service reloads `snapshot.json` so reads answer at once. A file that is empty, truncated or not a Snapshot is logged and ignored: the service starts empty (503) until its first poll.

The board polls `/snapshot.json` every `CONFIG.RENDER_TICK_SEC` seconds. In fixture mode the service rebuilds the snapshot on every poll tick and immediately after any write, so a tap shows on the wall within one tick.

## Identity

Writes that need a person carry `Authorization: Bearer <token>`. A token comes from a PIN check and lasts 8 hours or until the service restarts.

| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/api/pin` | `{ "userId": "<jobberUserId>", "pin": "1234" }` (`userId` ≤ 64 characters, `pin` ≤ 64) | 200 `{ ok: true, token, person: { jobberUserId, lastName, initials, role, reviewPass } }`; 401 `{ ok: false, error, attemptsLeft }`; 423 `{ ok: false, error, lockedForSec }` after 3 failures (60 s per user); 403 for a fixture (`-test-`) id in live mode. Failures are counted only for ids in the roster (an unknown id gets the same 401 and leaves no record); failure records untouched for a day are purged on start. Refused attempts are logged with the user id (when in the roster) and remote address, never the PIN. |
| GET | `/api/people` | — | `{ ok: true, people: [{ jobberUserId, lastName, initials, role, reviewPass }] }` (the PIN screen's name tiles; no hashes) |

The roster lives in `ROSTER_PATH` (`data/roster.json`): `{ people: Person[] }` with `pinHash = sha256("<jobberUserId>:<pin>")` (use `sha256Hex` from the domain). In fixture mode with no roster file the service writes one for the TESTVILLE people with PIN `1234` and logs that it did. Live mode never writes a roster, and **refuses to start** (one log line, exit code 1) when the roster file is that fixture roster or holds any `-test-` user id: replace it with the real roster before switching `BOARD_DATA_SOURCE` to `live`. In live mode a token whose person has a `-test-` id is refused with 403 on every write.

## Writes

All writes are idempotent through `submissionId` (domain `submissionId(kind, targetId, pass, payload)`); a repeat inside the dedupe window returns 200 with `deduped: true` and changes nothing. A target id containing `-test-` is refused in live mode (409); for `/api/flag` that is the id of the job its `jobNumber` resolves to. A target not present in the current snapshot is refused (404). Writes checked against the snapshot (`review`, `recap`, `ack`, `flag`, `owner`) wait for the first successful poll of this process: after a restart the reloaded snapshot is served for reading only, and those writes answer 503 until the first poll lands.

A write's status is decided by storing it. The service then rebuilds the snapshot so the next board tick shows it; if that rebuild fails (e.g. Jobber is down) the failure is logged, the route still answers its documented 200, and the write shows after the next good poll (`/api/review` then returns `rowIndex: 0`, meaning not known yet).

Fixture mode regenerates the same TESTVILLE ids every day, so the service's own note overlay and queued writes count only on the board day they were made; yesterday's ACK or queued recap never applies to today's regenerated visit.

Text fields that reach the wall or a sheet (`notes`, `holdReason`, recap `note`, focus `text`) are refused with 400 when they look like money, a street address or a phone number (decision 4). Initials (`/api/responder`, `/api/owner`) are 2–3 letters (`^[A-Z]{2,3}$` after uppercasing; a crew initials value with a digit such as `A2` is refused).

| Method | Path | Body | Rules | Returns |
|---|---|---|---|---|
| POST | `/api/review` | `{ jobId, pass: 1\|2, verdict: "READY"\|"FIX"\|"HOLD", fixPick?, holdReason?, notes? }` (`holdReason` ≤ 500 characters, `notes` ≤ 2000) | token required; `person.reviewPass` must equal `pass`; FIX needs `fixPick` from `FIX_PICKLIST`; HOLD needs `holdReason`; a pass-2 READY needs an existing pass-1 READY row for the job (409 otherwise); same job+pass+reviewer+verdict within `CONFIG.REVIEW_DEDUPE_MIN` → deduped | `{ ok: true, rowIndex, deduped }` |
| POST | `/api/recap` | `{ visitId, result, missReason?, note? }` (`note` ≤ 1000) | token required (crew lead or owner); `missReason` required when result is `Return needed`, `Problem` or `Not started`; an identical recap (same submission id) → 200 `deduped: true`, also after it was sent; a visit whose result is already in Jobber (job form, or a `VISIT RESULT:` / `CLOSE:` line in its note) → 409 `already answered in Jobber`; otherwise `recapDecision`: accept / supersede (replace the queued note) / refuse 409 (already in Jobber) | `{ ok: true, status: "queued"\|"superseded", deduped? }` |
| POST | `/api/ack` | `{ visitId }` | token required (office or owner); visit must show result `Problem`; queues the note line `ACK H:MM II`; one ACK per visit: while a queued or sent ACK exists for the visit, a repeat (any minute) → 200 `deduped: true` | `{ ok: true, status: "queued", deduped? }` |
| POST | `/api/focus` | `{ text }` (≤ 500 characters raw) | token required (office or owner); whitespace collapsed, ≤ 30 characters, uppercased; the privacy check runs on the text as typed and after uppercasing | `{ ok: true }` |
| POST | `/api/responder` | `{ initials }` | token required (office or owner); who answers Problems today; 2–3 letters | `{ ok: true }` |
| POST | `/api/flag` | `{ issue, jobNumber, employee, crewOnReport, notes, rr: "Y"\|"N" }` (`employee` 1–100 characters, `crewOnReport` ≤ 100, `notes` ≤ 2000) | token required (office or owner); `issue` from `ISSUE_TYPES`; appends to the KPI `Flags` tab; nothing of it enters the snapshot | `{ ok: true }` |
| POST | `/api/owner` | `{ jobId, initials }` | token required; huddle override for a cannot-invoice line (decision 33); 2–3 letters. Stored in the service (the wall reads it from there). When the job has a Review-sheet row, the line `OWNER:XX YYYY-MM-DD` is also queued for the Owner notes (column L) of the job's latest row; it stays queued until sheet writes exist (M6) and is never written by appending a row. The owner-note queue is service-only and does not appear in `snapshot.queuedWrites` | `{ ok: true }` |
| POST | `/api/tap` | `{ screen, target }` (`screen` 1–60 characters, `target` ≤ 200) | no token; the 30-day audit record (decision 38) | `{ ok: true }` |

## Queued writes

Jobber note writes (`recap`, `ack`) go to the `queued_writes` table and appear in `snapshot.queuedWrites`; the card shows `queued`. They drain to Jobber only when `JOBBER_WRITES=on` and the developer app exists (milestone M10). In fixture mode they are applied to an in-service overlay of note lines so the prototype shows the effect (the ACK clears the red border; the recap sets the result) without touching Jobber.

Sheet writes (`review`, `flag`) flush immediately: in live mode to Google Sheets by header name, in fixture mode to the service's own tables so a restart keeps them. The owner note (`OWNER:XX YYYY-MM-DD` for column L of an existing row) is held in the service's `owner_notes` table until the sheet writer exists (M6).

`npm run once -w apps/service` (`--once`) only builds and writes `snapshot.json`: it never clears sessions, drains the queue or sends alerts, so it is safe to run beside the running service on the same `DATA_DIR`.

## Status codes

200 ok (also `/health` with `ok: false` while serving the last good snapshot) · 304 unchanged snapshot · 400 bad body (not JSON, over 64 KB, a field over its cap, bad initials, text that looks private) · 401 no or bad token / bad PIN · 403 role not allowed, or a `-test-` person in live mode · 404 target not in snapshot / unknown `/api/*` path · 405 wrong method (with `Allow`) · 409 rule refused (pass-2 before pass-1, recap already answered in Jobber, `-test-` target in live mode) · 423 PIN locked · 503 no snapshot yet, or a write before this process's first poll
