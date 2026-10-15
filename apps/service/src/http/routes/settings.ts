/** POST /api/focus and POST /api/responder — the two human lines (decisions 35, 41). */
import { z } from 'zod';
import { assertNoPrivateText } from '@sealtech/domain';
import { HttpError, parseBody, requirePerson, type Handler } from '../context.js';

export const FOCUS_MAX = 30;

function titleCase(text: string): string {
  return text.toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase());
}

function privateTextIn(variants: string[]): boolean {
  return variants.some((v) => assertNoPrivateText({ text: v }).length > 0);
}

const FocusBody = z.object({ text: z.string().max(500) });
const ResponderBody = z.object({ initials: z.string().trim() });

export const focus: Handler = async (ctx) => {
  requirePerson(ctx, ['office', 'owner']);
  const typed = parseBody(FocusBody, ctx.body).text.trim().replace(/\s+/g, ' ');
  // Revision G (decision 54): the line is stored and shown as typed, in sentence case on the wall; no upper-casing.
  const text = typed;
  if (text.length > FOCUS_MAX) throw new HttpError(400, `focus line is ${text.length} characters; the limit is ${FOCUS_MAX}`);
  // Decision 4 on the text as typed, upper-cased and title-cased, so an address in any case is caught.
  if (privateTextIn([typed, typed.toUpperCase(), titleCase(typed)])) throw new HttpError(400, 'the focus line looks like money, a street address or a phone number; the board never shows those');
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
