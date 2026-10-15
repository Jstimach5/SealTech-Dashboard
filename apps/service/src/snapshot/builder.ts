/**
 * One snapshot build: load the raw inputs from the source, merge the service's own state from the
 * database on top, and hand the result to the domain's `buildSnapshot`. The merge is the only place
 * where DB tables meet `SourceInputs`:
 *
 *   bucket_seen      → `bucketSeen` option (attention clocks, decision 29)
 *   forms_seen       → `visit.formsSeenMax` (max of source value and stored value)
 *   queued_writes    → `queuedWrites`, and `queuedRecaps` from queued visit_note writes
 *   note_overlay     → appended to `job.noteLines` (fixture mode: the effect of ACK and sent recaps)
 *   owner_overrides  → `ownerOverrides`
 *   settings         → `focusLine`, `responderInitials`
 *   review_rows      → appended after the source's rows, `rowIndex` continuing (fixture mode only)
 *
 * The source status object is owned here too: after a successful load every connected source reads
 * ok with `lastOkAt = now`, unless the scenario itself says Jobber is down (the `stale` overlay).
 */
import {
  buildSnapshot,
  type Instant,
  type Job,
  type JobberId,
  type NoteLine,
  type QueuedWrite,
  type ReviewRow,
  type Snapshot,
  type SourceInputs,
  type SourceName,
  type SourceStatus,
  type Visit,
} from '@sealtech/domain';
import type { ServiceConfig } from '../config.js';
import type { RawInputs, Source } from '../sources/types.js';
import type { BoardDb, NoteOverlayRow, QueuedWriteRow } from '../state/db.js';

export interface BuildResult {
  snapshot: Snapshot;
  /** The merged inputs the snapshot was built from (unredacted review rows live here). */
  inputs: SourceInputs;
}

export async function buildOnce(source: Source, db: BoardDb, config: ServiceConfig, now: Instant): Promise<BuildResult> {
  const raw = await source.load(now);
  const inputs = mergeState(raw, db, config, now);
  const snapshot = buildSnapshot(inputs, { bucketSeen: db.bucketSeen() });
  return { snapshot, inputs };
}

/** `SourceInputs` for `buildSnapshot`: the raw load plus everything the service owns. */
export function mergeState(raw: RawInputs, db: BoardDb, config: ServiceConfig, now: Instant): SourceInputs {
  const defaults = raw.defaults ?? {};

  // bucket_seen / forms_seen: record what this poll observed, then read the whole tables back.
  db.transaction(() => {
    for (const job of raw.jobs) db.recordBucketSeen(job.id, job.bucket, job.bucketSinceSource === 'observed' ? job.bucketSince : now);
    for (const visit of raw.visits) db.recordFormsSeen(visit.id, Math.max(visit.incompleteJobFormsCount, visit.formsSeenMax));
  });
  const formsSeen = db.formsSeen();
  const visits: Visit[] = raw.visits.map((v) => ({
    ...v,
    formsSeenMax: Math.max(v.formsSeenMax, v.incompleteJobFormsCount, formsSeen.get(v.id) ?? 0),
  }));

  // queued_writes: DB rows win over any seeded write for the same target.
  const dbWrites = db.queuedWrites();
  const dbTargets = new Set(dbWrites.map((w) => w.targetId));
  const seededWrites = (defaults.queuedWrites ?? []).filter((w) => !dbTargets.has(w.targetId));
  const queuedWrites: QueuedWrite[] = [...seededWrites, ...dbWrites.map(publicWrite)];
  const queuedRecaps: SourceInputs['queuedRecaps'] = {};
  for (const [visitId, recap] of Object.entries(defaults.queuedRecaps ?? {})) if (!dbTargets.has(visitId)) queuedRecaps[visitId] = recap;
  for (const w of dbWrites) {
    if (w.kind !== 'visit_note' || w.status !== 'queued' || w.payload.result === undefined) continue;
    queuedRecaps[w.targetId] = {
      result: w.payload.result,
      at: w.createdAt,
      ...(w.payload.missReason !== undefined ? { missReason: w.payload.missReason } : {}),
      ...(w.payload.note !== undefined ? { note: w.payload.note } : {}),
    };
  }

  // note_overlay: lines the board queued, appended to the job's notes.
  const overlay = overlayByJob(db.noteOverlay());
  const jobs: Job[] = raw.jobs.map((job) => {
    const lines = overlay.get(job.id);
    return lines ? { ...job, noteLines: [...job.noteLines, ...lines] } : job;
  });

  // owner_overrides and settings.
  const ownerOverrides = { ...(defaults.ownerOverrides ?? {}), ...db.ownerOverrides() };
  const focusLine = db.getSetting('focusLine') ?? defaults.focusLine ?? '';
  const responderInitials = db.getSetting('responderInitials') ?? defaults.responderInitials;

  // review_rows: in fixture mode the DB is the sheet's appended region; in live mode the sheet already holds them.
  const reviewRows = config.dataSource === 'fixtures' ? appendReviewRows(raw.reviewRows, db) : raw.reviewRows;

  return {
    now,
    mode: config.dataSource,
    build: config.build,
    focusLine,
    ...(responderInitials !== undefined ? { responderInitials } : {}),
    boardOwnerInitials: raw.boardOwnerInitials,
    people: raw.people,
    crews: raw.crews,
    jobs,
    visits,
    reviewRows,
    formAnswers: raw.formAnswers,
    queuedRecaps,
    ownerOverrides,
    sources: serviceSources(raw.sources, now),
    queuedWrites,
    cardMeta: raw.cardMeta,
    scorecard: raw.scorecard,
    jobberRequiresInvoicingCount: raw.jobberRequiresInvoicingCount,
  };
}

