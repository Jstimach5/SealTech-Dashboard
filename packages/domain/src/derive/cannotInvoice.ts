/**
 * CANNOT INVOICE lines (decisions 30, 31, 43). A job sitting in Requires Invoicing gets one line
 * with one of the ten fixed reasons, per-stage clocks (completed → 1st review → 2nd review →
 * submitted → accepted) and a colour by the stage SealTech owns. Inputs are the job, its visits and
 * the Photo Review Queue rows already matched to it (match !== 'none'); human reviewer rows carry
 * pass 1|2 (decision 5), the overnight checker's rows carry no pass (decision 43). Labels follow
 * decision 4: LASTNAME · CITY · SCOPE, never dollars, address or phone. Pure functions; `now` is
 * always passed in.
 */
import { CONFIG } from '../config.js';
import { STAGES, type Reason, type ReviewStatus, type Stage } from '../enums.js';
import type { CannotInvoiceLine, Instant, Job, LocalDate, Owner, ReviewRow, Visit } from '../types.js';
import { fromLocal, localDaysBetween, maxInstant, minInstant, toDate } from './time.js';
import { parseSheetDate } from './reviewMatch.js';

/** A HOLD whose reason mentions an inspection or permit is INSPECTION/PERMIT, not HOLD (decision 30). */
const INSPECTION_RE = /inspect|permit/i;
/** A fix item about paperwork is FORM/QUANTITIES MISSING (decision 30). */
const FORM_RE = /form|quantit|unsigned/i;
/** Sheet text `<pre> > <post>`, thousands separators allowed, anything after the pair ignored. */
const BLOWER_DOOR_RE = /(\d[\d,]*(?:\.\d+)?)\s*>\s*(\d[\d,]*(?:\.\d+)?)/;
/** Jobber permit statuses that mean the job is waiting on an inspection (compared lowercase). */
const PERMIT_INSPECTION_STATUSES: readonly string[] = ['inspection requested', 'inspection scheduled', 'failed'];
/** Sheet Status values that close a FIX row. */
const CLOSED_FIX_STATUSES: readonly ReviewStatus[] = ['Fixed', 'Accepted as is', 'Submitted'];
/** Clock instant for a sheet date column: local noon, so a date never straddles midnight. */
const SHEET_DATE_HHMM = '12:00';
/** Ordering instant for a row that has only a `checked` date: the start of that local day, so an overnight
 *  checker row sorts before every human verdict of the same day (must agree with reviewMatch.rowOrderKey). */
const SHEET_ORDER_HHMM = '00:00';

// ---------------------------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------------------------

/** Blower-door column text → pre/post CFM and the reduction fraction; unparseable text → undefined. */
export function parseBlowerDoor(text: string | undefined): { pre: number; post: number; reduction: number } | undefined {
  if (!text) return undefined;
  const m = BLOWER_DOOR_RE.exec(text);
  if (!m) return undefined;
  const pre = Number((m[1] ?? '').replace(/,/g, ''));
  const post = Number((m[2] ?? '').replace(/,/g, ''));
  if (!Number.isFinite(pre) || !Number.isFinite(post) || pre <= 0) return undefined;
  return { pre, post, reduction: (pre - post) / pre };
}

/** Ordering instant: reviewedAt, else the start of the sheet's `checked` day (local), else unknown. */
export function rowInstant(row: ReviewRow): Instant | undefined {
  if (row.reviewedAt) return row.reviewedAt;
  const date = parseSheetDate(row.checked);
  return date ? fromLocal(date, SHEET_ORDER_HHMM) : undefined;
}

/** Clock instant (decision 31): reviewedAt, else the sheet's `checked` date at local noon, else unknown. */
export function rowClockInstant(row: ReviewRow): Instant | undefined {
  if (row.reviewedAt) return row.reviewedAt;
  const date = parseSheetDate(row.checked);
  return date ? fromLocal(date, SHEET_DATE_HHMM) : undefined;
}

/** Rows in review order: by reviewedAt ?? checked date, then sheet order; undated rows sort first in sheet order. */
export function sortedRows(rows: ReviewRow[]): ReviewRow[] {
  const keyed = rows.map((row) => {
    const at = rowInstant(row);
    return { row, time: at ? toDate(at).getTime() : 0 };
  });
  keyed.sort((a, b) => {
    if (a.time !== b.time) return a.time - b.time;
    return a.row.rowIndex - b.row.rowIndex;
  });
  return keyed.map((k) => k.row);
}

// ---------------------------------------------------------------------------------------------
// Small predicates, one rule each
// ---------------------------------------------------------------------------------------------

/** A visit counts as completed when Jobber says so or it has a completion instant. */
function isCompletedVisit(visit: Visit): boolean {
  return visit.isComplete || visit.completedAt !== undefined;
}

