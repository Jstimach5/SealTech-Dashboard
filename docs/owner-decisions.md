# Owner decisions (Oct 13–14, 2026)

These 48 answers are the contract for the board. Nothing in the code re-opens them. If one changes, change this file first, then the code.

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
24. **Prototype data**: fictional jobs shaped like real ones (TESTVILLE convention).
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
36. **Viewing distance**: about 12 ft. Type tiers A 280 / B 170 / C 85 / D 48 px at 3840×2160 (140 / 85 / 42 / 24 CSS px at device scale 2). Confirm on the wall before the mount is final.
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
