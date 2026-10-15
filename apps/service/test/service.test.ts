/**
 * The service object without HTTP: build, atomic write, reload on restart, failure handling,
 * cadence, alerts and config parsing.
 */
import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import * as nodeFs from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { SnapshotSchema, assertNoPrivateText, type Instant } from '@sealtech/domain';
import { loadConfig, parseEnvFile } from '../src/config.js';
import { silentLogger } from '../src/log.js';
import { MemoryMailer } from '../src/notify.js';
import { BACKOFF_MS, DAY_MS, FIXTURE_TICK_MS, NIGHT_MS, cadenceMs } from '../src/schedule.js';
import { BoardService } from '../src/service.js';
import { buildOnce, overlayApplies } from '../src/snapshot/builder.js';
import { fixtureSource } from '../src/sources/fixture.js';
import { liveSource } from '../src/sources/live.js';
import type { Source } from '../src/sources/types.js';
import { BoardDb } from '../src/state/db.js';
import { FIXTURE_NOW, TestClock, tempDir, testConfig } from './helpers.js';

const dirs: string[] = [];
function dir(): string {
  const d = tempDir();
  dirs.push(d);
  return d;
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function make(d: string, extra: Record<string, string> = {}, deps: Partial<ConstructorParameters<typeof BoardService>[0]> = {}): BoardService {
  return new BoardService({ config: testConfig(d, extra), log: silentLogger, mailer: new MemoryMailer(), clock: new TestClock(), ...deps });
}

describe('buildOnce / --once', () => {
  it('builds the default TESTVILLE snapshot: hero 12, fixtures mode, validated and private', async () => {
    const d = dir();
    const config = testConfig(d);
    const db = new BoardDb(join(d, 'board.db'));
    const { snapshot, inputs } = await buildOnce(fixtureSource('default'), db, config, FIXTURE_NOW);
    db.close();
    expect(snapshot.hero.cannotInvoice).toBe(12);
    expect(snapshot.mode).toBe('fixtures');
    expect(snapshot.generatedAt).toBe(FIXTURE_NOW);
    expect(snapshot.boardDate).toBe('2026-10-14');
    expect(snapshot.build).toBe('test');
    expect(() => SnapshotSchema.parse(snapshot)).not.toThrow();
    expect(assertNoPrivateText(snapshot)).toEqual([]);
    // Service-owned fields come from settings/defaults, not the raw source.
    expect(snapshot.focusLine).toBe('PHOTOS BEFORE YOU LEAVE');
    expect(snapshot.responderInitials).toBe('JA');
    expect(inputs.reviewRows[0]?.application).toContain('.pdf'); // unredacted in the inputs
    expect(snapshot.reviewRows[0]?.application).not.toContain('.pdf'); // redacted on the wall
  });

  it('the service owns `sources`: all ok as of now, CompanyCam unconnected; the stale overlay passes through', async () => {
    const d = dir();
    const s = make(d);
    const r = await s.poll({ quiet: true });
    expect(r.ok).toBe(true);
    const snap = s.snapshot()!;
    expect(snap.sources.jobber).toEqual({ connected: true, ok: true, lastOkAt: FIXTURE_NOW, lastAttemptAt: FIXTURE_NOW });
    expect(snap.sources.companyCam).toEqual({ connected: false, ok: false });
    s.close();

    const stale = make(dir(), { FIXTURE_SCENARIO: 'stale' });
    await stale.poll({ quiet: true });
    expect(stale.snapshot()!.sources.jobber.ok).toBe(false);
    expect(stale.snapshot()!.sources.jobber.error).toBe('HTTP 502 from Jobber');
    stale.close();
  });

  it('writes snapshot.json and re-reads it on restart before any poll', async () => {
    const d = dir();
    const first = make(d);
    expect(first.snapshot()).toBeUndefined();
    await first.poll({ quiet: true });
    expect(existsSync(join(d, 'snapshot.json'))).toBe(true);
    expect(existsSync(join(d, 'roster.json'))).toBe(true);
    first.close();

    const second = make(d);
    const reloaded = second.snapshot();
    expect(reloaded).toBeDefined();
    expect(reloaded?.generatedAt).toBe(FIXTURE_NOW);
    expect(reloaded?.hero.cannotInvoice).toBe(12);
    expect(second.etag()).toBe(`"${FIXTURE_NOW}"`);
    second.close();
  });

  it('live source refuses with the hand-off message until M8', async () => {
    await expect(liveSource().load(FIXTURE_NOW)).rejects.toThrow(/Jobber developer app/);
  });
});

describe('atomic snapshot write', () => {
  it('leaves no snapshot.json.tmp behind', async () => {
    const d = dir();
    const s = make(d);
    await s.poll({ quiet: true });
    await s.poll({ quiet: true });
    s.close();
    expect(readdirSync(d).filter((f) => f.endsWith('.tmp'))).toEqual([]);
  });

  it('a crash between the tmp write and the rename keeps the previous snapshot.json intact', async () => {
    const d = dir();
    let failNext = false;
    const writerFs = {
      ...nodeFs,
      renameSync: (from: string, to: string) => {
        if (failNext) {
          failNext = false;
          throw new Error('simulated crash before rename');
        }
        nodeFs.renameSync(from, to);
      },
    };
    const s = make(d, {}, { writerFs });
    await s.poll({ quiet: true });
    const before = readFileSync(join(d, 'snapshot.json'), 'utf8');
    s.db.setSetting('focusLine', 'CHANGED');
    failNext = true;
    const r = await s.poll({ quiet: true }); // this write fails at the rename
    expect(r.ok).toBe(true); // the build succeeded; memory has the new snapshot
    expect(s.snapshot()?.focusLine).toBe('CHANGED');
    expect(readFileSync(join(d, 'snapshot.json'), 'utf8')).toBe(before);
    expect(readdirSync(d).filter((f) => f.endsWith('.tmp'))).toEqual([]);
    await s.poll({ quiet: true }); // next poll writes normally
    expect(readFileSync(join(d, 'snapshot.json'), 'utf8')).not.toBe(before);
    s.close();
  });
});

describe('failed loads', () => {
  function flaky(): Source & { fail: boolean } {
    const inner = fixtureSource('default');
    const src = {
      name: 'fixtures' as const,
      fail: false,
      load(now: Instant) {
        if (src.fail) return Promise.reject(new Error('HTTP 502 from Jobber'));
        return inner.load(now);
      },
    };
    return src;
  }

  it('keeps the last snapshot, flips jobber to ok:false with the error, never moves lastOkAt, backs off after 3', async () => {
    const d = dir();
    const source = flaky();
    const s = make(d, {}, { source });
    await s.poll({ quiet: true });
    const good = s.snapshot()!;
    source.fail = true;
    const r = await s.poll({ quiet: true });
    expect(r.ok).toBe(false);
    const after = s.snapshot()!;
    expect(after.hero.cannotInvoice).toBe(good.hero.cannotInvoice);
    expect(after.sources.jobber).toMatchObject({ connected: true, ok: false, error: 'HTTP 502 from Jobber', lastOkAt: FIXTURE_NOW, lastAttemptAt: FIXTURE_NOW });
    expect(s.consecutiveFailures).toBe(1);
    expect(cadenceMs(FIXTURE_NOW, 'fixtures', s.consecutiveFailures)).toBe(FIXTURE_TICK_MS);
    await s.poll({ quiet: true });
    await s.poll({ quiet: true });
    expect(s.consecutiveFailures).toBe(3);
    expect(cadenceMs(FIXTURE_NOW, 'fixtures', s.consecutiveFailures)).toBe(BACKOFF_MS);
    // the failure state is persisted so a restart shows it too, and still validates
    expect(() => SnapshotSchema.parse(JSON.parse(readFileSync(join(d, 'snapshot.json'), 'utf8')))).not.toThrow();
    source.fail = false;
    expect((await s.poll({ quiet: true })).ok).toBe(true);
    expect(s.snapshot()!.sources.jobber.ok).toBe(true);
    expect(s.consecutiveFailures).toBe(0);
    s.close();
  });
});

describe('cadence', () => {
  it('fixtures every 15 s; live 60 s in the Detroit day, 10 min at night', () => {
    expect(cadenceMs('2026-10-14T13:30:00Z', 'fixtures')).toBe(FIXTURE_TICK_MS);
    expect(cadenceMs('2026-10-14T13:30:00Z', 'live')).toBe(DAY_MS); // 09:30 EDT
    expect(cadenceMs('2026-10-14T10:00:00Z', 'live')).toBe(DAY_MS); // 06:00 EDT, inclusive
    expect(cadenceMs('2026-10-14T22:30:00Z', 'live')).toBe(NIGHT_MS); // 18:30 EDT, exclusive
    expect(cadenceMs('2026-10-15T03:00:00Z', 'live')).toBe(NIGHT_MS); // 23:00 EDT
    expect(cadenceMs('2026-10-14T13:30:00Z', 'live', 3)).toBe(BACKOFF_MS);
  });
});

describe('no-ACK alert', () => {
  it('sends exactly one message for NGUYEN across polls, with the card label and no address', async () => {
    const d = dir();
    const mailer = new MemoryMailer();
    const s = make(d, { ALERT_TO: '5555555555@txt.example' }, { mailer });
    await s.poll({ quiet: true });
    await s.poll({ quiet: true });
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0]?.to).toBe('5555555555@txt.example');
    expect(mailer.sent[0]?.text).toContain('NGUYEN · TESTVILLE · ATT');
    expect(assertNoPrivateText({ text: mailer.sent[0]?.text })).toEqual([]);
    expect(s.db.alertSent('v-test-nguyen-1')).toBe(true);
    s.close();
    // a restart on the same DATA_DIR does not send it again
    const again = make(d, { ALERT_TO: '5555555555@txt.example' }, { mailer });
    await again.poll({ quiet: true });
    expect(mailer.sent).toHaveLength(1);
    again.close();
  });
});

