import { describe, expect, it } from 'vitest';
import type { Verdict } from '../src/enums.js';
import type { Instant, Job, Visit } from '../src/types.js';
import { cardInLane, cardState, chipLabel, problemAckOverdue, type CardState } from '../src/derive/cards.js';

// Wed Oct 14 2026, EDT (offset -240). Visit scheduled 07:00–15:00 local.
const START: Instant = '2026-10-14T11:00:00Z';
const END: Instant = '2026-10-14T19:00:00Z';

function mkVisit(overrides: Partial<Visit> = {}): Visit {
  return {
    id: 'visit-test-1',
    jobId: 'job-test-1',
    startAt: START,
    endAt: END,
    createdAt: '2026-10-10T14:00:00Z',
    isComplete: false,
    isLastScheduledVisit: true,
    incompleteJobFormsCount: 0,
    formsSeenMax: 0,
    assignedUserIds: ['user-test-1'],
    plannedAsPrep: false,
    resultSource: 'unknown',
    ...overrides,
  };
}

function mkJob(overrides: Partial<Job> = {}): Job {
  return {
    id: 'job-test-1',
    jobNumber: 1001,
    title: 'CEHN ATT',
    lastName: 'Testerman',
    city: 'Testville',
    scope: 'ATT',
    program: 'CE_INSULATION',
    bucket: 'today',
    bucketSince: '2026-10-14T04:00:00Z',
    bucketSinceSource: 'observed',
    updatedAt: '2026-10-14T04:00:00Z',
    invoiced: false,
    isZeroTotal: false,
    hasUninvoicedWork: true,
    futureVisitCount: 0,
    visitIds: ['visit-test-1'],
    noteLines: [],
    ...overrides,
  };
}

interface CardInput {
  visit?: Partial<Visit>;
  job?: Partial<Job>;
  latestVerdict?: Verdict;
  pass2Ready?: boolean;
  now: Instant;
}

interface CardCase {
  name: string;
  input: CardInput;
  expected: CardState;
}

/** Full expected state with the quiet defaults filled in: not grey, not red NOT STARTED, in lane. */
function st(overrides: Partial<CardState> & Pick<CardState, 'kind' | 'chipWord' | 'chipIcon' | 'tone'>): CardState {
  return { grey: false, showInLane: true, ...overrides };
}

function run(input: CardInput): CardState {
  return cardState({
    visit: mkVisit(input.visit),
    job: mkJob(input.job),
    pass2Ready: input.pass2Ready ?? false,
    now: input.now,
    ...(input.latestVerdict ? { latestVerdict: input.latestVerdict } : {}),
  });
}

const NOT_STARTED_GREY = st({ kind: 'NOT STARTED', chipWord: 'NOT STARTED', chipIcon: '○', tone: 'grey' });
const NOW = st({ kind: 'NOW', chipWord: 'NOW', chipIcon: '●', tone: 'brand' });
const LATE = st({ kind: 'LATE', chipWord: 'LATE', chipIcon: '⚠', tone: 'red' });
const NO_RESULT = st({ kind: 'NO RESULT', chipWord: 'NO RESULT', chipIcon: '◌', tone: 'amber' });
const AWAITING = st({ kind: 'AWAITING REVIEW', chipWord: 'AWAITING REVIEW', chipIcon: '◔', tone: 'grey' });

