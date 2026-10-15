/**
 * POST /api/recap and POST /api/ack — the two Jobber note writes (decisions 11, 12, 21, 41, 42).
 * Both land in `queued_writes`; fixture mode also keeps a note overlay so the wall shows the effect
 * before the developer app exists. The write is marked sent only when JOBBER_WRITES=on (simulated).
 */
import { z } from 'zod';
import { MISS_REASONS, VISIT_RESULTS, formatAckLine, formatVisitResultLine, localHHMM, recapDecision, submissionId, type VisitResult } from '@sealtech/domain';
import type { QueuedWritePayload } from '../../state/db.js';
import { HttpError, newId, parseBody, refuseTestIdInLive, requireNoPrivateText, requirePerson, requireSnapshot, type Ctx, type Handler } from '../context.js';

const RecapBody = z.object({
  visitId: z.string().min(1),
  result: z.enum(VISIT_RESULTS),
  missReason: z.enum(MISS_REASONS).optional(),
  note: z.string().trim().max(1000).optional(),
});

/** Decision 42: these results do not submit without a coded reason. */
export const RESULTS_NEEDING_REASON: ReadonlySet<VisitResult> = new Set<VisitResult>(['Return needed', 'Problem', 'Not started']);

export const recap: Handler = async (ctx) => {
  const { service } = ctx;
  const person = requirePerson(ctx, ['crewLead', 'owner']);
  const { visitId, result, missReason, note } = parseBody(RecapBody, ctx.body);
  if (RESULTS_NEEDING_REASON.has(result) && missReason === undefined) throw new HttpError(400, `missReason is required when result is ${result}`);
  refuseTestIdInLive(ctx, visitId);
  const snapshot = requireSnapshot(ctx);
  const visit = snapshot.visits.find((v) => v.id === visitId);
  if (!visit) throw new HttpError(404, `visit ${visitId} is not in the current snapshot`);
  requireNoPrivateText({ note });

  const now = service.boardNow();
  const text = note !== undefined && note !== '' ? note : undefined;
  const line = formatVisitResultLine(result, missReason, text);
  const payload: QueuedWritePayload = { result, ...(missReason !== undefined ? { missReason } : {}), ...(text !== undefined ? { note: text } : {}), line };
  const sid = submissionId('recap', visitId, undefined, { result, missReason, note: text });

  const existing = service.db.latestWriteFor('visit_note', visitId);
  const decision = recapDecision(existing ? { visitId: existing.targetId, flushed: existing.status === 'sent' } : undefined, { visitId });
  if (decision === 'refuse') throw new HttpError(409, 'recap already in Jobber for this visit');
  if (decision === 'supersede' && existing?.submissionId === sid) return { body: { ok: true, status: 'queued', deduped: true } };

  const id = decision === 'supersede' && existing ? existing.id : newId();
  service.db.transaction(() => {
    if (decision === 'supersede' && existing) service.db.replaceQueuedWrite(id, { submissionId: sid, payload, createdAt: now, createdBy: person.jobberUserId });
    else service.db.insertQueuedWrite({ id, submissionId: sid, kind: 'visit_note', targetId: visitId, payload, createdAt: now, createdBy: person.jobberUserId });
    service.db.recordSubmission({ submissionId: sid, kind: 'recap', targetId: visitId, reviewer: person.jobberUserId, at: now });
    applyFixtureOverlay(ctx, { id, jobId: visit.jobId, at: now, text: line });
  });
  await service.rebuild();
  return { body: { ok: true, status: decision === 'supersede' ? 'superseded' : 'queued' } };
};

const AckBody = z.object({ visitId: z.string().min(1) });

export const ack: Handler = async (ctx) => {
  const { service } = ctx;
  const person = requirePerson(ctx, ['office', 'owner']);
  const { visitId } = parseBody(AckBody, ctx.body);
  refuseTestIdInLive(ctx, visitId);
  const snapshot = requireSnapshot(ctx);
  const visit = snapshot.visits.find((v) => v.id === visitId);
  if (!visit) throw new HttpError(404, `visit ${visitId} is not in the current snapshot`);
  if (visit.result !== 'Problem') throw new HttpError(409, `visit ${visitId} does not show Problem`);
  if (visit.ack) return { body: { ok: true, status: 'queued', deduped: true } };

  const now = service.boardNow();
  const line = formatAckLine(localHHMM(now).replace(/^0/, ''), person.initials);
  const sid = submissionId('ack', visitId, undefined, { line });
  if (service.db.writeBySubmission(sid)) return { body: { ok: true, status: 'queued', deduped: true } };

  const id = newId();
  service.db.transaction(() => {
    service.db.insertQueuedWrite({ id, submissionId: sid, kind: 'ack', targetId: visitId, payload: { line }, createdAt: now, createdBy: person.jobberUserId });
    service.db.recordSubmission({ submissionId: sid, kind: 'ack', targetId: visitId, reviewer: person.jobberUserId, at: now });
    applyFixtureOverlay(ctx, { id, jobId: visit.jobId, at: now, text: line });
  });
  await service.rebuild();
  return { body: { ok: true, status: 'queued' } };
};

/** Fixture mode: keep the note line in the overlay; with JOBBER_WRITES=on the send is simulated at once. */
function applyFixtureOverlay(ctx: Ctx, entry: { id: string; jobId: string; at: string; text: string }): void {
  const { service } = ctx;
  if (service.config.dataSource !== 'fixtures') return;
  service.db.upsertNoteOverlay({ ...entry, writeId: entry.id });
  if (service.config.jobberWrites) service.db.markWriteSent(entry.id, entry.at);
}
