/** POST /api/focus and POST /api/responder — the two human lines (decisions 35, 41). */
import { z } from 'zod';
import { HttpError, parseBody, requireNoPrivateText, requirePerson, type Handler } from '../context.js';

export const FOCUS_MAX = 30;

const FocusBody = z.object({ text: z.string().max(500) });
const ResponderBody = z.object({ initials: z.string().trim() });

export const focus: Handler = async (ctx) => {
  requirePerson(ctx, ['office', 'owner']);
  const text = parseBody(FocusBody, ctx.body).text.trim().replace(/\s+/g, ' ').toUpperCase();
  if (text.length > FOCUS_MAX) throw new HttpError(400, `focus line is ${text.length} characters; the limit is ${FOCUS_MAX}`);
  requireNoPrivateText({ text });
  ctx.service.db.setSetting('focusLine', text);
  await ctx.service.rebuild();
  return { body: { ok: true } };
};

export const responder: Handler = async (ctx) => {
  requirePerson(ctx, ['office', 'owner']);
  const initials = parseBody(ResponderBody, ctx.body).initials.toUpperCase();
  if (!/^[A-Z]{2,3}$/.test(initials)) throw new HttpError(400, 'initials must be 2–3 letters');
  ctx.service.db.setSetting('responderInitials', initials);
  await ctx.service.rebuild();
  return { body: { ok: true } };
};
