/**
 * The service's own state, one SQLite file (`${DATA_DIR}/board.db`) through `node:sqlite`. Every SQL
 * statement lives in this module behind a small typed function; nothing else in the service writes
 * SQL. Tables (decisions 1, 8, 11, 29, 33, 38, 41):
 *
 *   bucket_seen     first instant each (job, bucket) pair was observed → `bucketSince` on the strip
 *   forms_seen      highest `incompleteJobFormsCount` ever seen per visit → the answered tri-state
 *   queued_writes   Jobber note writes (recap, ack) waiting for JOBBER_WRITES=on; payload_json holds the line
 *   submissions     every write's submissionId, for the dedupe window
 *   review_rows     fixture-mode Review sheet (appended rows only; live mode appends to the sheet itself)
 *   flag_rows       fixture-mode KPI Flags tab; never read into a snapshot (decision 16)
 *   owner_overrides huddle owner initials per job (decision 33)
 *   owner_notes     `OWNER:XX YYYY-MM-DD` lines waiting for the sheet writer (M6) to land in the Owner notes
 *                   (column L) of the job's latest Review row; service-only, never in a snapshot, because the
 *                   domain's QueuedWrite kinds do not include an owner note
 *   note_overlay    note lines the board queued, so fixture mode shows their effect before Jobber writes exist
 *   settings        focusLine, responderInitials
 *   taps            the 30-day audit record (decision 38)
 *   pin_failures / sessions   PIN lockout and bearer tokens
 *   alerts_sent     the one no-ACK text per visit (decision 41)
 */
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import type { DatabaseSync as DatabaseSyncType, StatementSync } from 'node:sqlite';
import type { Bucket, FlagRow, Instant, JobberId, MissReason, QueuedWrite, ReviewRow, VisitResult } from '@sealtech/domain';
import type { BucketSeen } from '@sealtech/domain';

/**
 * `node:sqlite` is unflagged on Node 22.13+ but still prints an ExperimentalWarning on import. The
 * warning is emitted synchronously while the module loads, so loading it through `require` lets us
 * swallow exactly that one warning and nothing else.
 */
function loadSqlite(): { DatabaseSync: typeof DatabaseSyncType } {
  const require = createRequire(import.meta.url);
  const original = process.emitWarning;
  const quiet: typeof process.emitWarning = (warning, ...rest) => {
    const type = rest[0];
    const isExperimental = type === 'ExperimentalWarning' || (typeof type === 'object' && type !== null && (type as { type?: string }).type === 'ExperimentalWarning');
    if (isExperimental && String(warning instanceof Error ? warning.message : warning).includes('SQLite')) return;
    return (original as (...args: unknown[]) => void).call(process, warning, ...rest);
  };
  process.emitWarning = quiet;
  try {
    return require('node:sqlite') as { DatabaseSync: typeof DatabaseSyncType };
  } finally {
    process.emitWarning = original;
  }
}

const { DatabaseSync } = loadSqlite();

