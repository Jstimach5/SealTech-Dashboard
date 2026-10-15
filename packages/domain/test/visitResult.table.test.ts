import { describe, expect, it } from 'vitest';
import { CLOSE_CODES, type CloseCode, type VisitResult } from '../src/enums.js';
import {
  closeCodeToResult,
  plannedAsPrep,
  resolveVisitResult,
  type ParsedNotesLike,
  type ResolvedResult,
} from '../src/derive/visitResult.js';
import type { Instant, Visit } from '../src/types.js';

// Wed Oct 14 2026, EDT (offset -240). The visit runs 07:00–15:00 local.
const START: Instant = '2026-10-14T11:00:00Z'; // 07:00 local
const END: Instant = '2026-10-14T19:00:00Z'; // 15:00 local
const CREATED: Instant = '2026-10-09T14:00:00Z'; // Fri Oct 9, 10:00 local: when the office booked it
const AT_FORM: Instant = '2026-10-14T18:30:00Z'; // 14:30 local: the crew answers the job form before leaving
const AT_VISIT_LINE: Instant = '2026-10-14T18:45:00Z'; // 14:45 local: a VISIT RESULT line in the note
const AT_RECAP: Instant = '2026-10-14T19:10:00Z'; // 15:10 local: a recap queued from the shop touchscreen
const AT_CLOSE: Instant = '2026-10-14T20:00:00Z'; // 16:00 local: the office close (decision 37)
const AT_LATE_LINE: Instant = '2026-10-14T20:30:00Z'; // 16:30 local: a VISIT RESULT line written after the close

let seq = 0;
function mkVisit(overrides: Partial<Visit> = {}): Visit {
  seq++;
  return {
    id: `visit-test-${seq}`,
    jobId: `job-test-${seq}`,
    startAt: START,
    endAt: END,
    createdAt: CREATED,
    isComplete: false,
    isLastScheduledVisit: true,
    incompleteJobFormsCount: 0,
    formsSeenMax: 1,
    assignedUserIds: ['user-test-lead-1'],
    plannedAsPrep: false,
    resultSource: 'unknown',
    ...overrides,
  };
}

type ResolveArgs = Parameters<typeof resolveVisitResult>[0];

describe('closeCodeToResult (decisions 11, 46)', () => {
  const cases: Array<{ name: string; input: { code: CloseCode; plannedAsPrep: boolean }; expected: VisitResult }> = [
    { name: 'C → Completed', input: { code: 'C', plannedAsPrep: false }, expected: 'Completed' },
    { name: 'CM → Completed', input: { code: 'CM', plannedAsPrep: false }, expected: 'Completed' },
    { name: 'PR on a planned prep day → Prepped', input: { code: 'PR', plannedAsPrep: true }, expected: 'Prepped' },
    { name: 'PR on a visit NOT planned as prep → Return needed', input: { code: 'PR', plannedAsPrep: false }, expected: 'Return needed' },
    { name: 'NW-R → Not started', input: { code: 'NW-R', plannedAsPrep: false }, expected: 'Not started' },
    { name: 'NW-W → Not started', input: { code: 'NW-W', plannedAsPrep: false }, expected: 'Not started' },
    { name: 'RS → Customer cancelled', input: { code: 'RS', plannedAsPrep: false }, expected: 'Customer cancelled' },
  ];

  it.each(cases)('$name', ({ input, expected }) => {
    expect(closeCodeToResult(input.code, input.plannedAsPrep)).toBe(expected);
  });

  const neverProblem: Array<{ name: string; input: { code: CloseCode; plannedAsPrep: boolean } }> = CLOSE_CODES.flatMap((code) => [
    { name: `${code} with plannedAsPrep true never yields Problem`, input: { code, plannedAsPrep: true } },
    { name: `${code} with plannedAsPrep false never yields Problem`, input: { code, plannedAsPrep: false } },
  ]);

  it.each(neverProblem)('$name', ({ input }) => {
    expect(closeCodeToResult(input.code, input.plannedAsPrep)).not.toBe('Problem');
  });
});

