import { describe, expect, it } from 'vitest';
import type { Reason, Stage } from '../src/enums.js';
import type { CannotInvoiceLine, Instant, Job, Owner, ReviewRow, Visit } from '../src/types.js';
import {
  buildCannotInvoiceLine,
  cannotInvoiceReason,
  lineColour,
  openStage,
  parseBlowerDoor,
  sortedRows,
  stageClocks,
  stageDays,
} from '../src/derive/cannotInvoice.js';

/** 07:00 local, Wed Oct 14 2026 (EDT, offset -240). */
const NOW = '2026-10-14T11:00:00Z';

/** Sat Oct 4 2026 16:00 local: 10 days before NOW. */
const T_COMPLETED = '2026-10-04T20:00:00Z';
/** Tue Oct 7 2026 16:00 local: 7 days before NOW. */
const T_FIRST = '2026-10-07T20:00:00Z';
/** Fri Oct 10 2026 16:00 local: 4 days before NOW. */
const T_SECOND = '2026-10-10T20:00:00Z';
/** Local noon on the sheet's submitted date (Oct 12): 2 days before NOW. */
const T_SUBMITTED = '2026-10-12T16:00:00.000Z';
/** Local noon on the sheet's accepted date (Oct 13). */
const T_ACCEPTED = '2026-10-13T16:00:00.000Z';

const OFFICE: Owner = { role: 'OFFICE' };
const CREW: Owner = { role: 'CREW' };

/** Overrides may set an optional field to undefined to erase the factory default. */
type Overrides<T> = { [K in keyof T]?: T[K] | undefined };

function strip<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}

function mkJob(over: Overrides<Job> = {}): Job {
  return strip({
    id: 'job-test-1',
    jobNumber: 1001,
    title: 'CEHN ATT',
    lastName: 'Nowak',
    city: 'Testville',
    scope: 'ATT',
    program: 'CE_INSULATION',
    bucket: 'requires_invoicing',
    bucketSince: T_COMPLETED,
    bucketSinceSource: 'observed',
    updatedAt: T_COMPLETED,
    invoiced: false,
    isZeroTotal: false,
    hasUninvoicedWork: true,
    futureVisitCount: 0,
    visitIds: ['visit-test-1'],
    noteLines: [],
    ...over,
  }) as Job;
}

/** A completed visit on Sat Oct 4 unless overridden. */
function mkVisit(over: Overrides<Visit> = {}): Visit {
  return strip({
    id: 'visit-test-1',
    jobId: 'job-test-1',
    startAt: '2026-10-04T12:00:00Z',
    endAt: '2026-10-04T20:00:00Z',
    createdAt: '2026-10-01T12:00:00Z',
    completedAt: T_COMPLETED,
    isComplete: true,
    isLastScheduledVisit: true,
    incompleteJobFormsCount: 0,
    formsSeenMax: 1,
    assignedUserIds: ['user-test-1'],
    plannedAsPrep: false,
    result: 'Completed',
    resultSource: 'jobForm',
    resultAt: T_COMPLETED,
    ...over,
  }) as Visit;
}

/** A matched pass-1 human row reviewed Sun Oct 5 unless overridden. Checker rows pass `pass: undefined`. */
function mkRow(over: Overrides<ReviewRow> = {}): ReviewRow {
  return strip({
    rowIndex: 2,
    checked: '',
    application: 'CE',
    installDate: '10/4/2026',
    tech: 'Crew A',
    jobDesc: 'ATT',
    match: 'exact',
    matchedJobId: 'job-test-1',
    jobberJobId: 'job-test-1',
    pass: 1,
    reviewedAt: '2026-10-05T18:00:00Z',
    ...over,
  }) as ReviewRow;
}

const checkerRow = (over: Overrides<ReviewRow> = {}): ReviewRow => mkRow({ pass: undefined, reviewedAt: undefined, ...over });

// ---------------------------------------------------------------------------------------------
// parseBlowerDoor
// ---------------------------------------------------------------------------------------------

describe('parseBlowerDoor', () => {
  it.each<{ name: string; input: string | undefined; expected: { pre: number; post: number; reduction: number } | undefined }>([
    { name: "'1,412 > 1,190' → 15.7 % reduction", input: '1,412 > 1,190', expected: { pre: 1412, post: 1190, reduction: 0.1572 } },
    { name: "'2,094 > 1,439 (31.3%)' ignores the parenthetical", input: '2,094 > 1,439 (31.3%)', expected: { pre: 2094, post: 1439, reduction: 0.3128 } },
    { name: "'1412>1190' without commas or spaces", input: '1412>1190', expected: { pre: 1412, post: 1190, reduction: 0.1572 } },
    { name: "'bad' → undefined", input: 'bad', expected: undefined },
    { name: 'undefined → undefined', input: undefined, expected: undefined },
    { name: "'n/a' → undefined", input: 'n/a', expected: undefined },
    { name: 'empty string → undefined', input: '', expected: undefined },
    { name: "'0 > 0' (no pre reading) → undefined", input: '0 > 0', expected: undefined },
    { name: 'a lone number without the arrow → undefined', input: '1,412', expected: undefined },
  ])('$name', ({ input, expected }) => {
    const out = parseBlowerDoor(input);
    if (expected === undefined) {
      expect(out).toBeUndefined();
      return;
    }
    expect(out?.pre).toBe(expected.pre);
    expect(out?.post).toBe(expected.post);
    expect(out?.reduction).toBeCloseTo(expected.reduction, 3);
  });
});

