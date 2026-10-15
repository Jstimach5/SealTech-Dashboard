# Jobber developer app — hand-off brief

For the Claude Cowork session on Jack's office PC that creates the app (owner decision 22). Everything the board needs from Jobber is listed here; nothing else should be requested.

## What to create

| Field | Value |
|---|---|
| App name | `SealTech Board` |
| Visibility | Private (this account only) |
| Auth | OAuth 2.0 authorization code |
| Redirect URI | `http://localhost:8787/oauth/callback` (if Jobber refuses localhost, use the Cloudflare Tunnel hostname from `docs/kiosk-setup.md` and tell the service via `JOBBER_REDIRECT_URI`) |
| GraphQL version | Pin the current stable version and write it into `.env` as `JOBBER_GRAPHQL_VERSION` |

Credentials go **only** into `C:\SealTech\board\.env` as `JOBBER_CLIENT_ID` and `JOBBER_CLIENT_SECRET`. Never paste the secret into chat, Notion, GHL, Zapier, Drive or a sheet. Report back the app name, client id, scopes granted, webhook topics, and the five answers below. Never the secret.

## Step 1 — read scopes (unblocks live read-only mode, milestone M8)

Request read access to: clients, jobs, visits / scheduled items, invoices, users, custom fields, and job forms if the scope list offers them.

Then answer these five questions in the GraphQL explorer and put the answers in `docs/jobber-assumptions.md`:

1. **Custom fields.** Does `job.customFields` return `CompanyCam Project`, `Program` and `Permit status`? Paste the field names and value types exactly as returned.
2. **Job-form answers.** Can the `Visit result` job form's answers be read? On which object (`visit`, `job`, `jobForm`)? If not readable, say so; the board then runs on close-code notes until writes exist.
3. **Notes.** What is the mutation that creates a note, and does it attach to a `Visit` or only to a `Job`? Paste the mutation signature.
4. **Status filter spellings.** What are the exact enum values for the job status filter (the buckets `unscheduled`, `upcoming`, `today`, `late`, `action_required`, `requires_invoicing`, `on_hold`, `archived`)? Paste the enum.
5. **Reminders.** Is there a field exposing the job's invoicing reminder setting ("As needed, no reminders")? Name it or say none.

Also note the throttle numbers the API returns (cost per query, available points, restore rate) from one `search_jobs`-sized query.

## Step 2 — write scopes (unblocks note writes and the RECAP screen, milestone M10)

Request write access to notes on jobs and visits (plus job-form answers if that is a separate scope). Do **not** request quote, request, client, invoice or payment writes. The board never writes those.

## Webhooks (milestone M11)

Subscribe the app to: `VISIT_COMPLETE`, `VISIT_CREATE`, `VISIT_UPDATE`, `JOB_CREATE`, `JOB_UPDATE`, `INVOICE_CREATE`, `INVOICE_UPDATE`, and any job-form topic present in `WebHookTopicEnum` (paste the full enum into the assumptions doc). Endpoint: the tunnel hostname + `/webhooks/jobber`. The service answers 200 in under a second and dedupes on item id + occurred-at, so at-least-once delivery is fine. Record the signing secret the same way as the client secret.

## One adjacent ask for the owner's CompanyCam check session

When the overnight photo check writes a row to the `SealTech Photo Review Queue` sheet, also write the Jobber job number into the new `Job #` column (column N after `migrate:sheet` runs). Until it does, the board matches rows by file stem and install date, and shows anything ambiguous in the REVIEW screen's unmatched panel instead of guessing.

## Checklist to report back

- [ ] App created, private, OAuth code flow, redirect URI accepted (or tunnel hostname used)
- [ ] GraphQL version pinned and written to `.env`
- [ ] Client id and secret in `.env` only
- [ ] Step 1 scopes granted
- [ ] Five answers written into `docs/jobber-assumptions.md`
- [ ] Throttle numbers recorded
- [ ] Step 2 scopes granted (may be a later day)
- [ ] Webhook topics subscribed and signing secret in `.env`
