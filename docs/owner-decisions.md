# Owner decisions (Oct 13–15, 2026)

These answers (49 signed, 50–56 proposed) are the contract for the board. Nothing in the code re-opens them. If one changes, change this file first, then the code.

## Round 1 — alignment (Oct 13)

1. **Ownership**: derived from Jobber. The only writes are Jobber visit notes/forms and the two existing Google Sheets (Photo Review Queue, KPI Flags). Nothing typed into the board exists only there.
2. **Default TV screen**: today's visits by crew + a NEEDS ATTENTION strip + the Requires Invoicing count. The stage view is a second tab.
3. **Stage words on the wall**: Jobber's own bucket names (Unscheduled, Upcoming, Today, Late, Action required, Requires invoicing, Closed).
4. **Wall privacy**: last name + city + scope. No dollars, street address or phone, ever.
5. **Approvers**: Henry first pass, then Jack second pass. Identity logged on every verdict.
6. **After READY**: nothing automatic in Jobber. The job stays in Requires Invoicing; Jamie closes it when she invoices or submits the package.
7. **Verdicts**: READY / FIX (crew lead fixes by end of next business day) / HOLD (owner decides).
8. **Verdict store**: the existing Photo Review Queue sheet (append rows; never edit A–L).
9. (same as 6)
10. **Crew answer set**: Jobber's six Visit result values — Completed · Return needed · Prepped · Not started · Customer cancelled · Problem — plus a note.
11. **Recap write path**: Jobber visit note in the house format, plus the Visit result form if the API exposes it. Queued until the developer app exists; the card shows "queued".
12. **Who submits a recap**: the crew lead only, one per visit.
13. **Photos**: no capture in the board. Show the CompanyCam project link, photo count and last capture per visit.
14. **Issues**: append rows to the KPI sheet's Flags tab. The incident email and scorecard keep working unchanged.
15. **Issue types**: one merged list — Improper Install · Work Not Completed · Professionalism · Missing Photos or Paperwork · CLEAResult Return · Office pre-arrival pack missing.
16. **TV privacy**: incidents, ladder counts and names never on the TV. Manager-PIN views only. The TV shows the FIX item on the job card, not who.
17. **Meetings**: deferred. "Main goal is to understand jobsites and progress, highlight jobs we are unable to invoice for."
18. **Phones**: Jobber app only; the board watches (shows unanswered Visit result forms).
19. **Computer**: the main office Windows PC drives the panel over HDMI + USB touch and runs the overnight photo checks.
20. **Identity**: name + 4-digit PIN mapped to a Jobber user id. Jack keeps the roster. Henry has a Jobber account.
21. **TV recap**: the shop touchscreen offers the recap as the second way to give the same answer.
22. **Jobber developer app**: created by a Claude Cowork session on Jack's PC (see jobber-app-handoff.md).
23. **Stack**: Vite + React/TypeScript board, small Node service; one `.env` on the office PC.
24. **Prototype data**: fictional jobs shaped like real ones (TESTVILLE convention). *Revision G note: fixture names are mixed case on the wall; the city stays TESTVILLE and is not printed on TODAY.*
25. **First screen**: Today board + "cannot invoice" list.
26. **GHL**: none in v1.
27. **Palette**: the house style from the printed guides — brand green #0f3d2e; red #e5322d = act; blue #1f5ce6 = card move; green #15803d = automatic; amber = exception; Inter. Urgent = red badge plus the word, never colour alone.
28. **Language**: English only in v1.

## Round 2 — board design (Oct 14)

