/**
 * Visit result resolution (decisions 10, 11, 21, 42, 46). A visit's result on the wall comes from
 * exactly one of three places, in a fixed order: the Jobber job form (decision 10), the house-format
 * visit note (decision 11: the crew lead's `VISIT RESULT:` line or the office's `CLOSE:` code), or a
 * recap still queued from the shop touchscreen (decision 21). Nothing else: a visit with none of
 * them is `unknown`, never defaulted. `plannedAsPrep` decides what a `PR` close code means
 * (decision 46). Pure functions; no clock is involved.
 */
import type { CloseCode, MissReason, ResultSource, VisitResult } from '../enums.js';
import type { Instant, Visit } from '../types.js';
import type { ParsedNotes } from './notes.js';
import { maxInstant, minutesBetween } from './time.js';

/** The parsed visit note as `parseNotes` returns it; this rule reads only the CLOSE and VISIT RESULT fields. */
export type ParsedNotesLike = ParsedNotes;

/** One crew answer: the result (decision 10), when it was given, and the coded reason when it was a miss (decision 42). */
export interface Answer {
  result: VisitResult;
  at: Instant;
  missReason?: MissReason;
}

export interface ResolvedResult {
  result?: VisitResult;
  resultSource: ResultSource;
  resultAt?: Instant;
  missReason?: MissReason;
  closeCode?: CloseCode;
}

// ---------------------------------------------------------------------------------------------
// Close codes

/** Decisions 11, 46: office close code → Jobber result. PR is Prepped only on a planned prep day; a code never yields Problem. */
export function closeCodeToResult(code: CloseCode, plannedAsPrep: boolean): VisitResult {
  switch (code) {
    case 'C':
    case 'CM':
      return 'Completed';
    case 'PR':
      return plannedAsPrep ? 'Prepped' : 'Return needed';
    case 'NW-R':
    case 'NW-W':
      return 'Not started';
    case 'RS':
      return 'Customer cancelled';
  }
}

// ---------------------------------------------------------------------------------------------
// Answers from the note

function withReason(answer: Answer, missReason: MissReason | undefined): Answer {
  return missReason === undefined ? answer : { ...answer, missReason };
}

/** Decision 11: the newest `VISIT RESULT:` line as an answer, or undefined when the note has none. */
export function visitLineAnswer(notes: ParsedNotesLike): Answer | undefined {
  if (notes.visitResult === undefined || notes.visitResultAt === undefined) return undefined;
  return withReason({ result: notes.visitResult, at: notes.visitResultAt }, notes.visitMissReason);
}

/** Decisions 11, 46: the newest `CLOSE:` line mapped to a result, or undefined when the note has none. */
export function closeLineAnswer(notes: ParsedNotesLike, plannedAsPrep: boolean): Answer | undefined {
  if (notes.closeCode === undefined || notes.closeAt === undefined) return undefined;
  return withReason({ result: closeCodeToResult(notes.closeCode, plannedAsPrep), at: notes.closeAt }, notes.closeMissReason);
}

/** Decisions 11, 42: the newer of the VISIT RESULT and CLOSE lines wins; on an equal `at` the crew's own line wins. */
export function answerFromNotes(notes: ParsedNotesLike, plannedAsPrep: boolean): Answer | undefined {
  const visitLine = visitLineAnswer(notes);
  const closeLine = closeLineAnswer(notes, plannedAsPrep);
  if (visitLine === undefined) return closeLine;
  if (closeLine === undefined) return visitLine;
  // maxInstant keeps its first argument on a tie, so the VISIT RESULT line wins an equal `at`.
  return maxInstant(visitLine.at, closeLine.at) === visitLine.at ? visitLine : closeLine;
}

// ---------------------------------------------------------------------------------------------
// Precedence

function resolved(resultSource: ResultSource, answer?: Answer): ResolvedResult {
  const out: ResolvedResult = { resultSource };
  if (answer === undefined) return out;
  out.result = answer.result;
  out.resultAt = answer.at;
  if (answer.missReason !== undefined) out.missReason = answer.missReason;
  return out;
}

/** Decisions 10, 11, 21: form → note → queued recap → unknown. Never a default. */
function pickAnswer(form: Answer | undefined, noteAnswer: Answer | undefined, recap: Answer | undefined): ResolvedResult {
  if (form !== undefined) return resolved('jobForm', form);
  if (noteAnswer !== undefined) return resolved('note', noteAnswer);
  if (recap !== undefined) return resolved('recapQueued', recap);
  return resolved('unknown');
}

/**
 * Decisions 10, 11, 21, 42, 46: resolve one visit's result. The close code is carried whenever a
 * CLOSE line exists, whichever source won. `visit` is part of the call shape for the integrator;
 * nothing is read from it, because Jobber's own completion flags are never a default.
 */
export function resolveVisitResult(args: {
  visit: Visit;
  plannedAsPrep: boolean;
  form?: Answer;
  notes: ParsedNotesLike;
  recap?: Answer;
}): ResolvedResult {
  const { plannedAsPrep, form, notes, recap } = args;
  const out = pickAnswer(form, answerFromNotes(notes, plannedAsPrep), recap);
  if (notes.closeCode !== undefined) out.closeCode = notes.closeCode;
  return out;
}

// ---------------------------------------------------------------------------------------------
// Planned as prep (decision 46)

const PR_DAY_RE = /PR:\s*day\s*(\d+)\s*of\s*(\d+)/i;
const PREP_WORD_RE = /\bprep\b/i;

/**
 * Decision 46: instructions name a prep day as `PR: day n of m` with n < m (the last day of a
 * multi-day job is the finishing day, not a prep), or the whole word "prep" ("Prepare" and
 * "Prepped" do not count).
 */
export function instructionsSayPrep(instructions: string | undefined): boolean {
  if (instructions === undefined) return false;
  const m = PR_DAY_RE.exec(instructions);
  if (m) return Number(m[1]) < Number(m[2]);
  return PREP_WORD_RE.test(instructions);
}

/** Decision 46: another visit on the same job that starts later and already existed when this one started. */
export function hasLaterPlannedVisit(visit: Visit, jobVisits: Visit[]): boolean {
  return jobVisits.some(
    (other) =>
      other.id !== visit.id &&
      other.jobId === visit.jobId &&
      minutesBetween(visit.startAt, other.startAt) > 0 &&
      minutesBetween(other.createdAt, visit.startAt) >= 0,
  );
}

/** Decision 46: a visit was planned as a prep day when a later visit was already on the books, or its instructions say so. */
export function plannedAsPrep(visit: Visit, jobVisits: Visit[]): boolean {
  if (!visit.isLastScheduledVisit && hasLaterPlannedVisit(visit, jobVisits)) return true;
  return instructionsSayPrep(visit.instructions);
}