// ---------------------------------------------------------------------------------------------
// sortedRows
// ---------------------------------------------------------------------------------------------

describe('sortedRows', () => {
  it.each<{ name: string; input: ReviewRow[]; expected: number[] }>([
    {
      name: 'ascending by reviewedAt regardless of rowIndex',
      input: [mkRow({ rowIndex: 5, reviewedAt: '2026-10-06T18:00:00Z' }), mkRow({ rowIndex: 4, reviewedAt: '2026-10-05T18:00:00Z' })],
      expected: [4, 5],
    },
    {
      name: "checker row's checked date (ISO) at local noon slots between human reviewedAt instants",
      input: [
        mkRow({ rowIndex: 2, reviewedAt: '2026-10-07T18:00:00Z' }),
        checkerRow({ rowIndex: 3, checked: '2026-10-06' }),
        mkRow({ rowIndex: 4, reviewedAt: '2026-10-05T18:00:00Z' }),
      ],
      expected: [4, 3, 2],
    },
    {
      name: "checked date in US form '10/6/2026' parses the same",
      input: [mkRow({ rowIndex: 2, reviewedAt: '2026-10-07T18:00:00Z' }), checkerRow({ rowIndex: 3, checked: '10/6/2026' })],
      expected: [3, 2],
    },
    {
      name: 'rows with no date at all fall back to sheet order and sort before dated rows',
      input: [checkerRow({ rowIndex: 9, checked: '' }), mkRow({ rowIndex: 2, reviewedAt: '2026-10-05T18:00:00Z' }), checkerRow({ rowIndex: 7, checked: 'yes' })],
      expected: [7, 9, 2],
    },
    {
      name: 'same instant → rowIndex breaks the tie',
      input: [mkRow({ rowIndex: 6, reviewedAt: '2026-10-05T18:00:00Z' }), mkRow({ rowIndex: 3, reviewedAt: '2026-10-05T18:00:00Z' })],
      expected: [3, 6],
    },
    { name: 'empty input → empty output', input: [], expected: [] },
  ])('$name', ({ input, expected }) => {
    expect(sortedRows(input).map((r) => r.rowIndex)).toEqual(expected);
  });
});

// ---------------------------------------------------------------------------------------------
// cannotInvoiceReason (decisions 30, 31, 43): precedence, one row per adjacent pair plus negatives
// ---------------------------------------------------------------------------------------------

interface ReasonCase {
  name: string;
  input: { job?: Job; visits?: Visit[]; rows?: ReviewRow[] };
  expected: { reason: Reason; fixPick?: string; fromRowIndex?: number };
}

const OPEN_FIX = (over: Overrides<ReviewRow> = {}): ReviewRow =>
  mkRow({ verdict: 'FIX', fixBeforeSubmitting: 'Hatch not shown', status: '', ...over });