/** The visit with the latest scheduled start. */
function latestVisit(visits: Visit[]): Visit | undefined {
  let best: Visit | undefined;
  for (const v of visits) if (!best || toDate(v.startAt) > toDate(best.startAt)) best = v;
  return best;
}

/** Last row in review order that satisfies the predicate. */
function lastRowWhere(ordered: ReviewRow[], pred: (row: ReviewRow) => boolean): ReviewRow | undefined {
  for (let i = ordered.length - 1; i >= 0; i--) {
    const row = ordered[i];
    if (row && pred(row)) return row;
  }
  return undefined;
}

/** Decision 52: a human reviewer row carries Pass 1 or 2; a machine row (checker, audit) carries none. */
export function isHumanRow(row: ReviewRow): boolean {
  return row.pass === 1 || row.pass === 2;
}

/** Decision 30: PROGRAM-WAIT = submitted to Vault and no row records an acceptance or a return yet. */
function isProgramWait(rows: ReviewRow[]): boolean {
  const submitted = rows.some((r) => Boolean(r.submittedDate));
  const answered = rows.some((r) => Boolean(r.acceptedDate) || Boolean(r.returnedDate));
  return submitted && !answered;
}

/** Decision 7: a HOLD with blank status is the owner still deciding, unless the reason is an inspection/permit. */
function isOwnerHold(row: ReviewRow): boolean {
  return row.verdict === 'HOLD' && (row.status ?? '') === '' && !INSPECTION_RE.test(row.holdReason ?? '');
}

/** Decision 30: a HOLD whose reason mentions an inspection or permit. */
function isInspectionHold(row: ReviewRow): boolean {
  return row.verdict === 'HOLD' && INSPECTION_RE.test(row.holdReason ?? '');
}

/** Decision 30: Jobber permit status that means the job waits on an inspection (case-insensitive). */
function isInspectionPermitStatus(permitStatus: string | undefined): boolean {
  if (!permitStatus) return false;
  return PERMIT_INSPECTION_STATUSES.includes(permitStatus.trim().toLowerCase());
}

/** Decision 7: a FIX row is open until its Status is Fixed, Accepted as is or Submitted. */
function isFixOpen(row: ReviewRow): boolean {
  return row.verdict === 'FIX' && !CLOSED_FIX_STATUSES.includes(row.status ?? '');
}

/** Decision 7: the latest open FIX row (any pass), unless a later row already says READY. */
function openFixRow(ordered: ReviewRow[]): ReviewRow | undefined {
  for (let i = ordered.length - 1; i >= 0; i--) {
    const row = ordered[i];
    if (!row || !isFixOpen(row)) continue;
    const closedByLaterReady = ordered.slice(i + 1).some((r) => r.verdict === 'READY');
    return closedByLaterReady ? undefined : row;
  }
  return undefined;
}

/** Decision 30: the latest visit ended Return needed or Problem and nothing further is scheduled. */
function isReturnNeeded(job: Job, visits: Visit[]): boolean {
  const latest = latestVisit(visits);
  if (!latest) return false;
  const needsReturn = latest.result === 'Return needed' || latest.result === 'Problem';
  return needsReturn && job.futureVisitCount === 0;
}

/** Decision 30: a parsed blower-door reading under CONFIG.BLOWER_DOOR_MIN_REDUCTION; unparseable text never fails. */
function isBlowerDoorFail(row: ReviewRow): boolean {
  const parsed = parseBlowerDoor(row.blowerDoorPrePost);
  return parsed !== undefined && parsed.reduction < CONFIG.BLOWER_DOOR_MIN_REDUCTION;
}

/** Decision 30: Jobber still counts unanswered forms on a completed visit, or the latest fix item is paperwork. */
function isFormMissing(visits: Visit[], latest: ReviewRow | undefined): boolean {
  const unansweredForms = visits.some((v) => isCompletedVisit(v) && v.incompleteJobFormsCount > 0);
  return unansweredForms || FORM_RE.test(latest?.fixBeforeSubmitting ?? '');
}

// ---------------------------------------------------------------------------------------------
// Reason
// ---------------------------------------------------------------------------------------------

/**
 * Decisions 30, 31, 43: the first true predicate wins, in this order:
 * PROGRAM-WAIT → HOLD → INSPECTION/PERMIT → FIX OPEN → RETURN NEEDED → BLOWER DOOR FAIL →
 * FORM/QUANTITIES MISSING → AWAITING 2ND REVIEW → READY TO INVOICE → AWAITING 1ST REVIEW.
 * `fromRow` is the sheet row the reason came from, when there is one; `fixPick` is its fix item.
 */
