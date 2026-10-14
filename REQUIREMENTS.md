# SealTech Jobsite QC Audit — Requirements v2

Supersedes the 2026-10-13 master prompt. Jack's decisions are baked in (§0). Standing rules are in `CLAUDE.md`.

## 0. Decisions (Jack, 2026-10-13)

| Topic | Decision |
|---|---|
| Audit unit | Jobber **Visit**. Partial coverage checks nightly on multi-day jobs; full checks fire on the last visit. |
| Upload timing | Crews upload on site, same day. A 7:00 PM sync sees the day's photos. |
| System of record | Jobber. GHL is ignored. |
| Priority | Photo vision first, scoped as **classification + extraction** against the line-item evidence matrix (§5). Defect detection is Phase 6. |
| Jobber↔CompanyCam link | Projects are created by the Jobber integration. Match on the integration reference only. Anything without one goes to a review queue. |
| Technicians | 1:1 users in both systems, except shared Management/Sales logins. Attribute photos by CompanyCam creator; shared-login photos attribute to "Management/Sales". |
| Required evidence | Driven by the Jobber **line items** on the job. |
| Before/after labels | Not tagged today. Open item §18.1. |
| Combustion / gas readings | Photographs of the analyzer screen. Extracted by vision; cloud-verified. |
| Energy certificate | Every insulation job: photo of the certificate at the breaker box. |
| Ground truth | None exists. Validation is prospective (Phase 5). |
| CLEAResult submission | = Jobber invoice created and marked sent. Tracked as a visit state, not a finding. |
| Jobber app | Reuse the existing developer app; add read scopes; re-authorize. |
| CompanyCam | Jack is admin; generates the token during a Cowork session. |
| M365 | Tenant is resold through GoDaddy; admin level unknown. See §12. |
| Remote access | Tailscale approved. |
| Workstation | Sleeps today. Jack controls power settings. |
| Installed today | Nothing relevant (no Docker, WSL, Ollama, n8n). |
| Cloud vision | Approved for accuracy checks and building a calibration set. Bulk analysis stays local. |
| Anthropic API | No Console account yet. Open item §18.3. |
| Photo retention | Local originals purged after `RETAIN_DAYS` (default 30). Thumbnails and analysis records kept. CompanyCam is the archive. |
| Reviewer | Jack only. |
| Write-back | Out of scope. |
| Night alerts | Out of v1. |
| Dedup | A persisting unchanged finding is shown every morning, marked "day N". |

## 1. Objective

By 6:30 AM every weekday: a dashboard and a ≤3-minute email covering every visit completed the previous workday, with each finding tied to the exact photo, note, form, or checklist that supports it, and direct links to the Jobber and CompanyCam records. Visits that could not be fully evaluated are listed as such, never as "no issues."

## 2. Unit of audit

A **visit** (Jobber `Visit`) completed on the audit date. For each visit the system knows: job, client, property, line items, assigned users, notes, incomplete-job-form count, completion time, whether it is the last visit, and the linked CompanyCam project.

- **Intermediate visit:** report evidence coverage per line item (0–100%), flag a completed visit with zero new photos that day, flag hazard language in notes.
- **Last visit:** all required evidence for every line item must be present. Missing = High.
- The system cannot know which line items were *due* on an intermediate day. It reports progress; it does not judge pace unless visit instructions enumerate the day's items.

## 3. Data sources (verified 2026-10-13)

**Jobber** — single GraphQL endpoint, OAuth 2.0, `X-JOBBER-GRAPHQL-VERSION` header required, leaky-bucket cost throttle (10,000 points, 500/sec refill). `Visit` exposes completion time, last-visit flag, and the count of incomplete job-form submissions. Whether form *answers* are readable is unconfirmed — check in Developer Center → Manage Apps → Test in GraphiQL → Documentation during Session 1. Jobber also has webhooks (job updated, job closed); not needed for v1.

**CompanyCam** — Core API v2 at `api.companycam.com/v2`, bearer token generated in-app, no approval review. Readable: projects, photos (metadata, URIs, descriptions, tags, creator), photo/project comments, project notepad, per-project checklists, documents, project integration references. Webhooks exist (new photo, photo tagged, checklist completed) — optional later. Rate limits unpublished; connector must back off on 429 by default.

**Microsoft 365** — see §12.

## 4. Job-type classification (v1)

From the Jobber job title, per SealTech's existing title rule:
- Title contains `HVAC` → **HVAC** (further split by line items: eval/tune-up vs. install)
- Title contains `Consumers` and not `HVAC` → **Consumers Insulation**
- Otherwise → **Standard Insulation**
- Line items decide sub-type (spray foam, cellulose, removal). Titles that match nothing expected → review queue, not a guess.

