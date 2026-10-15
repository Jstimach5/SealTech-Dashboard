import { describe, expect, it } from 'vitest';
import type { Job } from '../src/types.js';
import { cannotInvoiceCandidates, isLeakedJob, isNoChargeCandidate, leakTags, type LeakTag } from '../src/derive/leak.js';

/** 07:00 local, Wed Oct 14 2026 (EDT, offset -240). */
const COMPLETED_AT = '2026-10-14T11:00:00Z';

/** A plain, not-yet-completed upcoming job. Every case states its own deviations. */
function mkJob(over: Partial<Job> = {}): Job {
  return {
    id: 'job-test-1',
    jobNumber: 1001,
    title: 'STD ATT',
    lastName: 'Nowak',
    city: 'Testville',
    scope: 'ATT',
    program: 'STANDARD',
    bucket: 'upcoming',
    bucketSince: '2026-10-10T11:00:00Z',
    bucketSinceSource: 'updatedAt',
    updatedAt: '2026-10-10T11:00:00Z',
    invoiced: false,
    isZeroTotal: false,
    hasUninvoicedWork: false,
    futureVisitCount: 1,
    visitIds: [],
    noteLines: [],
    ...over,
  };
}

/** The canonical leaked job: completed, no future visit, uninvoiced work, sitting in Today. */
function leaked(over: Partial<Job> = {}): Job {
  return mkJob({ completedAt: COMPLETED_AT, futureVisitCount: 0, hasUninvoicedWork: true, bucket: 'today', ...over });
}

interface TagCase {
  name: string;
  input: Job;
  expected: LeakTag[];
}

const TAG_CASES: TagCase[] = [
  // --- NO-REMINDER (plan §B) ---
  { name: 'leaked job (completed, no future visits, uninvoiced, bucket today) → NO-REMINDER', input: leaked(), expected: ['NO-REMINDER'] },
  { name: 'same but bucket requires_invoicing → [] (Jobber already flags it)', input: leaked({ bucket: 'requires_invoicing' }), expected: [] },
  { name: 'same but futureVisitCount 1 → [] (work still scheduled)', input: leaked({ futureVisitCount: 1 }), expected: [] },
  { name: 'same but hasUninvoicedWork false → [] (nothing to invoice)', input: leaked({ hasUninvoicedWork: false }), expected: [] },
  { name: 'not completed → []', input: mkJob({ futureVisitCount: 0, hasUninvoicedWork: true, bucket: 'today' }), expected: [] },
  { name: 'archived never leaked', input: leaked({ bucket: 'archived' }), expected: [] },
  { name: 'leaked in unscheduled → NO-REMINDER', input: leaked({ bucket: 'unscheduled' }), expected: ['NO-REMINDER'] },
  { name: 'leaked in upcoming → NO-REMINDER', input: leaked({ bucket: 'upcoming' }), expected: ['NO-REMINDER'] },
  { name: 'leaked in late → NO-REMINDER', input: leaked({ bucket: 'late' }), expected: ['NO-REMINDER'] },
  { name: 'leaked in action_required → NO-REMINDER', input: leaked({ bucket: 'action_required' }), expected: ['NO-REMINDER'] },
  { name: 'leaked in on_hold → NO-REMINDER', input: leaked({ bucket: 'on_hold' }), expected: ['NO-REMINDER'] },
  // --- remindersOff is not consulted (field not yet readable) ---
  { name: 'remindersOff false does not clear the tag', input: leaked({ remindersOff: false }), expected: ['NO-REMINDER'] },
  { name: 'remindersOff true alone does not create the tag', input: mkJob({ remindersOff: true }), expected: [] },
  // --- NO CHARGE? (plan §B) ---
  { name: 'zero-total in requires_invoicing → NO CHARGE?', input: mkJob({ isZeroTotal: true, bucket: 'requires_invoicing' }), expected: ['NO CHARGE?'] },
  { name: 'zero-total leaked → both tags, NO-REMINDER first', input: leaked({ isZeroTotal: true }), expected: ['NO-REMINDER', 'NO CHARGE?'] },
  { name: 'zero-total upcoming not completed → []', input: mkJob({ isZeroTotal: true, bucket: 'upcoming' }), expected: [] },
  { name: 'zero-total archived → [] (closed jobs are never questioned)', input: leaked({ isZeroTotal: true, bucket: 'archived' }), expected: [] },
  { name: 'zero-total completed in today with a future visit → [] (not leaked, not in requires_invoicing)', input: leaked({ isZeroTotal: true, futureVisitCount: 1 }), expected: [] },
  { name: 'non-zero total in requires_invoicing → []', input: mkJob({ isZeroTotal: false, bucket: 'requires_invoicing' }), expected: [] },
];

