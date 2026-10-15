/** POST /api/pin and GET /api/people (docs/http-api.md, Identity). */
import { z } from 'zod';
import { publicPerson, verifyPin } from '../../auth/pin.js';
import { parseBody, type Handler } from '../context.js';

const PinBody = z.object({ userId: z.string().min(1), pin: z.string().min(1).max(64) });

export const pin: Handler = ({ service, body }) => {
  const { userId, pin: code } = parseBody(PinBody, body);
  const r = verifyPin(service.db, service.roster, userId, code, service.clock.now());
  if (r.ok) return { body: { ok: true, token: r.token, person: r.person } };
  if (r.status === 401) return { status: 401, body: { ok: false, error: r.error, attemptsLeft: r.attemptsLeft } };
  return { status: 423, body: { ok: false, error: r.error, lockedForSec: r.lockedForSec } };
};

/** The PIN screen's name tiles; never a hash. */
export const people: Handler = ({ service }) => ({ body: { ok: true, people: service.roster.people.map(publicPerson) } });