const REASON_CASES: ReasonCase[] = [
  // --- 1. PROGRAM-WAIT ---
  {
    name: 'PROGRAM-WAIT beats a stale open FIX (submittedDate set, nothing accepted or returned)',
    input: { rows: [OPEN_FIX({ submittedDate: '2026-10-10' })] },
    expected: { reason: 'PROGRAM-WAIT' },
  },
  {
    name: 'PROGRAM-WAIT beats an inspection HOLD',
    input: { rows: [mkRow({ verdict: 'HOLD', holdReason: 'inspection scheduled', submittedDate: '2026-10-10' })] },
    expected: { reason: 'PROGRAM-WAIT' },
  },
  {
    name: 'acceptedDate on any row ends PROGRAM-WAIT (→ READY TO INVOICE)',
    input: {
      rows: [
        mkRow({ rowIndex: 2, pass: 1, verdict: 'READY', reviewedAt: '2026-10-05T18:00:00Z' }),
        mkRow({ rowIndex: 3, pass: 2, verdict: 'READY', reviewedAt: '2026-10-06T18:00:00Z', submittedDate: '2026-10-07', acceptedDate: '2026-10-12' }),
      ],
    },
    expected: { reason: 'READY TO INVOICE' },
  },
  {
    name: 'returnedDate ends PROGRAM-WAIT (the open FIX shows again)',
    input: { rows: [OPEN_FIX({ submittedDate: '2026-10-07', returnedDate: '2026-10-12', returnedReason: 'Photos' })] },
    expected: { reason: 'FIX OPEN', fixPick: 'Hatch not shown', fromRowIndex: 2 },
  },
  // --- 2. HOLD ---
  {
    name: 'HOLD beats an open FIX when the latest row is an owner HOLD with blank status',
    input: {
      rows: [
        OPEN_FIX({ rowIndex: 2, reviewedAt: '2026-10-05T18:00:00Z' }),
        mkRow({ rowIndex: 3, pass: 2, verdict: 'HOLD', status: '', holdReason: 'Owner deciding on scope', reviewedAt: '2026-10-06T18:00:00Z' }),
      ],
    },
    expected: { reason: 'HOLD', fromRowIndex: 3 },
  },
  {
    name: 'HOLD with no holdReason and no status is still HOLD',
    input: { rows: [mkRow({ verdict: 'HOLD' })] },
    expected: { reason: 'HOLD', fromRowIndex: 2 },
  },
  {
    name: "HOLD that already has a status ('Accepted as is') is no hold → falls through to AWAITING 1ST REVIEW",
    input: { rows: [mkRow({ verdict: 'HOLD', status: 'Accepted as is', holdReason: 'Owner deciding' })] },
    expected: { reason: 'AWAITING 1ST REVIEW' },
  },
  {
    name: 'HOLD that is not the latest row does not hold (later pass-1 READY → AWAITING 2ND REVIEW)',
    input: {
      rows: [
        mkRow({ rowIndex: 2, verdict: 'HOLD', holdReason: 'Owner deciding', reviewedAt: '2026-10-05T18:00:00Z' }),
        mkRow({ rowIndex: 3, verdict: 'READY', reviewedAt: '2026-10-06T18:00:00Z' }),
      ],
    },
    expected: { reason: 'AWAITING 2ND REVIEW' },
  },
  // --- 3. INSPECTION/PERMIT ---
  {
    name: "INSPECTION/PERMIT beats an open FIX via latest HOLD holdReason 'inspection scheduled'",
    input: {
      rows: [
        OPEN_FIX({ rowIndex: 2, reviewedAt: '2026-10-05T18:00:00Z' }),
        mkRow({ rowIndex: 3, pass: 2, verdict: 'HOLD', holdReason: 'inspection scheduled', reviewedAt: '2026-10-06T18:00:00Z' }),
      ],
    },
    expected: { reason: 'INSPECTION/PERMIT', fromRowIndex: 3 },
  },
  {
    name: "HOLD holdReason 'Permit not yet pulled' is INSPECTION/PERMIT, not HOLD",
    input: { rows: [mkRow({ verdict: 'HOLD', holdReason: 'Permit not yet pulled' })] },
    expected: { reason: 'INSPECTION/PERMIT', fromRowIndex: 2 },
  },
  {
    name: "INSPECTION/PERMIT via job.permitStatus 'Inspection requested' beats an open FIX and has no fromRow",
    input: { job: mkJob({ permitStatus: 'Inspection requested' }), rows: [OPEN_FIX()] },
    expected: { reason: 'INSPECTION/PERMIT' },
  },
  {
    name: "permitStatus is case-insensitive ('inspection SCHEDULED')",
    input: { job: mkJob({ permitStatus: 'inspection SCHEDULED' }) },
    expected: { reason: 'INSPECTION/PERMIT' },
  },
  {
    name: "permitStatus 'Failed' → INSPECTION/PERMIT",
    input: { job: mkJob({ permitStatus: 'Failed' }) },
    expected: { reason: 'INSPECTION/PERMIT' },
  },
  {
    name: "permitStatus 'Passed' is not an inspection wait → AWAITING 1ST REVIEW",
    input: { job: mkJob({ permitStatus: 'Passed' }) },
    expected: { reason: 'AWAITING 1ST REVIEW' },
  },
  // --- 4. FIX OPEN ---
  {
    name: "FIX OPEN beats RETURN NEEDED (latest visit 'Return needed', no future visit)",
    input: {
      job: mkJob({ futureVisitCount: 0 }),
      visits: [mkVisit({ result: 'Return needed' })],
      rows: [OPEN_FIX({ fixBeforeSubmitting: 'No depth marker or ruler' })],
    },
    expected: { reason: 'FIX OPEN', fixPick: 'No depth marker or ruler', fromRowIndex: 2 },
  },
  {
    name: 'FIX closed by a later READY falls through (→ AWAITING 2ND REVIEW)',
    input: {
      rows: [OPEN_FIX({ rowIndex: 2, reviewedAt: '2026-10-05T18:00:00Z' }), mkRow({ rowIndex: 3, verdict: 'READY', reviewedAt: '2026-10-06T18:00:00Z' })],
    },
    expected: { reason: 'AWAITING 2ND REVIEW' },
  },
  {
    name: "FIX with status 'Fixed' falls through (→ AWAITING 1ST REVIEW)",
    input: { rows: [OPEN_FIX({ status: 'Fixed' })] },
    expected: { reason: 'AWAITING 1ST REVIEW' },
  },
  {
    name: "FIX with status 'Submitted' on pass 2 falls through (→ AWAITING 1ST REVIEW)",
    input: {
      rows: [
        mkRow({ rowIndex: 2, verdict: 'READY', reviewedAt: '2026-10-05T18:00:00Z' }),
        OPEN_FIX({ rowIndex: 3, pass: 2, status: 'Submitted', reviewedAt: '2026-10-06T18:00:00Z' }),
      ],
    },
    expected: { reason: 'AWAITING 1ST REVIEW' },
  },
  {
    name: 'a READY before the FIX does not close it',
    input: {
      rows: [
        mkRow({ rowIndex: 2, verdict: 'READY', reviewedAt: '2026-10-05T18:00:00Z' }),
        OPEN_FIX({ rowIndex: 3, pass: 2, fixBeforeSubmitting: 'Chimney dam not shown', reviewedAt: '2026-10-06T18:00:00Z' }),
      ],
    },
    expected: { reason: 'FIX OPEN', fixPick: 'Chimney dam not shown', fromRowIndex: 3 },
  },
  {
    name: 'checker FIX row (no pass) counts: FIX OPEN is any pass (decision 43)',
    input: { rows: [checkerRow({ checked: '2026-10-06', verdict: 'FIX', fixBeforeSubmitting: 'Undated / blurry' })] },
    expected: { reason: 'FIX OPEN', fixPick: 'Undated / blurry', fromRowIndex: 2 },
  },
  {
    name: 'FIX OPEN with no fixBeforeSubmitting has no fixPick',
    input: { rows: [OPEN_FIX({ fixBeforeSubmitting: undefined })] },
    expected: { reason: 'FIX OPEN', fromRowIndex: 2 },
  },
  {
    name: 'order is by reviewedAt, not rowIndex: READY (row 5, Oct 5) then FIX (row 4, Oct 6) → FIX OPEN',
    input: {
      rows: [
        mkRow({ rowIndex: 5, verdict: 'READY', reviewedAt: '2026-10-05T18:00:00Z' }),
        OPEN_FIX({ rowIndex: 4, reviewedAt: '2026-10-06T18:00:00Z' }),
      ],
    },
    expected: { reason: 'FIX OPEN', fixPick: 'Hatch not shown', fromRowIndex: 4 },
  },
  // --- 5. RETURN NEEDED ---
  {
    name: "RETURN NEEDED: latest visit 'Return needed' and futureVisitCount 0",
    input: { job: mkJob({ futureVisitCount: 0 }), visits: [mkVisit({ result: 'Return needed' })] },
    expected: { reason: 'RETURN NEEDED' },
  },
  {
    name: "RETURN NEEDED via 'Problem'",
    input: { job: mkJob({ futureVisitCount: 0 }), visits: [mkVisit({ result: 'Problem' })] },
    expected: { reason: 'RETURN NEEDED' },
  },
  {
    name: 'RETURN NEEDED needs futureVisitCount 0: with a return visit booked it falls through',
    input: { job: mkJob({ futureVisitCount: 1 }), visits: [mkVisit({ result: 'Return needed' })] },
    expected: { reason: 'AWAITING 1ST REVIEW' },
  },
  {
    name: "only the latest visit by startAt counts (older 'Return needed', newer 'Completed')",
    input: {
      visits: [
        mkVisit({ id: 'visit-test-1', startAt: '2026-10-02T12:00:00Z', result: 'Return needed' }),
        mkVisit({ id: 'visit-test-2', startAt: '2026-10-04T12:00:00Z', result: 'Completed' }),
      ],
    },
    expected: { reason: 'AWAITING 1ST REVIEW' },
  },
  {
    name: 'RETURN NEEDED beats BLOWER DOOR FAIL',
    input: { visits: [mkVisit({ result: 'Return needed' })], rows: [mkRow({ blowerDoorPrePost: '1,412 > 1,190' })] },
    expected: { reason: 'RETURN NEEDED' },
  },
  // --- 6. BLOWER DOOR FAIL ---
  {
    name: "BLOWER DOOR '1,412 > 1,190' (15.7 %) fails",
    input: { rows: [mkRow({ blowerDoorPrePost: '1,412 > 1,190' })] },
    expected: { reason: 'BLOWER DOOR FAIL' },
  },
  {
    name: "BLOWER DOOR '2,094 > 1,439 (31.3%)' passes",
    input: { rows: [mkRow({ blowerDoorPrePost: '2,094 > 1,439 (31.3%)' })] },
    expected: { reason: 'AWAITING 1ST REVIEW' },
  },
  {
    name: "BLOWER DOOR 'n/a' never fails a job",
    input: { rows: [mkRow({ blowerDoorPrePost: 'n/a' })] },
    expected: { reason: 'AWAITING 1ST REVIEW' },
  },
  {
    name: 'BLOWER DOOR FAIL beats FORM/QUANTITIES MISSING',
    input: { visits: [mkVisit({ incompleteJobFormsCount: 1 })], rows: [mkRow({ blowerDoorPrePost: '1,412 > 1,190' })] },
    expected: { reason: 'BLOWER DOOR FAIL' },
  },
  {
    name: 'a failing reading on an older checker row still fails (any row)',
    input: {
      rows: [
        checkerRow({ rowIndex: 2, checked: '2026-10-05', blowerDoorPrePost: '1,412 > 1,190' }),
        mkRow({ rowIndex: 3, verdict: 'READY', reviewedAt: '2026-10-06T18:00:00Z' }),
      ],
    },
    expected: { reason: 'BLOWER DOOR FAIL' },
  },
  // --- 7. FORM/QUANTITIES MISSING ---
  {
    name: 'FORM/QUANTITIES MISSING via a completed visit with incompleteJobFormsCount > 0',
    input: { visits: [mkVisit({ incompleteJobFormsCount: 2 })] },
    expected: { reason: 'FORM/QUANTITIES MISSING' },
  },
  {
    name: "FORM/QUANTITIES MISSING via latest row's fixBeforeSubmitting 'form unsigned' (FIX already marked Fixed)",
    input: { rows: [OPEN_FIX({ status: 'Fixed', fixBeforeSubmitting: 'form unsigned' })] },
    expected: { reason: 'FORM/QUANTITIES MISSING' },
  },
  {
    name: "'Quantities missing' pick on the latest row → FORM/QUANTITIES MISSING",
    input: { rows: [OPEN_FIX({ status: 'Accepted as is', fixBeforeSubmitting: 'Quantities missing' })] },
    expected: { reason: 'FORM/QUANTITIES MISSING' },
  },
  {
    name: 'unanswered forms on a visit that is not completed do not count',
    input: { visits: [mkVisit({ isComplete: false, completedAt: undefined, result: undefined, resultAt: undefined, resultSource: 'unknown', incompleteJobFormsCount: 1 })] },
    expected: { reason: 'AWAITING 1ST REVIEW' },
  },
  {
    name: 'FORM/QUANTITIES MISSING beats AWAITING 2ND REVIEW',
    input: { visits: [mkVisit({ incompleteJobFormsCount: 1 })], rows: [mkRow({ verdict: 'READY' })] },
    expected: { reason: 'FORM/QUANTITIES MISSING' },
  },
  // --- 8. AWAITING 2ND REVIEW / 9. READY TO INVOICE / 10. default ---
  {
    name: 'AWAITING 2ND REVIEW: latest pass-1 row READY and no pass-2 row',
    input: { rows: [mkRow({ verdict: 'READY' })] },
    expected: { reason: 'AWAITING 2ND REVIEW' },
  },
  {
    name: 'READY TO INVOICE: latest pass-2 row READY',
    input: {
      rows: [
        mkRow({ rowIndex: 2, pass: 1, verdict: 'READY', reviewedAt: '2026-10-05T18:00:00Z' }),
        mkRow({ rowIndex: 3, pass: 2, verdict: 'READY', reviewedAt: '2026-10-06T18:00:00Z' }),
      ],
    },
    expected: { reason: 'READY TO INVOICE' },
  },
  {
    name: 'pass-2 READY without any pass-1 row is still READY TO INVOICE',
    input: { rows: [mkRow({ pass: 2, verdict: 'READY' })] },
    expected: { reason: 'READY TO INVOICE' },
  },
  {
    name: 'default AWAITING 1ST REVIEW with no rows and a clean completed visit',
    input: { visits: [mkVisit()], rows: [] },
    expected: { reason: 'AWAITING 1ST REVIEW' },
  },
  {
    name: 'checker READY (no pass) is not a first-pass verdict (decision 43) → AWAITING 1ST REVIEW',
    input: { rows: [checkerRow({ checked: '2026-10-05', verdict: 'READY' })] },
    expected: { reason: 'AWAITING 1ST REVIEW' },
  },
  {
    name: 'pass-1 READY then a later pass-1 FIX marked Fixed: latest pass-1 is not READY → AWAITING 1ST REVIEW',
    input: {
      rows: [
        mkRow({ rowIndex: 2, verdict: 'READY', reviewedAt: '2026-10-05T18:00:00Z' }),
        OPEN_FIX({ rowIndex: 3, status: 'Fixed', reviewedAt: '2026-10-06T18:00:00Z' }),
      ],
    },
    expected: { reason: 'AWAITING 1ST REVIEW' },
  },
];

