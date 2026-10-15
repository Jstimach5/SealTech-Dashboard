# Sheet columns the board reads and writes

Two existing Google Sheets are the only stores outside Jobber (owner decisions 1, 8, 14). The board appends rows; it never edits an existing cell in the original columns.

## `SealTech Photo Review Queue` — tab `Queue`

Spreadsheet id `1wXopOPZuS5ro_hvvai6Ge3m7hfnzSdrOCOxADEDTgTs`. Columns are bound **by header text**, not by letter. A renamed header turns the source dot red in the board footer and stops writes; it never mis-maps a column.

### Existing columns A–L (never edited by the board)

| Col | Header | Written by | Notes |
|---|---|---|---|
| A | Checked | overnight checker | date the photo set was checked |
| B | Application | overnight checker | file stem, e.g. `STI_ATTIC_ROLLIN_CARTER_2635 NEEDHAM ST_APP.pdf`; third `_` segment is the customer last name |
| C | Install date | overnight checker | `YYYY-MM-DD` or `M/D/YYYY` |
| D | Tech | overnight checker | crew lead name as typed |
| E | Job | overnight checker | scope text (not a job number) |
| F | Verdict | checker / reviewer | `READY`, `FIX`, `HOLD` |
| G | Fix before submitting | checker / reviewer | one of the 12 FIX picklist values |
| H | Hold reason | checker / reviewer | free text; `inspection` or `permit` in it maps to the INSPECTION/PERMIT reason |
| I | Review notes | checker / reviewer | free text |
| J | Blower door pre>post | checker | `1,412 > 1,190` or `2,094 > 1,439 (31.3%)` |
| K | Status | office | blank, `Fixed`, `Accepted as is`, `Submitted` |
| L | Owner notes | owner | free text; a huddle owner override is recorded as `OWNER:JJ 2026-10-14` on the job's latest row. Until sheet writes exist (M6) the board queues that line in the service (`owner_notes`) and keeps the override in `board.db`; the sheet writer applies it to that row's L cell. It is never written by appending a row |

### Appended columns (added once by `npm run migrate:sheet -w apps/service`, decisions 8 and 30)

| Col | Header | Written by | Notes |
|---|---|---|---|
| M | Jobber job id | board | Jobber encoded id; exact match key |
| N | Job # | board, and the owner's checker session once it can | Jobber job number; exact match key |
| O | Pass | board | `1` (Henry) or `2` (Jack); blank on checker rows |
| P | Reviewer | board | Jobber user id of the person whose PIN was used |
| Q | Reviewed at | board | ISO instant |
| R | Submitted | office | `YYYY-MM-DD` the package went to CLEAResult Vault |
| S | Accepted | office | `YYYY-MM-DD` |
| T | Returned | office | `YYYY-MM-DD` |
| U | Returned reason | office | free text |
| V | Submission id | board | sha256 of kind, target, pass and payload; stops double taps |

### How a verdict becomes a row

One REVIEW tap = one appended row with A–L filled as far as known (Application and Install date copied from the matched checker row when there is one), Verdict/Fix/Hold from the tap, and M–Q, V from the board. Two taps with the same job, pass, reviewer and verdict within two minutes collapse to one row.

### Matching rows to jobs

1. Exact: `Jobber job id` or `Job #` equals a job.
2. Inferred: the Application stem's last name equals exactly one job's last name **and** that job has a completed visit within three days of Install date.
3. Otherwise unmatched: the row appears in the REVIEW screen's unmatched panel and never produces a verdict on the wall.

## `SealTech_FCS_KPI_Master` — tab `Flags`

Spreadsheet id `1ZeFPvKbKEeL-jxCs8cbE5gJdTvm5smmR2u0z3oAnIAU`. The board appends one row per FLAG tap; the existing incident email and scorecard keep working unchanged (decision 14). Nothing from this tab is ever placed in a snapshot or shown on the TV (decision 16).

| Header | Value written |
|---|---|
| Date | board date `YYYY-MM-DD` |
| Employee | name chosen on the FLAG screen |
| Type | `Compliance` or `Improper Install` (from the issue map in `packages/domain/src/enums.ts`) |
| RR | `Y` / `N` as chosen |
| FlagType | mapped sub-type (`Work Not Completed`, `Professionalism`, `Pictures`, `CLEAResult Return`, `Pre-arrival pack`; blank for Improper Install) |
| Job # | Jobber job number |
| Notes | typed note |
| Crew on report | crew initials |

## Service-account access

The service account named in `GOOGLE_SA_KEY_PATH` needs **editor** on the Review sheet and **editor** on the KPI sheet (the KPI sheet is owner-only today; sharing it widens access by exactly one principal). The key file lives next to `.env` and is never committed.
