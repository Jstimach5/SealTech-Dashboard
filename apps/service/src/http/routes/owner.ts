/** POST /api/owner — huddle owner override for a cannot-invoice line (decision 33). */
import { z } from 'zod';
import { HttpError, parseBody, refuseTestIdInLive, requirePerson, requireSnapshot, type Handler } from '../context.js';

const OwnerBody = z.object({ jobId: z.string().min(1), initials: z.string().trim() });

export const owner: Handler = async (ctx) => {
  requirePerson(ctx);
  const { jobId, initials: raw } = parseBody(OwnerBody, ctx.body);
  const initials = raw.toUpperCase();
  if (!/^[A-Z]{2,3}$/.test(initials)) throw new HttpError(400, 'initials must be 2–3 letters');
  refuseTestIdInLive(ctx, jobId);
  const snapshot = requireSnapshot(ctx);
  if (!snapshot.jobs.some((j) => j.id === jobId)) throw new HttpError(404, `job ${jobId} is not in the current snapshot`);
  ctx.service.db.setOwnerOverride(jobId, initials, snapshot.boardDate);
  await ctx.service.rebuild();
  return { body: { ok: true } };
};