Mapping lives in `config/job_types.yaml`. The planned Jobber/CompanyCam rebuild will change names; config, not code, absorbs it.

## 5. Line-item evidence matrix

The core of the system. `config/evidence_matrix.yaml` maps Jobber line-item name patterns to required evidence. Each requirement has a photo category the vision model classifies into (Tier C) and a presence rule (Tier A).

**Consumers Insulation**

| Line item | Required evidence |
|---|---|
| Attic hatch | After photo: hatch insulated and weather-stripped |
| Baffles | After photo: baffles visible at eaves |
| Blown cellulose | Before photo (existing level); after photo (coverage); depth marker photo (flag if absent, Normal) |
| Air sealing | Photos of sealed penetrations (top plates, can lights, chases, plumbing) |
| Caulking | Photos of caulked joints |
| Blower door | Before reading photo; after reading photo; extracted CFM50 values; after ≤ 80% of before (flag if ≥ 80% or unreadable) |
| Rim joist spray foam | Before and after photos |
| Weather stripping | After photos (doors) |
| *All insulation jobs* | Energy certificate photo at breaker box |

**HVAC**

| Item | Required evidence |
|---|---|
| Water heater | Data plate photo; extracted mfg/model/capacity |
| Furnace | Data plate photo; extracted mfg/model/BTU input |
| Condenser | Data plate photo; extracted mfg/model/tonnage |
| Each equipment item + piping + ductwork | ≥1 "problems/concerns" photo (presence, by category) |
| Constraints | ≥1 photo (presence) |
| Thermostat | Before and after photos |
| Tune-up / eval | Combustion analyzer screen photo; extracted readings; Jobber tune-up form submitted (incomplete-form count = 0) |
| Install | Replacement application artifacts per `hn-hvac-replacement-packet` (packet fields loaded into config, not hard-coded) |

**Standard Insulation**

| Item | Required evidence |
|---|---|
| Any insulation line item | Before and after photos; count ≥ `PHOTOS_PER_SQFT` × line-item square footage (default TBD — open item §18.2) |
| *All* | Energy certificate photo at breaker box |

**All visits**
- Visit marked complete in Jobber
- Incomplete job-form count = 0 on the last visit
- Linked CompanyCam project exists
- ≥1 photo created on the visit date
- Applicable CompanyCam checklist (if one exists on the project) complete on the last visit

## 6. Check tiers

**Tier A — deterministic (no model).** Everything in §5 that is a presence or count check, plus visit/form/checklist/invoice states. These are facts. `finding_kind = "missing_document"`.

**Tier B — text (local LLM, ~8B).** Jobber job notes, visit instructions, CompanyCam comments and notepad. Structured output: `{hazard_terms[], temporary_fix: bool, unresolved: bool, contradiction_with: [...]}`. Hazard vocabulary (gas leak, CO, carbon monoxide, red tag, hazard tag, cracked heat exchanger, flue, sparking, flooding, etc.) in `config/hazard_terms.yaml`; keyword match runs *before* the model so a model failure never hides a hazard. `finding_kind = "note_flag"`.

**Tier C — vision classification + extraction (local VLM, ≤8B at 4-bit).** Per photo: multi-label category from the evidence matrix; before/after inference (content + timestamp order, low confidence until tagging exists); data-plate field extraction; analyzer and manometer reading extraction; certificate present/absent. Confidence stored per label. `finding_kind = "coverage_gap"` when a category is empty, `"extraction"` for values. Cloud model (Claude) used on: extracted numeric readings, data plates with low confidence, and the calibration set — per-batch approval, count logged.

**Tier D — vision defect detection (Phase 6, after Phase 5 numbers exist).** Gaps, voids, corrosion, leaks, missing panels, loose components, poor cleanup. Local draft, cloud verify on flagged subset. `finding_kind = "visual_suspicion"`. Never promoted to a fact.

Separate prompts per domain: insulation photos, HVAC photos, data plates, gauges/analyzers, general site. One 11 GB GPU cannot hold a text model and a vision model at once; Ollama swaps them. Order Tier B for all visits, then Tier C.

## 7. Severity

- **Critical** — hazard term in notes with no documented resolution; reported gas leak / CO; hazard tag; serious electrical or flooding language. Human review required; the system never downgrades these.
- **High** — required evidence missing on last visit; incomplete form; completed visit with zero photos; note says temporary fix but form says resolved; contradiction between any two sources; blower-door reduction < 20% or unreadable.
- **Normal** — depth-marker absent, low-confidence extraction, unlabeled photos, administrative mismatches.