describe('resolveVisitResult (decisions 10, 11, 21, 42, 46)', () => {
  const visit = mkVisit();
  const base = { visit, plannedAsPrep: false };

  const cases: Array<{ name: string; input: ResolveArgs; expected: ResolvedResult }> = [
    // --- form first ---
    {
      name: 'form only → jobForm',
      input: { ...base, form: { result: 'Completed', at: AT_FORM }, notes: {} },
      expected: { result: 'Completed', resultSource: 'jobForm', resultAt: AT_FORM },
    },
    {
      name: 'form carries its own miss reason (Problem / PRE-EXISTING via the form)',
      input: { ...base, form: { result: 'Problem', at: AT_FORM, missReason: 'PRE-EXISTING' }, notes: {} },
      expected: { result: 'Problem', resultSource: 'jobForm', resultAt: AT_FORM, missReason: 'PRE-EXISTING' },
    },
    {
      name: 'form beats a newer VISIT RESULT line (and takes nothing from it)',
      input: {
        ...base,
        form: { result: 'Completed', at: AT_FORM },
        notes: { visitResult: 'Return needed', visitResultAt: AT_LATE_LINE, visitMissReason: 'ACCESS' },
      },
      expected: { result: 'Completed', resultSource: 'jobForm', resultAt: AT_FORM },
    },
    {
      name: 'form beats a newer CLOSE line, and the close code is still carried',
      input: {
        ...base,
        form: { result: 'Return needed', at: AT_FORM, missReason: 'MATERIALS' },
        notes: { closeCode: 'C', closeAt: AT_CLOSE },
      },
      expected: { result: 'Return needed', resultSource: 'jobForm', resultAt: AT_FORM, missReason: 'MATERIALS', closeCode: 'C' },
    },
    {
      name: 'form beats a newer recap',
      input: { ...base, form: { result: 'Completed', at: AT_FORM }, notes: {}, recap: { result: 'Problem', at: AT_RECAP, missReason: 'OTHER' } },
      expected: { result: 'Completed', resultSource: 'jobForm', resultAt: AT_FORM },
    },
    // --- then the note ---
    {
      name: 'VISIT RESULT line only → note',
      input: { ...base, notes: { visitResult: 'Completed', visitResultAt: AT_VISIT_LINE } },
      expected: { result: 'Completed', resultSource: 'note', resultAt: AT_VISIT_LINE },
    },
    {
      name: 'VISIT RESULT: Problem / EQUIPMENT/TRUCK line only → Problem from the note with its reason',
      input: { ...base, notes: { visitResult: 'Problem', visitResultAt: AT_VISIT_LINE, visitMissReason: 'EQUIPMENT/TRUCK' } },
      expected: { result: 'Problem', resultSource: 'note', resultAt: AT_VISIT_LINE, missReason: 'EQUIPMENT/TRUCK' },
    },
    {
      name: 'CLOSE: C only → note, Completed, closeCode C',
      input: { ...base, notes: { closeCode: 'C', closeAt: AT_CLOSE } },
      expected: { result: 'Completed', resultSource: 'note', resultAt: AT_CLOSE, closeCode: 'C' },
    },
    {
      name: 'CLOSE: CM only → Completed',
      input: { ...base, notes: { closeCode: 'CM', closeAt: AT_CLOSE } },
      expected: { result: 'Completed', resultSource: 'note', resultAt: AT_CLOSE, closeCode: 'CM' },
    },
    {
      name: 'CLOSE: NW-W / WEATHER only → Not started with the close line reason',
      input: { ...base, notes: { closeCode: 'NW-W', closeAt: AT_CLOSE, closeMissReason: 'WEATHER' } },
      expected: { result: 'Not started', resultSource: 'note', resultAt: AT_CLOSE, missReason: 'WEATHER', closeCode: 'NW-W' },
    },
    {
      name: 'CLOSE: NW-R / ACCESS only → Not started',
      input: { ...base, notes: { closeCode: 'NW-R', closeAt: AT_CLOSE, closeMissReason: 'ACCESS' } },
      expected: { result: 'Not started', resultSource: 'note', resultAt: AT_CLOSE, missReason: 'ACCESS', closeCode: 'NW-R' },
    },
    {
      name: 'CLOSE: RS only → Customer cancelled',
      input: { ...base, notes: { closeCode: 'RS', closeAt: AT_CLOSE } },
      expected: { result: 'Customer cancelled', resultSource: 'note', resultAt: AT_CLOSE, closeCode: 'RS' },
    },
    {
      name: 'CLOSE: PR with plannedAsPrep true → Prepped',
      input: { ...base, plannedAsPrep: true, notes: { closeCode: 'PR', closeAt: AT_CLOSE } },
      expected: { result: 'Prepped', resultSource: 'note', resultAt: AT_CLOSE, closeCode: 'PR' },
    },
    {
      name: 'CLOSE: PR / OVERCOMMITTED with plannedAsPrep false → Return needed with the reason',
      input: { ...base, plannedAsPrep: false, notes: { closeCode: 'PR', closeAt: AT_CLOSE, closeMissReason: 'OVERCOMMITTED' } },
      expected: { result: 'Return needed', resultSource: 'note', resultAt: AT_CLOSE, missReason: 'OVERCOMMITTED', closeCode: 'PR' },
    },
    {
      name: 'VISIT RESULT newer than CLOSE → the VISIT RESULT line wins; closeCode still carried',
      input: {
        ...base,
        notes: { closeCode: 'C', closeAt: AT_CLOSE, visitResult: 'Problem', visitResultAt: AT_LATE_LINE, visitMissReason: 'PRE-EXISTING' },
      },
      expected: { result: 'Problem', resultSource: 'note', resultAt: AT_LATE_LINE, missReason: 'PRE-EXISTING', closeCode: 'C' },
    },
    {
      name: 'CLOSE newer than VISIT RESULT → the close code wins (closer override, decision 42)',
      input: {
        ...base,
        notes: { visitResult: 'Completed', visitResultAt: AT_VISIT_LINE, closeCode: 'NW-R', closeAt: AT_CLOSE, closeMissReason: 'ACCESS' },
      },
      expected: { result: 'Not started', resultSource: 'note', resultAt: AT_CLOSE, missReason: 'ACCESS', closeCode: 'NW-R' },
    },
    {
      name: 'CLOSE newer than VISIT RESULT → the losing line reason is NOT carried',
      input: {
        ...base,
        notes: { visitResult: 'Return needed', visitResultAt: AT_VISIT_LINE, visitMissReason: 'MATERIALS', closeCode: 'C', closeAt: AT_CLOSE },
      },
      expected: { result: 'Completed', resultSource: 'note', resultAt: AT_CLOSE, closeCode: 'C' },
    },
    {
      name: 'VISIT RESULT and CLOSE at the same instant → the crew line wins',
      input: {
        ...base,
        notes: { visitResult: 'Return needed', visitResultAt: AT_CLOSE, visitMissReason: 'SCOPE CHANGED', closeCode: 'C', closeAt: AT_CLOSE },
      },
      expected: { result: 'Return needed', resultSource: 'note', resultAt: AT_CLOSE, missReason: 'SCOPE CHANGED', closeCode: 'C' },
    },
    {
      name: 'note beats a newer recap',
      input: { ...base, notes: { closeCode: 'C', closeAt: AT_VISIT_LINE }, recap: { result: 'Problem', at: AT_RECAP, missReason: 'OTHER' } },
      expected: { result: 'Completed', resultSource: 'note', resultAt: AT_VISIT_LINE, closeCode: 'C' },
    },
    // --- then the queued recap ---
    {
      name: 'recap only → recapQueued (Problem via recap)',
      input: { ...base, notes: {}, recap: { result: 'Problem', at: AT_RECAP, missReason: 'EQUIPMENT/TRUCK' } },
      expected: { result: 'Problem', resultSource: 'recapQueued', resultAt: AT_RECAP, missReason: 'EQUIPMENT/TRUCK' },
    },
    {
      name: 'recap wins over a note that has only an ACK and a PR day line (no result lines)',
      input: {
        ...base,
        notes: { prDay: { n: 1, m: 2, at: START }, ack: { at: AT_VISIT_LINE, initials: 'JJ', hhmm: '14:45' } },
        recap: { result: 'Prepped', at: AT_RECAP },
      },
      expected: { result: 'Prepped', resultSource: 'recapQueued', resultAt: AT_RECAP },
    },
    // --- then nothing ---
    {
      name: 'nothing → unknown with no result (never a default)',
      input: { ...base, notes: {} },
      expected: { resultSource: 'unknown' },
    },
    {
      name: 'only an ACK line in the note → still unknown',
      input: { ...base, notes: { ack: { at: AT_VISIT_LINE, initials: 'JJ', hhmm: '14:45' } } },
      expected: { resultSource: 'unknown' },
    },
    {
      name: 'a completed-looking visit with no form, note or recap → still unknown (Jobber flags are not a source)',
      input: { visit: mkVisit({ isComplete: true, completedAt: END }), plannedAsPrep: false, notes: {} },
      expected: { resultSource: 'unknown' },
    },
  ];

  it.each(cases)('$name', ({ input, expected }) => {
    expect(resolveVisitResult(input)).toStrictEqual(expected);
  });

  it('a close code never yields Problem through the note path, planned as prep or not', () => {
    for (const code of CLOSE_CODES) {
      for (const planned of [true, false]) {
        const notes: ParsedNotesLike = { closeCode: code, closeAt: AT_CLOSE };
        expect(resolveVisitResult({ visit, plannedAsPrep: planned, notes }).result).not.toBe('Problem');
      }
    }
  });
});

