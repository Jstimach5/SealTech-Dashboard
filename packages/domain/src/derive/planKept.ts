/**
 * Plan kept (decisions 44, 46). Yesterday's visits are sorted into kept / missed / unknown so the
 * wall can print "kept 7 of 9 (2 unknown)" and the Monday scorecard can take the percentage
 * (decision 39). Integers only; the UI renders. No clock is involved: the service hands in the
 * visits that belong to yesterday, so these are pure functions over that list.
 */
import type { MissReason } from '../enums.js';
import type { Visit } from '../types.js';

export interface PlanKeptCounts {
  kept: number;
  planned: number;
  unknown: number;
  misses: Partial<Record<MissReason, number>>;
}

/** Decision 44: a visit with no result yet is unknown; it is neither planned nor a miss. */
export function isUnknown(visit: Visit): boolean {
  return visit.result === undefined;
}

/** Decision 44: Customer cancelled is neither planned nor a miss; every other result was a planned visit. */
export function isPlanned(visit: Visit): boolean {
  return visit.result !== undefined && visit.result !== 'Customer cancelled';
}

/** Decision 46: Completed keeps the plan; Prepped keeps it only when the visit was planned as a prep day. */
export function isKept(visit: Visit): boolean {
  if (visit.result === 'Completed') return true;
  if (visit.result === 'Prepped') return visit.plannedAsPrep;
  return false;
}

/** Decisions 42, 46: a planned visit that was not kept is a miss under its coded reason, OTHER when none was coded. */
export function missReasonOf(visit: Visit): MissReason {
  return visit.missReason ?? 'OTHER';
}

/** Decision 44: count yesterday's visits into kept / planned / unknown, and the misses by reason. */
export function planKept(visitsYesterday: Visit[]): PlanKeptCounts {
  const out: PlanKeptCounts = { kept: 0, planned: 0, unknown: 0, misses: {} };
  for (const visit of visitsYesterday) {
    if (isUnknown(visit)) {
      out.unknown++;
      continue;
    }
    if (!isPlanned(visit)) continue;
    out.planned++;
    if (isKept(visit)) {
      out.kept++;
      continue;
    }
    const reason = missReasonOf(visit);
    out.misses[reason] = (out.misses[reason] ?? 0) + 1;
  }
  return out;
}
