/**
 * Identity (decision 20): name + 4-digit PIN mapped to a Jobber user id. The roster file holds
 * `pinHash = sha256("<jobberUserId>:<pin>")`, never a PIN. Three wrong PINs lock the user for 60 s;
 * a right one issues a bearer token good for 8 hours or until the service restarts.
 */
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { z } from 'zod';
import { PersonPublicSchema, addMinutes, minutesBetween, sha256Hex, type Person } from '@sealtech/domain';
import { PEOPLE } from '@sealtech/fixtures/testville/data.js';
import type { ServiceConfig } from '../config.js';
import type { Logger } from '../log.js';
import type { BoardDb } from '../state/db.js';

export const MAX_PIN_FAILURES = 3;
export const LOCK_SEC = 60;
export const SESSION_HOURS = 8;
export const FIXTURE_PIN = '1234';

const RosterSchema = z.object({ people: z.array(PersonPublicSchema.extend({ pinHash: z.string().optional() })) });

export interface Roster {
  people: Person[];
}

export type PublicPerson = Pick<Person, 'jobberUserId' | 'lastName' | 'initials' | 'role' | 'reviewPass'>;

export function publicPerson(p: Person): PublicPerson {
  return { jobberUserId: p.jobberUserId, lastName: p.lastName, initials: p.initials, role: p.role, reviewPass: p.reviewPass };
}

export function pinHash(userId: string, pin: string): string {
  return sha256Hex(`${userId}:${pin}`);
}

/** The TESTVILLE people with PIN 1234 for everyone. Fixtures only; never used in live mode. */
export function fixtureRoster(): Roster {
  return { people: PEOPLE.map((p) => ({ ...publicPerson(p), pinHash: pinHash(p.jobberUserId, FIXTURE_PIN) })) };
}

/** Fixture people carry `-test-` in every id (fixtures/testville/data.ts). */
export function isTestId(id: string): boolean {
  return id.includes('-test-');
}

/** True when the roster is the generated TESTVILLE roster or holds any fixture (`-test-`) person. */
export function isFixtureRoster(roster: Roster): boolean {
  if (roster.people.some((p) => isTestId(p.jobberUserId))) return true;
  const fixture = fixtureRoster();
  return roster.people.length > 0 && JSON.stringify(roster.people.map(publicPerson)) === JSON.stringify(fixture.people.map(publicPerson));
}

/**
 * Reads ROSTER_PATH. In fixture mode a missing file is written from the TESTVILLE people (and logged).
 * In live mode a missing file is an error the owner must fix: nobody can sign in until it exists; and
 * a roster holding fixture people (`-test-` ids, PIN 1234, e.g. the one left behind by the fixture
 * prototype) is refused outright: this throws, so the service does not start.
 */
export function loadRoster(config: ServiceConfig, log: Logger): Roster {
  if (!existsSync(config.rosterPath)) {
    if (config.dataSource !== 'fixtures') {
      log.error(`roster file ${config.rosterPath} is missing; PIN sign-in is unavailable until the owner writes it`);
      return { people: [] };
    }
    const roster = fixtureRoster();
    mkdirSync(dirname(config.rosterPath), { recursive: true });
    writeFileSync(config.rosterPath, JSON.stringify(roster, null, 2) + '\n');
    log.info(`wrote fixture roster (PIN ${FIXTURE_PIN} for all TESTVILLE people) — fixtures only`);
    return roster;
  }
  const parsed = RosterSchema.safeParse(JSON.parse(readFileSync(config.rosterPath, 'utf8')));
  if (!parsed.success) throw new Error(`roster file ${config.rosterPath} is not { people: Person[] }: ${parsed.error.issues[0]?.message ?? 'invalid'}`);
  const roster = { people: parsed.data.people as Person[] };
  if (config.dataSource === 'live' && isFixtureRoster(roster)) {
    throw new Error(
      `live mode refuses the roster at ${config.rosterPath}: it is the fixture (TESTVILLE) roster or holds -test- user ids; replace it with the real roster before starting`,
    );
  }
  return roster;
}

export type PinResult =
  | { ok: true; token: string; person: PublicPerson }
  | { ok: false; status: 401; error: string; attemptsLeft: number }
  | { ok: false; status: 403; error: string }
  | { ok: false; status: 423; error: string; lockedForSec: number };

/**
 * `now` is the real clock (lockouts and expiries are wall-clock), not the board's possibly frozen one.
 * Failures are recorded only for ids in the roster, so unknown ids never grow `pin_failures`; they get
 * the same 401 shape. In live mode a fixture (`-test-`) id is refused with 403.
 */
export function verifyPin(db: BoardDb, roster: Roster, userId: string, pin: string, now: string, opts: { live?: boolean } = {}): PinResult {
  if (opts.live && isTestId(userId)) return { ok: false, status: 403, error: 'fixture (-test-) people cannot sign in in live mode' };
  const person = roster.people.find((p) => p.jobberUserId === userId);
  if (!person) return { ok: false, status: 401, error: 'wrong PIN', attemptsLeft: MAX_PIN_FAILURES };
  const failure = db.pinFailure(userId);
  if (failure?.lockedUntil !== undefined) {
    const left = Math.ceil(minutesBetween(now, failure.lockedUntil) * 60);
    if (left > 0) return { ok: false, status: 423, error: `locked for ${left} s after ${MAX_PIN_FAILURES} wrong PINs`, lockedForSec: left };
  }
  const good = person.pinHash !== undefined && person.pinHash === pinHash(userId, pin);
  if (!good) {
    const count = (failure?.lockedUntil !== undefined ? 0 : (failure?.count ?? 0)) + 1;
    if (count >= MAX_PIN_FAILURES) {
      db.setPinFailure(userId, 0, now, addMinutes(now, LOCK_SEC / 60));
      return { ok: false, status: 423, error: `locked for ${LOCK_SEC} s after ${MAX_PIN_FAILURES} wrong PINs`, lockedForSec: LOCK_SEC };
    }
    db.setPinFailure(userId, count, now);
    return { ok: false, status: 401, error: 'wrong PIN', attemptsLeft: MAX_PIN_FAILURES - count };
  }
  db.clearPinFailure(userId);
  const token = randomBytes(32).toString('hex');
  db.insertSession(token, userId, addMinutes(now, SESSION_HOURS * 60));
  return { ok: true, token, person: publicPerson(person) };
}

/** The person behind an `Authorization: Bearer <token>` header, or undefined. */
export function authenticate(db: BoardDb, roster: Roster, authorization: string | undefined, now: string): Person | undefined {
  const m = /^Bearer\s+([A-Za-z0-9]+)\s*$/.exec(authorization ?? '');
  if (!m) return undefined;
  const session = db.session(m[1] ?? '');
  if (!session || session.expiresAt <= now) return undefined;
  return roster.people.find((p) => p.jobberUserId === session.userId);
}

export type Role = Person['role'];

/** Middleware-style guard: true when the person's role is one of `roles`. */
export function requireRole(roles: readonly Role[]): (person: Person) => boolean {
  return (person) => roles.includes(person.role);
}
