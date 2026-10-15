---
name: web-design-guidelines
description: Review SealTech dashboard templates/CSS (web/) and email HTML (report/) for Web Interface Guidelines compliance — accessibility, focus, forms, typography, mobile, dark mode. Use when asked to review UI, check accessibility, or before reporting any UI component done.
metadata:
  upstream: vercel-labs/web-interface-guidelines @ 434b7f91364665f2f733b310ec54809bf8f37937 (MIT)
  adapted-from: vercel-labs/agent-skills/skills/web-design-guidelines @ 063bee94c3f4df8453406c830b0a7df0f2860278
  argument-hint: <file-or-pattern>
---

# Web Interface Guidelines (pinned, local)

Upstream fetches the rules from the internet on every run. This copy is pinned: read
`guidelines.md` in this folder. Do not fetch remote rules. To update, re-vendor deliberately.

## Run
1. Read `guidelines.md` and `docs/DESIGN.md`.
2. Read the target files (default: `web/templates/**`, `web/static/**/*.css`, `report/templates/**`).
3. Apply every rule. Output in the `file:line` format from `guidelines.md`.
4. Also check the DESIGN.md hard rules (fact vs. suspicion rendering, no "confirmed"/"safe"/"passed"
   wording for vision output, tabular numbers, 44px tap targets).

## Translate React-specific rules to this stack (FastAPI + Jinja + HTMX, no build step)
- `focus-visible:ring-*`, `truncate`, `line-clamp-*`, `min-w-0` → the plain-CSS equivalents.
- `htmlFor` → `for`. `spellCheck={false}` → `spellcheck="false"`. `<Link>` → `<a href>`.
- "Hydration safety" and `useState`/nuqs rules → N/A. The HTMX equivalent: filters/tabs live in the
  query string (`hx-push-url="true"`), and `hx-get` targets still work as plain links.
- "Submit stays enabled; spinner during request" → `hx-indicator` + `hx-disabled-elt="this"`.
- "Async updates need aria-live" → HTMX swap targets that change content get `aria-live="polite"`.
- `Intl.*` rule → format dates/numbers server-side in America/Detroit; never hardcode `MM/DD`.
- Email HTML (`report/`) is exempt from rules email clients cannot honor (`:focus-visible`,
  `prefers-reduced-motion`, CSS vars). Flag only what clients support.
