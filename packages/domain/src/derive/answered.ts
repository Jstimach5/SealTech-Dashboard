/**
 * Visit-result "answered" state (decisions 10, 18, 21). The board never collects the answer itself:
 * crews answer the Visit result job form in the Jobber app (decision 18), or give the same answer at
 * the shop touchscreen (decision 21), and the board only watches. A visit is answered when a result
 * arrived from any source, or when Jobber's unanswered-form count fell to 0 on a visit that did have
 * a form. Live Jobber fact: `incompleteJobFormsCount` is 0 on a visit that never had a form attached,
 * so 0 alone never means answered; `formsSeenMax` (service-kept) tells the two apart.
 * Pure functions; `now` is always passed in.
 */
import { CONFIG } from '../config.js';
import type { ResultSource } from '../enums.js';
import type { Instant, Visit } from '../types.js';
import { minutesBetween } from './time.js';

export type AnsweredState = 'answered' | 'unanswered' | 'unknown';

/** Decisions 10, 11, 21: a result from the job form, a visit note or a queued recap is an answer. */
const ANSWERED_SOURCES: readonly ResultSource[] = ['jobForm', 'note', 'recapQueued'];

/** Decision 10/21: a result from any source counts as an answer, whatever the form count says. */
export function hasResultFromAnySource(visit: Visit): boolean {
  return ANSWERED_SOURCES.includes(visit.resultSource);
}

/** Decision 18: Jobber's own form count says answered only when the visit did have a form (formsSeenMax > 0). */
export function formAnsweredInJobber(visit: Visit): boolean {
  return visit.formsSeenMax > 0 && visit.incompleteJobFormsCount === 0;
}

/**
 * Decisions 10, 18, 21: 'answered' on a result from any source or a form Jobber reports answered;
 * 'unanswered' while Jobber still counts an open form; 'unknown' when no form was ever seen and no
 * result arrived (a 0 count on a form-less visit proves nothing).
 */
export function answeredState(visit: Visit): AnsweredState {
  if (hasResultFromAnySource(visit) || formAnsweredInJobber(visit)) return 'answered';
  if (visit.incompleteJobFormsCount > 0) return 'unanswered';
  return 'unknown';
}

/** Decision 18: a visit is owed an answer once it is complete, or strictly more than NO_RESULT_GRACE_MIN after its scheduled end. */
export function isPastGrace(visit: Visit, now: Instant): boolean {
  if (visit.isComplete) return true;
  return minutesBetween(visit.endAt, now) > CONFIG.NO_RESULT_GRACE_MIN;
}

/**
 * Decision 18: how many of today's visits past grace are still unanswered, and separately how many
 * are unknown (never had a form, no result). Visits inside grace count in neither.
 */
export function unansweredCount(visitsToday: Visit[], now: Instant): { unanswered: number; unknown: number } {
  let unanswered = 0;
  let unknown = 0;
  for (const visit of visitsToday) {
    if (!isPastGrace(visit, now)) continue;
    const state = answeredState(visit);
    if (state === 'unanswered') unanswered++;
    else if (state === 'unknown') unknown++;
  }
  return { unanswered, unknown };
}
