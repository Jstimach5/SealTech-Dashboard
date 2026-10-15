/** Test harness: a service on a temp DATA_DIR, the HTTP server on port 0, and a small fetch wrapper. */
import { mkdtempSync, rmSync } from 'node:fs';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Snapshot } from '@sealtech/domain';
import { loadConfig, type ServiceConfig } from '../src/config.js';
import { createHttpServer, listen } from '../src/http/server.js';
import { silentLogger } from '../src/log.js';
import { MemoryMailer } from '../src/notify.js';
import { pinHash, type Roster } from '../src/auth/pin.js';
import { BoardService, type Clock, type ServiceDeps } from '../src/service.js';

/** As the service stores it: loadConfig normalises FIXTURE_NOW to `toISOString()` form. */
export const FIXTURE_NOW = '2026-10-14T13:30:00.000Z';
export const PIN = '1234';

/** A live-mode roster with no fixture people (ids without `-test-`), PIN 1234. */
export function liveRoster(): Roster {
  const people = [
    { jobberUserId: 'u-live-henry', lastName: 'HENRY', initials: 'HH', role: 'crewLead' as const, reviewPass: 1 as const },
    { jobberUserId: 'u-live-jamie', lastName: 'JAMIE', initials: 'JJ', role: 'office' as const, reviewPass: 0 as const },
  ];
  return { people: people.map((p) => ({ ...p, pinHash: pinHash(p.jobberUserId, PIN) })) };
}

export function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'sealtech-service-'));
}

export function testConfig(dataDir: string, extra: Record<string, string> = {}): ServiceConfig {
  return loadConfig(
    {
      BOARD_DATA_SOURCE: 'fixtures',
      FIXTURE_SCENARIO: 'default',
      FIXTURE_NOW,
      DATA_DIR: dataDir,
      ROSTER_PATH: join(dataDir, 'roster.json'),
      BOARD_BUILD: 'test',
      BOARD_DIST: join(dataDir, 'no-dist'),
      PORT: '0',
      ...extra,
    },
    { cwd: dataDir, envFile: false },
  );
}

/** A wall clock the test moves by hand (PIN lockouts, token expiry). */
export class TestClock implements Clock {
  constructor(public at: number = Date.parse(FIXTURE_NOW)) {}
  now(): string {
    return new Date(this.at).toISOString();
  }
  advance(ms: number): void {
    this.at += ms;
  }
}

export interface ApiResponse {
  status: number;
  headers: Headers;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  json: any;
  text: string;
}

export interface Harness {
  dir: string;
  config: ServiceConfig;
  service: BoardService;
  server: Server;
  baseUrl: string;
  clock: TestClock;
  mailer: MemoryMailer;
  api(method: 'GET' | 'POST', path: string, body?: unknown, token?: string): Promise<ApiResponse>;
  login(userId: string, pin?: string): Promise<string>;
  snapshot(): Snapshot;
  close(keepDir?: boolean): Promise<void>;
}

export interface HarnessOptions {
  dir?: string;
  env?: Record<string, string>;
  deps?: Partial<ServiceDeps>;
  /** Run the first poll before returning (default true). */
  poll?: boolean;
}

export async function startHarness(opts: HarnessOptions = {}): Promise<Harness> {
  const dir = opts.dir ?? tempDir();
  const config = testConfig(dir, opts.env);
  const clock = (opts.deps?.clock as TestClock | undefined) ?? new TestClock();
  const mailer = (opts.deps?.mailer as MemoryMailer | undefined) ?? new MemoryMailer();
  const service = new BoardService({ config, log: silentLogger, clock, mailer, ...opts.deps });
  if (opts.poll !== false) {
    const r = await service.poll({ quiet: true });
    if (!r.ok) throw new Error(`first poll failed: ${r.error}`);
  }
  const server = createHttpServer(service);
  const addr = await listen(server, 0, '127.0.0.1');
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  const api: Harness['api'] = async (method, path, body, token) => {
    const res = await fetch(baseUrl + path, {
      method,
      headers: {
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const text = await res.text();
    return { status: res.status, headers: res.headers, json: text ? JSON.parse(text) : undefined, text };
  };

  return {
    dir,
    config,
    service,
    server,
    baseUrl,
    clock,
    mailer,
    api,
    async login(userId, pin = PIN) {
      const r = await api('POST', '/api/pin', { userId, pin });
      if (r.status !== 200) throw new Error(`login ${userId} failed: ${r.status} ${r.text}`);
      return r.json.token as string;
    },
    snapshot() {
      const s = service.snapshot();
      if (!s) throw new Error('no snapshot');
      return s;
    },
    async close(keepDir = false) {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      service.close();
      if (!keepDir) rmSync(dir, { recursive: true, force: true });
    },
  };
}