describe('note overlay rules', () => {
  it('ACK lines apply while queued; recap lines only once sent', () => {
    const base = { id: 'x', jobId: 'j', at: FIXTURE_NOW, text: 'ACK 9:30 JA', writeId: 'x' };
    expect(overlayApplies({ ...base, writeKind: 'ack', writeStatus: 'queued' })).toBe(true);
    expect(overlayApplies({ ...base, writeKind: 'visit_note', writeStatus: 'queued' })).toBe(false);
    expect(overlayApplies({ ...base, writeKind: 'visit_note', writeStatus: 'sent' })).toBe(true);
    expect(overlayApplies({ id: 'y', jobId: 'j', at: FIXTURE_NOW, text: 'CLOSE: C' })).toBe(true);
  });
});

describe('config', () => {
  it('parses .env text and applies defaults', () => {
    expect(parseEnvFile('# c\nA=1\nB="two words"\nC=x # trailing\n\nexport D=4\nbad line\n')).toEqual({ A: '1', B: 'two words', C: 'x', D: '4' });
    const c = loadConfig({ DATA_DIR: '/tmp/x' }, { cwd: '/tmp', envFile: false });
    expect(c.dataSource).toBe('fixtures');
    expect(c.fixtureScenario).toBe('default');
    expect(c.fixtureNow).toBeUndefined();
    expect(c.jobberWrites).toBe(false);
    expect(c.port).toBe(8787);
    expect(c.dataDir).toBe('/tmp/x');
    expect(c.rosterPath).toBe('/tmp/data/roster.json');
    expect(c.boardDist.endsWith('/apps/board/dist')).toBe(true);
    expect(c.tz).toBe('America/Detroit');
    expect(c.build.length).toBeGreaterThan(0);
    expect(() => loadConfig({ BOARD_DATA_SOURCE: 'nope' }, { envFile: false })).toThrow(/BOARD_DATA_SOURCE/);
    expect(() => loadConfig({ FIXTURE_NOW: 'yesterday' }, { envFile: false })).toThrow(/FIXTURE_NOW/);
    expect(() => loadConfig({ JOBBER_WRITES: 'yes' }, { envFile: false })).toThrow(/JOBBER_WRITES/);
  });
});