describe('cardState: no-result timeline (NO_RESULT_GRACE_MIN = 30; no crew-arrived signal exists, decision 48)', () => {
  const cases: CardCase[] = [
    { name: 'start − 1 min → NOT STARTED grey', input: { now: '2026-10-14T10:59:00Z' }, expected: NOT_STARTED_GREY },
    { name: 'start → NOW', input: { now: '2026-10-14T11:00:00Z' }, expected: NOW },
    { name: 'start + 45 → still NOW (an in-progress visit never reads NOT STARTED)', input: { now: '2026-10-14T11:45:00Z' }, expected: NOW },
    { name: 'end exactly → still NOW', input: { now: '2026-10-14T19:00:00Z' }, expected: NOW },
    { name: 'end + 30 → still NOW (visits run over)', input: { now: '2026-10-14T19:30:00Z' }, expected: NOW },
    { name: 'end + 31 → LATE', input: { now: '2026-10-14T19:31:00Z' }, expected: LATE },
    { name: 'end + 6 h → still LATE (never NO RESULT while Jobber shows the visit open)', input: { now: '2026-10-15T01:00:00Z' }, expected: LATE },
    {
      name: 'isComplete with no result → NO RESULT immediately, even mid-visit',
      input: { visit: { isComplete: true, completedAt: '2026-10-14T11:10:00Z' }, now: '2026-10-14T11:10:00Z' },
      expected: NO_RESULT,
    },
    {
      name: 'isComplete with no result long after end → NO RESULT, not LATE',
      input: { visit: { isComplete: true, completedAt: '2026-10-14T18:50:00Z' }, now: '2026-10-15T01:00:00Z' },
      expected: NO_RESULT,
    },
  ];
  it.each(cases)('$name', ({ input, expected }) => {
    expect(run(input)).toEqual(expected);
  });
});

describe('cardState: plain RESULT (word, icon and tone from enums.CHIP)', () => {
  const AT = '2026-10-14T15:00:00Z'; // 11:00 local, mid-visit
  const cases: CardCase[] = [
    {
      name: 'Completed on a today job',
      input: { visit: { result: 'Completed', resultSource: 'jobForm', resultAt: AT }, now: AT },
      expected: st({ kind: 'RESULT', chipWord: 'Completed', chipIcon: '✓', tone: 'grey' }),
    },
    {
      name: 'Return needed',
      input: { visit: { result: 'Return needed', resultSource: 'jobForm', resultAt: AT, missReason: 'MATERIALS' }, now: AT },
      expected: st({ kind: 'RESULT', chipWord: 'Return needed', chipIcon: '↩', tone: 'blue' }),
    },
    {
      name: 'Prepped',
      input: { visit: { result: 'Prepped', resultSource: 'jobForm', resultAt: AT, plannedAsPrep: true }, now: AT },
      expected: st({ kind: 'RESULT', chipWord: 'Prepped', chipIcon: '◐', tone: 'grey' }),
    },
    {
      name: 'Not started (the crew result, not the clock word)',
      input: { visit: { result: 'Not started', resultSource: 'jobForm', resultAt: AT, missReason: 'ACCESS' }, now: AT },
      expected: st({ kind: 'RESULT', chipWord: 'Not started', chipIcon: '○', tone: 'grey' }),
    },
    {
      name: 'Customer cancelled',
      input: { visit: { result: 'Customer cancelled', resultSource: 'note', resultAt: AT }, now: AT },
      expected: st({ kind: 'RESULT', chipWord: 'Customer cancelled', chipIcon: '✕', tone: 'blue' }),
    },
    {
      name: 'Problem',
      input: { visit: { result: 'Problem', resultSource: 'jobForm', resultAt: AT, missReason: 'PRE-EXISTING' }, now: AT },
      expected: st({ kind: 'RESULT', chipWord: 'Problem', chipIcon: '⚠', tone: 'red' }),
    },
    {
      name: 'a result after the visit ended beats the clock (no LATE / NO RESULT)',
      input: { visit: { result: 'Completed', resultSource: 'jobForm', resultAt: '2026-10-14T19:05:00Z' }, now: '2026-10-14T21:00:00Z' },
      expected: st({ kind: 'RESULT', chipWord: 'Completed', chipIcon: '✓', tone: 'grey' }),
    },
    {
      name: 'Completed on a non-requires_invoicing job stays RESULT even when pass 2 ready and invoiced',
      input: {
        visit: { result: 'Completed', resultSource: 'jobForm', resultAt: AT, isComplete: true, completedAt: AT },
        job: { bucket: 'archived', invoiced: true },
        pass2Ready: true,
        now: AT,
      },
      expected: st({ kind: 'RESULT', chipWord: 'Completed', chipIcon: '✓', tone: 'grey' }),
    },
  ];
  it.each(cases)('$name', ({ input, expected }) => {
    expect(run(input)).toEqual(expected);
  });
});

