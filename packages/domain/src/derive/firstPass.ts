/**
 * First-pass READY (decisions 44, 35) and "visits not yet READY" (decision 32). The Photo Review
 * Queue sheet is the verdict store (decision 8): Henry's pass-1 rows, Jack's pass-2 rows and the
 * overnight checker's rows (decision 43) all live there, and the board shows them without
 * re-implementing either review. Only matched rows (`match !== 'none'`, `matchedJobId` set) can
 * yield a verdict. Weeks are local Monday-start dates (decision 39); day math goes through time.ts.
 */
import type { Verdict } from '../enums.js';
import type { Crew, Instant, Job, JobberId, LocalDate, ReviewRow, Visit } from '../types.js';
import { addLocalDays, daysBetweenLocalDates, localDate, toDate } from './time.js';

export interface ReadyCount {
  ready: number;
  total: number;
}

/** Decision 44: a job's first pass-1 verdict of the week, reduced to what the count needs. */
export interface FirstPassVerdict {
  jobId: JobberId;
  verdict: Verdict;
  reviewedAt: Instant;
  rowIndex: number;
}

/** Manager-scorecard key for jobs with no identifiable crew lead. Never on the wall (decision 16). */
export const UNASSIGNED = 'UNASSIGNED';

/** Calendar fact, not a tunable: a scorecard week is seven local days (decision 39). */
export const WEEK_LENGTH_DAYS = 7;

/** Decision 39: a scorecard week runs from its Monday (inclusive) to the next Monday (exclusive), in local dates. */
export function weekRange(weekStart: LocalDate): { start: LocalDate; endExclusive: LocalDate } {
  return { start: weekStart, endExclusive: addLocalDays(weekStart, WEEK_LENGTH_DAYS) };
}

/** Decision 39: true when the instant's local date lies inside the week [start, endExclusive). */
export function isInWeek(instant: Instant, weekStart: LocalDate): boolean {
  const offset = daysBetweenLocalDates(weekRange(weekStart).start, localDate(instant));
  return offset >= 0 && offset < WEEK_LENGTH_DAYS;
}

/**
 * Decisions 5, 44: a matched row carrying a human pass-1 verdict reviewed inside the week, or null.
 * Pass-2 rows, checker rows (no pass), unmatched rows and rows without a verdict or a review time never count.
 */
export function firstPassVerdictInWeek(row: ReviewRow, weekStart: LocalDate): FirstPassVerdict | null {
  if (row.match === 'none' || !row.matchedJobId) return null;
  if (row.pass !== 1 || !row.verdict || !row.reviewedAt) return null;
  if (!isInWeek(row.reviewedAt, weekStart)) return null;
  return { jobId: row.matchedJobId, verdict: row.verdict, reviewedAt: row.reviewedAt, rowIndex: row.rowIndex };
}

/** Earlier reviewedAt wins; on a tie the row higher in the sheet (lower rowIndex) is the earlier one. */
function isEarlier(a: FirstPassVerdict, b: FirstPassVerdict): boolean {
  const ta = toDate(a.reviewedAt).getTime();
  const tb = toDate(b.reviewedAt).getTime();
  return ta !== tb ? ta < tb : a.rowIndex < b.rowIndex;
}

/** Decision 44: per matched job, the EARLIEST pass-1 verdict of the week (reviewedAt ascending). */
export function earliestFirstPassByJob(rows: ReviewRow[], weekStart: LocalDate): Map<JobberId, FirstPassVerdict> {
  const byJob = new Map<JobberId, FirstPassVerdict>();
  for (const row of rows) {
    const candidate = firstPassVerdictInWeek(row, weekStart);
    if (!candidate) continue;
    const current = byJob.get(candidate.jobId);
    if (!current || isEarlier(candidate, current)) byJob.set(candidate.jobId, candidate);
  }
  return byJob;
}

function countReady(verdicts: Iterable<FirstPassVerdict>): ReadyCount {
  const out: ReadyCount = { ready: 0, total: 0 };
  for (const v of verdicts) {
    out.total++;
    if (v.verdict === 'READY') out.ready++;
  }
  return out;
}

/**
 * Decisions 35, 44: the crews' company-level win number — jobs whose first pass-1 verdict of the week
 * was READY, over jobs that got a first pass-1 verdict that week. null when no job did (wall shows a dash).
 */
export function firstPassReady(rows: ReviewRow[], weekStart: LocalDate): ReadyCount | null {
  const byJob = earliestFirstPassByJob(rows, weekStart);
  if (byJob.size === 0) return null;
  return countReady(byJob.values());
}

/** The instant a completed visit finished: Jobber's completedAt, else its scheduled end. */
function completedInstant(visit: Visit): Instant {
  return visit.completedAt ?? visit.endAt;
}

/** The job's latest completed visit, linked by `visit.jobId` or by the job's own `visitIds`; undefined when none. */
export function latestCompletedVisit(jobId: JobberId, jobs: Job[], visits: Visit[]): Visit | undefined {
  const job = jobs.find((j) => j.id === jobId);
  let latest: Visit | undefined;
  for (const visit of visits) {
    const belongs = visit.jobId === jobId || (job !== undefined && job.visitIds.includes(visit.id));
    if (!belongs) continue;
    if (!visit.isComplete && visit.completedAt === undefined) continue;
    if (!latest || toDate(completedInstant(visit)) > toDate(completedInstant(latest))) latest = visit;
  }
  return latest;
}

/** Decision 33: a job's crew is the crew whose lead is the first lead among the assignees of its latest completed visit; UNASSIGNED when none. */
export function crewInitialsForJob(jobId: JobberId, jobs: Job[], visits: Visit[], crews: Crew[]): string {
  const visit = latestCompletedVisit(jobId, jobs, visits);
  if (!visit) return UNASSIGNED;
  for (const userId of visit.assignedUserIds) {
    const crew = crews.find((c) => c.leadUserId === userId);
    if (crew) return crew.initials;
  }
  return UNASSIGNED;
}

/**
 * Decision 44: the same first-pass count split by crew initials for the manager scorecard only
 * (decision 16: never on the wall, nobody ranked per decision 35). Keys appear only for crews with
 * at least one job; jobs with no identifiable crew sit under UNASSIGNED.
 */
export function firstPassReadyByCrew(
  rows: ReviewRow[],
  weekStart: LocalDate,
  jobs: Job[],
  visits: Visit[],
  crews: Crew[],
): Record<string, ReadyCount> {
  const out: Record<string, ReadyCount> = {};
  for (const v of earliestFirstPassByJob(rows, weekStart).values()) {
    const key = crewInitialsForJob(v.jobId, jobs, visits, crews);
    const cell = out[key] ?? { ready: 0, total: 0 };
    cell.total++;
    if (v.verdict === 'READY') cell.ready++;
    out[key] = cell;
  }
  return out;
}

/** Decisions 5, 52: a human READY row (pass 1 or 2) tied to the job makes it READY; the overnight checker's READY does not. */
export function hasReadyRow(jobId: JobberId, rows: ReviewRow[]): boolean {
  return rows.some((r) => r.match !== 'none' && r.matchedJobId === jobId && r.verdict === 'READY' && (r.pass === 1 || r.pass === 2));
}

/** Decision 32: the second hero number — today's visits with result Completed whose job has no READY verdict yet. */
export function visitsNotReady(visitsToday: Visit[], rows: ReviewRow[]): number {
  let n = 0;
  for (const visit of visitsToday) {
    if (visit.result === 'Completed' && !hasReadyRow(visit.jobId, rows)) n++;
  }
  return n;
}
