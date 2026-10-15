# Board brief: what is on the wall and why

The one-page design reference for `apps/board`. Owner decisions are in `owner-decisions.md`; the computation behind each word is in `derivation-rules.md`; the daily use is in `huddle-card.md` and `owner-daily.md`.

## The job of the board

Two questions, answered at a glance from 12 ft: **where are the crews and how is today going** (lanes, scoreline, NEEDS ATTENTION) and **which finished jobs cannot be billed, why, and whose move is it** (the CANNOT INVOICE rail). Everything else is a second tap away. The owner's words: "understand jobsites and progress, highlight jobs we are unable to invoice for."

## Why it is derived, not typed

Every tracker SealTech typed into this year died within weeks (Notion Jobs, Internal Issues, Meeting Reports, the Lead Hub sheets). Every feed that fills itself is still alive (KPI Master, Daily Briefings, Photo Review Queue). So the board types nothing of its own: it reads Jobber and the two existing sheets, and the only three inputs it takes (review verdicts, issue flags, crew recaps / ACKs) are written back into those systems, never into the board.

## Elements, by zone (TODAY screen)

| Zone | Shows | Source | Size |
|---|---|---|---|
| Top bar | date and clock; the typed FOCUS line (≤ 30 chars); tabs; the STALE banner when Jobber has not loaded for 30 min | focus from the service; staleness rule | 64 px |
| Scoreline | YESTERDAY kept x of y (n unknown) with miss reasons; THIS WEEK READY first pass a of b | plan-kept and first-pass rules | 48 px |
| NEEDS ATTENTION | up to 4 lines: Jobber's Late, Action required, Requires invoicing, oldest first, with age and owner initials | attention rule | 232 px |
| Crew lanes | one lane per crew out today: NOW card (name, city, scope, chip, meta), two NEXT rows, collapsed DONE; after 15:00 a TOMORROW row | visits + card rule | 380 px |
| CANNOT INVOICE rail | hero count (Jobber's own Requires invoicing figure), oldest and median days, NOT YET READY, review queue counts, top three lines coloured by stage age | cannot-invoice rules | 500 px wide, right |
| Counts strip | Jobber's seven bucket counts in Jobber's words, plus UNANSWERED | job buckets, answered rule | 96 px |
| Footer | four source freshness dots, responder, board owner, build, queued writes, DPR warning | service status | 32 px |

Other screens: STAGES (seven Jobber columns, WIP cap, hard-red filter), CANNOT INVOICE (the full list with stage clocks), REVIEW 🔒 (PIN, READY / FIX / HOLD, unmatched rows, FLAG, focus, responder), SCORECARD 🔒 (seven numbers by week, per-crew first pass; the only place crew-level numbers exist). RECAP arrives with Jobber note writes (milestone M10).

## Formatting rules

- Design at 1920×1080 CSS px; the panel runs Chrome at device scale 2. Safe margin 96 px sides, 54 px top and bottom. Rows 64 · 48 · 232 · 380 · 96 · 32 with 24 px gaps; columns 1204 + 24 + 500.
- Type tiers: A 140 px (the hero number only), B 85 px (NOW names, trigger words, counts), C 42 px (labels, chips, rail rows), D 24 px (meta). Nothing below D. Inter, tabular digits.
- Colour is the house palette: brand green `#0f3d2e`; red `#e5322d` means act now; blue `#1f5ce6` means a card moved; green `#15803d` means automatic; amber means an exception; grey means someone else's clock or done. Red never appears without a word and an icon next to it.
- Every chip is an icon and a word: `○ NOT STARTED`, `● NOW`, `⚠ LATE`, `◌ NO RESULT`, `✓ Completed`, `↩ Return needed`, `◐ Prepped`, `✕ Customer cancelled`, `⚠ Problem`, `◔ AWAITING REVIEW`, `✎ FIX`, `❚❚ HOLD`, `✓✓ READY`, `✓✓ DONE`.
- Touch targets ≥ 48 px with 8 px gaps. Cards, strip lines and rail rows are inert; the rail, the counts boxes and ACK are the only taps on TODAY.
- Zones clip and say `+N more`; nothing scrolls on the wall.
- Light theme only. No animation beyond the 15-second refresh. No sound.
- No dollars, street addresses, phone numbers, incidents, rankings or names beside a quality number, ever.

## Rituals the board serves

- 07:00 huddle, 10 minutes, standing, agenda = the default screen top to bottom.
- 16:00 close (existing): CLOSE lines in Jobber for unanswered visits.
- 16:30 / 17:00 verdict cut-offs (Henry, then Jack).
- Monday 07:15 office scorecard; 4-week baseline before any target shows.
- 30-day audit: a zone nobody used comes off.

## What was deliberately left out

Photo capture (CompanyCam is the photo system), a fourth incident tracker (the Flags tab stays the record), a second crew answer set (Jobber's six Visit result values are the set), live clock-ins on cards (phase 2), a GHL sales tab, sounds, percentages during the baseline, and the +45 minute red "NOT STARTED" card word: there is no crew-arrived signal in v1, and a red word that fires on every in-progress visit is ignored by the second morning.
