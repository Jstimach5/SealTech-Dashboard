/**
 * Review-row ↔ Jobber-job matching and the per-job verdict roll-up (decisions 5, 7, 8, 43).
 * Live facts the rules rest on: the Photo Review Queue's column E `Job` is scope text, not a job
 * number; rows carry no Jobber key today (the service appends `jobberJobId` / `jobNumber` when it
 * writes a verdict, decisions 8 and 30); the overnight checker (decision 43) writes rows with no
 * `pass`. A row is tied to a job exactly (by an appended key) or inferred from the application
 * file stem's last name plus a completed visit near the install date. Anything else is 'none':
 * the row sits in REVIEW's unmatched panel and never yields a verdict. Never a guess.
 * Pure functions; no clock is needed here.
 */
import { CONFIG } from '../config.js';
import type { Verdict } from '../enums.js';
import type { Instant, Job, JobberId, LocalDate, ReviewRow, Visit } from '../types.js';
import { daysBetweenLocalDates, localDate, toDate } from './time.js';

export type MatchKind = ReviewRow['match'];

export interface RowMatch {
  match: MatchKind;
  jobId?: JobberId;
}

export interface JobVerdicts {
  latest?: ReviewRow;
  pass1?: ReviewRow;
  pass2?: ReviewRow;
  checker?: ReviewRow;
  pass1Ready: boolean;
  pass2Ready: boolean;
  latestVerdict?: Verdict;
}

/** The checker's file-name prefix; only stems with it have a known segment layout (decision 43). */
const STEM_PREFIX = 'STI';
/** Segment index of the last name in `STI_<SCOPE>_<LAST>_<FIRST>_<ADDRESS>_<KIND>`. */
const STEM_LAST_NAME_INDEX = 2;

const ISO_DATE = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;
const US_DATE = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/;

const pad = (n: number) => String(n).padStart(2, '0');

// ---------------------------------------------------------------------------------------------
// Parsing the sheet's text columns
// ---------------------------------------------------------------------------------------------

/** Basename of an application path without its extension: 'a/b/STI_X_Y.pdf' → 'STI_X_Y'. */
export function fileStem(application: string): string {
  const base = application.trim().split(/[\\/]/).pop() ?? '';
  return base.replace(/\.[A-Za-z0-9]+$/, '');
}

/** Decision 43: the checker names files `STI_<SCOPE>_<LAST>_...`; segment 2 is the last name, uppercased. */
export function lastNameFromApplication(application: string): string | undefined {
  const segments = fileStem(application)
    .split('_')
    .map((s) => s.trim());
  if (segments.length <= STEM_LAST_NAME_INDEX) return undefined;
  if ((segments[0] ?? '').toUpperCase() !== STEM_PREFIX) return undefined;
  const last = (segments[STEM_LAST_NAME_INDEX] ?? '').toUpperCase();
  return last === '' ? undefined : last;
}

/** Sheet dates arrive as 'YYYY-MM-DD', 'M/D/YYYY' or 'M/D/YY' (two-digit years are 20xx); anything else is undefined. */
export function parseSheetDate(s: string | undefined): LocalDate | undefined {
  const text = (s ?? '').trim();
  let y: number;
  let m: number;
  let d: number;
  const iso = ISO_DATE.exec(text);
  const us = US_DATE.exec(text);
  if (iso) {
    y = Number(iso[1]);
    m = Number(iso[2]);
    d = Number(iso[3]);
  } else if (us) {
    m = Number(us[1]);
    d = Number(us[2]);
    y = Number(us[3]);
    if (y < 100) y += 2000;
  } else {
    return undefined;
  }
  return isRealDate(y, m, d) ? `${y}-${pad(m)}-${pad(d)}` : undefined;
}

/** True when the calendar day exists (rejects month 13, Feb 30, ...). */
function isRealDate(y: number, m: number, d: number): boolean {
  const x = new Date(Date.UTC(y, m - 1, d));
  return x.getUTCFullYear() === y && x.getUTCMonth() === m - 1 && x.getUTCDate() === d;
}

// ---------------------------------------------------------------------------------------------
// Matching one row to one job
// ---------------------------------------------------------------------------------------------

/**
 * Decisions 5, 7, 8: a row with a Jobber key matches exactly; a keyed row that resolves to no job
 * is 'none' (the key is authoritative, so it is never re-inferred from the stem); an unkeyed row
 * may be inferred. Zero or two-plus candidates are 'none' — never guess.
 */
export function matchReviewRow(row: ReviewRow, jobs: Job[], visits: Visit[]): RowMatch {
  const exact = exactMatch(row, jobs);
  if (exact) return { match: 'exact', jobId: exact.id };
  if (hasJobberKey(row)) return { match: 'none' };
  const inferred = inferredMatch(row, jobs, visits);
  return inferred ? { match: 'inferred', jobId: inferred.id } : { match: 'none' };
}

/** Decision 8: the appended `jobberJobId` or `jobNumber` column names the job outright. */
export function exactMatch(row: ReviewRow, jobs: Job[]): Job | undefined {
  if (row.jobberJobId) {
    const byId = jobs.find((job) => job.id === row.jobberJobId);
    if (byId) return byId;
  }
  if (hasJobNumber(row)) return jobs.find((job) => job.jobNumber === row.jobNumber);
  return undefined;
}

/**
 * Live fact (decision 43): checker rows carry no key, so the stem's last name must single out
 * exactly one job that also has a completed visit within ±REVIEW_MATCH_TOLERANCE_DAYS of the
 * install date. When the stem gives no last name at all, column E is tried as a last name instead
 * and accepted only when it equals exactly one job's (no date check on that path).
 */