describe('leakTags (plan §B, decision 32)', () => {
  it.each(TAG_CASES)('$name', ({ input, expected }) => {
    expect(leakTags(input)).toEqual(expected);
  });

  it('isLeakedJob and isNoChargeCandidate agree with the tag list on every case', () => {
    for (const { input, expected } of TAG_CASES) {
      expect(isLeakedJob(input)).toBe(expected.includes('NO-REMINDER'));
      expect(isNoChargeCandidate(input)).toBe(expected.includes('NO CHARGE?'));
    }
  });
});

interface CandidatesCase {
  name: string;
  input: Job[];
  /** Expected jobNumbers in order. */
  expected: number[];
}

const CANDIDATE_CASES: CandidatesCase[] = [
  { name: 'empty → []', input: [], expected: [] },
  {
    name: 'requires_invoicing jobs are included as-is (Jobber bucket wins, no completed/uninvoiced check)',
    input: [mkJob({ id: 'job-test-ri', jobNumber: 1010, bucket: 'requires_invoicing', hasUninvoicedWork: false })],
    expected: [1010],
  },
  {
    name: 'leaked jobs are included alongside requires_invoicing',
    input: [
      mkJob({ id: 'job-test-ri', jobNumber: 1010, bucket: 'requires_invoicing' }),
      leaked({ id: 'job-test-leak', jobNumber: 1003 }),
    ],
    expected: [1003, 1010],
  },
  {
    name: 'mixed list: sorted by jobNumber regardless of input order; upcoming, archived and completed-with-future-visit stay out',
    input: [
      mkJob({ id: 'job-test-ri-b', jobNumber: 1010, bucket: 'requires_invoicing' }),
      mkJob({ id: 'job-test-up', jobNumber: 1001, bucket: 'upcoming' }),
      leaked({ id: 'job-test-arch', jobNumber: 1002, bucket: 'archived' }),
      leaked({ id: 'job-test-leak', jobNumber: 1003 }),
      leaked({ id: 'job-test-future', jobNumber: 1004, futureVisitCount: 2 }),
      mkJob({ id: 'job-test-ri-a', jobNumber: 1005, bucket: 'requires_invoicing' }),
      leaked({ id: 'job-test-noinv', jobNumber: 1006, hasUninvoicedWork: false }),
    ],
    expected: [1003, 1005, 1010],
  },
  {
    name: 'zero-total leaked job is a candidate too (it carries both tags)',
    input: [leaked({ id: 'job-test-zero', jobNumber: 1007, isZeroTotal: true })],
    expected: [1007],
  },
  {
    name: 'not completed in today is not a candidate',
    input: [mkJob({ id: 'job-test-today', jobNumber: 1008, bucket: 'today', futureVisitCount: 0, hasUninvoicedWork: true })],
    expected: [],
  },
];

describe('cannotInvoiceCandidates (decision 32: listed, never added to the hero)', () => {
  it.each(CANDIDATE_CASES)('$name', ({ input, expected }) => {
    expect(cannotInvoiceCandidates(input).map((j) => j.jobNumber)).toEqual(expected);
  });

  it('does not mutate the input array', () => {
    const input = [
      mkJob({ id: 'job-test-ri', jobNumber: 1010, bucket: 'requires_invoicing' }),
      leaked({ id: 'job-test-leak', jobNumber: 1003 }),
    ];
    const before = input.map((j) => j.id);
    cannotInvoiceCandidates(input);
    expect(input.map((j) => j.id)).toEqual(before);
  });

  it('returns the same Job objects, not copies', () => {
    const job = leaked({ id: 'job-test-leak', jobNumber: 1003 });
    expect(cannotInvoiceCandidates([job])[0]).toBe(job);
  });
});