describe('cannotInvoiceReason (decisions 30, 31, 43)', () => {
  it.each(REASON_CASES)('$name', ({ input, expected }) => {
    const out = cannotInvoiceReason(input.job ?? mkJob(), input.visits ?? [mkVisit()], input.rows ?? []);
    expect(out.reason).toBe(expected.reason);
    expect(out.fixPick).toBe(expected.fixPick);
    expect(out.fromRow?.rowIndex).toBe(expected.fromRowIndex);
  });
});

// ---------------------------------------------------------------------------------------------
// stageClocks (decision 31)
// ---------------------------------------------------------------------------------------------

describe('stageClocks (decision 31)', () => {
  it.each<{ name: string; input: { job?: Job; visits?: Visit[]; rows?: ReviewRow[] }; expected: Partial<Record<Stage, Instant>> }>([
    {
      name: 'completed = max completedAt over two completed visits (job.completedAt ignored)',
      input: {
        job: mkJob({ completedAt: '2026-10-02T20:00:00Z' }),
        visits: [
          mkVisit({ id: 'visit-test-1', completedAt: '2026-10-03T20:00:00Z' }),
          mkVisit({ id: 'visit-test-2', completedAt: T_COMPLETED }),
        ],
      },
      expected: { completed: T_COMPLETED },
    },
    {
      name: 'completed falls back to job.completedAt when no visit has completedAt',
      input: { job: mkJob({ completedAt: '2026-10-02T20:00:00Z' }), visits: [mkVisit({ completedAt: undefined })] },
      expected: { completed: '2026-10-02T20:00:00Z' },
    },
    {
      name: 'no visit completedAt and no job.completedAt → no completed clock',
      input: { job: mkJob(), visits: [mkVisit({ completedAt: undefined })] },
      expected: {},
    },
    {
      name: 'first_review = earliest reviewedAt among pass-1 rows; a checker row with an earlier date is ignored',
      input: {
        visits: [],
        rows: [
          checkerRow({ rowIndex: 2, checked: '2026-10-05' }),
          mkRow({ rowIndex: 3, pass: 1, reviewedAt: '2026-10-08T18:00:00Z' }),
          mkRow({ rowIndex: 4, pass: 1, reviewedAt: T_FIRST }),
        ],
      },
      expected: { first_review: T_FIRST },
    },
    {
      name: 'first_review falls back to the checked date at local noon when the pass-1 row has no reviewedAt',
      input: { visits: [], rows: [mkRow({ pass: 1, reviewedAt: undefined, checked: '2026-10-07' })] },
      expected: { first_review: '2026-10-07T16:00:00.000Z' },
    },
    {
      name: 'second_review = earliest reviewedAt among pass-2 rows',
      input: {
        visits: [],
        rows: [mkRow({ rowIndex: 2, pass: 2, reviewedAt: '2026-10-11T18:00:00Z' }), mkRow({ rowIndex: 3, pass: 2, reviewedAt: T_SECOND })],
      },
      expected: { second_review: T_SECOND },
    },
    {
      name: 'submitted and accepted are the earliest sheet dates at local noon',
      input: {
        visits: [],
        rows: [
          mkRow({ rowIndex: 2, pass: 2, reviewedAt: T_SECOND, submittedDate: '2026-10-12', acceptedDate: '2026-10-13' }),
          mkRow({ rowIndex: 3, pass: 2, reviewedAt: '2026-10-11T18:00:00Z', submittedDate: '2026-10-11' }),
        ],
      },
      expected: { second_review: T_SECOND, submitted: '2026-10-11T16:00:00.000Z', accepted: T_ACCEPTED },
    },
    {
      name: 'all five clocks',
      input: {
        visits: [mkVisit()],
        rows: [
          mkRow({ rowIndex: 2, pass: 1, reviewedAt: T_FIRST, verdict: 'READY' }),
          mkRow({ rowIndex: 3, pass: 2, reviewedAt: T_SECOND, verdict: 'READY', submittedDate: '2026-10-12', acceptedDate: '2026-10-13' }),
        ],
      },
      expected: { completed: T_COMPLETED, first_review: T_FIRST, second_review: T_SECOND, submitted: T_SUBMITTED, accepted: T_ACCEPTED },
    },
  ])('$name', ({ input, expected }) => {
    expect(stageClocks(input.job ?? mkJob(), input.visits ?? [mkVisit()], input.rows ?? [])).toStrictEqual(expected);
  });
});

