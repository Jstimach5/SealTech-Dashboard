import { describe, expect, it } from 'vitest';
import type { Verdict } from '../src/enums.js';
import {
  crewInitialsForJob,
  firstPassReady,
  firstPassReadyByCrew,
  isInWeek,
  UNASSIGNED,
  visitsNotReady,
  weekRange,
  type ReadyCount,
} from '../src/derive/firstPass.js';
import type { Crew, Instant, Job, JobberId, LocalDate, ReviewRow, Visit } from '../src/types.js';

// Scorecard week of Mon Oct 12 2026 (EDT, offset -240). Verdict instants are 16:30 local (decision 40).
const WEEK: LocalDate = '2026-10-12';
const PREV_FRI: Instant = '2026-10-09T20:30:00Z'; // Fri Oct 9, previous week
const TUE: Instant = '2026-10-13T20:30:00Z';
const WED: Instant = '2026-10-14T20:30:00Z';
const THU: Instant = '2026-10-15T20:30:00Z';
const NEXT_TUE: Instant = '2026-10-20T20:30:00Z'; // Tue Oct 20, next week
// Local-day edges of the week.
const SUN_BEFORE_2359: Instant = '2026-10-12T03:59:00Z'; // Sun Oct 11 23:59 local → previous week
const MON_0000: Instant = '2026-10-12T04:00:00Z'; // Mon Oct 12 00:00 local → in week
const SUN_2359: Instant = '2026-10-19T03:59:00Z'; // Sun Oct 18 23:59 local → in week
const NEXT_MON_0000: Instant = '2026-10-19T04:00:00Z'; // Mon Oct 19 00:00 local → next week

const JOB_A: JobberId = 'job-test-a';
const JOB_B: JobberId = 'job-test-b';
const JOB_C: JobberId = 'job-test-c';
const JOB_D: JobberId = 'job-test-d';

const LEAD_JM: JobberId = 'user-test-lead-jm';
const LEAD_RK: JobberId = 'user-test-lead-rk';
const MEMBER_1: JobberId = 'user-test-member-1';
const CREWS: Crew[] = [
  { leadUserId: LEAD_JM, leadLastName: 'MARSH', initials: 'JM', memberUserIds: [MEMBER_1] },
  { leadUserId: LEAD_RK, leadLastName: 'KOWALSKI', initials: 'RK', memberUserIds: [] },
];

/** A matched sheet row with no pass, verdict or review time; the helpers below add those. */
function mkRow(overrides: Partial<ReviewRow> = {}): ReviewRow {
  return {
    rowIndex: 2,
    checked: 'Y',
    application: 'Attic insulation',
    installDate: '2026-10-13',
    tech: 'JM',
    jobDesc: 'ATT',
    match: 'exact',
    matchedJobId: JOB_A,
    jobberJobId: JOB_A,
    jobNumber: 1001,
    ...overrides,
  };
}
function pass1(jobId: JobberId, reviewedAt: Instant, verdict: Verdict, rowIndex = 2): ReviewRow {
  return mkRow({ matchedJobId: jobId, jobberJobId: jobId, pass: 1, reviewerUserId: 'user-test-henry', reviewedAt, verdict, rowIndex });
}
function pass2(jobId: JobberId, reviewedAt: Instant, verdict: Verdict, rowIndex = 3): ReviewRow {
  return mkRow({ matchedJobId: jobId, jobberJobId: jobId, pass: 2, reviewerUserId: 'user-test-jack', reviewedAt, verdict, rowIndex });
}
/** Overnight CompanyCam checker row (decision 43): a verdict with no human pass. */
function checker(jobId: JobberId, verdict: Verdict, rowIndex = 4): ReviewRow {
  return mkRow({ matchedJobId: jobId, jobberJobId: jobId, verdict, rowIndex, reviewedAt: '2026-10-14T06:00:00Z' });
}

