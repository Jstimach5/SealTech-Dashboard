# DESIGN.md — SealTech QC Dashboard + Morning Email

Read before writing any template, CSS, or email HTML. This is a working tool for one reviewer
(Jack), read on a phone over Tailscale at 6:30 AM and on a desktop later. Goal: find the visits that
need attention in under 10 seconds and trust what each finding says. Not a marketing site.

Format follows the DESIGN.md convention (tokens + rules an agent can apply). Colors and font come
from SealTech's SOP guide house style, so the dashboard, email, and staff guides look like one company.

## Hard rules (these come from CLAUDE.md, not taste)
1. **Fact vs. suspicion look different.** `missing_document`, `note_flag`, `coverage_gap` = facts:
   solid left bar, solid badge. `visual_suspicion`, low-confidence `extraction` = suspicions: dashed
   left bar, outlined badge, label text "Possible". Never color alone — the shape and word differ too.
2. **Wording.** Vision output says "Possible …". Never "confirmed", "safe", "passed", "compliant".
   Empty visit = "No detected issues". Unevaluated visit = "Not fully evaluated", never folded into
   "no issues".
3. **Critical cannot be hidden.** Critical findings sort first, are never collapsed by default, and
   have no "hide" control — only the review actions.
4. **Every finding shows its evidence**: thumbnail(s) or note excerpt, rule ID + version, model
   name + version (if any), timestamp. Secondary text size is fine; absent is not.
5. **No customer names/addresses in URLs** (they end up in logs). URLs use visit/job IDs.

## Tokens
Plain CSS custom properties in `web/static/app.css`. No Tailwind, no build step.