export const SCHEMA_VERSION = 1;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS bucket_seen (
  job_id TEXT NOT NULL,
  bucket TEXT NOT NULL,
  first_seen_at TEXT NOT NULL,
  PRIMARY KEY (job_id, bucket)
);
CREATE TABLE IF NOT EXISTS forms_seen (visit_id TEXT PRIMARY KEY, max_count INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS queued_writes (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL,
  target_id TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  sent_at TEXT
);
CREATE INDEX IF NOT EXISTS queued_writes_target ON queued_writes (kind, target_id, created_at);
CREATE TABLE IF NOT EXISTS submissions (
  submission_id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  target_id TEXT NOT NULL,
  pass INTEGER,
  reviewer TEXT,
  verdict TEXT,
  at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS review_rows (row_index INTEGER PRIMARY KEY AUTOINCREMENT, json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS flag_rows (id INTEGER PRIMARY KEY AUTOINCREMENT, json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS owner_overrides (job_id TEXT PRIMARY KEY, initials TEXT NOT NULL, set_on TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS note_overlay (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  at TEXT NOT NULL,
  text TEXT NOT NULL,
  write_id TEXT REFERENCES queued_writes(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS taps (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, screen TEXT NOT NULL, target TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS pin_failures (user_id TEXT PRIMARY KEY, count INTEGER NOT NULL, locked_until TEXT, updated_at TEXT);
CREATE TABLE IF NOT EXISTS owner_notes (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL UNIQUE,
  job_id TEXT NOT NULL,
  row_index INTEGER NOT NULL,
  row_submission_id TEXT,
  line TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS alerts_sent (visit_id TEXT PRIMARY KEY, at TEXT NOT NULL);
`;

/** What a queued note write carries: the exact line for the Jobber note, plus the recap fields when it is one. */
export interface QueuedWritePayload {
  line: string;
  result?: VisitResult;
  missReason?: MissReason;
  note?: string;
}

export interface QueuedWriteRow extends QueuedWrite {
  payload: QueuedWritePayload;
  sentAt?: Instant;
}

export interface NewQueuedWrite {
  id: string;
  submissionId: string;
  kind: QueuedWrite['kind'];
  targetId: string;
  payload: QueuedWritePayload;
  createdAt: Instant;
  createdBy: string;
}

export interface SubmissionRow {
  submissionId: string;
  kind: string;
  targetId: string;
  pass?: number;
  reviewer?: string;
  verdict?: string;
  at: Instant;
}

export interface NoteOverlayRow {
  id: string;
  jobId: JobberId;
  at: Instant;
  text: string;
  writeId?: string;
  writeKind?: QueuedWrite['kind'];
  writeStatus?: QueuedWrite['status'];
}

export interface OwnerNoteRow {
  id: string;
  submissionId: string;
  jobId: JobberId;
  /** The Review-sheet row whose Owner notes (column L) the line goes into. */
  rowIndex: number;
  /** That row's Submission id (column V) when the board wrote it; a sturdier key than the row number. */
  rowSubmissionId?: string;
  line: string;
  status: 'queued' | 'sent';
  createdAt: Instant;
  createdBy: string;
}

export interface PinFailureRow {
  count: number;
  lockedUntil?: Instant;
}

type Row = Record<string, unknown>;

function str(v: unknown): string {
  return typeof v === 'string' ? v : String(v);
}
function num(v: unknown): number {
  return typeof v === 'number' ? v : Number(v);
}
function opt(v: unknown): string | undefined {
  return v === null || v === undefined ? undefined : str(v);
}

export class BoardDb {
  private readonly db: DatabaseSyncType;
  private readonly stmts = new Map<string, StatementSync>();

  constructor(readonly path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA journal_mode=WAL');
    this.db.exec('PRAGMA foreign_keys=ON');
    this.db.exec('PRAGMA busy_timeout=2000');
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(SCHEMA);
    // pin_failures.updated_at arrived after the first release; add it to an older board.db in place.
    const cols = (this.db.prepare('PRAGMA table_info(pin_failures)').all() as Row[]).map((r) => str(r.name));
    if (!cols.includes('updated_at')) this.db.exec('ALTER TABLE pin_failures ADD COLUMN updated_at TEXT');
    const row = this.db.prepare('SELECT version FROM schema_version LIMIT 1').get() as Row | undefined;
    if (!row) this.db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(SCHEMA_VERSION);
    else if (num(row.version) > SCHEMA_VERSION) throw new Error(`board.db schema version ${str(row.version)} is newer than this service (${SCHEMA_VERSION})`);
  }

  private stmt(sql: string): StatementSync {
    let s = this.stmts.get(sql);
    if (!s) {
      s = this.db.prepare(sql);
      this.stmts.set(sql, s);
    }
    return s;
  }

  transaction<T>(fn: () => T): T {
    this.db.exec('BEGIN');
    try {
      const out = fn();
      this.db.exec('COMMIT');
      return out;
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  close(): void {
    this.stmts.clear();
    this.db.close();
  }

  // ---- bucket_seen ----------------------------------------------------------------------

  /** Keeps the first observation; later calls for the same (job, bucket) are no-ops. */
  recordBucketSeen(jobId: JobberId, bucket: Bucket, at: Instant): void {
    this.stmt('INSERT OR IGNORE INTO bucket_seen (job_id, bucket, first_seen_at) VALUES (?, ?, ?)').run(jobId, bucket, at);
  }

  /**
   * A job is in exactly one bucket: forget its clocks for every other bucket, so leaving and later
   * re-entering a bucket starts a fresh clock (decision 29: the line exists exactly while the bucket does).
   */
  clearOtherBuckets(jobId: JobberId, bucket: Bucket): void {
    this.stmt('DELETE FROM bucket_seen WHERE job_id = ? AND bucket <> ?').run(jobId, bucket);
  }

  bucketSeen(): BucketSeen {
    const out: BucketSeen = {};
    for (const r of this.stmt('SELECT job_id, bucket, first_seen_at FROM bucket_seen').all() as Row[]) {
      (out[str(r.job_id)] ??= {})[str(r.bucket) as Bucket] = str(r.first_seen_at);
    }
    return out;
  }

  // ---- forms_seen -----------------------------------------------------------------------

  recordFormsSeen(visitId: JobberId, count: number): void {
    this.stmt('INSERT INTO forms_seen (visit_id, max_count) VALUES (?, ?) ON CONFLICT(visit_id) DO UPDATE SET max_count = MAX(max_count, excluded.max_count)').run(visitId, count);
  }

  formsSeen(): Map<JobberId, number> {
    const out = new Map<JobberId, number>();
    for (const r of this.stmt('SELECT visit_id, max_count FROM forms_seen').all() as Row[]) out.set(str(r.visit_id), num(r.max_count));
    return out;
  }

  // ---- queued_writes --------------------------------------------------------------------

  private toWrite(r: Row): QueuedWriteRow {
    const lastError = opt(r.last_error);
    const sentAt = opt(r.sent_at);
    return {
      id: str(r.id),
      submissionId: str(r.submission_id),
      kind: str(r.kind) as QueuedWrite['kind'],
      targetId: str(r.target_id),
      status: str(r.status) as QueuedWrite['status'],
      createdAt: str(r.created_at),
      createdBy: str(r.created_by),
      attempts: num(r.attempts),
      ...(lastError !== undefined ? { lastError } : {}),
      ...(sentAt !== undefined ? { sentAt } : {}),
      payload: JSON.parse(str(r.payload_json)) as QueuedWritePayload,
    };
  }

  insertQueuedWrite(w: NewQueuedWrite): void {
    this.stmt(
      'INSERT INTO queued_writes (id, submission_id, kind, target_id, payload_json, status, created_at, created_by, attempts) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)',
    ).run(w.id, w.submissionId, w.kind, w.targetId, JSON.stringify(w.payload), 'queued', w.createdAt, w.createdBy);
  }

  /** A superseding recap replaces the queued row's content; id and status stay. */
  replaceQueuedWrite(id: string, patch: { submissionId: string; payload: QueuedWritePayload; createdAt: Instant; createdBy: string }): void {
    this.stmt('UPDATE queued_writes SET submission_id = ?, payload_json = ?, created_at = ?, created_by = ?, attempts = 0, last_error = NULL WHERE id = ?').run(
      patch.submissionId,
      JSON.stringify(patch.payload),
      patch.createdAt,
      patch.createdBy,
      id,
    );
  }

  /** Drops one queued write (its note_overlay rows cascade). Used for fixture rows from an earlier board day. */
  deleteQueuedWrite(id: string): void {
    this.stmt('DELETE FROM queued_writes WHERE id = ?').run(id);
  }

  markWriteSent(id: string, at: Instant): void {
    this.stmt("UPDATE queued_writes SET status = 'sent', sent_at = ?, attempts = attempts + 1 WHERE id = ?").run(at, id);
  }

  /** Fixture-mode drain: every queued write becomes sent. Returns how many. */
  markAllQueuedSent(at: Instant): number {
    return Number(this.stmt("UPDATE queued_writes SET status = 'sent', sent_at = ?, attempts = attempts + 1 WHERE status = 'queued'").run(at).changes);
  }

  queuedWrites(): QueuedWriteRow[] {
    return (this.stmt('SELECT * FROM queued_writes ORDER BY created_at, rowid').all() as Row[]).map((r) => this.toWrite(r));
  }

  queuedCount(): number {
    const r = this.stmt("SELECT COUNT(*) AS n FROM queued_writes WHERE status = 'queued'").get() as Row;
    return num(r.n);
  }

  latestWriteFor(kind: QueuedWrite['kind'], targetId: string): QueuedWriteRow | undefined {
    const r = this.stmt('SELECT * FROM queued_writes WHERE kind = ? AND target_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1').get(kind, targetId) as Row | undefined;
    return r ? this.toWrite(r) : undefined;
  }

  writeBySubmission(submissionId: string): QueuedWriteRow | undefined {
    const r = this.stmt('SELECT * FROM queued_writes WHERE submission_id = ?').get(submissionId) as Row | undefined;
    return r ? this.toWrite(r) : undefined;
  }

  // ---- submissions ----------------------------------------------------------------------

  recordSubmission(s: SubmissionRow): void {
    this.stmt('INSERT OR REPLACE INTO submissions (submission_id, kind, target_id, pass, reviewer, verdict, at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
      s.submissionId,
      s.kind,
      s.targetId,
      s.pass ?? null,
      s.reviewer ?? null,
      s.verdict ?? null,
      s.at,
    );
  }

  private toSubmission(r: Row): SubmissionRow {
    const pass = r.pass === null || r.pass === undefined ? undefined : num(r.pass);
    const reviewer = opt(r.reviewer);
    const verdict = opt(r.verdict);
    return {
      submissionId: str(r.submission_id),
      kind: str(r.kind),
      targetId: str(r.target_id),
      ...(pass !== undefined ? { pass } : {}),
      ...(reviewer !== undefined ? { reviewer } : {}),
      ...(verdict !== undefined ? { verdict } : {}),
      at: str(r.at),
    };
  }

  /** Submissions of one kind at or after `since` (ISO compare works because every `at` is a UTC instant). */
  submissionsSince(kind: string, since: Instant): SubmissionRow[] {
    return (this.stmt('SELECT * FROM submissions WHERE kind = ? AND at >= ? ORDER BY at').all(kind, since) as Row[]).map((r) => this.toSubmission(r));
  }

  submissionCount(): number {
    return num((this.stmt('SELECT COUNT(*) AS n FROM submissions').get() as Row).n);
  }

  // ---- review_rows / flag_rows -----------------------------------------------------------

  /** Appends one Review-sheet row; returns its table index (1-based, continues across restarts). */
  appendReviewRow(row: ReviewRow): number {
    return Number(this.stmt('INSERT INTO review_rows (json) VALUES (?)').run(JSON.stringify(row)).lastInsertRowid);
  }

  reviewRows(): Array<{ index: number; row: ReviewRow }> {
    return (this.stmt('SELECT row_index, json FROM review_rows ORDER BY row_index').all() as Row[]).map((r) => ({
      index: num(r.row_index),
      row: JSON.parse(str(r.json)) as ReviewRow,
    }));
  }

  reviewRowCount(): number {
    return num((this.stmt('SELECT COUNT(*) AS n FROM review_rows').get() as Row).n);
  }

  appendFlagRow(row: FlagRow): number {
    return Number(this.stmt('INSERT INTO flag_rows (json) VALUES (?)').run(JSON.stringify(row)).lastInsertRowid);
  }

  flagRows(): FlagRow[] {
    return (this.stmt('SELECT json FROM flag_rows ORDER BY id').all() as Row[]).map((r) => JSON.parse(str(r.json)) as FlagRow);
  }

  flagRowCount(): number {
    return num((this.stmt('SELECT COUNT(*) AS n FROM flag_rows').get() as Row).n);
  }

  // ---- owner_overrides ------------------------------------------------------------------

  setOwnerOverride(jobId: JobberId, initials: string, setOn: string): void {
    this.stmt('INSERT INTO owner_overrides (job_id, initials, set_on) VALUES (?, ?, ?) ON CONFLICT(job_id) DO UPDATE SET initials = excluded.initials, set_on = excluded.set_on').run(
      jobId,
      initials,
      setOn,
    );
  }

  ownerOverrides(): Record<JobberId, { initials: string; setOn: string }> {
    const out: Record<JobberId, { initials: string; setOn: string }> = {};
    for (const r of this.stmt('SELECT job_id, initials, set_on FROM owner_overrides').all() as Row[]) out[str(r.job_id)] = { initials: str(r.initials), setOn: str(r.set_on) };
    return out;
  }

  // ---- owner_notes ----------------------------------------------------------------------

  /** Queues an owner note line for the sheet writer; a repeat with the same submission id is a no-op. Returns true when inserted. */
  insertOwnerNote(n: Omit<OwnerNoteRow, 'status'>): boolean {
    const r = this.stmt(
      "INSERT OR IGNORE INTO owner_notes (id, submission_id, job_id, row_index, row_submission_id, line, status, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?, 'queued', ?, ?)",
    ).run(n.id, n.submissionId, n.jobId, n.rowIndex, n.rowSubmissionId ?? null, n.line, n.createdAt, n.createdBy);
    return Number(r.changes) > 0;
  }

  ownerNotes(): OwnerNoteRow[] {
    return (this.stmt('SELECT * FROM owner_notes ORDER BY created_at, rowid').all() as Row[]).map((r) => {
      const rowSubmissionId = opt(r.row_submission_id);
      return {
        id: str(r.id),
        submissionId: str(r.submission_id),
        jobId: str(r.job_id),
        rowIndex: num(r.row_index),
        ...(rowSubmissionId !== undefined ? { rowSubmissionId } : {}),
        line: str(r.line),
        status: str(r.status) as OwnerNoteRow['status'],
        createdAt: str(r.created_at),
        createdBy: str(r.created_by),
      };
    });
  }

  // ---- note_overlay ---------------------------------------------------------------------

  upsertNoteOverlay(entry: { id: string; jobId: JobberId; at: Instant; text: string; writeId?: string }): void {
    this.stmt('INSERT INTO note_overlay (id, job_id, at, text, write_id) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET job_id = excluded.job_id, at = excluded.at, text = excluded.text, write_id = excluded.write_id').run(
      entry.id,
      entry.jobId,
      entry.at,
      entry.text,
      entry.writeId ?? null,
    );
  }

  noteOverlay(): NoteOverlayRow[] {
    return (
      this.stmt('SELECT n.id, n.job_id, n.at, n.text, n.write_id, w.kind AS write_kind, w.status AS write_status FROM note_overlay n LEFT JOIN queued_writes w ON w.id = n.write_id ORDER BY n.at, n.rowid').all() as Row[]
    ).map((r) => {
      const writeId = opt(r.write_id);
      const writeKind = opt(r.write_kind) as QueuedWrite['kind'] | undefined;
      const writeStatus = opt(r.write_status) as QueuedWrite['status'] | undefined;
      return {
        id: str(r.id),
        jobId: str(r.job_id),
        at: str(r.at),
        text: str(r.text),
        ...(writeId !== undefined ? { writeId } : {}),
        ...(writeKind !== undefined ? { writeKind } : {}),
        ...(writeStatus !== undefined ? { writeStatus } : {}),
      };
    });
  }

  // ---- settings -------------------------------------------------------------------------

  getSetting(key: string): string | undefined {
    const r = this.stmt('SELECT value FROM settings WHERE key = ?').get(key) as Row | undefined;
    return r ? str(r.value) : undefined;
  }

  setSetting(key: string, value: string): void {
    this.stmt('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
  }

  // ---- taps -----------------------------------------------------------------------------

  insertTap(at: Instant, screen: string, target: string): void {
    this.stmt('INSERT INTO taps (at, screen, target) VALUES (?, ?, ?)').run(at, screen, target);
  }

  tapCount(): number {
    return num((this.stmt('SELECT COUNT(*) AS n FROM taps').get() as Row).n);
  }

  // ---- pin_failures / sessions ----------------------------------------------------------

  pinFailure(userId: string): PinFailureRow | undefined {
    const r = this.stmt('SELECT count, locked_until FROM pin_failures WHERE user_id = ?').get(userId) as Row | undefined;
    if (!r) return undefined;
    const lockedUntil = opt(r.locked_until);
    return { count: num(r.count), ...(lockedUntil !== undefined ? { lockedUntil } : {}) };
  }

  setPinFailure(userId: string, count: number, at: Instant, lockedUntil?: Instant): void {
    this.stmt(
      'INSERT INTO pin_failures (user_id, count, locked_until, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET count = excluded.count, locked_until = excluded.locked_until, updated_at = excluded.updated_at',
    ).run(userId, count, lockedUntil ?? null, at);
  }

  /** Drops failure rows last touched before `before` (and legacy rows with no timestamp). Returns how many. */
  purgePinFailures(before: Instant): number {
    return Number(this.stmt('DELETE FROM pin_failures WHERE updated_at IS NULL OR updated_at < ?').run(before).changes);
  }

  pinFailureCount(): number {
    return num((this.stmt('SELECT COUNT(*) AS n FROM pin_failures').get() as Row).n);
  }

  clearPinFailure(userId: string): void {
    this.stmt('DELETE FROM pin_failures WHERE user_id = ?').run(userId);
  }

  insertSession(token: string, userId: string, expiresAt: Instant): void {
    this.stmt('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, userId, expiresAt);
  }

  session(token: string): { userId: string; expiresAt: Instant } | undefined {
    const r = this.stmt('SELECT user_id, expires_at FROM sessions WHERE token = ?').get(token) as Row | undefined;
    return r ? { userId: str(r.user_id), expiresAt: str(r.expires_at) } : undefined;
  }

  /** A token lasts 8 hours or until the service restarts (docs/http-api.md). */
  clearSessions(): void {
    this.stmt('DELETE FROM sessions').run();
  }

  purgeExpiredSessions(now: Instant): void {
    this.stmt('DELETE FROM sessions WHERE expires_at <= ?').run(now);
  }

  // ---- alerts_sent ----------------------------------------------------------------------

  alertSent(visitId: JobberId): boolean {
    return this.stmt('SELECT 1 FROM alerts_sent WHERE visit_id = ?').get(visitId) !== undefined;
  }

  markAlertSent(visitId: JobberId, at: Instant): void {
    this.stmt('INSERT OR IGNORE INTO alerts_sent (visit_id, at) VALUES (?, ?)').run(visitId, at);
  }
}