function mkVisit(overrides: Partial<Visit> = {}): Visit {
  return {
    id: 'visit-test-1',
    jobId: JOB_A,
    startAt: '2026-10-13T12:00:00Z',
    endAt: '2026-10-13T19:00:00Z',
    createdAt: '2026-10-09T14:00:00Z',
    isComplete: false,
    isLastScheduledVisit: true,
    incompleteJobFormsCount: 0,
    formsSeenMax: 1,
    assignedUserIds: [LEAD_JM, MEMBER_1],
    plannedAsPrep: false,
    resultSource: 'jobForm',
    ...overrides,
  };
}
function completedVisit(id: string, jobId: JobberId, assignedUserIds: JobberId[], completedAt: Instant): Visit {
  return mkVisit({ id, jobId, assignedUserIds, isComplete: true, completedAt, result: 'Completed' });
}

function mkJob(overrides: Partial<Job> = {}): Job {
  return {
    id: JOB_A,
    jobNumber: 1001,
    title: 'CEHN Attic',
    lastName: 'TESTER',
    city: 'TESTVILLE',
    scope: 'ATT',
    program: 'CE_INSULATION',
    bucket: 'requires_invoicing',
    bucketSince: '2026-10-13T21:00:00Z',
    bucketSinceSource: 'observed',
    updatedAt: '2026-10-13T21:00:00Z',
    invoiced: false,
    isZeroTotal: false,
    hasUninvoicedWork: true,
    futureVisitCount: 0,
    visitIds: [],
    noteLines: [],
    ...overrides,
  };
}

describe('weekRange (decision 39)', () => {
  const cases: Array<{ name: string; input: LocalDate; expected: { start: LocalDate; endExclusive: LocalDate } }> = [
    { name: 'Mon Oct 12 → [Oct 12, Oct 19)', input: '2026-10-12', expected: { start: '2026-10-12', endExclusive: '2026-10-19' } },
    { name: 'Mon Oct 26 → [Oct 26, Nov 2): crosses month end and the Nov 1 fall-back, still 7 calendar days', input: '2026-10-26', expected: { start: '2026-10-26', endExclusive: '2026-11-02' } },
    { name: 'Mon Dec 28 → [Dec 28, Jan 4 2027): crosses year end', input: '2026-12-28', expected: { start: '2026-12-28', endExclusive: '2027-01-04' } },
  ];

  it.each(cases)('$name', ({ input, expected }) => {
    expect(weekRange(input)).toEqual(expected);
  });
});

describe('isInWeek local-day edges (decision 39, America/Detroit)', () => {
  const cases: Array<{ name: string; input: Instant; expected: boolean }> = [
    { name: 'Sun 23:59 local before the week → out', input: SUN_BEFORE_2359, expected: false },
    { name: 'Mon 00:00 local → in', input: MON_0000, expected: true },
    { name: 'Wed 16:30 local → in', input: WED, expected: true },
    { name: 'Sun 23:59 local at week end → in', input: SUN_2359, expected: true },
    { name: 'next Mon 00:00 local → out', input: NEXT_MON_0000, expected: false },
    { name: 'previous Friday → out', input: PREV_FRI, expected: false },
  ];

  it.each(cases)('$name', ({ input, expected }) => {
    expect(isInWeek(input, WEEK)).toBe(expected);
  });
});

