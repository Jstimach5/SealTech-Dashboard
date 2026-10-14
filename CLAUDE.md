# SealTech Jobsite QC Audit — Standing Rules

Read this at the start of every session. `REQUIREMENTS.md` is the spec. `PROJECT_STATUS.md` is the truth about what actually works. When they disagree, STATUS wins and REQUIREMENTS gets a note.

## What this is
Nightly audit of SealTech **visits**. Pull Jobber + CompanyCam read-only, check documentation per Jobber line item, cross-reference notes/forms/photos, classify photos with a local vision model, produce a dashboard and a 6:30 AM email. One reviewer (Jack). Timezone America/Detroit everywhere.

## Scope fence
**In:** visit-level documentation audit, photo classification and data-plate/gauge extraction, note/form contradiction checks, dashboard, morning email.
**Out:** sales, leads, GHL, inventory, purchasing, write-back to Jobber/CompanyCam, night alerts (v1), technician scoring (emit a per-visit compliance signal; the KPI system does the scoring), Broadmark.

## Pre-approved — do without asking
- Create/modify files under the project directory
- `pip install` into the project venv
- Git commits in the project repo
- Read-only API calls to Jobber and CompanyCam with stored credentials
- Running tests, benchmarks, and the dashboard bound to 127.0.0.1
- Downloading installers via Chrome for: Python 3.12, Git, Ollama, NSSM, Tailscale (install only when the current phase calls for it)
- Ollama model pulls ≤ 8 GB each

## Ask first — every time
- Any write or mutation to Jobber, CompanyCam, or Microsoft 365
- Sending email to anyone
- System-wide settings, Windows services, Task Scheduler entries, power settings
- Sending customer photos or data to any cloud API (approved in principle; ask per batch with count and purpose)
- Spending money
- Deleting anything outside the project directory
- Binding any port to anything other than 127.0.0.1 or the Tailscale interface

## Non-negotiables
- Credentials live in `.env` (gitignored) only. Never in code, logs, commits, chat, or PROJECT_STATUS.md.
- Never report a component done without a test run. Paste the output.
- Never auto-merge a Jobber job and a CompanyCam project on name or address similarity. Integration reference or review queue.
- Vision output is "possible," never "confirmed." A missing document is a fact; a visual defect is a suspicion. Store them with different `finding_kind` values and render them differently.
- Never state that gas equipment is safe, a combustion test passed, or work is code-compliant from photos.
- Never delete or overwrite prior audit results. Append and version.
- Every finding stores: model name + version, rule ID + version, timestamp, evidence IDs.
- Customer names and addresses stay out of log files. Log job/visit/project IDs.
- SQLite with WAL. No Postgres. No Docker. No n8n. No WSL dependency.
- Build rules against real data shapes. Fictional fixtures are anonymized copies of real records, created after the first live pull.
- Verify a field exists in a live response or GraphiQL before writing a rule that depends on it.

## Working style
- Working software over architecture. Deterministic checks ship before any model runs.
- One phase at a time. Don't start the next phase's install or code until the current phase is tested and STATUS is updated.
- Blocked → document the blocker in STATUS, pick a safe workaround, continue on independent work.
- End every session by updating `PROJECT_STATUS.md`: done / tested (with results) / limits / blockers / needs Jack / next.
