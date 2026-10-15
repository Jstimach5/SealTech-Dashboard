/**
 * NEEDS ATTENTION strip (decision 29). Jobber's native signals only: a job sitting in Late,
 * Action required or Requires invoicing gets one line, and the line exists exactly while the
 * bucket does. Nothing here is closed by hand. Labels follow decision 4: LASTNAME · CITY · SCOPE,
 * never dollars, address or phone. Pure functions; `now` is always passed in.
 */
import { ATTENTION_BUCKETS, type AttentionBucket, type Bucket } from '../enums.js';
import type { AttentionLine, Instant, Job, JobberId, Owner } from '../types.js';
import { localDaysBetween, toDate } from './time.js';

/** First instant each (job, bucket) pair was observed by the service. */
export type BucketSeen = Record<JobberId, Partial<Record<Bucket, Instant>>>;

/** Decision 29: only late, action_required and requires_invoicing put a line on the strip. */
export function isAttentionBucket(bucket: Bucket): bucket is AttentionBucket {
  return (ATTENTION_BUCKETS as readonly Bucket[]).includes(bucket);
}

/** Decision 29: the clock starts when the service first saw the bucket; unobserved, it falls back to Jobber's updatedAt. */
export function attentionSince(job: Job, bucketSeen: BucketSeen): { sinceAt: Instant; sinceSource: 'observed' | 'updatedAt' } {
  const observed = bucketSeen[job.id]?.[job.bucket];
  if (observed) return { sinceAt: observed, sinceSource: 'observed' };
  return { sinceAt: job.updatedAt, sinceSource: 'updatedAt' };
}

/** Decision 4: `LASTNAME · CITY · SCOPE`, uppercase. No dollars, street address or phone, ever. */
export function attentionLabel(job: Job): string {
  return `${job.lastName} · ${job.city} · ${job.scope}`.toUpperCase();
}

/** Age in America/Detroit calendar days, clamped at 0 so a sinceAt ahead of `now` never reads negative. */
export function attentionAgeDays(sinceAt: Instant, now: Instant): number {
  return Math.max(0, localDaysBetween(sinceAt, now));
}

/** Decision 29 display order: kind in ATTENTION_BUCKETS order, then oldest sinceAt first, then job number ascending. */
function compareLines(a: { jobNumber: number; line: AttentionLine }, b: { jobNumber: number; line: AttentionLine }): number {
  const byKind = ATTENTION_BUCKETS.indexOf(a.line.kind) - ATTENTION_BUCKETS.indexOf(b.line.kind);
  if (byKind !== 0) return byKind;
  const byAge = toDate(a.line.sinceAt).getTime() - toDate(b.line.sinceAt).getTime();
  if (byAge !== 0) return byAge;
  return a.jobNumber - b.jobNumber;
}

/**
 * Decision 29: one line per job whose bucket is an attention bucket; archived and every other bucket
 * never appear. The list is not capped here; the board applies CONFIG.MAX_ATTENTION_ROWS when it draws.
 */
export function attentionLines(
  jobs: Job[],
  bucketSeen: BucketSeen,
  now: Instant,
  ownerFor: (job: Job, kind: AttentionBucket) => Owner,
): AttentionLine[] {
  const rows: Array<{ jobNumber: number; line: AttentionLine }> = [];
  for (const job of jobs) {
    if (!isAttentionBucket(job.bucket)) continue;
    const kind = job.bucket;
    const { sinceAt, sinceSource } = attentionSince(job, bucketSeen);
    rows.push({
      jobNumber: job.jobNumber,
      line: {
        kind,
        jobId: job.id,
        label: attentionLabel(job),
        sinceAt,
        sinceSource,
        ageDays: attentionAgeDays(sinceAt, now),
        owner: ownerFor(job, kind),
      },
    });
  }
  rows.sort(compareLines);
  return rows.map((r) => r.line);
}