describe('firstPassReady (decisions 35, 44)', () => {
  const cases: Array<{ name: string; input: ReviewRow[]; expected: ReadyCount | null }> = [
    {
      name: 'rows across two weeks: only this week counts (A READY this week; B FIX last week; C READY next week) → 1 of 1',
      input: [pass1(JOB_A, WED, 'READY'), pass1(JOB_B, PREV_FRI, 'FIX', 5), pass1(JOB_C, NEXT_TUE, 'READY', 9)],
      expected: { ready: 1, total: 1 },
    },
    {
      name: 'earliest pass-1 row per job wins: FIX (Tue) then READY (Wed), listed out of order → not ready, 0 of 1',
      input: [pass1(JOB_A, WED, 'READY', 6), pass1(JOB_A, TUE, 'FIX', 3)],
      expected: { ready: 0, total: 1 },
    },
    {
      name: 'earliest pass-1 row per job wins: READY (Tue) then FIX (Thu) → ready, 1 of 1',
      input: [pass1(JOB_A, TUE, 'READY', 3), pass1(JOB_A, THU, 'FIX', 8)],
      expected: { ready: 1, total: 1 },
    },
    {
      name: 'same reviewedAt on two pass-1 rows: the higher sheet row (lower rowIndex) is the earlier → FIX at row 5 beats READY at row 7',
      input: [pass1(JOB_A, WED, 'READY', 7), pass1(JOB_A, WED, 'FIX', 5)],
      expected: { ready: 0, total: 1 },
    },
    {
      name: 'pass-2 rows are ignored for first pass: only a pass-2 READY → null',
      input: [pass2(JOB_A, WED, 'READY')],
      expected: null,
    },
    {
      name: 'checker rows (no pass) are ignored for first pass: only a checker READY → null',
      input: [checker(JOB_A, 'READY')],
      expected: null,
    },
    {
      name: 'a pass-2 READY does not rescue a pass-1 FIX → 0 of 1',
      input: [pass1(JOB_A, TUE, 'FIX'), pass2(JOB_A, WED, 'READY')],
      expected: { ready: 0, total: 1 },
    },
    {
      name: 'total 0 (no rows) → null, the wall shows a dash',
      input: [],
      expected: null,
    },
    {
      name: 'unmatched row (match none) with a pass-1 READY never yields a verdict → null',
      input: [mkRow({ match: 'none', pass: 1, reviewedAt: WED, verdict: 'READY' })],
      expected: null,
    },
    {
      name: 'pass-1 row with no reviewedAt cannot be placed in a week → null',
      input: [mkRow({ pass: 1, verdict: 'READY' })],
      expected: null,
    },
    {
      name: 'pass-1 row with no verdict is not a verdict: skipped, so the later READY is the first → 1 of 1',
      input: [mkRow({ pass: 1, reviewedAt: TUE, rowIndex: 2 }), pass1(JOB_A, WED, 'READY', 3)],
      expected: { ready: 1, total: 1 },
    },
    {
      name: 'local-day edges: A Sun 23:59 before (out), B Mon 00:00 READY (in), C Sun 23:59 FIX (in), D next Mon 00:00 (out) → 1 of 2',
      input: [pass1(JOB_A, SUN_BEFORE_2359, 'READY', 2), pass1(JOB_B, MON_0000, 'READY', 3), pass1(JOB_C, SUN_2359, 'FIX', 4), pass1(JOB_D, NEXT_MON_0000, 'READY', 5)],
      expected: { ready: 1, total: 2 },
    },
    {
      name: 'pass-1 FIX last week then pass-1 READY this week: the week filter runs first, so this week counts the READY → 1 of 1',
      input: [pass1(JOB_A, PREV_FRI, 'FIX', 2), pass1(JOB_A, TUE, 'READY', 3)],
      expected: { ready: 1, total: 1 },
    },
    {
      name: 'three jobs: READY, FIX, HOLD → 1 of 3',
      input: [pass1(JOB_A, TUE, 'READY', 2), pass1(JOB_B, WED, 'FIX', 3), pass1(JOB_C, THU, 'HOLD', 4)],
      expected: { ready: 1, total: 3 },
    },
  ];

  it.each(cases)('$name', ({ input, expected }) => {
    expect(firstPassReady(input, WEEK)).toEqual(expected);
  });
});