```css
:root {
  color-scheme: light dark;
  /* SealTech house style (from the annotated-sop-guide skill). Same color jobs as the SOP guides:
     red = act now, amber = exception, blue = information, green = automatic / nothing found. */
  --brand: #0f3d2e;           /* header band, page titles, primary buttons */
  --brand-ink: #ffffff;       /* text on --brand */
  --brand-kicker: #9fd3b8;    /* secondary text on --brand */
  /* surfaces, neutrals tinted toward the brand green */
  --bg: #f5f7f6;  --surface: #ffffff;  --surface-2: #eaf0ed;
  --ink: #14201b; --ink-2: #4d5a54;    --line: #d5ddd9;
  /* severity: text color / tint / bar. Text passes 4.5:1 on its tint and on --surface.
     #e5322d and #d98b00 are bar/fill colors only; as text they fail contrast. */
  --critical: #b91c1c; --critical-bg: #fff5f5; --critical-bar: #e5322d;
  --high:     #a24a00; --high-bg:     #fff7e6; --high-bar:     #d98b00;
  --normal:   #1f5ce6; --normal-bg:   #f2f6ff; --normal-bar:   #1f5ce6;
  --ok:       #15803d; --ok-bg:       #f0fdf4;   /* "No detected issues" only */
  --unknown:  #5b5f66; --unknown-bg:  #eceef0;   /* "Not fully evaluated" */
  /* type: Inter self-hosted from web/static/fonts (no network fetch), system fallback */
  --font: Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --mono: ui-monospace, "Cascadia Mono", Consolas, monospace; /* IDs only */
  --fs-1: 0.8125rem; --fs-2: 0.9375rem; --fs-3: 1.0625rem; --fs-4: 1.375rem; --fs-5: 2rem;
  /* space (4px base) */
  --s1: 4px; --s2: 8px; --s3: 12px; --s4: 16px; --s5: 24px; --s6: 32px;
  --radius: 6px; --tap: 44px;
}
@media (prefers-color-scheme: dark) {
  :root {
    --brand: #0f3d2e; --brand-ink: #ffffff; --brand-kicker: #9fd3b8;
    --bg: #0e1714; --surface: #141e1a; --surface-2: #1b2823;
    --ink: #e6ece9; --ink-2: #a7b5ae; --line: #2a3832;
    --critical: #ff8a80; --critical-bg: #2a1414; --critical-bar: #e5322d;
    --high: #ffb84d;     --high-bg: #2b2010;     --high-bar: #d98b00;
    --normal: #8fb0ff;   --normal-bg: #141b2e;   --normal-bar: #1f5ce6;
    --ok: #6fd49a;       --ok-bg: #10241a;
    --unknown: #b0b4ba;  --unknown-bg: #24272b;
  }
}
```
Inter matches the SOP guides. Self-host the font files so the dashboard makes zero network fetches. The email uses the system stack (clients won't load it).

## Type
- Body `--fs-3` (17px) on phone, 16px desktop. Line-height 1.45. Max line 75ch.
- Numbers: `font-variant-numeric: tabular-nums` on every count, reading, date column.
- Monospace only for IDs (visit/job/photo/rule IDs). Everything else in `--font`.
- Sentence case everywhere. No all-caps letter-spaced labels.

## Layout
- **Answer first.** Every screen opens with one sentence that answers "do I need to do anything?"
  (e.g. "2 visits need you today. 1 critical."), then the counts, then the list. Detail is one tap
  away, never on the first screen. Same order in the email.
- **Rows, not cards.** Lists are dense rows with a severity bar, scannable top to bottom.
- **Phone first** (390px). Single column, 16px gutters. Desktop (≥1024px) adds a filter sidebar and
  a two-column visit page (findings left, evidence right). No horizontal scroll at any width.
- **Home:** six count tiles in the REQUIREMENTS §11 order, each a real `<a>` to the filtered list.
  Critical and High tiles use their severity color; zero renders as "0" in `--ink-2`, not hidden.
  Below: needs-attention list, critical first.
- **Visit list row:** severity badge · job type · visit date · tech · finding count. Whole row is the
  link. Customer name is shown on the page but never in the URL.
- **Visit page order:** header (client, address, job type, links to Jobber + CompanyCam) → facts →
  suspicions → line-item coverage bars → notes/forms → photos.
- **Coverage bar:** filled segments per required evidence category; missing segments show the
  category name, not just a gap.
- Review actions (Acknowledge · Needs follow-up · Resolved · False positive · Comment) are buttons
  ≥ `--tap` tall, pinned within thumb reach on phone. False positive asks for one-line reason
  (optional) and never needs a second screen.

## Components
- **Badge:** fact = filled `--{sev}-bg` + `--{sev}` text, with a `--{sev}-bar` left edge; suspicion = transparent bg, 1px dashed
  `--{sev}` border, text prefixed "Possible".
- **Finding card:** 4px left bar (solid fact / dashed suspicion) in `--{sev}-bar`, title, one-line
  evidence summary, thumbnails (`width`/`height` set, `loading="lazy"`), metadata line in `--fs-1`.
- **Thumbnail:** 96×96 phone, 128×128 desktop, `object-fit: cover`, opens the CompanyCam photo.
- **Tables** (review queue, labeling): real `<table>`, sticky header, row lines allowed.
- **Empty states** say what was checked: "12 visits checked. No detected issues." not a blank page.
- **Loading:** HTMX swaps show "Loading…" in place; swap targets carry `aria-live="polite"`.

## Motion
Almost none. 120ms opacity/transform on HTMX swaps, disabled under `prefers-reduced-motion`. No
scroll animations, no entrance effects. This is a review tool.

## Morning email (`report/`)
Email clients ignore most modern CSS. Separate rules:
- Table layout, inline styles, 600px max, system font stack, hex colors (no CSS vars).
- Same order as REQUIREMENTS §12. Same fact/suspicion distinction: suspicions get the word
  "Possible" and a dashed border (Outlook falls back to solid — the word carries it).
- No images in v1 (customer photos must not leave the machine via email). Link to the dashboard.
- Plain-text part mirrors the HTML exactly. Readable in under 3 minutes.

## Done means
A UI change is done only after: (1) web-design-guidelines review run on the changed files with
findings fixed or justified; (2) `python tools/ui_snap.py <url>` exits 0 and its 390px/1440px light/dark screenshots were looked at;
(3) the hard rules above checked by a test where possible (e.g. no "confirmed" in rendered HTML).

## Open (needs Jack)
- SealTech logo file (SVG preferred) for the header band.
