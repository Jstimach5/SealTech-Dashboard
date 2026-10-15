/**
 * POST /api/owner — huddle owner override for a cannot-invoice line (decision 33).
 *
 * The override is stored in `owner_overrides` (the wall reads it from there). When the job has a
 * Review-sheet row, the line `OWNER:XX YYYY-MM-DD` is also queued in `owner_notes` for the job's
 * latest row, so the sheet writer (M6) can put it into that row's Owner notes (column L) and the
 * sheet carries the record (decision 1). Columns A–L of an existing row are never edited by
 * appending a new row, and the board never writes the sheet itself before M6. The queue is
 * service-only: the domain's QueuedWrite kinds have no owner note, so it never enters a snapshot.
 */
import { z } from 'zod';
import { submissionId, verdictsByJob } from '@sealtech/domain';
import { HttpError, newId, parseBody, refuseTestIdInLive, requirePerson, requireSnapshot, type Handler } from '../context.js';

const OwnerBody = z.object({ jobId: z.string().min(1).max(200), initials: z.string().trim().max(10) });

export const owner: Handler = async (ctx) => {
  const { service } = ctx;
  const person = requirePerson(ctx);
  const { jobId, initials: raw } = parseBody(OwnerBody, ctx.body);
  const initials = raw.toUpperCase();
  if (!/^[A-Z]{2,3}$/.test(initials)) throw new HttpError(400, 'initials must be 2–3 letters');
  refuseTestIdInLive(ctx, jobId);
  const snapshot = requireSnapshot(ctx);
  if (!snapshot.jobs.some((j) => j.id === jobId)) throw new HttpError(404, `job ${jobId} is not in the current snapshot`);

  const line = `OWNER:${initials} ${snapshot.boardDate}`;
  const latest = verdictsByJob(snapshot.reviewRows)[jobId]?.latest;
  service.db.transaction(() => {
    service.db.setOwnerOverride(jobId, initials, snapshot.boardDate);
    if (latest) {
      service.db.insertOwnerNote({
        id: newId(),
        submissionId: submissionId('owner_note', jobId, undefined, { line, rowIndex: latest.rowIndex }),
        jobId,
        rowIndex: latest.rowIndex,
        ...(latest.submissionId !== undefined ? { rowSubmissionId: latest.submissionId } : {}),
        line,
        createdAt: service.boardNow(),
        createdBy: person.jobberUserId,
      });
    }
  });
  await service.rebuild();
  return { body: { ok: true } };
};