describe('firstPassReadyByCrew (decision 44, manager scorecard only)', () => {
  const VISIT_A = completedVisit('visit-test-a', JOB_A, [LEAD_JM, MEMBER_1], '2026-10-13T19:00:00Z');
  const VISIT_B = completedVisit('visit-test-b', JOB_B, [LEAD_RK], '2026-10-13T19:30:00Z');
  const JOBS = [mkJob({ id: JOB_A, visitIds: ['visit-test-a'] }), mkJob({ id: JOB_B, jobNumber: 1002, visitIds: ['visit-test-b'] }), mkJob({ id: JOB_C, jobNumber: 1003 })];

  const cases: Array<{
    name: string;
    input: { rows: ReviewRow[]; jobs: Job[]; visits: Visit[]; crews: Crew[] };
    expected: Record<string, ReadyCount>;
  }> = [
    {
      name: 'grouping: A (JM) READY, B (RK) FIX, C has no completed visit → {JM 1/1, RK 0/1, UNASSIGNED 1/1}',
      input: {
        rows: [pass1(JOB_A, TUE, 'READY', 2), pass1(JOB_B, WED, 'FIX', 3), pass1(JOB_C, THU, 'READY', 4)],
        jobs: JOBS,
        visits: [VISIT_A, VISIT_B],
        crews: CREWS,
      },
      expected: { JM: { ready: 1, total: 1 }, RK: { ready: 0, total: 1 }, [UNASSIGNED]: { ready: 1, total: 1 } },
    },
    {
      name: 'latest completed visit decides the crew: earlier visit by JM, later visit by RK → RK',
      input: {
        rows: [pass1(JOB_A, WED, 'READY')],
        jobs: [mkJob({ id: JOB_A })],
        visits: [
          completedVisit('visit-test-1', JOB_A, [LEAD_JM], '2026-10-12T19:00:00Z'),
          completedVisit('visit-test-2', JOB_A, [LEAD_RK], '2026-10-13T19:00:00Z'),
        ],
        crews: CREWS,
      },
      expected: { RK: { ready: 1, total: 1 } },
    },
    {
      name: 'an unfinished later visit does not change the crew: completed visit by JM, later incomplete visit by RK → JM',
      input: {
        rows: [pass1(JOB_A, WED, 'READY')],
        jobs: [mkJob({ id: JOB_A })],
        visits: [
          completedVisit('visit-test-1', JOB_A, [LEAD_JM], '2026-10-12T19:00:00Z'),
          mkVisit({ id: 'visit-test-2', jobId: JOB_A, assignedUserIds: [LEAD_RK], startAt: '2026-10-15T12:00:00Z', endAt: '2026-10-15T19:00:00Z' }),
        ],
        crews: CREWS,
      },
      expected: { JM: { ready: 1, total: 1 } },
    },
    {
      name: 'assignees are crew members only, no lead → UNASSIGNED',
      input: {
        rows: [pass1(JOB_A, WED, 'FIX')],
        jobs: [mkJob({ id: JOB_A })],
        visits: [completedVisit('visit-test-1', JOB_A, [MEMBER_1], '2026-10-13T19:00:00Z')],
        crews: CREWS,
      },
      expected: { [UNASSIGNED]: { ready: 0, total: 1 } },
    },
    {
      name: 'job missing from jobs[] but its visit carries jobId → crew still identified (JM)',
      input: {
        rows: [pass1(JOB_A, WED, 'READY')],
        jobs: [],
        visits: [VISIT_A],
        crews: CREWS,
      },
      expected: { JM: { ready: 1, total: 1 } },
    },
    {
      name: 'no crews configured → everything UNASSIGNED',
      input: {
        rows: [pass1(JOB_A, WED, 'READY'), pass1(JOB_B, WED, 'READY', 3)],
        jobs: JOBS,
        visits: [VISIT_A, VISIT_B],
        crews: [],
      },
      expected: { [UNASSIGNED]: { ready: 2, total: 2 } },
    },
    {
      name: 'no first-pass rows this week → {} (nothing to split)',
      input: { rows: [pass2(JOB_A, WED, 'READY'), pass1(JOB_B, NEXT_TUE, 'READY', 3)], jobs: JOBS, visits: [VISIT_A, VISIT_B], crews: CREWS },
      expected: {},
    },
  ];

  it.each(cases)('$name', ({ input, expected }) => {
    expect(firstPassReadyByCrew(input.rows, WEEK, input.jobs, input.visits, input.crews)).toEqual(expected);
  });

  it('per-crew totals add up to the company-level count', () => {
    const rows = [pass1(JOB_A, TUE, 'READY', 2), pass1(JOB_B, WED, 'FIX', 3), pass1(JOB_C, THU, 'READY', 4), pass1(JOB_A, THU, 'FIX', 5)];
    const company = firstPassReady(rows, WEEK);
    const byCrew = Object.values(firstPassReadyByCrew(rows, WEEK, JOBS, [VISIT_A, VISIT_B], CREWS));
    expect(company).toEqual({ ready: 2, total: 3 });
    expect(byCrew.reduce((n, c) => n + c.total, 0)).toBe(company?.total);
    expect(byCrew.reduce((n, c) => n + c.ready, 0)).toBe(company?.ready);
  });

  it('crewInitialsForJob returns UNASSIGNED when the job has no visits at all', () => {
    expect(crewInitialsForJob(JOB_D, JOBS, [VISIT_A, VISIT_B], CREWS)).toBe(UNASSIGNED);
  });
});

