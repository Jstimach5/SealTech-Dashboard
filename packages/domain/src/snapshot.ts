/**
 * buildSnapshot: the one place where every derivation rule is composed into the
 * document the board renders. Pure: `inputs.now` is the clock. Fixtures and the live
 * service both call this and nothing else; the board never recomputes a rule.
 *
 * Order of operations (each step uses only the output of the previous ones):
 *   1. jobs      — bucketSince from the service's bucket_seen table (attentionSince)
 *   2. visits    — plannedAsPrep, then the visit result (form → note → recap → unknown), ACK
 *   3. reviews   — match sheet rows to jobs (exact / inferred / none), group verdicts
 *   4. attention — one line per late / action_required / requires_invoicing job
 *   5. rail      — cannot-invoice lines for requires_invoicing jobs plus leaked jobs
 *   6. numbers   — hero, scoreline, counts, packagesOpen
 *   7. validate  — zod schema + the no-private-text sweep (decision 4). Throws on failure.
 */
import { BUCKETS, type AttentionBucket, type Bucket, type Reason } from './enums.js';
import { SnapshotSchema, assertNoPrivateText } from './schema.js';
import type {
  CannotInvoiceLine,
  CardMeta,
  Counts,
  Hero,
  Instant,
  Job,
  JobberId,
  NoteLine,
  Owner,
  ReviewRow,
  Snapshot,
  SourceInputs,
  Visit,
} from './types.js';
import { attentionLines, attentionSince, type BucketSeen } from './derive/attention.js';
import { parseNotes } from './derive/notes.js';
import { plannedAsPrep, resolveVisitResult } from './derive/visitResult.js';
import { unansweredCount } from './derive/answered.js';
import { matchAllReviewRows } from './derive/reviewMatch.js';
import { buildCannotInvoiceLine, cannotInvoiceReason } from './derive/cannotInvoice.js';
import { defaultOwner } from './derive/owner.js';
import { cannotInvoiceCandidates, leakTags } from './derive/leak.js';
import { planKept } from './derive/planKept.js';
import { firstPassReady, visitsNotReady } from './derive/firstPass.js';
import { addLocalDays, localDate, toDate, weekStartMonday } from './derive/time.js';

export interface BuildOptions {
  /** First instant each (job, bucket) pair was observed. When omitted, rebuilt from the jobs' own `bucketSince`. */
  bucketSeen?: BucketSeen;
  /** Skip the zod + privacy validation (tests of malformed input only). Default false. */
  skipValidation?: boolean;
}