describe('cardState: review overlay on Completed + requires_invoicing (decision 34)', () => {
  const AT = '2026-10-14T19:30:00Z';
  const completed: Partial<Visit> = { result: 'Completed', resultSource: 'jobForm', resultAt: '2026-10-14T18:50:00Z', isComplete: true, completedAt: '2026-10-14T18:55:00Z' };
  const ri: Partial<Job> = { bucket: 'requires_invoicing', completedAt: '2026-10-14T18:55:00Z' };
  const cases: CardCase[] = [
    { name: 'no verdict yet → AWAITING REVIEW', input: { visit: completed, job: ri, now: AT }, expected: AWAITING },
    {
      name: 'verdict FIX → FIX amber',
      input: { visit: completed, job: ri, latestVerdict: 'FIX', now: AT },
      expected: st({ kind: 'FIX', chipWord: 'FIX', chipIcon: '✎', tone: 'amber' }),
    },
    {
      name: 'verdict HOLD → HOLD amber',
      input: { visit: completed, job: ri, latestVerdict: 'HOLD', now: AT },
      expected: st({ kind: 'HOLD', chipWord: 'HOLD', chipIcon: '❚❚', tone: 'amber' }),
    },
    {
      name: 'first-pass READY verdict alone (pass 2 not ready) → still AWAITING REVIEW',
      input: { visit: completed, job: ri, latestVerdict: 'READY', now: AT },
      expected: AWAITING,
    },
    {
      name: 'pass 2 ready, not invoiced → READY green, not grey',
      input: { visit: completed, job: ri, pass2Ready: true, now: AT },
      expected: st({ kind: 'READY', chipWord: 'READY', chipIcon: '✓✓', tone: 'green' }),
    },
    {
      name: 'pass 2 ready beats a stale FIX verdict → READY',
      input: { visit: completed, job: ri, latestVerdict: 'FIX', pass2Ready: true, now: AT },
      expected: st({ kind: 'READY', chipWord: 'READY', chipIcon: '✓✓', tone: 'green' }),
    },
    {
      name: 'pass 2 ready and invoiced → DONE, the only grey card',
      input: { visit: completed, job: { ...ri, invoiced: true }, pass2Ready: true, now: AT },
      expected: st({ kind: 'DONE', chipWord: 'DONE', chipIcon: '✓✓', tone: 'grey', grey: true }),
    },
    {
      name: 'invoiced but pass 2 not ready → AWAITING REVIEW, never DONE',
      input: { visit: completed, job: { ...ri, invoiced: true }, now: AT },
      expected: AWAITING,
    },
    {
      name: 'Return needed on requires_invoicing is not overlaid (overlay is for Completed only)',
      input: { visit: { ...completed, result: 'Return needed', missReason: 'MATERIALS' }, job: ri, pass2Ready: true, now: AT },
      expected: st({ kind: 'RESULT', chipWord: 'Return needed', chipIcon: '↩', tone: 'blue' }),
    },
  ];
  it.each(cases)('$name', ({ input, expected }) => {
    expect(run(input)).toEqual(expected);
  });
});

