/**
 * POST /api/flag — one row on the KPI sheet's Flags tab (decisions 14, 15, 16). Nothing of it ever
 * enters a snapshot: the row goes to `flag_rows` (fixture mode) or the sheet (live), and the board
 * is not rebuilt.
 */
import { z } from 'zod';
import { ISSUE_TO_FLAG, ISSUE_TYPES, type FlagRow } from '@sealtech/domain';
import { HttpError, parseBody, requirePerson, requireSnapshot, type Handler } from '../context.js';

const FlagBody = z.object({
  issue: z.enum(ISSUE_TYPES),
  jobNumber: z.number().int().nonnegative(),
  employee: z.string().trim().min(1).max(100),
  crewOnReport: z.string().trim().max(100),
  notes: z.string().trim().max(2000),
  rr: z.enum(['Y', 'N']),
});

export const flag: Handler = (ctx) => {
  requirePerson(ctx, ['office', 'owner']);
  const input = parseBody(FlagBody, ctx.body);
  const snapshot = requireSnapshot(ctx);
  const job = snapshot.jobs.find((j) => j.jobNumber === input.jobNumber);
  if (!job) throw new HttpError(404, `job #${input.jobNumber} is not in the current snapshot`);
  const mapped = ISSUE_TO_FLAG[input.issue];
  const row: FlagRow = {
    date: snapshot.boardDate,
    employee: input.employee,
    type: mapped.type,
    rr: input.rr,
    flagType: mapped.flagType,
    jobNumber: input.jobNumber,
    notes: input.notes,
    crewOnReport: input.crewOnReport,
  };
  ctx.service.db.appendFlagRow(row);
  return { body: { ok: true } };
};
