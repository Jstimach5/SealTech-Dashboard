import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config.js';
import {
  lastNameFromApplication,
  matchAllReviewRows,
  matchReviewRow,
  parseSheetDate,
  rowOrderKey,
  verdictsByJob,
  type JobVerdicts,
  type RowMatch,
} from '../src/derive/reviewMatch.js';
import { addLocalDays } from '../src/derive/time.js';
import type { Job, LocalDate, ReviewRow, Visit } from '../src/types.js';

const TOL = CONFIG.REVIEW_MATCH_TOLERANCE_DAYS;

// Wed Oct 14 2026, EDT (offset -240).
const INSTALL_DAY: LocalDate = '2026-10-14';
const COMPLETED_OCT14 = '2026-10-14T20:30:00Z'; // 16:30 local Oct 14
const COMPLETED_OCT14_LATE = '2026-10-15T02:30:00Z'; // 22:30 local Oct 14 (Oct 15 in UTC)
const COMPLETED_OCT01 = '2026-10-01T20:30:00Z'; // 16:30 local Oct 1

const STEM_ROLLIN = 'STI_ATTIC_ROLLIN_CARTER_2635 NEEDHAM ST_APP.pdf';
const STEM_NONE = 'random.pdf';

function mkJob(overrides: Partial<Job> = {}): Job {
  return {
    id: 'job-test-rollin-att',
    jobNumber: 1001,
    title: 'CEHN Attic',
    lastName: 'ROLLIN',
    city: 'TESTVILLE',
    scope: 'ATT',
    program: 'CE_INSULATION',
    bucket: 'requires_invoicing',
    bucketSince: COMPLETED_OCT14,
    bucketSinceSource: 'observed',
    completedAt: COMPLETED_OCT14,
    updatedAt: COMPLETED_OCT14,
    invoiced: false,
    isZeroTotal: false,
    hasUninvoicedWork: true,
    futureVisitCount: 0,
    visitIds: [],
    noteLines: [],
    ...overrides,
  };
}