// ---------------------------------------------------------------------------------------------
// openStage
// ---------------------------------------------------------------------------------------------

describe('openStage', () => {
  it.each<{ name: string; input: Partial<Record<Stage, Instant>>; expected: Stage }>([
    { name: 'no clocks → completed', input: {}, expected: 'completed' },
    { name: 'completed → first_review', input: { completed: T_COMPLETED }, expected: 'first_review' },
    { name: 'completed + first_review → second_review', input: { completed: T_COMPLETED, first_review: T_FIRST }, expected: 'second_review' },
    {
      name: '… + second_review → submitted',
      input: { completed: T_COMPLETED, first_review: T_FIRST, second_review: T_SECOND },
      expected: 'submitted',
    },
    {
      name: '… + submitted → accepted',
      input: { completed: T_COMPLETED, first_review: T_FIRST, second_review: T_SECOND, submitted: T_SUBMITTED },
      expected: 'accepted',
    },
    {
      name: 'every clock set → accepted (nothing left open)',
      input: { completed: T_COMPLETED, first_review: T_FIRST, second_review: T_SECOND, submitted: T_SUBMITTED, accepted: T_ACCEPTED },
      expected: 'accepted',
    },
    { name: 'a gap counts: first_review without completed → completed', input: { first_review: T_FIRST }, expected: 'completed' },
  ])('$name', ({ input, expected }) => {
    expect(openStage(input)).toBe(expected);
  });
});

