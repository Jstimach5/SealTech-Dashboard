# Board brief: what is on the wall and why

The one-page design reference for `apps/board` (revision G, Oct 15). Owner decisions are in `owner-decisions.md` (50–56 are this revision's proposals); the computation behind each word is in `derivation-rules.md`; the daily use is in `huddle-card.md` and `owner-daily.md`.

## The job of the wall

One question first, in one sentence: **who has to act now.** Below it every open item has exactly one home: a ranked row in **Needs you**, a counted line in the **Requires invoicing** table, or a line in a **crew row**. The owner's words: "understand jobsites and progress, highlight jobs we are unable to invoice for."

The design borrows the jobsite audit's discipline (answer first, rows not cards, red rare and always with a word, facts apart from suspicions, never "confirmed", "safe", "passed" or "compliant") but not its content: the audit is a per-visit evidence review, the wall is the live operations and billing screen.

## Why it is derived, not typed

Every tracker SealTech typed into this year died within weeks; every feed that fills itself is still alive. The board types nothing of its own: it reads Jobber and the two existing sheets, and the inputs it takes (review verdicts, issue flags, crew recaps, ACKs) are written back into those systems. Decision 56 lists the three settings that live in the service until sheet writes exist.

## Zones (1920×1080 CSS px, device scale 2, margins 96 / 54)

| Zone | Box | Shows |
|---|---|---|
| Answer | 96–1824 × 54–190 | Line 1 (76 px): `Nguyen Problem · no ACK since 9:05 am`, `5 to act on now · 4 more today`, `Nothing to act on · 5 jobs to invoice`, `Nothing open · 7 visits today`. Line 2 (42 px): `Focus: …` left; the one win number right (`READY 1st pass 3 of 4 jobs`), or `Stale · Jobber as of 8:45 am` with an amber bar in the left margin. Touch shows the nav for 10 s. |
| Needs you | 96–1216 × 214–974 | Head: `Needs you` and the last worked day's plan kept (`Tue 5 of 7 visits kept · 2 unanswered`). Six slots of 120 px: name (56), age (56), owner (42); status and why (42), `→ next` or the ACK button. Past six rows, five rows and a names line (`+5 · Holt · Kowalski · Diaz · Rossi · Greene`). |
| Requires invoicing | 1280–1824 × 214–(Z4 − 24) | Jobber's own count (140 px) and `jobs`, then a table in fixed order: done today not READY, 1st pass with actor and cut-off, 2nd pass, ready to invoice, owner decides, with crews, invoiced not closed, waiting on others. 7 lines with 2 crews, 3 with 4, 1 with 5. One tap opens Cannot invoice. |
| Crews | 1280–1824 × (974 − 104·n)–974 | One row per crew, never collapsed: crew name and next token (`→ Okafor 1 pm`, `last day · 2 of 2`, `Mbeki done`, after 15:00 `tomorrow Lee 8 am` / `none tomorrow`); the NOW job and its status (`○ 10 am`, `● Now`, `⚠ Still open`, `✓ Completed`). Schedule only: nothing a crew owes is printed here. |
| Meta | 96–1824 × 990–1026 | 30 px, never huddle content: date, Demo data, source times, responder, photo feed, unmatched rows, unanswered forms, unknown visits, queued writes; dropped from the end when they do not fit. |

## Type

Inter, self-hosted (`apps/board/public/fonts`), so the TV renders the font every budget was measured in. Five sizes: 140 hero, 76 answer, 56 ledger names and ages, 42 everything else the huddle reads, 30 meta. No upper-case styling, no letter-spacing; capitals only for initials, CREW / OFFICE, FIX / HOLD / READY and ACK. Tabular figures only in age, time and count cells. Budgets are pixels measured with Inter's own advance widths (`packages/domain/src/derive/interWidths.ts`), checked in unit tests and again on the rendered page.

## Colour

| Colour | Where on the wall |
|---|---|
| Ink #14201b, ink-2 #4d5a54, hairline #d5ddd9 on #f5f7f6 | Everything. Structure is whitespace and one hairline. |
| Brand #0f3d2e | The ACK button and the nav. Never a status. |
| Red #e5322d (fill) | The ring and left edge of a Problem 15 minutes without ACK (decision 41). Nothing else. |
| Red #b91c1c (text) | Age and status word of a red or hard-red row (decision 31), and of the overdue Problem. Always with the word. |
| Amber #a24a00 (text) | 3–6 day ages, the stale bar and line, `none tomorrow`, a review line past its cut-off. |
| Green, blue | Not on the wall (decisions 27 and 34 unchanged; they appear on PIN screens). |

Every status is an icon from one inline SVG set plus a word; the word carries the meaning.

## Other screens

STAGES (Jobber's seven buckets, counts in the heads), CANNOT INVOICE (every line grouped by next move with actor and cut-off, stage clocks, hold reasons and FIX items in full, the reconciliation sentence), REVIEW (PIN: human verdicts solid, checker rows marked `checker:` and dashed, unmatched rows), SCORECARD (PIN: the seven decision-44 numbers by week). Every screen other than TODAY returns to TODAY after 60 s without a touch (decision 49). Laptop (1280–1899 px wide) shows every row with band headings; phone (390 px) shows the same content as a list with a tab bar.

## Rituals the board serves

07:00 huddle, top to bottom in about 90 seconds of reading (`huddle-card.md`); 16:00 close; 16:30 / 17:00 verdict cut-offs; Monday 07:15 scorecard; 30-day "not discussed → remove" audit.

## Deliberately left out

Photo capture (CompanyCam is the photo system), a fourth incident tracker, a second crew answer set, live clock-ins, a GHL sales tab, sounds, percentages during the baseline, free text on the TV, machine verdicts on the wall, per-crew numbers on the wall, and the red "NOT STARTED" word (there is no crew-arrived signal in v1).