29. **NEEDS ATTENTION triggers**: Jobber's native signals only — Late, Action required, Requires invoicing. A line exists exactly while the bucket does.
30. **Cannot-invoice reasons**: ten fixed values — awaiting 1st review · awaiting 2nd review · FIX open · HOLD · return needed · blower-door fail · form/quantities missing · inspection/permit · PROGRAM-WAIT (grey) · ready to invoice — with Submitted / Accepted / Returned (reason) date columns appended to the Review sheet, filled by whoever submits to Vault.
31. **Aging**: per-stage clocks (completed → 1st review → 2nd review → submitted → accepted). Colour by the stage SealTech owns: amber at 3 days, red at 7. Hard red at day 20 unsubmitted (provisional until the CLEAResult window is confirmed).
32. **Hero number**: the CANNOT INVOICE count (Jobber's own Requires Invoicing figure), top of the right rail; "visits not yet READY" second.
33. **Line owners**: initials defaulted by reason (office for review/paperwork/program-wait; crew lead for access/return/materials), changeable at the huddle. FIX and HOLD lines show a role word (CREW / OFFICE). Initials never sit beside a rate.
34. **Card lifecycle**: Completed → AWAITING REVIEW → READY; grey only at READY + invoiced; leaves the lane at midnight.
35. **Human lines**: a typed daily focus line (≤ 30 characters) in the top bar and one company-level crew win number on the scoreline. Recognition spoken at the huddle. No injury counter. Nobody ranked.
36. **Viewing distance**: about 12 ft. Type tiers A 280 / B 170 / C 85 / D 48 px at 3840×2160 (140 / 85 / 42 / 24 CSS px at device scale 2). Confirm on the wall before the mount is final. *Amended by revision G (proposed, sign below): hero 140, answer line 76, ledger names and ages 56, everything else the huddle reads 42, meta line 30 (CSS px). The 12-ft and 15-ft read test on the 55-inch panel decides; if 56 fails at the far mark, names drop to 42 and nothing else changes.*
37. **Huddle**: crews stage at the shop. 7:00, 10 minutes, standing at the TV, crew leads present. Agenda = the default screen top to bottom. Plus the existing 4 PM close.
38. **Board owner**: Jack owns everything (huddle, tiles, audit, integrations). Jamie is the facilitator fallback; the 30-day "not discussed → remove" audit is on Jack's calendar.
39. **Weekly scorecard**: Monday 7:15–7:45, office only (Jack, Jamie, Katy, Henry when not rolling). Numbers computed overnight. Crew-lead 1-minute forecast inside Monday's 7:00 huddle.
40. **Verdict cut-offs**: Henry by 16:30, Jack by 17:00, same day.
41. **Problem rule**: a named daily office responder acknowledges within 15 minutes; the ACK is a line in the Jobber visit note ("ACK 9:14 JJ") and shows on the card. Visual only, no sounds. After 15 minutes without ACK the line gets a red border and Jack gets one text.
42. **Reason coding**: the crew lead picks from the fixed list (ACCESS · MATERIALS · SCOPE CHANGED · PRE-EXISTING · EQUIPMENT/TRUCK · WEATHER · OVERCOMMITTED · OTHER + note) when the result is Return needed, Problem or Not started. The result will not submit without one. The closer may override at 16:00.
43. **Photo gate**: field checklist → overnight CompanyCam check (owner's local session, writes Review sheet rows) → office review. The board shows both verdicts; it never re-implements the checker.
44. **Scorecard numbers**: plan kept % (Jamie) · Visit result answered before leaving % (Henry) · first-pass READY (Henry) · photo set complete % (Henry; dash until the CompanyCam feed) · cannot-invoice count + oldest (Jamie) · median and P90 days completed→submitted (Katy) · first-time program acceptance % (Jack, phase 2). The crews' win number on the wall is first-pass READY.
45. **Targets**: four weeks of numbers with no targets shown, then targets from the baseline (ceilings: READY first pass ≥ 90 %, answered ≥ 95 %, plan kept ≥ 80 %). Red two weeks running goes to the issues list and a private conversation. The wall never feeds the discipline ladder or any bonus.
46. **Prepped** counts as plan kept only when the visit was planned as a prep day; otherwise it is a miss with a reason code.
47. **Launch**: the prototype runs on a laptop at the 7:00 huddle for two weeks (fictional jobs, then live read-only Jobber as soon as the service runs). Mount the panel when the habit holds. No paper phase.
48. **Phase-2 feed modelled now**: CompanyCam photo counts + last capture per visit (fix the account time zone first). Not selected for now: live clock-ins on the card, Vault dates on the board (they still go in the sheet per 30), a GHL Sales tab.

## Round 3 — build review (Oct 15)

49. **Auto-return**: every screen other than TODAY (STAGES, CANNOT INVOICE, REVIEW, SCORECARD) returns to TODAY after 60 s without a touch. Leaving REVIEW or SCORECARD by any route also ends the PIN session. *Revision G note: applies to the wall and the laptop; the phone layout does not auto-return.*

## Round 4 — the TODAY wall, revision G (Oct 15, proposed)

The board is built with these as defaults. Each line has a fallback that the code can switch to without a redesign. Sign or redirect each one; until then they are proposals, not decisions.

50. **Needs-you ledger replaces the strip.** Every open item that someone must act on now or today gets one ranked row: who, age, owner, status and why, and the next step. Order: a Problem with no ACK; then still-open visits, Jobber Late, hard red, red money, overdue FIX, Jobber Action required; then ready to invoice, a return or re-test to book, a form the crew still owes. A Requires-invoicing job that is only waiting for its review is counted in the Requires-invoicing table, not listed. A completed, uninvoiced job the leak rule finds outside Requires invoicing gets a row tagged with its Jobber bucket. Six rows show; past six, five rows and a line naming the rest. *Fallback: the old NEEDS ATTENTION strip; the leak on Cannot invoice only.* Signed: ________
51. **A scheduled inspection is grey.** An inspection or permit that is requested or scheduled runs on the inspector's clock, like PROGRAM-WAIT; a failed inspection is SealTech's move and is coloured by its days (reading of 31). *Fallback: red at 7 days as before.* Signed: ________
52. **Machine rows are advisory.** A Review-sheet row with no Pass (the overnight checker, later the jobsite audit) shows on REVIEW beside the human verdicts and never sets a cannot-invoice reason, a FIX clock, a blower-door fail or a READY. Only Henry's and Jack's rows move a job. *Fallback: machine rows count as before.* Signed: ________
53. **Card word `Still open`.** A visit 30 minutes past its end with no result reads `Still open`; `Late` stays Jobber's bucket word (decision 3). Signed: ________
54. **Wall wording.** One clock style: 12-hour with am/pm. No free text on the TV: hold reasons, notes and FIX detail stay on Cannot invoice and the PIN screens. No upper-case styling. Three cell shortenings on the wall, full words on the laptop: `1st review` (awaiting 1st review), `Return` (Return needed, crew status only), `Cancelled` (Customer cancelled). Signed: ________
55. **Owner word on crew-owed rows.** Still-open visits, unanswered forms and incomplete forms show the role word `CREW` (decision 16). Return-needed rows keep the crew lead's initials (decision 33: return / materials / access). *Alternative: initials on all of them.* Signed: ________
56. **Decision-1 exemption.** The focus line, the responder and huddle owner overrides live only in the board service until the sheet writes of M6 exist. *Alternative: a Settings tab in the Review sheet.* Signed: ________

Gaps stated, not hidden: an ACK from the wall is queued until Jobber note writes exist (11); the TV recap of decision 21 waits for M10 (crews answer in the Jobber app, 18); the date each owner says aloud at the huddle has no store and does not reach the wall.