export function inferredMatch(row: ReviewRow, jobs: Job[], visits: Visit[]): Job | undefined {
  const stemLast = lastNameFromApplication(row.application);
  if (stemLast === undefined) return jobDescMatch(row, jobs);
  const installDate = parseSheetDate(row.installDate);
  if (installDate === undefined) return undefined;
  const candidates = jobs.filter(
    (job) => sameLastName(job.lastName, stemLast) && hasCompletedVisitNear(job, visits, installDate),
  );
  return candidates.length === 1 ? candidates[0] : undefined;
}

/** Fallback when the stem names nobody: column E used as a last name, accepted only when it equals exactly one job's lastName. */
export function jobDescMatch(row: ReviewRow, jobs: Job[]): Job | undefined {
  const text = row.jobDesc.trim();
  if (text === '') return undefined;
  const candidates = jobs.filter((job) => sameLastName(job.lastName, text));
  return candidates.length === 1 ? candidates[0] : undefined;
}

/** CONFIG.REVIEW_MATCH_TOLERANCE_DAYS: a completed visit of this job whose Detroit-local date is within the tolerance of the install date. */
export function hasCompletedVisitNear(job: Job, visits: Visit[], installDate: LocalDate): boolean {
  return visits.some(
    (visit) =>
      visit.jobId === job.id &&
      visit.completedAt !== undefined &&
      Math.abs(daysBetweenLocalDates(installDate, localDate(visit.completedAt))) <= CONFIG.REVIEW_MATCH_TOLERANCE_DAYS,
  );
}

function hasJobberKey(row: ReviewRow): boolean {
  return Boolean(row.jobberJobId) || hasJobNumber(row);
}

function hasJobNumber(row: ReviewRow): boolean {
  return row.jobNumber !== undefined && Number.isFinite(row.jobNumber);
}

function sameLastName(a: string, b: string): boolean {
  return a.trim().toUpperCase() === b.trim().toUpperCase();
}

/** Copies of the rows with `match` and `matchedJobId` set by matchReviewRow; a stale matchedJobId on a 'none' row is dropped. Inputs are not mutated. */
export function matchAllReviewRows(rows: ReviewRow[], jobs: Job[], visits: Visit[]): ReviewRow[] {
  return rows.map((row) => {
    const { match, jobId } = matchReviewRow(row, jobs, visits);
    const copy: ReviewRow = { ...row, match };
    delete copy.matchedJobId;
    if (jobId !== undefined) copy.matchedJobId = jobId;
    return copy;
  });
}

// ---------------------------------------------------------------------------------------------
// Verdict roll-up per job
// ---------------------------------------------------------------------------------------------

/** Sortable key: the row's instant (reviewedAt, else the Checked date at 00:00Z, else ''), then the zero-padded sheet row index. */
export function rowOrderKey(row: ReviewRow): string {
  const checkedDate = parseSheetDate(row.checked);
  let stamp = '';
  if (row.reviewedAt) stamp = normalizeInstant(row.reviewedAt);
  else if (checkedDate !== undefined) stamp = normalizeInstant(`${checkedDate}T00:00:00Z`);
  return `${stamp}|${String(row.rowIndex).padStart(8, '0')}`;
}

/** Same instant → same text whatever offset or precision the sheet used; unparsable text is kept as is. */
function normalizeInstant(instant: Instant): string {
  try {
    return toDate(instant).toISOString();
  } catch {
    return instant;
  }
}

/** Rows ascending by rowOrderKey; a new array, inputs untouched. */
export function sortByOrderKey(rows: ReviewRow[]): ReviewRow[] {
  return [...rows].sort((a, b) => compareKeys(rowOrderKey(a), rowOrderKey(b)));
}

function compareKeys(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/**
 * Decisions 5 and 7: per matched job, the latest row overall, the latest pass-1 (Henry), pass-2
 * (Jack) and checker (no pass) rows, and whether each pass currently stands at READY. Rows with
 * match 'none' never yield a verdict. Decision 5's "pass 2 only after pass 1 READY" is not enforced
 * here; the service enforces it at write time.
 */
export function verdictsByJob(rows: ReviewRow[]): Record<JobberId, JobVerdicts> {
  const groups = new Map<JobberId, ReviewRow[]>();
  for (const row of rows) {
    if (row.match === 'none' || row.matchedJobId === undefined) continue;
    const list = groups.get(row.matchedJobId) ?? [];
    list.push(row);
    groups.set(row.matchedJobId, list);
  }
  const out: Record<JobberId, JobVerdicts> = {};
  for (const [jobId, list] of groups) out[jobId] = summarizeVerdicts(sortByOrderKey(list));
  return out;
}

/** The roll-up for one job's rows, already in rowOrderKey order. */
export function summarizeVerdicts(ordered: ReviewRow[]): JobVerdicts {
  const latest = ordered[ordered.length - 1];
  const pass1 = lastWhere(ordered, (row) => row.pass === 1);
  const pass2 = lastWhere(ordered, (row) => row.pass === 2);
  const checker = lastWhere(ordered, (row) => row.pass === undefined);
  const out: JobVerdicts = {
    pass1Ready: pass1?.verdict === 'READY',
    pass2Ready: pass2?.verdict === 'READY',
  };
  if (latest) out.latest = latest;
  if (pass1) out.pass1 = pass1;
  if (pass2) out.pass2 = pass2;
  if (checker) out.checker = checker;
  if (latest?.verdict !== undefined) out.latestVerdict = latest.verdict;
  return out;
}

function lastWhere(rows: ReviewRow[], pick: (row: ReviewRow) => boolean): ReviewRow | undefined {
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i];
    if (row && pick(row)) return row;
  }
  return undefined;
}