describe('cardState: showInLane follows the Detroit-local day of startAt', () => {
  const cases: CardCase[] = [
    {
      name: 'started 23:30 local yesterday, now 00:30 today → out of lane',
      input: { visit: { startAt: '2026-10-14T03:30:00Z', endAt: '2026-10-14T05:30:00Z' }, now: '2026-10-14T04:30:00Z' },
      expected: { ...NOW, showInLane: false },
    },
    {
      name: 'started 07:00 local, now 23:00 local same day → in lane',
      input: { visit: { result: 'Completed', resultSource: 'jobForm', resultAt: '2026-10-14T19:00:00Z' }, now: '2026-10-15T03:00:00Z' },
      expected: st({ kind: 'RESULT', chipWord: 'Completed', chipIcon: '✓', tone: 'grey' }),
    },
    {
      name: 'started 19:00 local, now 21:31 local same day (different UTC date) → in lane',
      input: { visit: { startAt: '2026-10-14T23:00:00Z', endAt: '2026-10-15T01:00:00Z' }, now: '2026-10-15T01:31:00Z' },
      expected: LATE,
    },
    {
      name: 'Completed yesterday, viewed today → out of lane (card left at midnight)',
      input: { visit: { result: 'Completed', resultSource: 'jobForm', resultAt: '2026-10-14T19:00:00Z' }, now: '2026-10-15T11:00:00Z' },
      expected: st({ kind: 'RESULT', chipWord: 'Completed', chipIcon: '✓', tone: 'grey', showInLane: false }),
    },
  ];
  it.each(cases)('$name', ({ input, expected }) => {
    expect(run(input)).toEqual(expected);
  });

  it('cardInLane matches the showInLane field', () => {
    expect(cardInLane(mkVisit({ startAt: '2026-10-14T03:30:00Z' }), '2026-10-14T04:30:00Z')).toBe(false);
    expect(cardInLane(mkVisit(), '2026-10-15T03:00:00Z')).toBe(true);
  });
});

describe('problemAckOverdue (decision 41, ACK_MIN = 15)', () => {
  const RESULT_AT = '2026-10-14T14:00:00Z'; // 10:00 local
  const problem: Partial<Visit> = { result: 'Problem', resultSource: 'jobForm', resultAt: RESULT_AT, missReason: 'PRE-EXISTING' };
  const cases: Array<{ name: string; input: { visit: Partial<Visit>; now: Instant }; expected: boolean }> = [
    { name: 'Problem, no ack, 14 min → not yet', input: { visit: problem, now: '2026-10-14T14:14:00Z' }, expected: false },
    { name: 'Problem, no ack, 15 min → overdue', input: { visit: problem, now: '2026-10-14T14:15:00Z' }, expected: true },
    { name: 'Problem, no ack, 60 min → overdue', input: { visit: problem, now: '2026-10-14T15:00:00Z' }, expected: true },
    {
      name: 'Problem with ack present → never overdue',
      input: { visit: { ...problem, ack: { at: '2026-10-14T14:09:00Z', initials: 'JJ' } }, now: '2026-10-14T15:00:00Z' },
      expected: false,
    },
    {
      name: 'result not Problem (Return needed), no ack, 60 min → false',
      input: { visit: { ...problem, result: 'Return needed', missReason: 'MATERIALS' }, now: '2026-10-14T15:00:00Z' },
      expected: false,
    },
    { name: 'no result at all → false', input: { visit: {}, now: '2026-10-14T21:00:00Z' }, expected: false },
    {
      name: 'no resultAt → clock starts at completedAt',
      input: { visit: { result: 'Problem', resultSource: 'note', isComplete: true, completedAt: '2026-10-14T16:00:00Z' }, now: '2026-10-14T16:15:00Z' },
      expected: true,
    },
    {
      name: 'no resultAt or completedAt → clock starts at scheduled endAt',
      input: { visit: { result: 'Problem', resultSource: 'recapQueued' }, now: '2026-10-14T19:14:00Z' },
      expected: false,
    },
    {
      name: 'no resultAt or completedAt → overdue 15 min after scheduled endAt',
      input: { visit: { result: 'Problem', resultSource: 'recapQueued' }, now: '2026-10-14T19:15:00Z' },
      expected: true,
    },
  ];
  it.each(cases)('$name', ({ input, expected }) => {
    expect(problemAckOverdue(mkVisit(input.visit), input.now)).toBe(expected);
  });
});

describe('chipLabel', () => {
  it.each([
    { name: 'NOT STARTED grey', state: NOT_STARTED_GREY, expected: '○ NOT STARTED' },
    { name: 'NOW', state: NOW, expected: '● NOW' },
    { name: 'NO RESULT', state: NO_RESULT, expected: '◌ NO RESULT' },
    { name: 'DONE', state: st({ kind: 'DONE', chipWord: 'DONE', chipIcon: '✓✓', tone: 'grey', grey: true }), expected: '✓✓ DONE' },
  ])('$name → $expected', ({ state, expected }) => {
    expect(chipLabel(state)).toBe(expected);
  });
});
