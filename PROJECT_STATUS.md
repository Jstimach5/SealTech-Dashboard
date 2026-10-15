# PROJECT_STATUS — SealTech Jobsite QC Audit

Truth about what actually works. When this disagrees with REQUIREMENTS.md, this wins and REQUIREMENTS gets a note.
Updated at the end of every session. Timezone America/Detroit.

## Completed

## Tested (with results)

## Limitations

## Blockers

## Needs Jack
- Activate staged UI skills: see `docs/ui-skills/README.md` (agent blocked from writing `.claude/skills/`).
- SealTech brand color(s)/logo for `docs/DESIGN.md` (`--accent` is a placeholder).

## Next

## Prototype-vs-production compromises

## Decisions log
- 2026-10-14 (Jack): Session 1 runs locally on the Windows workstation, not in the cloud container. Cloud container could not reach api.getjobber.com / api.companycam.com and cannot see a local .env.
- 2026-10-14 (Jack): .claude/settings.json approved; git push allowed without asking.
- 2026-10-14 (Jack): Pin Python >=3.12 (3.12 per spec on the workstation).
- 2026-10-15: Added `docs/DESIGN.md` (dashboard + email design rules; token contrast checked ≥4.5:1 light and dark). Staged web-design-guidelines + playwright-cli skills in `docs/ui-skills/`. Rejected taste-skill (self-declared not for dashboards), image-to-code, awesome-design-md brand copies.
