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
import type { Instant, Snapshot, SourceInputs, SourceName, SourceStatus } from '@sealtech/domain';
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
}

export type PollResult = { ok: true; ms: number; snapshot: Snapshot } | { ok: false; ms: number; error: string };

interface Current {
  snapshot: Snapshot;
  body: string;
  etag: string;
  inputs?: SourceInputs;
}

export const DB_FILE = 'board.db';

export class BoardService {
  readonly config: ServiceConfig;
  readonly log: Logger;
  readonly clock: Clock;
  readonly mailer: Mailer;
  readonly source: Source;
  readonly db: BoardDb;
  readonly roster: Roster;
  readonly writer: SnapshotWriter;

  private current?: Current;
  /** The first body seen for a generatedAt gets the plain `"<generatedAt>"` ETag; any other body for the same instant a content suffix. */
  private firstBody?: { generatedAt: Instant; body: string };
  consecutiveFailures = 0;
  lastPollOk = false;
  lastError?: string;
  private warnedLiveWrites = false;

  constructor(deps: ServiceDeps) {
    this.config = deps.config;
    this.log = deps.log ?? consoleLogger;
    this.clock = deps.clock ?? systemClock;
    this.mailer = deps.mailer ?? new LogMailer(this.log);
    this.source = deps.source ?? (this.config.dataSource === 'fixtures' ? fixtureSource(this.config.fixtureScenario) : liveSource());
    this.db = new BoardDb(join(this.config.dataDir, DB_FILE));
    // A token lasts 8 hours or until the service restarts (docs/http-api.md).
    this.db.clearSessions();
    this.roster = loadRoster(this.config, this.log);
    this.writer = new SnapshotWriter(this.config.dataDir, deps.writerFs);
    const onDisk = this.writer.read();
    if (onDisk) {
      this.firstBody = { generatedAt: onDisk.snapshot.generatedAt, body: onDisk.body };
      this.current = { snapshot: onDisk.snapshot, body: onDisk.body, etag: `"${onDisk.snapshot.generatedAt}"` };
      this.log.info(`reloaded ${this.writer.path} (generated ${onDisk.snapshot.generatedAt})`);
    }
  }

  /** The board's clock: FIXTURE_NOW when set, else the real clock. */
  boardNow(): Instant {
    return this.config.fixtureNow ?? this.clock.now();
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
      this.drainQueuedWrites(now);
      const { snapshot, inputs } = await buildOnce(this.source, this.db, this.config, now);
      this.adopt(snapshot, inputs);
      this.consecutiveFailures = 0;
      this.lastPollOk = true;
      delete this.lastError;
      this.persist();
      const alerted = await runNoAckAlerts(snapshot, { db: this.db, config: this.config, mailer: this.mailer });
      const ms = Math.round(performance.now() - t0);
      if (!opts.quiet) this.log.info(`poll ok ${snapshot.jobs.length} jobs ${snapshot.visits.length} visits hero ${snapshot.hero.cannotInvoice} in ${ms} ms`);
      for (const id of alerted) this.log.info(`no-ACK alert sent for ${id}`);
      return { ok: true, ms, snapshot };
    } catch (err) {
      const error = errorMessage(err);
      const ms = Math.round(performance.now() - t0);
      this.consecutiveFailures += 1;
      this.lastPollOk = false;
      this.lastError = error;
      this.markSourceFailed(error, now);
      if (!opts.quiet) this.log.error(`poll FAILED ${error}`);
      return { ok: false, ms, error };
    }
  }

  /** After a write: rebuild now so the next board tick shows it. Throws when the build fails. */
  async rebuild(): Promise<Snapshot> {
    const r = await this.poll({ quiet: true });
    if (!r.ok) throw new Error(`rebuild after write failed: ${r.error}`);
    return r.snapshot;
  }

  close(): void {
    this.db.close();
  }

  // ---- internals ------------------------------------------------------------------------

  private adopt(snapshot: Snapshot, inputs: SourceInputs | undefined): void {
    const body = serializeSnapshot(snapshot);
    if (!this.firstBody || this.firstBody.generatedAt !== snapshot.generatedAt) this.firstBody = { generatedAt: snapshot.generatedAt, body };
    const etag = body === this.firstBody.body ? `"${snapshot.generatedAt}"` : `"${snapshot.generatedAt};${createHash('sha256').update(body).digest('hex').slice(0, 8)}"`;
    this.current = { snapshot, body, etag, ...(inputs ? { inputs } : {}) };
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
    const failed: SourceStatus = { ...prev, ok: false, error, lastAttemptAt: now };
    const snapshot: Snapshot = { ...this.current.snapshot, generatedAt: now, sources: { ...this.current.snapshot.sources, [name]: failed } };
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
