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

/**
 * Reads ROSTER_PATH. In fixture mode a missing file is written from the TESTVILLE people (and logged).
 * In live mode a missing file is an error the owner must fix: nobody can sign in until it exists.
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
  return { people: parsed.data.people as Person[] };
}

export type PinResult =
  | { ok: true; token: string; person: PublicPerson }
  | { ok: false; status: 401; error: string; attemptsLeft: number }
  | { ok: false; status: 423; error: string; lockedForSec: number };

/** `now` is the real clock (lockouts and expiries are wall-clock), not the board's possibly frozen one. */
export function verifyPin(db: BoardDb, roster: Roster, userId: string, pin: string, now: string): PinResult {
  const failure = db.pinFailure(userId);
  if (failure?.lockedUntil !== undefined) {
    const left = Math.ceil(minutesBetween(now, failure.lockedUntil) * 60);
    if (left > 0) return { ok: false, status: 423, error: `locked for ${left} s after ${MAX_PIN_FAILURES} wrong PINs`, lockedForSec: left };
  }
  const person = roster.people.find((p) => p.jobberUserId === userId);
  const good = person?.pinHash !== undefined && person.pinHash === pinHash(userId, pin);
  if (!good) {
    const count = (failure?.lockedUntil !== undefined ? 0 : (failure?.count ?? 0)) + 1;
    if (count >= MAX_PIN_FAILURES) {
      db.setPinFailure(userId, 0, addMinutes(now, LOCK_SEC / 60));
      return { ok: false, status: 423, error: `locked for ${LOCK_SEC} s after ${MAX_PIN_FAILURES} wrong PINs`, lockedForSec: LOCK_SEC };
    }
    db.setPinFailure(userId, count);
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
