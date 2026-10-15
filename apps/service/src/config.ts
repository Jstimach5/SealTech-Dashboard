/**
 * Process configuration. Values come from `process.env`, topped up from a `.env` file in the working
 * directory (the office PC keeps the only real one at C:\SealTech\board\.env). Keys are documented in
 * `.env.example`. Secret values (JOBBER_CLIENT_SECRET, the Google key path) are never logged; this
 * module only ever prints key names.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export type DataSource = 'fixtures' | 'live';

export interface ServiceConfig {
  /** BOARD_DATA_SOURCE: fixtures (TESTVILLE) or live (Jobber + sheets; needs the developer app, M8). */
  dataSource: DataSource;
  /** FIXTURE_SCENARIO: a key of fixtures/scenarios.ts. */
  fixtureScenario: string;
  /** FIXTURE_NOW: a frozen board clock (ISO instant). Unset = the real clock. */
  fixtureNow?: string;
  /** JOBBER_WRITES=on lets queued note writes drain (fixture mode: simulated). */
  jobberWrites: boolean;
  /** ROSTER_PATH: `{ people: Person[] }` with pin hashes. */
  rosterPath: string;
  /** DATA_DIR: board.db, snapshot.json and the fixture roster live here. */
  dataDir: string;
  port: number;
  /** BOARD_DIST: the built board (apps/board/dist) served at `/`. */
  boardDist: string;
  /** ALERT_TO: email-to-SMS address for the single no-ACK alert (decision 41). */
  alertTo?: string;
  tz: string;
  /** BOARD_BUILD: shown in the footer and /health; defaults to the short git head, else `dev`. */
  build: string;
}

/** apps/service, whether this file runs from src/ (tsx) or dist/ (node). */
export const SERVICE_ROOT: string = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Tiny `.env` parser: `KEY=value`, `#` comments, optional single or double quotes. No interpolation. */
export function parseEnvFile(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim().replace(/^export\s+/, '');
    let value = line.slice(eq + 1).trim();
    const quoted = (value.startsWith('"') && value.endsWith('"') && value.length >= 2) || (value.startsWith("'") && value.endsWith("'") && value.length >= 2);
    if (quoted) value = value.slice(1, -1);
    else {
      const hash = value.indexOf(' #');
      if (hash !== -1) value = value.slice(0, hash).trim();
    }
    out[key] = value;
  }
  return out;
}

export interface LoadConfigOptions {
  /** Where `.env` is looked for and relative paths resolve. Default `process.cwd()`. */
  cwd?: string;
  /** Read `<cwd>/.env` (default true). Tests pass false. */
  envFile?: boolean;
}

function gitShortHead(cwd: string): string | undefined {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd, stdio: ['ignore', 'pipe', 'ignore'], timeout: 2000 })
      .toString()
      .trim() || undefined;
  } catch {
    return undefined;
  }
}

export function loadConfig(env: Record<string, string | undefined> = process.env, opts: LoadConfigOptions = {}): ServiceConfig {
  const cwd = opts.cwd ?? process.cwd();
  const merged: Record<string, string | undefined> = { ...env };
  if (opts.envFile !== false) {
    const file = resolve(cwd, '.env');
    if (existsSync(file)) {
      for (const [k, v] of Object.entries(parseEnvFile(readFileSync(file, 'utf8')))) {
        if (merged[k] === undefined || merged[k] === '') merged[k] = v;
      }
    }
  }
  const get = (key: string): string | undefined => {
    const v = merged[key];
    return v === undefined || v.trim() === '' ? undefined : v.trim();
  };

  const dataSource = get('BOARD_DATA_SOURCE') ?? 'fixtures';
  if (dataSource !== 'fixtures' && dataSource !== 'live') throw new Error(`BOARD_DATA_SOURCE must be "fixtures" or "live" (got "${dataSource}")`);

  const fixtureNow = get('FIXTURE_NOW');
  if (fixtureNow !== undefined && Number.isNaN(new Date(fixtureNow).getTime())) throw new Error('FIXTURE_NOW must be an ISO-8601 instant (or blank for the real clock)');

  const writes = get('JOBBER_WRITES') ?? 'off';
  if (writes !== 'on' && writes !== 'off') throw new Error(`JOBBER_WRITES must be "on" or "off" (got "${writes}")`);

  const port = Number(get('PORT') ?? '8787');
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('PORT must be an integer 0–65535');

  const alertTo = get('ALERT_TO');
  const boardDist = get('BOARD_DIST');

  return {
    dataSource,
    fixtureScenario: get('FIXTURE_SCENARIO') ?? 'default',
    ...(fixtureNow !== undefined ? { fixtureNow } : {}),
    jobberWrites: writes === 'on',
    rosterPath: resolve(cwd, get('ROSTER_PATH') ?? './data/roster.json'),
    dataDir: resolve(cwd, get('DATA_DIR') ?? './data'),
    port,
    boardDist: boardDist !== undefined ? resolve(cwd, boardDist) : resolve(SERVICE_ROOT, '../board/dist'),
    ...(alertTo !== undefined ? { alertTo } : {}),
    tz: get('TZ') ?? 'America/Detroit',
    build: get('BOARD_BUILD') ?? gitShortHead(cwd) ?? 'dev',
  };
}

/** A printable summary with no secret values (only key names and non-secret settings). */
export function describeConfig(c: ServiceConfig): string {
  return [
    `mode=${c.dataSource}`,
    c.dataSource === 'fixtures' ? `scenario=${c.fixtureScenario}` : '',
    c.fixtureNow ? `now=${c.fixtureNow}` : 'now=real',
    `writes=${c.jobberWrites ? 'on' : 'off'}`,
    `build=${c.build}`,
    `data=${c.dataDir}`,
    `port=${c.port}`,
    `alert=${c.alertTo ? 'set' : 'unset'}`,
  ]
    .filter(Boolean)
    .join(' ');
}