// ---------------------------------------------------------------------------------------------
// stageDays (decision 31)
// ---------------------------------------------------------------------------------------------

const FULL_CLOCKS: Partial<Record<Stage, Instant>> = {
  completed: T_COMPLETED,
  first_review: T_FIRST,
  second_review: T_SECOND,
  submitted: T_SUBMITTED,
  accepted: T_ACCEPTED,
};

describe('stageDays (decision 31)', () => {
  it.each<{
    name: string;
    input: { reason: Reason; clocks?: Partial<Record<Stage, Instant>>; visits?: Visit[]; fromRow?: ReviewRow; now?: Instant };
    expected: number;
  }>([
    { name: 'AWAITING 1ST REVIEW → since completed (10)', input: { reason: 'AWAITING 1ST REVIEW' }, expected: 10 },
    { name: 'AWAITING 2ND REVIEW → since first_review (7)', input: { reason: 'AWAITING 2ND REVIEW' }, expected: 7 },
    {
      name: 'FIX OPEN from a row → since fromRow.reviewedAt (5)',
      input: { reason: 'FIX OPEN', fromRow: OPEN_FIX({ reviewedAt: '2026-10-09T18:00:00Z' }) },
      expected: 5,
    },
    {
      name: 'FIX OPEN from a row with no reviewedAt → since completed (10)',
      input: { reason: 'FIX OPEN', fromRow: OPEN_FIX({ reviewedAt: undefined, checked: '2026-10-09' }) },
      expected: 10,
    },
    { name: 'FIX OPEN without a row → since completed (10)', input: { reason: 'FIX OPEN' }, expected: 10 },
    {
      name: 'HOLD from a row → since fromRow.reviewedAt (5)',
      input: { reason: 'HOLD', fromRow: mkRow({ verdict: 'HOLD', reviewedAt: '2026-10-09T18:00:00Z' }) },
      expected: 5,
    },
    {
      name: 'INSPECTION/PERMIT from a HOLD row → since fromRow.reviewedAt (5)',
      input: { reason: 'INSPECTION/PERMIT', fromRow: mkRow({ verdict: 'HOLD', holdReason: 'inspection', reviewedAt: '2026-10-09T18:00:00Z' }) },
      expected: 5,
    },
    { name: 'INSPECTION/PERMIT from permitStatus (no row) → since completed (10)', input: { reason: 'INSPECTION/PERMIT' }, expected: 10 },
    { name: 'BLOWER DOOR FAIL → since completed (10)', input: { reason: 'BLOWER DOOR FAIL' }, expected: 10 },
    { name: 'FORM/QUANTITIES MISSING → since completed (10)', input: { reason: 'FORM/QUANTITIES MISSING' }, expected: 10 },
    {
      name: "RETURN NEEDED → since the latest visit's resultAt (3)",
      input: { reason: 'RETURN NEEDED', visits: [mkVisit({ result: 'Return needed', resultAt: '2026-10-11T18:00:00Z' })] },
      expected: 3,
    },
    {
      name: 'RETURN NEEDED with no resultAt → since the visit completedAt (4)',
      input: { reason: 'RETURN NEEDED', visits: [mkVisit({ result: 'Return needed', resultAt: undefined, completedAt: '2026-10-10T18:00:00Z' })] },
      expected: 4,
    },
    { name: 'RETURN NEEDED with no visits → since completed (10)', input: { reason: 'RETURN NEEDED', visits: [] }, expected: 10 },
    {
      name: 'RETURN NEEDED picks the latest visit by startAt, not the first in the list',
      input: {
        reason: 'RETURN NEEDED',
        visits: [
          mkVisit({ id: 'visit-test-2', startAt: '2026-10-12T12:00:00Z', result: 'Return needed', resultAt: '2026-10-12T18:00:00Z' }),
          mkVisit({ id: 'visit-test-1', startAt: '2026-10-04T12:00:00Z', result: 'Completed', resultAt: T_COMPLETED }),
        ],
      },
      expected: 2,
    },
    { name: 'READY TO INVOICE → since second_review (4)', input: { reason: 'READY TO INVOICE' }, expected: 4 },
    { name: 'PROGRAM-WAIT → since submitted (2)', input: { reason: 'PROGRAM-WAIT' }, expected: 2 },
    { name: 'missing clock → 0 (AWAITING 2ND REVIEW with no first_review)', input: { reason: 'AWAITING 2ND REVIEW', clocks: { completed: T_COMPLETED } }, expected: 0 },
    { name: 'no clocks at all → 0', input: { reason: 'AWAITING 1ST REVIEW', clocks: {} }, expected: 0 },
    {
      name: 'a clock ahead of now clamps at 0',
      input: { reason: 'AWAITING 1ST REVIEW', clocks: { completed: '2026-10-20T20:00:00Z' } },
      expected: 0,
    },
    {
      name: 'days are local calendar days: 23:00 local Oct 13 → 07:00 local Oct 14 is 1 day',
      input: { reason: 'AWAITING 1ST REVIEW', clocks: { completed: '2026-10-14T03:00:00Z' } },
      expected: 1,
    },
  ])('$name', ({ input, expected }) => {
    expect(stageDays(input.reason, input.clocks ?? FULL_CLOCKS, input.visits ?? [], input.fromRow, input.now ?? NOW)).toBe(expected);
  });
});

