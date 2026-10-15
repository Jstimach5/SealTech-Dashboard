# UI skills — staged, not active

Vetted copies of design/QA skills. They sit here because the agent is not allowed to write into
`.claude/skills/` on its own. Jack activates them:

```
mkdir -p .claude/skills && cp -r docs/ui-skills/web-design-guidelines docs/ui-skills/playwright-cli .claude/skills/
```

| Skill | Source (pinned) | Why |
|---|---|---|
| web-design-guidelines | vercel-labs/web-interface-guidelines @ 434b7f9 (MIT) | Audits templates for a11y, focus, forms, mobile, dark mode. Rules vendored locally; upstream fetched instructions from the internet every run, removed. Adapted for Jinja/HTMX. |
| playwright-cli | microsoft/playwright-cli @ b85c7a7 (Apache-2.0) | Interactive browser driving. Optional: needs Node 18+ (not pre-approved). The routine screenshot check is `tools/ui_snap.py` (Python, pip-only), so skip this unless Node gets approved. |

Rejected from the same video:
- **taste-skill v2** — its own description: "Not for dashboards or app screens." Requires ≥8 animated
  elements and ≥4 photos per page. Wrong tool for a QC review screen.
- **image-to-code** (in taste-skill repo) — built for Codex image generation; we have no design images to convert.
- **awesome-design-md** — catalog of other companies' brand analyses. Used only its format; `docs/DESIGN.md` is our own.