export function cannotInvoiceReason(
  job: Job,
  visits: Visit[],
  rows: ReviewRow[],
): { reason: Reason; fixPick?: string; fromRow?: ReviewRow } {
  // Decision 52 (proposed, default on): a row with no Pass is a machine row (the overnight checker, later the
  // audit). It is advisory: shown on REVIEW beside the human verdicts (decision 43), never a reason or a clock.
  const all = sortedRows(rows);
  const ordered = all.filter(isHumanRow);
  const latest = ordered.at(-1);

  // 1. PROGRAM-WAIT (Vault dates are typed by whoever submits; any row may carry them)
  if (isProgramWait(all)) return { reason: 'PROGRAM-WAIT' };
  // 2. HOLD
  if (latest && isOwnerHold(latest)) return { reason: 'HOLD', fromRow: latest };
  // 3. INSPECTION/PERMIT
  if (latest && isInspectionHold(latest)) return { reason: 'INSPECTION/PERMIT', fromRow: latest };
  if (isInspectionPermitStatus(job.permitStatus)) return { reason: 'INSPECTION/PERMIT' };
  // 4. FIX OPEN
  const fix = openFixRow(ordered);
  if (fix) {
    const out: { reason: Reason; fixPick?: string; fromRow?: ReviewRow } = { reason: 'FIX OPEN', fromRow: fix };
    if (fix.fixBeforeSubmitting) out.fixPick = fix.fixBeforeSubmitting;
    return out;
  }
  // 5. RETURN NEEDED
  if (isReturnNeeded(job, visits)) return { reason: 'RETURN NEEDED' };
  // 6. BLOWER DOOR FAIL
  if (ordered.some(isBlowerDoorFail)) return { reason: 'BLOWER DOOR FAIL' };
  // 7. FORM/QUANTITIES MISSING
  if (isFormMissing(visits, latest)) return { reason: 'FORM/QUANTITIES MISSING' };
  // 8. AWAITING 2ND REVIEW / 9. READY TO INVOICE (decision 5: pass 1 then pass 2; checker rows have no pass)
  const latestPass1 = lastRowWhere(ordered, (r) => r.pass === 1);
  const latestPass2 = lastRowWhere(ordered, (r) => r.pass === 2);
  if (latestPass1?.verdict === 'READY' && !latestPass2) return { reason: 'AWAITING 2ND REVIEW' };
  if (latestPass2?.verdict === 'READY') return { reason: 'READY TO INVOICE' };
  // 10. default
  return { reason: 'AWAITING 1ST REVIEW' };
}

// ---------------------------------------------------------------------------------------------
// Clocks
// ---------------------------------------------------------------------------------------------

/** Decision 31: when the completed stage closed: latest visit completion, else Jobber's job completedAt. */
function completedClock(job: Job, visits: Visit[]): Instant | undefined {
  return maxInstant(...visits.map((v) => v.completedAt)) ?? job.completedAt;
}

/** Decision 31: when the 1st review closed: earliest pass-1 review (reviewedAt, else checked date at noon). */
function firstReviewClock(rows: ReviewRow[]): Instant | undefined {
  return minInstant(...rows.filter((r) => r.pass === 1).map(rowClockInstant));
}

/** Decision 31: when the 2nd review closed: earliest pass-2 reviewedAt. */
function secondReviewClock(rows: ReviewRow[]): Instant | undefined {
  return minInstant(...rows.filter((r) => r.pass === 2).map((r) => r.reviewedAt));
}

/** Decision 30: earliest sheet date in a column, as local noon. */
function earliestSheetDate(rows: ReviewRow[], pick: (row: ReviewRow) => LocalDate | undefined): Instant | undefined {
  const instants = rows.map(pick).map((d) => (d ? fromLocal(d, SHEET_DATE_HHMM) : undefined));
  return minInstant(...instants);
}

/** Decision 31: one clock per closed stage; a stage with no clock is still open. */
export function stageClocks(job: Job, visits: Visit[], rows: ReviewRow[]): Partial<Record<Stage, Instant>> {
  const clocks: Partial<Record<Stage, Instant>> = {};
  const completed = completedClock(job, visits);
  if (completed) clocks.completed = completed;
  const firstReview = firstReviewClock(rows);
  if (firstReview) clocks.first_review = firstReview;
  const secondReview = secondReviewClock(rows);
  if (secondReview) clocks.second_review = secondReview;
  const submitted = earliestSheetDate(rows, (r) => r.submittedDate);
  if (submitted) clocks.submitted = submitted;
  const accepted = earliestSheetDate(rows, (r) => r.acceptedDate);
  if (accepted) clocks.accepted = accepted;
  return clocks;
}

/** Decision 31: the first stage in STAGES order with no clock; when every clock is set, the last stage. */
export function openStage(clocks: Partial<Record<Stage, Instant>>): Stage {
  for (const stage of STAGES) if (!clocks[stage]) return stage;
  return STAGES[STAGES.length - 1] ?? 'accepted';
}

