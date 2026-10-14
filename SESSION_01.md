# Session 1 — Inspect, initialize, read-only live sync

Read `CLAUDE.md` and `REQUIREMENTS.md` first. This session covers Phases P0 and P1 only. No rules, no models, no dashboard. If a step blocks, write the blocker to `PROJECT_STATUS.md` and continue with the next independent step.

## 1. Inspect the machine
Record in `docs/ENVIRONMENT.md`: Windows edition/build; CPU model, cores/threads; installed RAM; GPU model, VRAM, NVIDIA driver version; free space per drive; every Python install and version; Git; whether Docker/WSL/Ollama/n8n exist (report only — do not install anything this session); current power/sleep settings; existing Task Scheduler entries and services that look related. Report before moving on.

## 2. Initialize the project
Propose a project path (suggest `C:\SealTech\jobsite-audit`) and wait for my confirmation. Then: `git init`, `.gitignore` (venv, `.env`, `data/`, `db/*.sqlite*`, `logs/`), Python 3.12 venv (download via Chrome if absent — installer only, ask before running it), `requirements.txt`, `.env.example` with every key the connectors will need, structured logging to `logs/`, `README.md` skeleton, `PROJECT_STATUS.md` skeleton, `config/` folder with empty `job_types.yaml` and `evidence_matrix.yaml`.

## 3. Jobber read-only
- Ask me to open the Jobber Developer Center and add read scopes to the existing app: jobs, visits, clients, properties, users, notes, and any job-form scope that exists. I will re-authorize in Chrome and paste the tokens into `.env`.
- Note in STATUS that the TimeGuardian hours push needs re-pointing at the new token.
- In GraphiQL (Developer Center → Manage Apps → Test in GraphiQL → Documentation), find and record: the `Visit` fields; whether job-form *contents* (not just the incomplete count) are queryable, and the exact field names; the `Job.lineItems` shape; note types on jobs and visits. Write findings to `docs/JOBBER_FIELDS.md`.
- Pull the last 30 days of completed visits with: job, client, property/address, line items (name, quantity, unit), assigned users, notes, incomplete-job-form count, completion time, last-visit flag, job URL. Respect the cost throttle; back off on `THROTTLED`.

## 4. CompanyCam read-only
- Ask me to generate an API access token in CompanyCam; I'll paste it into `.env`.
- Pull projects updated in the last 30 days: project fields, integration references (find the field that carries the Jobber job ID), photos (ID, created time, creator, description, tags, URIs), photo and project comments, notepad, checklists and items, documents.
- Download original photos for 5 projects (mix of insulation and HVAC) into `data/photos/{project_id}/`. Record size and count. Back off on 429.
- Write field findings to `docs/COMPANYCAM_FIELDS.md`.

## 5. Load SQLite
`db/audit.sqlite`, WAL mode. Minimal real schema for what was pulled (visits, jobs, clients, properties, line_items, users, cc_projects, photos, comments, checklists, checklist_items, documents, sync_state, errors, match_queue). Keep external IDs and `fetched_at` on every row. Write `db/schema.sql`.

## 6. Report (this is the deliverable)
Write `docs/P1_REPORT.md` and paste the summary to me:
- How CompanyCam projects reference Jobber jobs in real data: field name, and % of projects that carry it. Unmatched projects → `match_queue`.
- Photo volume: per visit, per job type, per day; min/median/max.
- Line-item vocabulary: every distinct line-item name with counts.
- Job-title classification: % matching `HVAC`, `Consumers`, neither.
- Labeling reality: % of photos with any tag; % with any description.
- Job-form data: available or not; field names if yes.
- Historical median photos-per-square-foot for Standard Insulation visits (for open item §18.2).
- Anything in `REQUIREMENTS.md` the real data makes impossible, unnecessary, or different.

## 7. Email path check (2 minutes, with me)
Ask me to sign in at entra.microsoft.com and try App registrations → New registration. Record the result in STATUS. Do not register anything yet.

## 8. Close
Update `PROJECT_STATUS.md`. Commit. List what you need from me before Session 2.