/** The snapshot's view of a queued write: no payload (the note text stays in the service). */
export function publicWrite(w: QueuedWriteRow): QueuedWrite {
  return {
    id: w.id,
    submissionId: w.submissionId,
    kind: w.kind,
    targetId: w.targetId,
    status: w.status,
    createdAt: w.createdAt,
    createdBy: w.createdBy,
    attempts: w.attempts,
    ...(w.lastError !== undefined ? { lastError: w.lastError } : {}),
  };
}

/**
 * Which overlay lines the board may see. An ACK line applies as soon as it is queued (decision 41:
 * the red border clears on the tap). A recap line applies only once its write is sent: while queued
 * the result already shows through `queuedRecaps` as `recapQueued`, and a note line would wrongly
 * promote it to `note` (the domain's precedence is form → note → recap).
 */
export function overlayApplies(row: NoteOverlayRow): boolean {
  if (row.writeId === undefined) return true;
  if (row.writeKind === 'ack') return true;
  return row.writeStatus === 'sent';
}

function overlayByJob(rows: NoteOverlayRow[]): Map<JobberId, NoteLine[]> {
  const out = new Map<JobberId, NoteLine[]>();
  for (const row of rows) {
    if (!overlayApplies(row)) continue;
    const list = out.get(row.jobId) ?? [];
    list.push({ at: row.at, text: row.text });
    out.set(row.jobId, list);
  }
  return out;
}

/** Source rows first, then the DB's appended rows with `rowIndex` continuing after the last source row. */
export function appendReviewRows(sourceRows: ReviewRow[], db: BoardDb): ReviewRow[] {
  const base = sourceRows.reduce((max, r) => Math.max(max, r.rowIndex), 1);
  const appended = db.reviewRows().map(({ index, row }) => ({ ...row, rowIndex: base + index }));
  return [...sourceRows, ...appended];
}

/**
 * The service owns `sources`. After a successful load every connected source is ok as of now;
 * CompanyCam stays unconnected until the phase-2 feed exists (decision 48). A scenario that says
 * Jobber is down (`stale`) is passed through untouched so the board can be checked in that state.
 */
export function serviceSources(raw: Record<SourceName, SourceStatus>, now: Instant): Record<SourceName, SourceStatus> {
  if (raw.jobber.ok === false) return raw;
  const ok = (): SourceStatus => ({ connected: true, ok: true, lastOkAt: now, lastAttemptAt: now });
  return { jobber: ok(), reviewSheet: ok(), flagsSheet: ok(), companyCam: { connected: false, ok: false } };
}