/** Days in America/Detroit from `since` to `now`, clamped at 0; no `since` → 0. */
function daysSince(since: Instant | undefined, now: Instant): number {
  if (!since) return 0;
  return Math.max(0, localDaysBetween(since, now));
}

/** Decision 31: calendar days the line has sat in the stage its reason belongs to. */
export function stageDays(
  reason: Reason,
  clocks: Partial<Record<Stage, Instant>>,
  visits: Visit[],
  fromRow: ReviewRow | undefined,
  now: Instant,
): number {
  let since: Instant | undefined;
  switch (reason) {
    case 'AWAITING 1ST REVIEW':
    case 'BLOWER DOOR FAIL':
    case 'FORM/QUANTITIES MISSING':
      since = clocks.completed;
      break;
    case 'AWAITING 2ND REVIEW':
      since = clocks.first_review;
      break;
    case 'FIX OPEN':
    case 'HOLD':
    case 'INSPECTION/PERMIT':
      since = fromRow ? (fromRow.reviewedAt ?? clocks.completed) : clocks.completed;
      break;
    case 'RETURN NEEDED': {
      const latest = latestVisit(visits);
      since = latest?.resultAt ?? latest?.completedAt ?? clocks.completed;
      break;
    }
    case 'READY TO INVOICE':
      since = clocks.second_review;
      break;
    case 'PROGRAM-WAIT':
      since = clocks.submitted;
      break;
  }
  return daysSince(since, now);
}

// ---------------------------------------------------------------------------------------------
// Colour and line
// ---------------------------------------------------------------------------------------------

/**
 * Decision 31: amber at CONFIG.AMBER_DAYS, red at CONFIG.RED_DAYS in the stage SealTech owns;
 * PROGRAM-WAIT is grey (the program's clock, not ours); hard red at CONFIG.HARD_RED_DAYS since
 * completion with no Vault submission, which forces red.
 */
export function lineColour(
  reason: Reason,
  stageDays: number,
  daysSinceCompleted: number,
  submitted: boolean,
  inspectionFailed = false,
): { colour: 'none' | 'amber' | 'red' | 'grey'; hardRed: boolean } {
  const hardRed = daysSinceCompleted >= CONFIG.HARD_RED_DAYS && !submitted;
  if (hardRed) return { colour: 'red', hardRed: true };
  if (reason === 'PROGRAM-WAIT') return { colour: 'grey', hardRed: false };
  // Decision 51 (proposed, reading of 31): a requested or scheduled inspection runs on the inspector's clock,
  // so it is grey like PROGRAM-WAIT; a failed inspection is SealTech's move again and is coloured by its days.
  if (reason === 'INSPECTION/PERMIT' && !inspectionFailed) return { colour: 'grey', hardRed: false };
  if (stageDays < CONFIG.AMBER_DAYS) return { colour: 'none', hardRed: false };
  if (stageDays < CONFIG.RED_DAYS) return { colour: 'amber', hardRed: false };
  return { colour: 'red', hardRed: false };
}

/** Decision 4: `LASTNAME · CITY · SCOPE`, uppercase. No dollars, street address or phone, ever. */
export function cannotInvoiceLabel(job: Job): string {
  return `${job.lastName} · ${job.city} · ${job.scope}`.toUpperCase();
}

/** Decisions 30, 31, 33: one CANNOT INVOICE line for a job; the owner and tags are decided by the caller. */
export function buildCannotInvoiceLine(args: {
  job: Job;
  visits: Visit[];
  rows: ReviewRow[];
  now: Instant;
  owner: Owner;
  tags: Array<'NO-REMINDER' | 'NO CHARGE?'>;
}): CannotInvoiceLine {
  const { job, visits, rows, now, owner, tags } = args;
  const { reason, fixPick, fromRow } = cannotInvoiceReason(job, visits, rows);
  const clocks = stageClocks(job, visits, rows.filter(isHumanRow).concat(rows.filter((r) => !isHumanRow(r) && (r.submittedDate || r.acceptedDate))));
  const days = stageDays(reason, clocks, visits, fromRow, now);
  const daysSinceCompleted = daysSince(clocks.completed ?? job.updatedAt, now);
  const inspectionFailed = (job.permitStatus ?? '').trim().toLowerCase() === 'failed';
  const { colour, hardRed } = lineColour(reason, days, daysSinceCompleted, clocks.submitted !== undefined, inspectionFailed);
  const line: CannotInvoiceLine = {
    jobId: job.id,
    label: cannotInvoiceLabel(job),
    reason,
    owner,
    clocks,
    openStage: openStage(clocks),
    stageDays: days,
    daysSinceCompleted,
    colour,
    hardRed,
    tags,
  };
  if (fixPick !== undefined) line.fixPick = fixPick;
  return line;
}