export function buildSnapshot(rawInputs: SourceInputs, options: BuildOptions = {}): Snapshot {
  const inputs = dropFuture(rawInputs);
  const now = inputs.now;
  const boardDate = localDate(now);
  const yesterday = lastWorkedDay(inputs.visits, boardDate);
  const bucketSeen = options.bucketSeen ?? bucketSeenFromJobs(inputs.jobs);

  // 1. jobs
  const jobs: Job[] = inputs.jobs.map((job) => {
    const since = attentionSince(job, bucketSeen);
    return { ...job, bucketSince: since.sinceAt, bucketSinceSource: since.sinceSource };
  });
  const jobById = new Map(jobs.map((j) => [j.id, j]));
  const visitsByJob = groupBy(inputs.visits, (v) => v.jobId);

  // 2. visits
  const visits: Visit[] = inputs.visits.map((visit) => {
    const job = jobById.get(visit.jobId);
    const jobVisits = visitsByJob.get(visit.jobId) ?? [visit];
    const prep = plannedAsPrep(visit, jobVisits);
    const notes = parseNotes(notesForVisit(visit, jobVisits, job?.noteLines ?? []));
    const form = inputs.formAnswers[visit.id];
    const recap = inputs.queuedRecaps[visit.id];
    const resolved = resolveVisitResult({
      visit,
      plannedAsPrep: prep,
      ...(form ? { form } : {}),
      notes,
      ...(recap ? { recap } : {}),
    });
    const out: Visit = {
      ...visit,
      plannedAsPrep: prep,
      resultSource: resolved.resultSource,
    };
    delete out.result;
    delete out.resultAt;
    delete out.missReason;
    delete out.closeCode;
    delete out.ack;
    if (resolved.result !== undefined) out.result = resolved.result;
    if (resolved.resultAt !== undefined) out.resultAt = resolved.resultAt;
    if (resolved.missReason !== undefined) out.missReason = resolved.missReason;
    if (resolved.closeCode !== undefined) out.closeCode = resolved.closeCode;
    if (notes.ack) out.ack = { at: notes.ack.at, initials: notes.ack.initials };
    return out;
  });
  const resolvedVisitsByJob = groupBy(visits, (v) => v.jobId);
  const visitsToday = visits.filter((v) => localDate(v.startAt) === boardDate);
  const visitsYesterday = visits.filter((v) => localDate(v.startAt) === yesterday);

  // 3. reviews (match on the raw sheet text, then redact the file name: it carries a street address, decision 4)
  const reviewRows: ReviewRow[] = matchAllReviewRows(inputs.reviewRows, jobs, visits).map((r) => ({
    ...r,
    application: redactApplication(r.application),
  }));
  const rowsByJob = groupBy(
    reviewRows.filter((r) => r.match !== 'none' && r.matchedJobId),
    (r) => r.matchedJobId as JobberId,
  );
  const unmatchedReviewRows = reviewRows.filter((r) => r.match === 'none').length;

  // 5. cannot-invoice rail. An invoiced job is done, whatever bucket Jobber still shows it in
  //    (the hero keeps Jobber's own count, decision 32; the list only shows what SealTech cannot bill).
  const cannotInvoice: CannotInvoiceLine[] = cannotInvoiceCandidates(jobs)
    .filter((job) => !job.invoiced)
    .map((job) => {
      const jobVisits = resolvedVisitsByJob.get(job.id) ?? [];
      const rows = rowsByJob.get(job.id) ?? [];
      const reason = cannotInvoiceReason(job, jobVisits, rows);
      const owner = defaultOwner({
        reason: reason.reason,
        job,
        visits: jobVisits,
        crews: inputs.crews,
        people: inputs.people,
        ...(inputs.ownerOverrides[job.id] ? { override: inputs.ownerOverrides[job.id] } : {}),
      });
      return buildCannotInvoiceLine({ job, visits: jobVisits, rows, now, owner, tags: leakTags(job) });
    })
    .sort(compareRailLines);

  // 4. attention (after the rail: a Requires invoicing line names the same owner as the job's rail line,
  //    so FIX / HOLD jobs show the role word there too, decisions 16 and 33)
  const railOwner = new Map(cannotInvoice.map((l) => [l.jobId, l.owner]));
  const ownerFor = (job: Job, kind: AttentionBucket): Owner =>
    (kind === 'requires_invoicing' ? railOwner.get(job.id) : undefined) ??
    defaultOwner({
      attentionKind: kind,
      job,
      visits: resolvedVisitsByJob.get(job.id) ?? [],
      crews: inputs.crews,
      people: inputs.people,
      ...(inputs.ownerOverrides[job.id] ? { override: inputs.ownerOverrides[job.id] } : {}),
    });
  const attention = attentionLines(jobs, bucketSeen, now, ownerFor);

  // 6. numbers
  const byReason: Partial<Record<Reason, number>> = {};
  for (const line of cannotInvoice) byReason[line.reason] = (byReason[line.reason] ?? 0) + 1;
  const ages = cannotInvoice.filter((l) => l.colour !== 'grey').map((l) => l.daysSinceCompleted);
  const hero: Hero = {
    cannotInvoice: inputs.jobberRequiresInvoicingCount,
    visitsNotReady: visitsNotReady(visitsToday, reviewRows),
    oldestDays: ages.length ? Math.max(...ages) : 0,
    medianDays: median(ages),
    byReason,
    reviewQueue: {
      pass1: byReason['AWAITING 1ST REVIEW'] ?? 0,
      pass2: byReason['AWAITING 2ND REVIEW'] ?? 0,
      fix: byReason['FIX OPEN'] ?? 0,
      hold: byReason['HOLD'] ?? 0,
    },
  };

  const kept = planKept(visitsYesterday);
  const thisWeek = firstPassReady(reviewRows, weekStartMonday(boardDate));
  const lastWeek = thisWeek ? null : firstPassReady(reviewRows, addLocalDays(weekStartMonday(boardDate), -7));
  const scoreline = {
    ...kept,
    firstPassReady: thisWeek ?? lastWeek,
    day: yesterday,
    ...(thisWeek ? { firstPassWeek: 'this' as const } : lastWeek ? { firstPassWeek: 'last' as const } : {}),
  };

  const unanswered = unansweredCount(
    visits.filter((v) => localDate(v.startAt) === boardDate || localDate(v.startAt) === yesterday),
    now,
  );
  const counts = bucketCounts(jobs, unanswered.unanswered);

  // Packages SealTech is still holding: everything on the rail that is not already with the program.
  const packagesOpen = cannotInvoice.filter((l) => l.reason !== 'PROGRAM-WAIT').length;

  const cardMeta: Record<JobberId, CardMeta> = {};
  for (const v of visits) {
    const given = inputs.cardMeta[v.id];
    const synced: CardMeta['synced'] = inputs.queuedRecaps[v.id]
      ? 'queued'
      : v.resultSource === 'jobForm' || v.resultSource === 'note'
        ? 'jobber'
        : (given?.synced ?? 'none');
    cardMeta[v.id] = {
      ...(given?.photosCount !== undefined ? { photosCount: given.photosCount } : {}),
      ...(given?.lastCaptureAt !== undefined ? { lastCaptureAt: given.lastCaptureAt } : {}),
      synced,
    };
  }

  const snapshot: Snapshot = {
    schemaVersion: 1,
    generatedAt: now,
    boardDate,
    build: inputs.build,
    mode: inputs.mode,
    focusLine: inputs.focusLine.slice(0, 30),
    ...(inputs.responderInitials ? { responderInitials: inputs.responderInitials } : {}),
    boardOwnerInitials: inputs.boardOwnerInitials,
    sources: inputs.sources,
    people: inputs.people.map(({ jobberUserId, lastName, initials, role, reviewPass }) => ({ jobberUserId, lastName, initials, role, reviewPass })),
    crews: inputs.crews,
    jobs,
    visits,
    reviewRows,
    attention,
    cannotInvoice,
    hero,
    scoreline,
    counts,
    unansweredUnknown: unanswered.unknown,
    unmatchedReviewRows,
    packagesOpen,
    queuedWrites: inputs.queuedWrites,
    cardMeta,
    scorecard: inputs.scorecard,
  };

  // 7. validate
  if (!options.skipValidation) {
    SnapshotSchema.parse(snapshot);
    const offenders = assertNoPrivateText(snapshot);
    if (offenders.length) throw new Error(`Snapshot contains private text (decision 4):\n${offenders.join('\n')}`);
  }
  return snapshot;
}

