/**
 * Leak guard (plan §B). Jobber's "As needed, no reminders" visit setting suppresses the
 * Requires Invoicing status, so a completed job with uninvoiced work can sit in Today, Late,
 * Upcoming or any other bucket and never surface on its own. Decision 32 keeps the hero as
 * Jobber's own Requires Invoicing figure, so a leaked job is LISTED and TAGGED here but never
 * added to that number. `remindersOff` is not consulted: the field is not yet readable.
 * Pure functions, no time involved.
 */
import type { Bucket } from '../enums.js';
import type { Job } from '../types.js';

export type LeakTag = 'NO-REMINDER' | 'NO CHARGE?';

/** Buckets where Jobber already says "invoice me" (requires_invoicing) or the job is closed (decision 6), so nothing has leaked. */
const NOT_LEAKED_BUCKETS: readonly Bucket[] = ['requires_invoicing', 'archived'];

/** Plan §B: completed, no future visit, uninvoiced work, and Jobber neither flagged nor closed it. */
export function isLeakedJob(job: Job): boolean {
  if (!job.completedAt) return false;
  if (job.futureVisitCount !== 0) return false;
  if (!job.hasUninvoicedWork) return false;
  return !NOT_LEAKED_BUCKETS.includes(job.bucket);
}

/** Plan §B: a zero-total job that is in Requires Invoicing, or has leaked out of it, probably has a missing charge. */
export function isNoChargeCandidate(job: Job): boolean {
  return job.isZeroTotal && (job.bucket === 'requires_invoicing' || isLeakedJob(job));
}

/** Tags in display order: NO-REMINDER first, then NO CHARGE?. Empty when neither rule fires. */
export function leakTags(job: Job): Array<'NO-REMINDER' | 'NO CHARGE?'> {
  const tags: LeakTag[] = [];
  if (isLeakedJob(job)) tags.push('NO-REMINDER');
  if (isNoChargeCandidate(job)) tags.push('NO CHARGE?');
  return tags;
}

/** Decision 32: every job in requires_invoicing plus every leaked job, by jobNumber ascending. The hero count is not computed here and stays Jobber's own. */
export function cannotInvoiceCandidates(jobs: Job[]): Job[] {
  return jobs
    .filter((job) => job.bucket === 'requires_invoicing' || isLeakedJob(job))
    .sort((a, b) => a.jobNumber - b.jobNumber);
}