A visit with no findings is reported as "no detected issues," never "compliant."

## 8. Cross-reference rules (seed set)

| ID | Sources | Flag when |
|---|---|---|
| XR-01 | Form/checklist vs. notes | Equipment marked operational; notes report failure to ignite / no heat / no cooling; no later note resolves it |
| XR-02 | Visit status vs. photos | Visit complete; required after-photo categories empty |
| XR-03 | Notes vs. form | Note reports leak/defect; form or report says "good condition" |
| XR-04 | Notes vs. follow-up | Hazard term present; no resolution note, no follow-up visit scheduled |
| XR-05 | Notes vs. form | Note contains temporary/bypass language; form marks resolved |
| XR-06 | Blower door before vs. after | After ≥ 80% of before |
| XR-07 | Data plate vs. line item | Line item says 3-ton condenser; plate extraction reads 2.5 |

Each finding records: issue, rule ID, evidence IDs (photo/note/form), confidence, what Jack should verify.

## 9. Photo pipeline

1. Fetch photo metadata for linked projects; skip photos whose `(id, updated_at)` is already stored.
2. Download originals to `data/photos/{project_id}/{photo_id}.jpg`. Keep CompanyCam URIs and IDs.
3. Generate 1024-px analysis copy and 256-px thumbnail. SHA-256 the original; cache keyed on hash + model + prompt version.
4. Classify (Tier C), extract, store labels with confidence.
5. Link findings to photo IDs. Dashboard shows thumbnails; click → CompanyCam.
6. Purge originals and 1024-px copies after `RETAIN_DAYS`. Keep thumbnails, hashes, labels.
7. Re-evaluate a visit when a new photo arrives on a later sync; prior findings are versioned, not replaced.

Benchmark exactly two local models (one Qwen-VL-class, one Llama-Vision-class) on 50 real photos Jack labels through the dashboard. Report per-category precision/recall, seconds per photo, VRAM. Pick one. Stop benchmarking.

## 10. Database (SQLite, WAL)

Tables: `jobs`, `visits`, `clients`, `properties`, `line_items`, `users`, `cc_projects`, `photos`, `photo_labels`, `notes`, `comments`, `checklists`, `checklist_items`, `documents`, `job_forms` (if exposed), `audit_runs`, `findings`, `finding_evidence`, `finding_versions`, `review_decisions`, `sync_state`, `errors`, `match_queue`.

Every row from an external system keeps its external ID and `fetched_at`. Findings carry `rule_id`, `rule_version`, `model_name`, `model_version`, `prompt_version`, `created_at`, `finding_kind`, `severity`, `confidence`. Nothing is deleted; superseded findings get `superseded_by`.

## 11. Dashboard

FastAPI + Jinja + HTMX. Binds 127.0.0.1:8080. Reached from phone via Tailscale. Single password (bcrypt), session cookie. No build step, no React.

- **Home:** visits evaluated / needing attention / critical / high / no detected issues / not fully evaluated. Each number links to the filtered list.
- **Visit page:** client, address, job type, line items with coverage bars, technicians, findings grouped by kind (facts first, suspicions second, visually distinct), thumbnails per finding, notes, form/checklist status, Jobber link, CompanyCam link.
- **Actions:** Acknowledge · Needs follow-up · Resolved · False positive · Comment. False-positive clicks are the training data; the button is load-bearing.
- **Filters:** severity, job type, technician, date, review status, finding kind.
- **Review queue:** unmatched projects, unknown line items, unknown job titles.
- **Labeling view (Phase 3):** photo + category checkboxes, 50-photo calibration set.

## 12. Morning email

Subject: `SealTech Daily Job Audit — {Month D, YYYY}`. Recipient: Jack. HTML + plain text. Order: critical → high → awaiting documentation → not fully evaluated → no detected issues (count + one line each) → dashboard link.

**Delivery:** Microsoft Graph `Mail.Send` via an Entra app registration is the target. The tenant is resold through GoDaddy, which commonly restricts Entra admin access. Session 1 check: sign in at entra.microsoft.com → App registrations → New registration. If blocked, options in order: (a) SMTP AUTH with an app password — Microsoft's updated timeline leaves basic SMTP AUTH unchanged until December 2026, then disabled by default for existing tenants and re-enableable by an admin, so this is a bridge, not a destination; (b) a transactional sender (Resend/SendGrid free tier) from a SealTech subdomain; (c) Gmail API if a Google Workspace mailbox is acceptable. No email leaves the machine until Jack approves the first send.

## 13. Schedule (America/Detroit)

