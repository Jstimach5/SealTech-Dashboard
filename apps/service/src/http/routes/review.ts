/**
 * POST /api/review — one tap, one appended Review-sheet row (decisions 5, 7, 8). Pass must match the
 * person's review pass; FIX needs a picklist value, HOLD a reason; a pass-2 READY needs a pass-1 READY
 * row already on the job; the same tap twice inside CONFIG.REVIEW_DEDUPE_MIN collapses to one row.
 */
import { z } from 'zod';
import {
  CONFIG,
  FIX_PICKLIST,
  VERDICTS,
  addMinutes,
  attentionLabel,
  minutesBetween,
  shouldDropReview,
  submissionId,
  verdictsByJob,
  type ReviewRow,
} from '@sealtech/domain';
import { HttpError, parseBody, refuseTestIdInLive, requireNoPrivateText, requirePerson, requireSnapshot, type Handler } from '../context.js';

const ReviewBody = z.object({
  jobId: z.string().min(1),
  pass: z.union([z.literal(1), z.literal(2)]),
  verdict: z.enum(VERDICTS),
  fixPick: z.enum(FIX_PICKLIST).optional(),
  holdReason: z.string().trim().min(1).max(500).optional(),
  notes: z.string().trim().max(2000).optional(),
});

const DEDUPE_LOOKBACK_MIN = 10;

export const review: Handler = async (ctx) => {
  const { service } = ctx;
  const person = requirePerson(ctx);
  const { jobId, pass, verdict, fixPick, holdReason, notes } = parseBody(ReviewBody, ctx.body);
  refuseTestIdInLive(ctx, jobId);
  const snapshot = requireSnapshot(ctx);
  const job = snapshot.jobs.find((j) => j.id === jobId);
  if (!job) throw new HttpError(404, `job ${jobId} is not in the current snapshot`);
  if (person.reviewPass !== pass) throw new HttpError(403, `${person.lastName} reviews pass ${person.reviewPass || 'none'}, not pass ${pass}`);
  if (verdict === 'FIX' && fixPick === undefined) throw new HttpError(400, 'FIX needs fixPick from the picklist');
  if (verdict === 'HOLD' && holdReason === undefined) throw new HttpError(400, 'HOLD needs holdReason');
  requireNoPrivateText({ holdReason, notes });

  const verdicts = verdictsByJob(snapshot.reviewRows);
  if (pass === 2 && verdict === 'READY' && !verdicts[jobId]?.pass1Ready) throw new HttpError(409, 'pass 2 READY needs a pass 1 READY row on this job first');

  const now = service.boardNow();
  const sid = submissionId('review', jobId, pass, { verdict, fixPick, holdReason });
  const incoming = { targetId: jobId, pass, reviewerUserId: person.jobberUserId, verdict, at: now };
  const recent = service.db.submissionsSince('review', addMinutes(now, -DEDUPE_LOOKBACK_MIN));
  const taps = recent.map((s) => ({ targetId: s.targetId, at: s.at, ...(s.pass !== undefined ? { pass: s.pass } : {}), ...(s.reviewer !== undefined ? { reviewerUserId: s.reviewer } : {}), ...(s.verdict !== undefined ? { verdict: s.verdict } : {}) }));
  if (shouldDropReview(taps, incoming)) {
    const prior = recent.find(
      (s) => s.targetId === jobId && s.pass === pass && s.reviewer === person.jobberUserId && s.verdict === verdict && Math.abs(minutesBetween(s.at, now)) <= CONFIG.REVIEW_DEDUPE_MIN,
    );
    const rowIndex = prior ? (lastRowWith(snapshot.reviewRows, prior.submissionId)?.rowIndex ?? 0) : 0;
    return { body: { ok: true, rowIndex, deduped: true } };
  }

  // A–L copied from the job's latest matched row (unredacted, from the merged inputs), else blank / the card label.
  const latest = verdicts[jobId]?.latest;
  const rawLatest = latest ? service.inputs()?.reviewRows.find((r) => r.rowIndex === latest.rowIndex) : undefined;
  const row: ReviewRow = {
    rowIndex: 0,
    checked: snapshot.boardDate,
    application: rawLatest?.application ?? '',
    installDate: rawLatest?.installDate ?? '',
    tech: rawLatest?.tech ?? '',
    jobDesc: rawLatest?.jobDesc ?? attentionLabel(job),
    verdict,
    ...(fixPick !== undefined ? { fixBeforeSubmitting: fixPick } : {}),
    ...(holdReason !== undefined ? { holdReason } : {}),
    ...(notes !== undefined && notes !== '' ? { reviewNotes: notes } : {}),
    jobberJobId: job.id,
    jobNumber: job.jobNumber,
    pass,
    reviewerUserId: person.jobberUserId,
    reviewedAt: now,
    submissionId: sid,
    match: 'exact',
    matchedJobId: job.id,
  };
  service.db.transaction(() => {
    service.db.appendReviewRow(row);
    service.db.recordSubmission({ submissionId: sid, kind: 'review', targetId: jobId, pass, reviewer: person.jobberUserId, verdict, at: now });
  });
  const next = await service.rebuild();
  const rowIndex = lastRowWith(next.reviewRows, sid)?.rowIndex ?? 0;
  return { body: { ok: true, rowIndex, deduped: false } };
};

function lastRowWith(rows: ReviewRow[], sid: string): ReviewRow | undefined {
  for (let i = rows.length - 1; i >= 0; i--) if (rows[i]?.submissionId === sid) return rows[i];
  return undefined;
}
