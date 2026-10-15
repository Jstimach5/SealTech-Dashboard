/** Request context and the small helpers every route uses. Errors become `{ ok:false, error }` with their status. */
import { randomBytes } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { z } from 'zod';
import { assertNoPrivateText, type Person, type Snapshot } from '@sealtech/domain';
import { authenticate, isTestId, requireRole, type Role } from '../auth/pin.js';
import type { QueuedWriteRow } from '../state/db.js';
import type { BoardService } from '../service.js';

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly extra: Record<string, unknown> = {},
    readonly headers: Record<string, string> = {},
  ) {
    super(message);
  }
}

export interface Ctx {
  req: IncomingMessage;
  res: ServerResponse;
  url: URL;
  service: BoardService;
  /** Parsed JSON body for POST routes; `{}` when empty. */
  body: unknown;
}

export interface Reply {
  status?: number;
  body: unknown;
}

export type Handler = (ctx: Ctx) => Promise<Reply> | Reply;

/** zod-validates a body; the first issue becomes a 400 with a plain sentence. */
export function parseBody<T extends z.ZodTypeAny>(schema: T, body: unknown): z.infer<T> {
  const parsed = schema.safeParse(body);
  if (parsed.success) return parsed.data as z.infer<T>;
  const issue = parsed.error.issues[0];
  const where = issue?.path.length ? `${issue.path.join('.')}: ` : '';
  throw new HttpError(400, `bad body — ${where}${issue?.message ?? 'invalid'}`);
}

/** The person behind the bearer token (401), optionally restricted to roles (403). */
export function requirePerson(ctx: Ctx, roles?: readonly Role[]): Person {
  const person = authenticate(ctx.service.db, ctx.service.roster, ctx.req.headers.authorization, ctx.service.clock.now());
  if (!person) throw new HttpError(401, 'missing, expired or unknown token');
  if (ctx.service.config.dataSource === 'live' && isTestId(person.jobberUserId)) throw new HttpError(403, 'fixture (-test-) people may not write in live mode');
  if (roles && !requireRole(roles)(person)) throw new HttpError(403, `a ${person.role} may not do this`);
  return person;
}

/**
 * The snapshot a write is checked against. It must come from a poll of this process: a snapshot
 * reloaded from disk at start may be yesterday's and carries no source inputs (A–L for a review row),
 * so writes wait (503) until the first poll after a start succeeds.
 */
export function requireSnapshot(ctx: Ctx): Snapshot {
  const s = ctx.service.snapshot();
  if (!s) throw new HttpError(503, 'no snapshot yet', {}, { 'Retry-After': '5' });
  if (!ctx.service.hasFreshSnapshot()) throw new HttpError(503, 'the board is still loading after a restart; try again in a few seconds', {}, { 'Retry-After': '5' });
  return s;
}

/**
 * The latest queued write of a kind for a target that still counts: in fixture mode only one made on
 * this board day (the fixture regenerates the same ids daily); in live mode any.
 */
export function currentWriteFor(ctx: Ctx, kind: QueuedWriteRow['kind'], targetId: string): QueuedWriteRow | undefined {
  const w = ctx.service.db.latestWriteFor(kind, targetId);
  return w && ctx.service.inBoardDay(w.createdAt) ? w : undefined;
}

/**
 * Fixture mode: a row from an earlier board day that happens to carry the same submission id (same
 * kind, target and payload) is out of scope; drop it so the new row can take the id.
 */
export function dropStaleSubmission(ctx: Ctx, submissionId: string): void {
  const stale = ctx.service.db.writeBySubmission(submissionId);
  if (stale && !ctx.service.inBoardDay(stale.createdAt)) ctx.service.db.deleteQueuedWrite(stale.id);
}

/** Fixture ids carry `-test-`; a live service must never write them to Jobber or a sheet. */
export function refuseTestIdInLive(ctx: Ctx, targetId: string): void {
  if (ctx.service.config.dataSource === 'live' && isTestId(targetId)) throw new HttpError(409, `"${targetId}" is a fixture id; refused in live mode`);
}

/** Decision 4 at the door: text that looks like money, a street address or a phone number never enters a snapshot. */
export function requireNoPrivateText(fields: Record<string, string | undefined>): void {
  const offenders = assertNoPrivateText(fields);
  if (offenders.length) throw new HttpError(400, 'text looks like money, a street address or a phone number; the board never carries those (decision 4)');
}

export function newId(): string {
  return randomBytes(12).toString('hex');
}