| Time | Job |
|---|---|
| 7:00 PM | Sync Jobber visits/jobs/notes for the day; sync linked CompanyCam projects/photos/comments/checklists |
| 7:30 PM | Tier A + Tier B for all visits completed today |
| 8:00 PM → | Tier C photo classification/extraction; cross-reference rules |
| 6:15 AM | Incremental resync; re-evaluate visits with new data |
| 6:30 AM | Freeze run, render dashboard state, send email |

Each job is idempotent with a checkpoint row in `sync_state`. A failed job marks affected visits `not_fully_evaluated` with the reason. Task Scheduler entries run "whether user is logged on or not."

## 14. Infrastructure

- Windows native. Python 3.12 venv. Ollama for Windows. Git.
- Dashboard and Ollama run as Windows services via NSSM so they survive logoff and reboot.
- Power: sleep disabled, active hours set to cover 6:00 PM–7:00 AM; Jack approves the change.
- Tailscale on workstation and Jack's phone. Dashboard also listens on the Tailscale IP, nothing else.
- Backups: nightly `VACUUM INTO` of the SQLite file + `config/` to a second local path; restore tested once in Phase 4. Dedicated drive deferred.
- Monitoring: a run that doesn't produce a 6:30 AM email by 6:45 AM writes a failure email (or, if email itself failed, a desktop notification and a `FAILED` file the dashboard home shows).

## 15. Security

No credentials in code or git. Least-privilege read scopes on Jobber; CompanyCam token scoped as narrowly as the app allows. `.env` permissions restricted to Jack's user. Logs reference IDs, not names. Dashboard never public; 127.0.0.1 + Tailscale only. Cloud API calls logged with photo count and purpose. Prototype-vs-production compromises listed in PROJECT_STATUS.md.

## 16. Phases

**P0 — Inspect (½ session).** Hardware, OS, drivers, disk, Python, Git, power settings. `docs/ENVIRONMENT.md`.

**P1 — Read-only live sync.** Jobber read scopes + re-auth; CompanyCam token; 30 days of visits, jobs, line items, notes, users, projects, photos, comments, checklists, documents into SQLite. Output: field-availability report, photo volume by job type, line-item vocabulary, % of projects with an integration reference, % of photos with any tag/description, job-form data availability. No rules, no models, no dashboard.

**P2 — Deterministic audit (shippable).** `evidence_matrix.yaml` and `job_types.yaml` from P1 vocabulary; Tier A checks; Tier B hazard/contradiction scan (keyword first, model second); cross-reference seed rules; dashboard; email rendered to file (not sent); tests on anonymized fixtures from real records.

**P3 — Vision classification/extraction.** Ollama install; two-model benchmark on Jack's 50 labeled photos; pick one; Tier C in pipeline; caching; cloud verification path with per-batch approval.

**P4 — Production.** NSSM services, Task Scheduler, power settings, Tailscale, email delivery (per §12), backups + restore test, restart-recovery test, failure monitor.

**P5 — Prospective validation (2 weeks minimum).** Jack reviews every morning and marks false positives. Track per-rule FP rate, missed issues he found manually, time per visit, `not_fully_evaluated` rate. Tune thresholds and prompts. No new features during this window.

**P6 — Defect detection.** Only after P5 numbers exist. Local draft + cloud verify on flagged subset. Same prospective validation loop.

## 17. Deliverables

Source tree, `README.md` (install/setup), `docs/ENVIRONMENT.md`, schema (`db/schema.sql`), `config/*.yaml`, connectors (`jobber/`, `companycam/`, `m365/`), rules (`audit/rules/`), vision pipeline (`vision/`), dashboard (`web/`), email (`report/`), tests (`tests/`) with fixtures, scheduler definitions (`ops/`), backup/restore scripts, and `PROJECT_STATUS.md` updated every session with: completed · tested (results) · limitations · blockers · needs Jack · next.

## 18. Open items

1. **Before/after tagging.** Crews don't tag. A two-tag rule (`before`, `after`) in CompanyCam costs seconds per photo and removes a whole class of ambiguity. Until then the model infers from content and timestamp order with reduced confidence on same-day attic work. Jack decides whether to add the rule.
2. **Photos-per-square-foot ratio** for Standard Insulation. Needs a number from Jack (or P1 computes the historical median and Jack blesses it).
3. **Anthropic Console account.** Separate from the claude.ai subscription; needs billing. Set a monthly cap in config. Used for calibration and verification, not nightly bulk.
4. **M365 admin level.** 2-minute Entra check in Session 1 (§12).
5. **Jobber re-authorization** adds read scopes to the shared developer app; the TimeGuardian hours push must be re-pointed at the new token so it doesn't break.
6. **Replacement application packet** fields for HVAC installs: load from the existing packet definition into config during P2.