describe('visitsNotReady (decisions 32, 43)', () => {
  const DONE_A = mkVisit({ id: 'visit-test-a', jobId: JOB_A, isComplete: true, result: 'Completed' });
  const DONE_B = mkVisit({ id: 'visit-test-b', jobId: JOB_B, isComplete: true, result: 'Completed' });
  const DONE_C = mkVisit({ id: 'visit-test-c', jobId: JOB_C, isComplete: true, result: 'Completed' });

  const cases: Array<{ name: string; input: { visits: Visit[]; rows: ReviewRow[] }; expected: number }> = [
    {
      name: 'checker READY (no pass) counts as ready: A checker READY, B no rows → 1',
      input: { visits: [DONE_A, DONE_B], rows: [checker(JOB_A, 'READY')] },
      expected: 1,
    },
    {
      name: 'no rows at all → every Completed visit is not ready (3 Completed + 1 Return needed) → 3',
      input: { visits: [DONE_A, DONE_B, DONE_C, mkVisit({ id: 'visit-test-d', jobId: JOB_D, result: 'Return needed', missReason: 'MATERIALS' })], rows: [] },
      expected: 3,
    },
    {
      name: 'FIX and HOLD rows do not make a job ready → 2',
      input: { visits: [DONE_A, DONE_B], rows: [pass1(JOB_A, TUE, 'FIX'), pass2(JOB_B, WED, 'HOLD')] },
      expected: 2,
    },
    {
      name: 'pass-1 READY and pass-2 READY both count as ready → 0',
      input: { visits: [DONE_A, DONE_B], rows: [pass1(JOB_A, TUE, 'READY'), pass2(JOB_B, WED, 'READY')] },
      expected: 0,
    },
    {
      name: 'a READY row from any week counts (it is a state, not a weekly number) → 0',
      input: { visits: [DONE_A], rows: [pass1(JOB_A, PREV_FRI, 'READY')] },
      expected: 0,
    },
    {
      name: 'non-Completed results never count: Return needed, Prepped, Problem, no result → 0',
      input: {
        visits: [
          mkVisit({ id: 'visit-test-1', result: 'Return needed', missReason: 'ACCESS' }),
          mkVisit({ id: 'visit-test-2', result: 'Prepped', plannedAsPrep: true }),
          mkVisit({ id: 'visit-test-3', result: 'Problem', missReason: 'PRE-EXISTING' }),
          mkVisit({ id: 'visit-test-4', resultSource: 'unknown' }),
        ],
        rows: [],
      },
      expected: 0,
    },
    {
      name: 'READY on a row the matcher marked none is ignored even with a stale matchedJobId → 1',
      input: { visits: [DONE_A], rows: [mkRow({ match: 'none', matchedJobId: JOB_A, verdict: 'READY' })] },
      expected: 1,
    },
    {
      name: 'READY for a different job does not help → 1',
      input: { visits: [DONE_A], rows: [checker(JOB_B, 'READY')] },
      expected: 1,
    },
    {
      name: 'empty visits → 0',
      input: { visits: [], rows: [checker(JOB_A, 'READY')] },
      expected: 0,
    },
  ];

  it.each(cases)('$name', ({ input, expected }) => {
    expect(visitsNotReady(input.visits, input.rows)).toBe(expected);
  });
});
