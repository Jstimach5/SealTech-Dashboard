/** Request context and the small helpers every route uses. Errors become `{ ok:false, error }` with their status. */
import { randomBytes } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { z } from 'zod';
import { assertNoPrivateText, type Person, type Snapshot } from '@sealtech/domain';
import { authenticate, requireRole, type Role } from '../auth/pin.js';
import type { BoardService } from '../service.js';

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly extra: Record<string, unknown> = {},
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
  if (roles && !requireRole(roles)(person)) throw new HttpError(403, `a ${person.role} may not do this`);
  return person;
}

export function requireSnapshot(ctx: Ctx): Snapshot {
  const s = ctx.service.snapshot();
  if (!s) throw new HttpError(503, 'no snapshot yet');
  return s;
}

/** Fixture ids carry `-test-`; a live service must never write them to Jobber or a sheet. */
export function refuseTestIdInLive(ctx: Ctx, targetId: string): void {
  if (ctx.service.config.dataSource === 'live' && targetId.includes('-test-')) throw new HttpError(409, `"${targetId}" is a fixture id; refused in live mode`);
}

/** Decision 4 at the door: text that looks like money, a street address or a phone number never enters a snapshot. */
export function requireNoPrivateText(fields: Record<string, string | undefined>): void {
  const offenders = assertNoPrivateText(fields);
  if (offenders.length) throw new HttpError(400, 'text looks like money, a street address or a phone number; the board never carries those (decision 4)');
}

export function newId(): string {
  return randomBytes(12).toString('hex');
}
