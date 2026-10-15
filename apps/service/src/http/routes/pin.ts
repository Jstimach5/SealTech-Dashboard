/** POST /api/pin and GET /api/people (docs/http-api.md, Identity). */
import { z } from 'zod';
import { publicPerson, verifyPin } from '../../auth/pin.js';
import { parseBody, type Handler } from '../context.js';

export const USER_ID_MAX = 64;

const PinBody = z.object({ userId: z.string().min(1).max(USER_ID_MAX), pin: z.string().min(1).max(64) });

export const pin: Handler = ({ service, body, req }) => {
  const { userId, pin: code } = parseBody(PinBody, body);
  const r = verifyPin(service.db, service.roster, userId, code, service.clock.now(), { live: service.config.dataSource === 'live' });
  if (r.ok) return { body: { ok: true, token: r.token, person: r.person } };
  // Who and from where, never the PIN. Unknown ids are not echoed (they are caller-chosen text).
  const known = service.roster.people.some((p) => p.jobberUserId === userId);
  service.log.warn(`PIN refused (${r.status}) for ${known ? userId : 'an id not in the roster'} from ${req.socket.remoteAddress ?? 'unknown address'}`);
  if (r.status === 401) return { status: 401, body: { ok: false, error: r.error, attemptsLeft: r.attemptsLeft } };
  if (r.status === 403) return { status: 403, body: { ok: false, error: r.error } };
  return { status: 423, body: { ok: false, error: r.error, lockedForSec: r.lockedForSec } };
};

/** The PIN screen's name tiles; never a hash. */
export const people: Handler = ({ service }) => ({ body: { ok: true, people: service.roster.people.map(publicPerson) } });