// ---------------------------------------------------------------------------------------------
// lineColour (decision 31): amber at 3, red at 7, hard red at 20 unsubmitted, PROGRAM-WAIT grey
// ---------------------------------------------------------------------------------------------

describe('lineColour (decision 31)', () => {
  it.each<{
    name: string;
    input: { reason: Reason; stageDays: number; daysSinceCompleted: number; submitted: boolean };
    expected: { colour: CannotInvoiceLine['colour']; hardRed: boolean };
  }>([
    { name: 'stageDays 2 → none', input: { reason: 'AWAITING 1ST REVIEW', stageDays: 2, daysSinceCompleted: 2, submitted: false }, expected: { colour: 'none', hardRed: false } },
    { name: 'stageDays 3 → amber', input: { reason: 'AWAITING 1ST REVIEW', stageDays: 3, daysSinceCompleted: 3, submitted: false }, expected: { colour: 'amber', hardRed: false } },
    { name: 'stageDays 6 → amber', input: { reason: 'FIX OPEN', stageDays: 6, daysSinceCompleted: 9, submitted: false }, expected: { colour: 'amber', hardRed: false } },
    { name: 'stageDays 7 → red', input: { reason: 'FIX OPEN', stageDays: 7, daysSinceCompleted: 9, submitted: false }, expected: { colour: 'red', hardRed: false } },
    { name: 'stageDays 0 → none', input: { reason: 'READY TO INVOICE', stageDays: 0, daysSinceCompleted: 5, submitted: false }, expected: { colour: 'none', hardRed: false } },
    { name: 'PROGRAM-WAIT → grey even at 10 stage days', input: { reason: 'PROGRAM-WAIT', stageDays: 10, daysSinceCompleted: 15, submitted: true }, expected: { colour: 'grey', hardRed: false } },
    { name: 'daysSinceCompleted 19 unsubmitted → not hard red', input: { reason: 'HOLD', stageDays: 1, daysSinceCompleted: 19, submitted: false }, expected: { colour: 'none', hardRed: false } },
    { name: 'daysSinceCompleted 20 unsubmitted → hard red forces red', input: { reason: 'HOLD', stageDays: 1, daysSinceCompleted: 20, submitted: false }, expected: { colour: 'red', hardRed: true } },
    { name: 'daysSinceCompleted 20 submitted → no hard red', input: { reason: 'HOLD', stageDays: 1, daysSinceCompleted: 20, submitted: true }, expected: { colour: 'none', hardRed: false } },
    { name: 'submitted lines still colour by stage days (amber at 5)', input: { reason: 'AWAITING 2ND REVIEW', stageDays: 5, daysSinceCompleted: 25, submitted: true }, expected: { colour: 'amber', hardRed: false } },
    { name: 'PROGRAM-WAIT at 30 days stays grey (submitted, so hard red cannot apply)', input: { reason: 'PROGRAM-WAIT', stageDays: 0, daysSinceCompleted: 30, submitted: true }, expected: { colour: 'grey', hardRed: false } },
  ])('$name', ({ input, expected }) => {
    expect(lineColour(input.reason, input.stageDays, input.daysSinceCompleted, input.submitted)).toStrictEqual(expected);
  });
});

