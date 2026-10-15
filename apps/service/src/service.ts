/**
 * The service object: one database, one source, one writer, the last good snapshot in memory.
 * `index.ts` runs it as a process; the tests construct it directly against a temp DATA_DIR.
 *
 * Two clocks: `clock.now()` is wall-clock time (poll cadence, PIN lockouts, token expiry) and
 * `boardNow()` is the board's clock, which `FIXTURE_NOW` may freeze for deterministic fixtures.
 */
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { addMinutes, assertNoPrivateText, localDate, type Instant, type Snapshot, type SourceInputs, type SourceName, type SourceStatus } from '@sealtech/domain';
import { loadRoster, type Roster } from './auth/pin.js';
import type { ServiceConfig } from './config.js';
import { consoleLogger, errorMessage, type Logger } from './log.js';
import { LogMailer, runNoAckAlerts, type Mailer } from './notify.js';
import { buildOnce } from './snapshot/builder.js';
import { SnapshotWriter, serializeSnapshot, type WriterFs } from './snapshot/writer.js';
import { fixtureSource } from './sources/fixture.js';
import { liveSource } from './sources/live.js';
import type { Source } from './sources/types.js';
import { BoardDb } from './state/db.js';

export interface Clock {
  now(): Instant;
}

export const systemClock: Clock = { now: () => new Date().toISOString() };

export interface ServiceDeps {
  config: ServiceConfig;
  log?: Logger;
  clock?: Clock;
  mailer?: Mailer;
  source?: Source;
  writerFs?: WriterFs;
  /**
   * `--once`: build and write snapshot.json only. Sessions, PIN failures, the write queue and the
   * alert table belong to the long-running service on the same DATA_DIR and are not touched.
   */
  once?: boolean;
}

export type PollResult = { ok: true; ms: number; snapshot: Snapshot } | { ok: false; ms: number; error: string };

interface Current {
  snapshot: Snapshot;
  body: string;
  etag: string;
  inputs?: SourceInputs;
}

export const DB_FILE = 'board.db';

/** What sources.*.error and /health say when a load failed the decision-4 privacy check. Never the text itself. */
export const PRIVACY_FAILURE = 'a record failed the privacy check (money, address or phone); last good snapshot kept';
/** What they say when an error message itself looks private. */
export const OPAQUE_FAILURE = 'load failed; the error text was withheld because it looked like private data; last good snapshot kept';

/**
 * Error text that is safe for the snapshot, /health and the log. A decision-4 rejection becomes the
 * fixed sentence plus the offending field path(s) only; any other message that itself looks like
 * money, an address or a phone number is replaced whole.
 */
export function safeErrorText(raw: string): string {
  if (raw.startsWith('Snapshot contains private text')) {
    const paths = raw
      .split('\n')
      .slice(1)
      .map((line) => line.slice(0, Math.max(0, line.indexOf(': '))))
      .filter((p) => /^\$[\w.[\]-]*$/.test(p));
    const shown = paths.slice(0, 3).join(', ');
    const more = paths.length > 3 ? ` and ${paths.length - 3} more` : '';
    const text = shown ? `${PRIVACY_FAILURE} (at ${shown}${more})` : PRIVACY_FAILURE;
    return assertNoPrivateText({ text }).length ? PRIVACY_FAILURE : text;
  }
  return assertNoPrivateText({ text: raw }).length ? OPAQUE_FAILURE : raw;
}

/** The ETag for a body: generatedAt for readability, plus a content hash so a tag never names two bodies. */
export function etagFor(generatedAt: Instant, body: string): string {
  return `"${generatedAt};${createHash('sha256').update(body).digest('hex').slice(0, 16)}"`;
}

/** pin_failures rows untouched for this long are purged on start. */
export const PIN_FAILURE_TTL_MIN = 24 * 60;

export class BoardService {
  readonly config: ServiceConfig;
  readonly log: Logger;
  readonly clock: Clock;
  readonly mailer: Mailer;
  readonly source: Source;
  readonly db: BoardDb;
  readonly roster: Roster;
  readonly writer: SnapshotWriter;

  readonly once: boolean;
  private current?: Current;
  consecutiveFailures = 0;
  lastPollOk = false;
  lastError?: string;
  private warnedLiveWrites = false;

  constructor(deps: ServiceDeps) {
    this.config = deps.config;
    this.log = deps.log ?? consoleLogger;
    this.clock = deps.clock ?? systemClock;
    this.mailer = deps.mailer ?? new LogMailer(this.log);
    this.once = deps.once ?? false;
    this.source = deps.source ?? (this.config.dataSource === 'fixtures' ? fixtureSource(this.config.fixtureScenario) : liveSource());
    // Live mode refuses a fixture roster before anything else is opened (throws: the process exits 1).
    this.roster = loadRoster(this.config, this.log);
    this.db = new BoardDb(join(this.config.dataDir, DB_FILE));
    if (!this.once) {
      // A token lasts 8 hours or until the service restarts (docs/http-api.md). `--once` is not a restart.
      this.db.clearSessions();
      const purged = this.db.purgePinFailures(addMinutes(this.clock.now(), -PIN_FAILURE_TTL_MIN));
      if (purged > 0) this.log.info(`purged ${purged} PIN failure row(s) older than a day`);
    }
    this.writer = new SnapshotWriter(this.config.dataDir, deps.writerFs);
    const onDisk = this.writer.read((m) => this.log.warn(m));
    if (onDisk) {
      // No inputs: this snapshot is served for reads only; writes wait for this process's first poll.
      this.current = { snapshot: onDisk.snapshot, body: onDisk.body, etag: etagFor(onDisk.snapshot.generatedAt, onDisk.body) };
      this.log.info(`reloaded ${this.writer.path} (generated ${onDisk.snapshot.generatedAt})`);
    }
  }

