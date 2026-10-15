# Owner's daily and weekly routine

What Jack (board owner, decision 38) does so the board stays true. Everything here is under five hours a week; most of it is already happening.

## Every day

| When | What | Where |
|---|---|---|
| 06:55 | Glance at the footer dots on the way to the huddle. Red Jobber dot → the service log on the office PC (`C:\SealTech\board\logs`). | Wall |
| 07:00 | Run the huddle (`huddle-card.md`). | Wall |
| 07:10 | Jamie types the focus line for the day (≤ 30 characters) and sets today's responder (the office person who answers a crew `Problem` within 15 minutes, decision 41). | REVIEW 🔒 → FOCUS / RESPONDER |
| During the day | A `Problem` card with a red border means 15 minutes passed with no ACK. The responder taps ACK after calling the crew. One text goes to Jack if nobody does. | Wall / phone |
| 16:00 | The close: Jamie writes `CLOSE: <code>` lines in Jobber for any visit the crew did not answer, with the reason code. The board reads them within a minute. | Jobber |
| 16:30 | Henry's first-pass review of the day's completed program jobs: READY / FIX / HOLD per job, after the overnight checker's row. Cut-off 16:30 (decision 40). | REVIEW 🔒 (Henry's PIN) |
| 17:00 | Jack's second pass on jobs Henry marked READY. Cut-off 17:00. A READY writes a row; the job stays in Requires invoicing until Jamie closes it (decision 6). | REVIEW 🔒 (Jack's PIN) |

## Every week

| When | What |
|---|---|
| Monday 07:15–07:45 | Office scorecard (Jack, Jamie, Katy, Henry when not rolling): the seven numbers for last week, owner per number, two reds in a row go on the issues list and into a private conversation. No targets on the screen for the first four weeks (decision 45). |
| Friday | Jamie fills the Submitted / Accepted / Returned columns on the Review sheet for anything that moved at CLEAResult Vault this week. The PROGRAM-WAIT rows and the "days to submit" number depend on this. |
| Friday | Jack reads the `taps` table (what screens were opened, what nobody opened) and the unmatched-rows panel. A Review sheet row that stayed unmatched all week needs a `Job #` typed into column N. |

## Every month

- 30-day audit: anything on the board nobody looked at or spoke about comes off. Note it in `owner-decisions.md` with the date.
- Roster: PIN changes, a new crew lead, a role change → `data/roster.json` on the office PC. Nothing else stores a PIN.
- Review `docs/jobber-assumptions.md` for any answer still blank.

## When something breaks

| Symptom | First thing to check |
|---|---|
| Red STALE banner | Office PC awake? Service running? (`services.msc` → SealTechBoard). Internet? |
| A card says `unknown` all day | The visit never had the Visit result form attached in Jobber, and no CLOSE line was written. Attach the form to the visit template. |
| A job is on the rail that should not be | Jobber still shows it in Requires invoicing, or it has uninvoiced work with reminders off (`NO-REMINDER` tag). Close or invoice it in Jobber; the line leaves on the next poll. |
| A verdict is missing on the wall | The sheet row is unmatched (REVIEW 🔒 → unmatched panel). Type the Job # in column N. |
| The panel shows tiny text | Chrome lost the scale flag. The logon task in `kiosk-setup.md` sets `--force-device-scale-factor=2`; the footer shows `DPR` in red when it is wrong. |