// ---------------------------------------------------------------------------------------------
// buildCannotInvoiceLine: assembly
// ---------------------------------------------------------------------------------------------

describe('buildCannotInvoiceLine', () => {
  it.each<{
    name: string;
    input: { job?: Job; visits?: Visit[]; rows?: ReviewRow[]; owner?: Owner; tags?: Array<'NO-REMINDER' | 'NO CHARGE?'> };
    expected: CannotInvoiceLine;
  }>([
    {
      name: 'FIX OPEN line: label, fixPick, clocks, open stage, amber at 5 stage days, tags pass through',
      input: {
        visits: [mkVisit()],
        rows: [OPEN_FIX({ reviewedAt: '2026-10-09T18:00:00Z' })],
        owner: CREW,
        tags: ['NO-REMINDER'],
      },
      expected: {
        jobId: 'job-test-1',
        label: 'NOWAK · TESTVILLE · ATT',
        reason: 'FIX OPEN',
        fixPick: 'Hatch not shown',
        owner: CREW,
        clocks: { completed: T_COMPLETED, first_review: '2026-10-09T18:00:00Z' },
        openStage: 'second_review',
        stageDays: 5,
        daysSinceCompleted: 10,
        colour: 'amber',
        hardRed: false,
        tags: ['NO-REMINDER'],
      },
    },
    {
      name: 'PROGRAM-WAIT line is grey with the program clock, no fixPick key',
      input: {
        visits: [mkVisit()],
        rows: [
          mkRow({ rowIndex: 2, pass: 1, verdict: 'READY', reviewedAt: T_FIRST }),
          mkRow({ rowIndex: 3, pass: 2, verdict: 'READY', reviewedAt: T_SECOND, submittedDate: '2026-10-12' }),
        ],
        owner: OFFICE,
        tags: [],
      },
      expected: {
        jobId: 'job-test-1',
        label: 'NOWAK · TESTVILLE · ATT',
        reason: 'PROGRAM-WAIT',
        owner: OFFICE,
        clocks: { completed: T_COMPLETED, first_review: T_FIRST, second_review: T_SECOND, submitted: T_SUBMITTED },
        openStage: 'accepted',
        stageDays: 2,
        daysSinceCompleted: 10,
        colour: 'grey',
        hardRed: false,
        tags: [],
      },
    },
    {
      name: 'hard red: completed 20 days ago, never submitted, no review yet',
      input: {
        visits: [mkVisit({ completedAt: '2026-09-24T20:00:00Z', resultAt: '2026-09-24T20:00:00Z' })],
        rows: [],
        owner: OFFICE,
        tags: ['NO CHARGE?'],
      },
      expected: {
        jobId: 'job-test-1',
        label: 'NOWAK · TESTVILLE · ATT',
        reason: 'AWAITING 1ST REVIEW',
        owner: OFFICE,
        clocks: { completed: '2026-09-24T20:00:00Z' },
        openStage: 'first_review',
        stageDays: 20,
        daysSinceCompleted: 20,
        colour: 'red',
        hardRed: true,
        tags: ['NO CHARGE?'],
      },
    },
    {
      name: 'no completed clock: daysSinceCompleted falls back to job.updatedAt, stageDays 0',
      input: {
        job: mkJob({ updatedAt: '2026-10-11T20:00:00Z', bucketSince: '2026-10-11T20:00:00Z' }),
        visits: [],
        rows: [],
        owner: OFFICE,
        tags: [],
      },
      expected: {
        jobId: 'job-test-1',
        label: 'NOWAK · TESTVILLE · ATT',
        reason: 'AWAITING 1ST REVIEW',
        owner: OFFICE,
        clocks: {},
        openStage: 'completed',
        stageDays: 0,
        daysSinceCompleted: 3,
        colour: 'none',
        hardRed: false,
        tags: [],
      },
    },
    {
      name: 'label is uppercased with middle dots from mixed-case job fields (decision 4)',
      input: {
        job: mkJob({ id: 'job-test-2', lastName: 'de Vries', city: 'Grand Rapids', scope: 'BD', permitStatus: 'Inspection scheduled' }),
        visits: [mkVisit({ jobId: 'job-test-2' })],
        rows: [],
        owner: OFFICE,
        tags: [],
      },
      expected: {
        jobId: 'job-test-2',
        label: 'DE VRIES · GRAND RAPIDS · BD',
        reason: 'INSPECTION/PERMIT',
        owner: OFFICE,
        clocks: { completed: T_COMPLETED },
        openStage: 'first_review',
        stageDays: 10,
        daysSinceCompleted: 10,
        colour: 'red',
        hardRed: false,
        tags: [],
      },
    },
  ])('$name', ({ input, expected }) => {
    const line = buildCannotInvoiceLine({
      job: input.job ?? mkJob(),
      visits: input.visits ?? [mkVisit()],
      rows: input.rows ?? [],
      now: NOW,
      owner: input.owner ?? OFFICE,
      tags: input.tags ?? [],
    });
    expect(line).toStrictEqual(expected);
    expect(line.label).toMatch(/^[A-Z '\-]+ · [A-Z '\-]+ · [A-Z—]+$/);
  });
});