/**
 * The last worked day: the most recent local date before today that has a visit (Monday's wall reads
 * Saturday or Sunday when crews worked then, else Friday). Falls back to the calendar yesterday.
 */
export function lastWorkedDay(visits: Visit[], boardDate: string): string {
  let best: string | undefined;
  for (const v of visits) {
    const d = localDate(v.startAt);
    if (d < boardDate && (!best || d > best)) best = d;
  }
  return best ?? addLocalDays(boardDate, -1);
}

/**
 * Clock-skew and fixture guard: nothing dated after `now` exists yet. Review rows reviewed later, note
 * lines written later, form answers and recaps given later are dropped; a visit or job completed later is
 * not complete yet. One guard here, so no rule needs its own.
 */
export function dropFuture(inputs: SourceInputs): SourceInputs {
  const t = toDate(inputs.now).getTime();
  const after = (i: string | undefined) => i !== undefined && toDate(i).getTime() > t;
  const keepRecord = <T extends { at: string }>(rec: Record<string, T>): Record<string, T> =>
    Object.fromEntries(Object.entries(rec).filter(([, v]) => !after(v.at)));
  return {
    ...inputs,
    jobs: inputs.jobs.map((j) => {
      const out: Job = { ...j, noteLines: j.noteLines.filter((n) => !after(n.at)) };
      if (after(j.completedAt)) delete out.completedAt;
      return out;
    }),
    visits: inputs.visits.map((v) => {
      if (!after(v.completedAt)) return v;
      const out: Visit = { ...v, isComplete: false };
      delete out.completedAt;
      return out;
    }),
    reviewRows: inputs.reviewRows.filter((r) => !after(r.reviewedAt)),
    formAnswers: keepRecord(inputs.formAnswers),
    queuedRecaps: keepRecord(inputs.queuedRecaps),
  };
}

