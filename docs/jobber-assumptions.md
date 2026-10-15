# Jobber API assumptions (unverified until the developer app exists)

Every row is something the service code assumes about Jobber's GraphQL API that was **not** confirmed through the connector used during design (Oct 13). The Cowork session that creates the developer app (see `jobber-app-handoff.md`) answers each one in the explorer and fills in the Answer column. Code paths marked *guarded* already degrade safely when the assumption is false.

| # | Assumption | Where it matters | Check | Guarded? | Answer |
|---|---|---|---|---|---|
| 1 | Job status filter enum values are `UNSCHEDULED, UPCOMING, TODAY, LATE, ACTION_REQUIRED, REQUIRES_INVOICING, ON_HOLD, ARCHIVED` (or close) | `apps/service/src/jobber/queries.ts` bucket query | introspect the jobs filter input type | no: a wrong spelling returns zero jobs; the footer shows the source error | |
| 2 | `job.customFields` returns `CompanyCam Project`, `Program`, `Permit status` with readable values | card CompanyCam link, program fail-safe, INSPECTION/PERMIT reason | query one requires_invoicing job | yes: missing fields → no link, program from title, permit from hold reason only | |
| 3 | Notes attach to `Job` (possibly also `Visit`) and expose `message`, `createdAt` | `parseNotes` input; `notesForVisit` assigns job notes to visits by time | query `job.notes` | yes: job-level notes are assigned to the latest visit that started before the note | |
| 4 | Note creation mutation exists for jobs (name and arguments unknown) | ACK and recap writes (M10) | introspect mutations containing `note` | yes: writes stay queued behind `JOBBER_WRITES=on` | |
| 5 | The `Visit result` job-form answers are readable through the API | `formAnswers` precedence step | query job forms on a completed visit | yes: `resultSource` falls to `note` then `unknown` | |
| 6 | `visit.incompleteJobFormsCount` is 0 both when all forms are answered and when no form was ever attached | `answeredState` tri-state via `formsSeenMax` | observed on Oct 13 on a never-started visit | yes: tri-state | confirmed Oct 13 |
| 7 | `visit.actionsUponComplete` carries no per-visit information | nothing | observed Oct 13: identical 3-item array on every visit | yes: field is never read | confirmed Oct 13 |
| 8 | `job.visitsInfo.pastCount` is unreliable | nothing | observed Oct 13: wrong on a job completed the day before | yes: field is never read; `futureCount` is used only for `futureVisitCount` | confirmed Oct 13 |
| 9 | `job.visitsInfo.futureCount` is reliable | RETURN NEEDED and leak guard | compare against the visit list for five jobs | partly: the service recomputes from fetched visits when they are all loaded | |
| 10 | A field exposes "As needed, no reminders" on the job's invoicing schedule | `remindersOff` | introspect `Job` for invoicing/reminder fields | yes: the leak guard does not depend on it | |
| 11 | Invoice totals and `invoiced` state are readable per job (`job.invoices` with `invoiceStatus`, `total`) | `invoiced`, `isZeroTotal`, `hasUninvoicedWork` | query one invoiced and one uninvoiced job | no: without invoices every job reads as uninvoiced and nothing greys to DONE | |
| 12 | Throttle: cost-based, with `extensions.cost.throttleStatus` in each response | poll backoff | read one response | yes: backoff on any 429/THROTTLED | |
| 13 | Webhook payloads are signed with an HMAC-SHA256 of the raw body using the app secret, header name unknown | `/webhooks/jobber` | read the webhook docs page in the developer portal | yes: webhooks are off until M11 and polling continues regardless | |
| 14 | OAuth redirect to `http://localhost:8787/oauth/callback` is accepted for a private app | first token | try it in the app settings | yes: tunnel hostname fallback | |
| 15 | All instants are returned in UTC with a `Z` suffix | every day boundary (America/Detroit) | inspect one `startAt` | yes: `time.ts` handles any ISO offset | confirmed Oct 13 |
| 16 | `visit.assignedUsers` returns user ids that match `users` query ids | crew lanes and crew-lead owner lookup | compare one visit's assignee id with the users list | no: unmatched ids put the visit in an UNASSIGNED lane | |

## Visits the service must deliver (revision G)

`SourceInputs.visits` is the last worked day, today and tomorrow, **plus the latest visit of every job in an attention bucket or on the cannot-invoice list**. The ledger's why (`Sun 11 Oct visit open` for a Late job), the return owner (crew lead of the last visit) and the still-open rule read those visits. The fixture already delivers them; `apps/service/src/sources/live.ts` must fetch them at M8.