function mkVisit(overrides: Partial<Visit> = {}): Visit {
  return {
    id: 'visit-test-1',
    jobId: 'job-test-rollin-att',
    startAt: '2026-10-14T12:00:00Z',
    endAt: '2026-10-14T19:00:00Z',
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

function mkRow(overrides: Partial<ReviewRow> = {}): ReviewRow {
  return {
    rowIndex: 2,
    checked: '10/15/2026',
    application: STEM_ROLLIN,
    installDate: '10/14/2026',
    tech: 'Crew A',
    jobDesc: 'Attic insulation',
    match: 'none',
    ...overrides,
  };
}

const completedVisit = (jobId: string, completedAt: string, id = `visit-test-${jobId}`): Visit =>
  mkVisit({ id, jobId, completedAt, isComplete: true });

const ROLLIN_ATT = mkJob();
const ROLLIN_WALL = mkJob({ id: 'job-test-rollin-wall', jobNumber: 1002, scope: 'WALL' });
const BAKER = mkJob({ id: 'job-test-baker', jobNumber: 2001, lastName: 'BAKER' });

describe('lastNameFromApplication (decision 43 checker file stems)', () => {
  const cases: Array<{ name: string; input: string; expected: string | undefined }> = [
    { name: 'real checker stem → segment 2', input: STEM_ROLLIN, expected: 'ROLLIN' },
    { name: 'quote stem → LAST', input: 'STI_WHF_LAST_FIRST_ADDRESS_QUOTE.pdf', expected: 'LAST' },
    { name: 'random.pdf → undefined', input: STEM_NONE, expected: undefined },
    { name: 'lowercase stem → uppercased', input: 'sti_attic_rollin_carter.pdf', expected: 'ROLLIN' },
    { name: 'two segments → undefined', input: 'STI_ATTIC.pdf', expected: undefined },
    { name: 'prefix other than STI → undefined (layout unknown)', input: 'CE_ATTIC_ROLLIN_CARTER.pdf', expected: undefined },
    { name: 'path prefix is ignored', input: 'queue/2026/STI_ATTIC_ROLLIN_CARTER.PDF', expected: 'ROLLIN' },
    { name: 'empty string → undefined', input: '', expected: undefined },
  ];

  it.each(cases)('$name', ({ input, expected }) => {
    expect(lastNameFromApplication(input)).toBe(expected);
  });
});

describe('parseSheetDate', () => {
  const cases: Array<{ name: string; input: string | undefined; expected: LocalDate | undefined }> = [
    { name: 'YYYY-MM-DD', input: '2026-10-14', expected: '2026-10-14' },
    { name: 'M/D/YYYY', input: '10/14/2026', expected: '2026-10-14' },
    { name: 'M/D/YY → 20YY', input: '10/14/26', expected: '2026-10-14' },
    { name: 'single-digit month and day are padded', input: '1/5/2026', expected: '2026-01-05' },
    { name: 'surrounding whitespace is trimmed', input: ' 10/14/2026 ', expected: '2026-10-14' },
    { name: 'garbage → undefined', input: 'garbage', expected: undefined },
    { name: 'undefined → undefined', input: undefined, expected: undefined },
    { name: 'empty → undefined', input: '', expected: undefined },
    { name: 'month 13 → undefined', input: '13/40/2026', expected: undefined },
    { name: 'Feb 30 → undefined', input: '2/30/2026', expected: undefined },
  ];

  it.each(cases)('$name', ({ input, expected }) => {
    expect(parseSheetDate(input)).toBe(expected);
  });
});

describe('matchReviewRow (decisions 5, 7, 8; CONFIG.REVIEW_MATCH_TOLERANCE_DAYS)', () => {
  const cases: Array<{ name: string; input: { row: ReviewRow; jobs: Job[]; visits: Visit[] }; expected: RowMatch }> = [
    {
      name: 'exact by jobberJobId',
      input: { row: mkRow({ jobberJobId: 'job-test-baker', application: STEM_NONE }), jobs: [ROLLIN_ATT, BAKER], visits: [] },
      expected: { match: 'exact', jobId: 'job-test-baker' },
    },
    {
      name: 'exact by jobNumber',
      input: { row: mkRow({ jobNumber: 2001, application: STEM_NONE }), jobs: [ROLLIN_ATT, BAKER], visits: [] },
      expected: { match: 'exact', jobId: 'job-test-baker' },
    },
    {
      name: 'exact key beats a stem that names a different job',
      input: {
        row: mkRow({ jobberJobId: 'job-test-baker' }),
        jobs: [ROLLIN_ATT, BAKER],
        visits: [completedVisit('job-test-rollin-att', COMPLETED_OCT14)],
      },
      expected: { match: 'exact', jobId: 'job-test-baker' },
    },
    {
      name: 'keyed row whose job is not in the list → none (key is authoritative, never re-inferred)',
      input: {
        row: mkRow({ jobberJobId: 'job-test-gone' }),
        jobs: [ROLLIN_ATT],
        visits: [completedVisit('job-test-rollin-att', COMPLETED_OCT14)],
      },
      expected: { match: 'none' },
    },
    {
      name: 'inferred by stem + completed visit on the install date',
      input: { row: mkRow(), jobs: [ROLLIN_ATT, BAKER], visits: [completedVisit('job-test-rollin-att', COMPLETED_OCT14)] },
      expected: { match: 'inferred', jobId: 'job-test-rollin-att' },
    },
    {
      name: `inferred when the install date is exactly ${TOL} days before the completed visit`,
      input: {
        row: mkRow({ installDate: addLocalDays(INSTALL_DAY, -TOL) }),
        jobs: [ROLLIN_ATT],
        visits: [completedVisit('job-test-rollin-att', COMPLETED_OCT14)],
      },
      expected: { match: 'inferred', jobId: 'job-test-rollin-att' },
    },
    {
      name: `inferred when the install date is exactly ${TOL} days after the completed visit`,
      input: {
        row: mkRow({ installDate: addLocalDays(INSTALL_DAY, TOL) }),
        jobs: [ROLLIN_ATT],
        visits: [completedVisit('job-test-rollin-att', COMPLETED_OCT14)],
      },
      expected: { match: 'inferred', jobId: 'job-test-rollin-att' },
    },
    {
      name: `stem match but date ${TOL + 1} days off → none`,
      input: {
        row: mkRow({ installDate: addLocalDays(INSTALL_DAY, -(TOL + 1)) }),
        jobs: [ROLLIN_ATT],
        visits: [completedVisit('job-test-rollin-att', COMPLETED_OCT14)],
      },
      expected: { match: 'none' },
    },
    {
      name: 'visit date is Detroit-local, not UTC (22:30 local Oct 14 is Oct 15 in UTC)',
      input: {
        row: mkRow({ installDate: addLocalDays(INSTALL_DAY, -TOL) }),
        jobs: [ROLLIN_ATT],
        visits: [completedVisit('job-test-rollin-att', COMPLETED_OCT14_LATE)],
      },
      expected: { match: 'inferred', jobId: 'job-test-rollin-att' },
    },
    {
      name: 'twin surname: two jobs with the same last name both completed near the date → none',
      input: {
        row: mkRow(),
        jobs: [ROLLIN_ATT, ROLLIN_WALL],
        visits: [completedVisit('job-test-rollin-att', COMPLETED_OCT14), completedVisit('job-test-rollin-wall', COMPLETED_OCT14)],
      },
      expected: { match: 'none' },
    },
    {
      name: 'twin surname but only one completed inside the tolerance → inferred to that one',
      input: {
        row: mkRow(),
        jobs: [ROLLIN_ATT, ROLLIN_WALL],
        visits: [completedVisit('job-test-rollin-att', COMPLETED_OCT14), completedVisit('job-test-rollin-wall', COMPLETED_OCT01)],
      },
      expected: { match: 'inferred', jobId: 'job-test-rollin-att' },
    },
    {
      name: 'stem match, job lastName in mixed case → inferred (case-insensitive)',
      input: {
        row: mkRow(),
        jobs: [mkJob({ lastName: 'Rollin' })],
        visits: [completedVisit('job-test-rollin-att', COMPLETED_OCT14)],
      },
      expected: { match: 'inferred', jobId: 'job-test-rollin-att' },
    },
    {
      name: 'stem match but the visit is not completed → none',
      input: { row: mkRow(), jobs: [ROLLIN_ATT], visits: [mkVisit({ jobId: 'job-test-rollin-att' })] },
      expected: { match: 'none' },
    },
    {
      name: 'stem match but the completed visit belongs to another job → none',
      input: { row: mkRow(), jobs: [ROLLIN_ATT, BAKER], visits: [completedVisit('job-test-baker', COMPLETED_OCT14)] },
      expected: { match: 'none' },
    },
    {
      name: 'stem match but installDate unparsable → none',
      input: {
        row: mkRow({ installDate: 'tbd' }),
        jobs: [ROLLIN_ATT],
        visits: [completedVisit('job-test-rollin-att', COMPLETED_OCT14)],
      },
      expected: { match: 'none' },
    },
    {
      name: 'stem names a last name no job has → none (jobDesc is not tried)',
      input: {
        row: mkRow({ application: 'STI_ATTIC_NOBODY_CARTER_ADDRESS_APP.pdf', jobDesc: 'BAKER' }),
        jobs: [BAKER],
        visits: [completedVisit('job-test-baker', COMPLETED_OCT14)],
      },
      expected: { match: 'none' },
    },
    {
      name: 'stem absent + jobDesc equals one lastName → inferred',
      input: { row: mkRow({ application: STEM_NONE, jobDesc: 'baker' }), jobs: [ROLLIN_ATT, BAKER], visits: [] },
      expected: { match: 'inferred', jobId: 'job-test-baker' },
    },
    {
      name: 'stem absent + jobDesc equals two lastNames → none',
      input: { row: mkRow({ application: STEM_NONE, jobDesc: 'ROLLIN' }), jobs: [ROLLIN_ATT, ROLLIN_WALL], visits: [] },
      expected: { match: 'none' },
    },
    {
      name: 'stem absent + jobDesc is scope text (the live column E) → none',
      input: { row: mkRow({ application: STEM_NONE, jobDesc: 'Attic insulation' }), jobs: [ROLLIN_ATT, BAKER], visits: [] },
      expected: { match: 'none' },
    },
    {
      name: 'stem absent + blank jobDesc → none',
      input: { row: mkRow({ application: '', jobDesc: '' }), jobs: [ROLLIN_ATT], visits: [] },
      expected: { match: 'none' },
    },
    {
      name: 'no jobs at all → none',
      input: { row: mkRow(), jobs: [], visits: [completedVisit('job-test-rollin-att', COMPLETED_OCT14)] },
      expected: { match: 'none' },
    },
  ];

  it.each(cases)('$name', ({ input, expected }) => {
    expect(matchReviewRow(input.row, input.jobs, input.visits)).toEqual(expected);
  });
});

describe('matchAllReviewRows', () => {
  it('returns copies with match and matchedJobId set, drops a stale matchedJobId on none rows, and leaves inputs untouched', () => {
    const keyed = mkRow({ rowIndex: 2, jobberJobId: 'job-test-baker', application: STEM_NONE });
    const inferred = mkRow({ rowIndex: 3 });
    const stale = mkRow({ rowIndex: 4, application: STEM_NONE, match: 'inferred', matchedJobId: 'job-test-rollin-att' });
    const rows = [keyed, inferred, stale];
    const visits = [completedVisit('job-test-rollin-att', COMPLETED_OCT14)];

    const out = matchAllReviewRows(rows, [ROLLIN_ATT, BAKER], visits);

    expect(out.map((r) => [r.rowIndex, r.match, r.matchedJobId])).toEqual([
      [2, 'exact', 'job-test-baker'],
      [3, 'inferred', 'job-test-rollin-att'],
      [4, 'none', undefined],
    ]);
    expect(out[2] && 'matchedJobId' in out[2]).toBe(false);
    expect(out[0]).not.toBe(keyed);
    expect(keyed.match).toBe('none');
    expect(stale.matchedJobId).toBe('job-test-rollin-att');
  });
});

describe('rowOrderKey', () => {
  const cases: Array<{ name: string; input: [ReviewRow, ReviewRow]; expected: 'a<b' | 'a>b' }> = [
    {
      name: 'later reviewedAt sorts after, whatever the rowIndex',
      input: [mkRow({ rowIndex: 20, reviewedAt: '2026-10-14T20:30:00Z' }), mkRow({ rowIndex: 10, reviewedAt: '2026-10-15T20:00:00Z' })],
      expected: 'a<b',
    },
    {
      name: 'reviewedAt with an offset compares as the same instant scale (16:30-04:00 is 20:30Z)',
      input: [mkRow({ rowIndex: 2, reviewedAt: '2026-10-14T16:30:00-04:00' }), mkRow({ rowIndex: 3, reviewedAt: '2026-10-14T20:00:00Z' })],
      expected: 'a>b',
    },
    {
      name: 'checked date alone orders before a verdict later that day',
      input: [mkRow({ rowIndex: 9, checked: '10/14/2026' }), mkRow({ rowIndex: 3, reviewedAt: '2026-10-14T20:30:00Z' })],
      expected: 'a<b',
    },
    {
      name: 'checked date the next day orders after a verdict the day before',
      input: [mkRow({ rowIndex: 3, checked: '10/15/2026' }), mkRow({ rowIndex: 9, reviewedAt: '2026-10-14T20:30:00Z' })],
      expected: 'a>b',
    },
    {
      name: 'no dates at all → rowIndex decides, numerically (9 before 10)',
      input: [mkRow({ rowIndex: 9, checked: '' }), mkRow({ rowIndex: 10, checked: '' })],
      expected: 'a<b',
    },
    {
      name: 'same instant → rowIndex decides',
      input: [mkRow({ rowIndex: 5, reviewedAt: '2026-10-14T20:30:00Z' }), mkRow({ rowIndex: 4, reviewedAt: '2026-10-14T20:30:00Z' })],
      expected: 'a>b',
    },
  ];

  it.each(cases)('$name', ({ input: [a, b], expected }) => {
    const ka = rowOrderKey(a);
    const kb = rowOrderKey(b);
    expect(ka === kb ? 'equal' : ka < kb ? 'a<b' : 'a>b').toBe(expected);
  });
});

describe('verdictsByJob (decisions 5, 7)', () => {
  interface Projection {
    latest: number | undefined;
    pass1: number | undefined;
    pass2: number | undefined;
    checker: number | undefined;
    pass1Ready: boolean;
    pass2Ready: boolean;
    latestVerdict: JobVerdicts['latestVerdict'];
  }
  const project = (v: JobVerdicts): Projection => ({
    latest: v.latest?.rowIndex,
    pass1: v.pass1?.rowIndex,
    pass2: v.pass2?.rowIndex,
    checker: v.checker?.rowIndex,
    pass1Ready: v.pass1Ready,
    pass2Ready: v.pass2Ready,
    latestVerdict: v.latestVerdict,
  });

  const JOB = 'job-test-rollin-att';
  const matched = (overrides: Partial<ReviewRow>): ReviewRow => mkRow({ match: 'inferred', matchedJobId: JOB, ...overrides });

  const cases: Array<{ name: string; input: ReviewRow[]; expected: Record<string, Projection> }> = [
    {
      name: 'checker row, pass1 FIX, pass1 READY, pass2 READY → both passes READY, latest READY',
      input: [
        matched({ rowIndex: 2, checked: '10/14/2026', verdict: 'FIX' }),
        matched({ rowIndex: 3, pass: 1, verdict: 'FIX', reviewedAt: '2026-10-14T20:30:00Z' }),
        matched({ rowIndex: 4, pass: 1, verdict: 'READY', reviewedAt: '2026-10-15T20:00:00Z' }),
        matched({ rowIndex: 5, pass: 2, verdict: 'READY', reviewedAt: '2026-10-15T20:45:00Z' }),
      ],
      expected: {
        [JOB]: { latest: 5, pass1: 4, pass2: 5, checker: 2, pass1Ready: true, pass2Ready: true, latestVerdict: 'READY' },
      },
    },
    {
      name: 'ordering by reviewedAt beats rowIndex (the lower row index carries the later verdict)',
      input: [
        matched({ rowIndex: 20, pass: 1, verdict: 'FIX', reviewedAt: '2026-10-14T20:30:00Z' }),
        matched({ rowIndex: 10, pass: 1, verdict: 'READY', reviewedAt: '2026-10-15T20:00:00Z' }),
      ],
      expected: {
        [JOB]: { latest: 10, pass1: 10, pass2: undefined, checker: undefined, pass1Ready: true, pass2Ready: false, latestVerdict: 'READY' },
      },
    },
    {
      name: 'pass1 READY then a later pass1 FIX → pass1Ready false (latest pass-1 row wins)',
      input: [
        matched({ rowIndex: 2, pass: 1, verdict: 'READY', reviewedAt: '2026-10-14T20:30:00Z' }),
        matched({ rowIndex: 3, pass: 1, verdict: 'FIX', reviewedAt: '2026-10-15T20:00:00Z' }),
      ],
      expected: {
        [JOB]: { latest: 3, pass1: 3, pass2: undefined, checker: undefined, pass1Ready: false, pass2Ready: false, latestVerdict: 'FIX' },
      },
    },
    {
      name: 'pass2 READY with no pass1 row → pass2Ready true, pass1Ready false (decision 5 is enforced by the service, not here)',
      input: [matched({ rowIndex: 2, pass: 2, verdict: 'READY', reviewedAt: '2026-10-14T21:00:00Z' })],
      expected: {
        [JOB]: { latest: 2, pass1: undefined, pass2: 2, checker: undefined, pass1Ready: false, pass2Ready: true, latestVerdict: 'READY' },
      },
    },
    {
      name: 'checker-only rows → no pass rows, latestVerdict is the latest checker verdict',
      input: [
        matched({ rowIndex: 2, checked: '10/13/2026', verdict: 'FIX' }),
        matched({ rowIndex: 3, checked: '10/14/2026', verdict: 'HOLD' }),
      ],
      expected: {
        [JOB]: { latest: 3, pass1: undefined, pass2: undefined, checker: 3, pass1Ready: false, pass2Ready: false, latestVerdict: 'HOLD' },
      },
    },
    {
      name: 'rows with match none are excluded, even with a stale matchedJobId',
      input: [
        mkRow({ rowIndex: 2, match: 'none', verdict: 'READY', pass: 1, reviewedAt: '2026-10-14T20:30:00Z' }),
        mkRow({ rowIndex: 3, match: 'none', matchedJobId: JOB, verdict: 'READY', pass: 1, reviewedAt: '2026-10-14T20:30:00Z' }),
      ],
      expected: {},
    },
    {
      name: 'rows are grouped per matched job',
      input: [
        matched({ rowIndex: 2, pass: 1, verdict: 'READY', reviewedAt: '2026-10-14T20:30:00Z' }),
        mkRow({ rowIndex: 3, match: 'exact', matchedJobId: 'job-test-baker', pass: 1, verdict: 'FIX', reviewedAt: '2026-10-14T20:35:00Z' }),
      ],
      expected: {
        [JOB]: { latest: 2, pass1: 2, pass2: undefined, checker: undefined, pass1Ready: true, pass2Ready: false, latestVerdict: 'READY' },
        'job-test-baker': { latest: 3, pass1: 3, pass2: undefined, checker: undefined, pass1Ready: false, pass2Ready: false, latestVerdict: 'FIX' },
      },
    },
    {
      name: 'no rows → empty record',
      input: [],
      expected: {},
    },
  ];

  it.each(cases)('$name', ({ input, expected }) => {
    const out = verdictsByJob(input);
    const projected: Record<string, Projection> = {};
    for (const [jobId, v] of Object.entries(out)) projected[jobId] = project(v);
    expect(projected).toEqual(expected);
  });

  it('does not reorder the input array', () => {
    const rows = [
      matched({ rowIndex: 3, pass: 1, verdict: 'READY', reviewedAt: '2026-10-15T20:00:00Z' }),
      matched({ rowIndex: 2, pass: 1, verdict: 'FIX', reviewedAt: '2026-10-14T20:30:00Z' }),
    ];
    verdictsByJob(rows);
    expect(rows.map((r) => r.rowIndex)).toEqual([3, 2]);
  });
});