/**
 * The Review sheet's Application column is a file name like `STI_ATTIC_ROLLIN_CARTER_2635 NEEDHAM ST_APP.pdf`.
 * The wall may carry the program, scope and last name; the rest (first name, street) is cut (decision 4).
 */
export function redactApplication(application: string): string {
  const stem = application.replace(/\.[A-Za-z0-9]+$/, '');
  const parts = stem.split('_');
  if (parts.length <= 3) return stem;
  return `${parts.slice(0, 3).join('_')}_…`;
}

/** Rebuild the bucket_seen map from jobs that already carry an observed `bucketSince`. */
export function bucketSeenFromJobs(jobs: Job[]): BucketSeen {
  const seen: BucketSeen = {};
  for (const job of jobs) {
    if (job.bucketSinceSource !== 'observed') continue;
    (seen[job.id] ??= {})[job.bucket] = job.bucketSince;
  }
  return seen;
}

/**
 * Jobber notes live on the job (whether the API also exposes visit notes is an open
 * assumption, see docs/jobber-assumptions.md). A note line belongs to the latest visit that
 * started at or before the note; a line written before any visit belongs to the first visit.
 */
export function notesForVisit(visit: Visit, jobVisits: Visit[], lines: NoteLine[]): NoteLine[] {
  const ordered = [...jobVisits].sort((a, b) => toDate(a.startAt).getTime() - toDate(b.startAt).getTime());
  const first = ordered[0];
  return lines.filter((line) => {
    const t = toDate(line.at).getTime();
    let owner: Visit | undefined;
    for (const v of ordered) if (toDate(v.startAt).getTime() <= t) owner = v;
    return (owner ?? first)?.id === visit.id;
  });
}

/** Rail order: hard red first, PROGRAM-WAIT (grey) last, then oldest since completion, then job number. */
export function compareRailLines(a: CannotInvoiceLine, b: CannotInvoiceLine): number {
  if (a.hardRed !== b.hardRed) return a.hardRed ? -1 : 1;
  const aGrey = a.colour === 'grey';
  const bGrey = b.colour === 'grey';
  if (aGrey !== bGrey) return aGrey ? 1 : -1;
  if (a.daysSinceCompleted !== b.daysSinceCompleted) return b.daysSinceCompleted - a.daysSinceCompleted;
  return a.label.localeCompare(b.label);
}

export function bucketCounts(jobs: Job[], unanswered: number): Counts {
  const counts = Object.fromEntries(BUCKETS.filter((b) => b !== 'archived').map((b) => [b, 0])) as Record<Exclude<Bucket, 'archived'>, number>;
  for (const job of jobs) if (job.bucket !== 'archived') counts[job.bucket] += 1;
  return { ...counts, unanswered };
}

export function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? (s[mid] as number) : ((s[mid - 1] as number) + (s[mid] as number)) / 2;
}

function groupBy<T, K>(xs: T[], key: (x: T) => K): Map<K, T[]> {
  const m = new Map<K, T[]>();
  for (const x of xs) {
    const k = key(x);
    const arr = m.get(k);
    if (arr) arr.push(x);
    else m.set(k, [x]);
  }
  return m;
}

/** Callers may hold `now` as a Date; the snapshot wants an ISO instant. */
export function instant(d: Date | Instant): Instant {
  return typeof d === 'string' ? d : d.toISOString();
}