describe('plannedAsPrep (decision 46)', () => {
  const JOB = 'job-test-prep';
  const NEXT_START: Instant = '2026-10-15T11:00:00Z'; // Thu Oct 15, 07:00 local
  const NEXT_END: Instant = '2026-10-15T19:00:00Z';
  const PREV_START: Instant = '2026-10-13T11:00:00Z'; // Tue Oct 13, 07:00 local
  const PREV_END: Instant = '2026-10-13T19:00:00Z';
  const CREATED_AFTER_START: Instant = '2026-10-14T13:00:00Z'; // Wed Oct 14, 09:00 local: booked once the crew was already on site

  function day1(overrides: Partial<Visit> = {}): Visit {
    return mkVisit({ id: 'visit-test-day1', jobId: JOB, isLastScheduledVisit: false, ...overrides });
  }
  function day2(overrides: Partial<Visit> = {}): Visit {
    return mkVisit({ id: 'visit-test-day2', jobId: JOB, startAt: NEXT_START, endAt: NEXT_END, createdAt: CREATED, ...overrides });
  }

  const cases: Array<{ name: string; input: { visit: Visit; jobVisits: Visit[] }; expected: boolean }> = [
    {
      name: 'later visit on the job, created before this one started → true',
      input: { visit: day1(), jobVisits: [day1(), day2()] },
      expected: true,
    },
    {
      name: 'later visit created AFTER this one started → false (the return was not planned)',
      input: { visit: day1(), jobVisits: [day1(), day2({ createdAt: CREATED_AFTER_START })] },
      expected: false,
    },
    {
      name: 'later visit created exactly at this one\'s start → true (createdAt <= startAt)',
      input: { visit: day1(), jobVisits: [day1(), day2({ createdAt: START })] },
      expected: true,
    },
    {
      name: 'isLastScheduledVisit true → false even with a later visit on the job',
      input: { visit: day1({ isLastScheduledVisit: true }), jobVisits: [day1({ isLastScheduledVisit: true }), day2()] },
      expected: false,
    },
    {
      name: 'later visit belongs to another job → false',
      input: { visit: day1(), jobVisits: [day1(), day2({ jobId: 'job-test-other' })] },
      expected: false,
    },
    {
      name: 'only an EARLIER visit on the job → false',
      input: { visit: day1(), jobVisits: [day1(), day2({ id: 'visit-test-day0', startAt: PREV_START, endAt: PREV_END })] },
      expected: false,
    },
    {
      name: 'the visit itself is the only one listed → false',
      input: { visit: day1(), jobVisits: [day1()] },
      expected: false,
    },
    {
      name: 'empty job visits and no instructions → false',
      input: { visit: day1(), jobVisits: [] },
      expected: false,
    },
    {
      name: "instructions 'PR: day 1 of 2' → true (even as the last scheduled visit with no siblings)",
      input: { visit: day1({ isLastScheduledVisit: true, instructions: 'PR: day 1 of 2' }), jobVisits: [] },
      expected: true,
    },
    {
      name: "instructions 'pr:day 2of3' → true (spacing and case tolerant)",
      input: { visit: day1({ isLastScheduledVisit: true, instructions: 'pr:day 2of3' }), jobVisits: [] },
      expected: true,
    },
    {
      name: "instructions 'PR: day 2 of 2' → false (the last day finishes the job; it is not a prep)",
      input: { visit: day1({ isLastScheduledVisit: true, instructions: 'PR: day 2 of 2' }), jobVisits: [] },
      expected: false,
    },
    {
      name: "instructions 'PR: day 2 of 3' → true",
      input: { visit: day1({ isLastScheduledVisit: true, instructions: 'PR: day 2 of 3' }), jobVisits: [] },
      expected: true,
    },
    {
      name: "instructions 'prep day' → true",
      input: { visit: day1({ isLastScheduledVisit: true, instructions: 'prep day' }), jobVisits: [] },
      expected: true,
    },
    {
      name: "instructions 'PREP — bring baffles, finish Thu' → true (whole word, any case)",
      input: { visit: day1({ isLastScheduledVisit: true, instructions: 'PREP — bring baffles, finish Thu' }), jobVisits: [] },
      expected: true,
    },
    {
      name: "instructions 'Prepare quote' → false (word boundary)",
      input: { visit: day1({ isLastScheduledVisit: true, instructions: 'Prepare quote' }), jobVisits: [] },
      expected: false,
    },
    {
      name: "instructions 'Prepped yesterday, finish today' → false (word boundary)",
      input: { visit: day1({ isLastScheduledVisit: true, instructions: 'Prepped yesterday, finish today' }), jobVisits: [] },
      expected: false,
    },
    {
      name: 'instructions say prep AND a later visit was created after start → true (either rule suffices)',
      input: { visit: day1({ instructions: 'prep day' }), jobVisits: [day1(), day2({ createdAt: CREATED_AFTER_START })] },
      expected: true,
    },
  ];

  it.each(cases)('$name', ({ input, expected }) => {
    expect(plannedAsPrep(input.visit, input.jobVisits)).toBe(expected);
  });
});
