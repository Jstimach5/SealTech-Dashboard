/**
 * Card state on the TODAY lanes. One card is one visit; its chip is always a word AND an icon
 * (decision 27: red never alone). Lifecycle per decision 34: Completed → AWAITING REVIEW → READY,
 * grey only at READY + invoiced, and the card leaves the lane at Detroit midnight. The Problem
 * acknowledgement clock is decision 41. Chip words are the crew's own Visit result values
 * (decision 10) or the fixed house words below; never dollars, address or phone (decision 4).
 * Pure functions; `now` is always passed in.
 */
import { CONFIG } from '../config.js';
import { CHIP, type ChipTone, type Verdict, type VisitResult } from '../enums.js';
import type { Instant, Job, Visit } from '../types.js';
import { isSameLocalDay, minutesBetween } from './time.js';

export type CardStateKind =
  | 'NOT STARTED'
  | 'NOW'
  | 'STILL OPEN'
  | 'RESULT'
  | 'NO RESULT'
  | 'AWAITING REVIEW'
  | 'FIX'
  | 'HOLD'
  | 'READY'
  | 'DONE';

export type Tone = ChipTone;

export interface CardState {
  kind: CardStateKind;
  /** The word printed on the chip, uppercase house word or the Visit result as Jobber spells it. */
  chipWord: string;
  chipIcon: string;
  tone: Tone;
  /** Decision 34: true only at READY + invoiced (DONE). */
  grey: boolean;
  /** Decision 34: the card leaves its lane at Detroit midnight. */
  showInLane: boolean;
}

/** Everything on a CardState except lane membership, which is decided separately. */
type Chip = Omit<CardState, 'showInLane'>;

function chip(kind: CardStateKind, chipWord: string, look: { icon: string; tone: Tone }, flags: Partial<Pick<Chip, 'grey'>> = {}): Chip {
  return { kind, chipWord, chipIcon: look.icon, tone: look.tone, grey: false, ...flags };
}

/** Decision 34: a card sits in a TODAY lane only on the Detroit-local day its visit starts; it leaves at midnight. */
export function cardInLane(visit: Visit, now: Instant): boolean {
  return isSameLocalDay(visit.startAt, now);
}

/** The chip as the wall prints it: icon, space, word (e.g. `○ NOT STARTED`). */
export function chipLabel(state: Pick<CardState, 'chipIcon' | 'chipWord'>): string {
  return `${state.chipIcon} ${state.chipWord}`;
}

/** A visit the crew marked complete in Jobber without answering the Visit result reads NO RESULT (amber: an exception, not an alarm). */
function noResultChip(): Chip {
  return chip('NO RESULT', 'NO RESULT', CHIP['NO RESULT']);
}

/**
 * Timeline for a visit that has no result and is not complete, by the clock:
 * NOT STARTED (grey, before start) → NOW (from start until CONFIG.NO_RESULT_GRACE_MIN past the scheduled
 * end, because visits run over) → STILL OPEN (red ⚠: the scheduled end plus grace has passed and Jobber still
 * shows the visit open; this is the card's early warning before Jobber's own Late bucket fires).
 * Jobber gives no "crew arrived" signal (decision 48 kept live clock-ins out of v1), so the card never
 * claims a visit has not started once its start time has passed; a red word that fires on every
 * in-progress visit would be ignored by the second morning.
 */
function pendingChip(visit: Visit, now: Instant): Chip {
  const sinceStart = minutesBetween(visit.startAt, now);
  const sinceEnd = minutesBetween(visit.endAt, now);
  if (sinceStart < 0) return chip('NOT STARTED', 'NOT STARTED', CHIP['NOT STARTED']);
  if (sinceEnd <= CONFIG.NO_RESULT_GRACE_MIN) return chip('NOW', 'NOW', CHIP.NOW);
  return chip('STILL OPEN', 'STILL OPEN', CHIP['STILL OPEN']);
}

/** Decision 10: the chip word is the crew's own Visit result; icon and tone come from enums.CHIP. */
function resultChip(result: VisitResult): Chip {
  return chip('RESULT', result, CHIP[result]);
}

/**
 * Decision 34 overlay for a Completed visit on a Requires Invoicing job:
 * AWAITING REVIEW → FIX / HOLD (decision 7) → READY (second pass) → DONE (READY + invoiced, the only grey card).
 */
function reviewChip(job: Job, latestVerdict: Verdict | undefined, pass2Ready: boolean): Chip {
  if (pass2Ready && job.invoiced) return chip('DONE', 'DONE', CHIP.DONE, { grey: true });
  if (pass2Ready) return chip('READY', 'READY', CHIP.READY);
  if (latestVerdict === 'FIX') return chip('FIX', 'FIX', CHIP.FIX);
  if (latestVerdict === 'HOLD') return chip('HOLD', 'HOLD', CHIP.HOLD);
  return chip('AWAITING REVIEW', 'AWAITING REVIEW', CHIP['AWAITING REVIEW']);
}

/** Picks the chip: no result → clock or NO RESULT; Completed on Requires Invoicing → review overlay; else the result word. */
function chipFor(visit: Visit, job: Job, latestVerdict: Verdict | undefined, pass2Ready: boolean, now: Instant): Chip {
  if (visit.result === undefined) return visit.isComplete ? noResultChip() : pendingChip(visit, now);
  if (visit.result === 'Completed' && job.bucket === 'requires_invoicing') return reviewChip(job, latestVerdict, pass2Ready);
  return resultChip(visit.result);
}

/** Decisions 34 and 41: the full chip and lane state of one visit card at `now`. */
export function cardState(args: { visit: Visit; job: Job; latestVerdict?: Verdict; pass2Ready: boolean; now: Instant }): CardState {
  const { visit, job, latestVerdict, pass2Ready, now } = args;
  return { ...chipFor(visit, job, latestVerdict, pass2Ready, now), showInLane: cardInLane(visit, now) };
}

/** Decision 41: a Problem with no ACK line for CONFIG.ACK_MIN minutes gets the red border. Clock starts at the result, else completion, else the scheduled end. */
export function problemAckOverdue(visit: Visit, now: Instant): boolean {
  if (visit.result !== 'Problem' || visit.ack !== undefined) return false;
  const since = visit.resultAt ?? visit.completedAt ?? visit.endAt;
  return minutesBetween(since, now) >= CONFIG.ACK_MIN;
}
