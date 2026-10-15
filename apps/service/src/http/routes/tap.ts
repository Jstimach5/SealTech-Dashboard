/** POST /api/tap — the 30-day audit record (decision 38). No token. */
import { z } from 'zod';
import { parseBody, type Handler } from '../context.js';

const TapBody = z.object({ screen: z.string().trim().min(1).max(60), target: z.string().trim().max(200) });

export const tap: Handler = (ctx) => {
  const { screen, target } = parseBody(TapBody, ctx.body);
  ctx.service.db.insertTap(ctx.service.clock.now(), screen, target);
  return { body: { ok: true } };
};