  /** The board's clock: FIXTURE_NOW when set, else the real clock. Always a UTC `...Z` instant. */
  boardNow(): Instant {
    return this.config.fixtureNow ?? this.clock.now();
  }

  /**
   * Fixture mode regenerates the same visit ids every day, so the service's own rows (note overlay,
   * queued writes) count only on the board day they were made. Live ids are unique; everything counts.
   */
  inBoardDay(at: Instant): boolean {
    return this.config.dataSource !== 'fixtures' || localDate(at) === localDate(this.boardNow());
  }

  /** True once this process has built a snapshot itself (a reloaded file alone does not count). */
  hasFreshSnapshot(): boolean {
    return this.current?.inputs !== undefined;
  }

  snapshot(): Snapshot | undefined {
    return this.current?.snapshot;
  }

  /** The serialized snapshot exactly as written to disk, for `/snapshot.json`. */
  body(): string | undefined {
    return this.current?.body;
  }

  etag(): string | undefined {
    return this.current?.etag;
  }

  /** The merged inputs behind the current snapshot (undefined until the first build of this process). */
  inputs(): SourceInputs | undefined {
    return this.current?.inputs;
  }

  queuedCount(): number {
    return this.db.queuedCount();
  }

  /**
   * One poll: drain (fixture simulation), build, adopt, persist, alert. A failed load keeps the last
   * snapshot and marks the source as failing without moving `lastOkAt`. Logs one line unless quiet.
   */
  async poll(opts: { quiet?: boolean } = {}): Promise<PollResult> {
    const t0 = performance.now();
    const now = this.boardNow();
    try {
      if (!this.once) this.drainQueuedWrites(now);
      const { snapshot, inputs } = await buildOnce(this.source, this.db, this.config, now);
      this.adopt(snapshot, inputs);
      this.consecutiveFailures = 0;
      this.lastPollOk = true;
      delete this.lastError;
      this.persist();
      const alerted = this.once ? [] : await runNoAckAlerts(snapshot, { db: this.db, config: this.config, mailer: this.mailer });
      const ms = Math.round(performance.now() - t0);
      if (!opts.quiet) this.log.info(`poll ok ${snapshot.jobs.length} jobs ${snapshot.visits.length} visits hero ${snapshot.hero.cannotInvoice} in ${ms} ms`);
      for (const id of alerted) this.log.info(`no-ACK alert sent for ${id}`);
      return { ok: true, ms, snapshot };
    } catch (err) {
      const error = safeErrorText(errorMessage(err));
      const ms = Math.round(performance.now() - t0);
      this.consecutiveFailures += 1;
      this.lastPollOk = false;
      this.lastError = error;
      this.markSourceFailed(error, now);
      if (!opts.quiet) this.log.error(`poll FAILED ${error}`);
      return { ok: false, ms, error };
    }
  }

  /**
   * After a committed write: rebuild now so the next board tick shows it. A failed rebuild never
   * fails the write (it is already stored); it is logged and the next poll picks the write up.
   */
  async rebuild(): Promise<Snapshot | undefined> {
    const r = await this.poll({ quiet: true });
    if (!r.ok) {
      this.log.error(`rebuild after write failed (${r.error}); the write is stored and shows after the next good poll`);
      return undefined;
    }
    return r.snapshot;
  }

  close(): void {
    this.db.close();
  }

  // ---- internals ------------------------------------------------------------------------

  private adopt(snapshot: Snapshot, inputs: SourceInputs | undefined): void {
    const body = serializeSnapshot(snapshot);
    this.current = { snapshot, body, etag: etagFor(snapshot.generatedAt, body), ...(inputs ? { inputs } : {}) };
  }

  private persist(): void {
    if (!this.current) return;
    try {
      this.writer.write(this.current.body);
    } catch (err) {
      this.log.error(`snapshot write FAILED (${errorMessage(err)}); serving from memory, previous file kept`);
    }
  }

  /** The last snapshot stays; the failing source reads ok=false with the error and this attempt's time. */
  private markSourceFailed(error: string, now: Instant): void {
    if (!this.current) return;
    const name: SourceName = 'jobber';
    const prev = this.current.snapshot.sources[name];
    const build = (text: string): Snapshot => {
      const failed: SourceStatus = { ...prev, ok: false, error: text, lastAttemptAt: now };
      return { ...this.current!.snapshot, generatedAt: now, sources: { ...this.current!.snapshot.sources, [name]: failed } };
    };
    let snapshot = build(error);
    // Belt and braces for decision 4: the snapshot we are about to serve must pass the same sweep.
    if (assertNoPrivateText(snapshot).length) snapshot = build(OPAQUE_FAILURE);
    this.adopt(snapshot, this.current.inputs);
    this.persist();
  }

  /**
   * JOBBER_WRITES=on: in fixture mode the "send" is simulated (every queued write becomes sent, so its
   * note line applies). In live mode the Jobber writer is milestone M10; writes stay queued.
   */
  private drainQueuedWrites(now: Instant): void {
    if (!this.config.jobberWrites) return;
    if (this.config.dataSource === 'fixtures') {
      const n = this.db.markAllQueuedSent(now);
      if (n > 0) this.log.info(`fixture drain: ${n} queued write(s) marked sent (simulated)`);
      return;
    }
    if (!this.warnedLiveWrites) {
      this.log.warn('JOBBER_WRITES=on but the live Jobber note writer is milestone M10; writes stay queued');
      this.warnedLiveWrites = true;
    }
  }
}
