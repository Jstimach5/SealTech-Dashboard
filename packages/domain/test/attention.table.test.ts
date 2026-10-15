import { describe, expect, it } from 'vitest';
import type { AttentionBucket, Bucket } from '../src/enums.js';
import type { AttentionLine, Job, Owner } from '../src/types.js';
import { attentionLines, attentionSince, type BucketSeen } from '../src/derive/attention.js';

/** 07:00 local, Wed Oct 14 2026 (EDT, offset -240). */
const NOW = '2026-10-14T11:00:00Z';

const OFFICE: Owner = { role: 'OFFICE' };
const officeOwner = (): Owner => OFFICE;

function job(over: Partial<Job> & { id: string; bucket: Bucket }): Job {
  return {
    jobNumber: 1001,
    title: 'STD ATT',
    lastName: 'Nowak',
    city: 'Testville',
    scope: 'ATT',
    program: 'STANDARD',
    bucketSince: '2026-10-10T11:00:00Z',
    bucketSinceSource: 'updatedAt',
    updatedAt: '2026-10-10T11:00:00Z',
    invoiced: false,
    isZeroTotal: false,
    hasUninvoicedWork: true,
    futureVisitCount: 0,
    visitIds: [],
    noteLines: [],
    ...over,
  };
}

interface LinesCase {
  name: string;
  input: {
    jobs: Job[];
    bucketSeen?: BucketSeen;
    now?: string;
    ownerFor?: (job: Job, kind: AttentionBucket) => Owner;
  };
  /** Partial lines in expected order; length must match exactly. */
  expected: Array<Partial<AttentionLine>>;
}

const LINES_CASES: LinesCase[] = [
  // --- three buckets in (decision 29) ---
  {
    name: 'late → one line of kind late',
    input: { jobs: [job({ id: 'job-test-1', bucket: 'late' })] },
    expected: [{ kind: 'late', jobId: 'job-test-1' }],
  },
  {
    name: 'action_required → one line of kind action_required',
    input: { jobs: [job({ id: 'job-test-1', bucket: 'action_required' })] },
    expected: [{ kind: 'action_required', jobId: 'job-test-1' }],
  },
  {
    name: 'requires_invoicing → one line of kind requires_invoicing',
    input: { jobs: [job({ id: 'job-test-1', bucket: 'requires_invoicing' })] },
    expected: [{ kind: 'requires_invoicing', jobId: 'job-test-1' }],
  },
  // --- five buckets out ---
  { name: 'unscheduled never appears', input: { jobs: [job({ id: 'job-test-1', bucket: 'unscheduled' })] }, expected: [] },
  { name: 'upcoming never appears', input: { jobs: [job({ id: 'job-test-1', bucket: 'upcoming' })] }, expected: [] },
  { name: 'today never appears', input: { jobs: [job({ id: 'job-test-1', bucket: 'today' })] }, expected: [] },
  { name: 'on_hold never appears', input: { jobs: [job({ id: 'job-test-1', bucket: 'on_hold' })] }, expected: [] },
  { name: 'archived never appears', input: { jobs: [job({ id: 'job-test-1', bucket: 'archived' })] }, expected: [] },
  {
    name: 'archived never appears even when bucketSeen has an entry for it (line lives exactly while the bucket does)',
    input: {
      jobs: [job({ id: 'job-test-1', bucket: 'archived' })],
      bucketSeen: { 'job-test-1': { archived: '2026-10-01T11:00:00Z', late: '2026-09-20T11:00:00Z' } },
    },
    expected: [],
  },
  {
    name: 'mixed list keeps only the three attention buckets',
    input: {
      jobs: [
        job({ id: 'job-test-1', bucket: 'today', jobNumber: 1 }),
        job({ id: 'job-test-2', bucket: 'late', jobNumber: 2 }),
        job({ id: 'job-test-3', bucket: 'archived', jobNumber: 3 }),
        job({ id: 'job-test-4', bucket: 'requires_invoicing', jobNumber: 4 }),
        job({ id: 'job-test-5', bucket: 'on_hold', jobNumber: 5 }),
      ],
    },
    expected: [
      { kind: 'late', jobId: 'job-test-2' },
      { kind: 'requires_invoicing', jobId: 'job-test-4' },
    ],
  },
  // --- ordering ---
  {
    name: 'order across kinds is late, action_required, requires_invoicing regardless of input order',
    input: {
      jobs: [
        job({ id: 'job-test-ri', bucket: 'requires_invoicing', jobNumber: 1 }),
        job({ id: 'job-test-ar', bucket: 'action_required', jobNumber: 2 }),
        job({ id: 'job-test-late', bucket: 'late', jobNumber: 3 }),
      ],
    },
    expected: [
      { kind: 'late', jobId: 'job-test-late' },
      { kind: 'action_required', jobId: 'job-test-ar' },
      { kind: 'requires_invoicing', jobId: 'job-test-ri' },
    ],
  },
  {
    name: 'within a kind the oldest sinceAt comes first',
    input: {
      jobs: [
        job({ id: 'job-test-new', bucket: 'late', jobNumber: 1, updatedAt: '2026-10-12T11:00:00Z' }),
        job({ id: 'job-test-old', bucket: 'late', jobNumber: 2, updatedAt: '2026-10-01T11:00:00Z' }),
      ],
    },
    expected: [
      { jobId: 'job-test-old', ageDays: 13 },
      { jobId: 'job-test-new', ageDays: 2 },
    ],
  },
  {
    name: 'within a kind, equal sinceAt falls back to jobNumber ascending',
    input: {
      jobs: [
        job({ id: 'job-test-b', bucket: 'late', jobNumber: 1010 }),
        job({ id: 'job-test-a', bucket: 'late', jobNumber: 1005 }),
      ],
    },
    expected: [{ jobId: 'job-test-a' }, { jobId: 'job-test-b' }],
  },
  {
    name: 'age ordering compares instants, not strings (offset form vs Z form)',
    input: {
      jobs: [
        // '2026-10-13T07:00:00-04:00' is 11:00Z; it sorts before '…T10:00:00Z' as text but is the newer instant.
        job({ id: 'job-test-offset', bucket: 'late', jobNumber: 1, updatedAt: '2026-10-13T07:00:00-04:00' }),
        job({ id: 'job-test-z', bucket: 'late', jobNumber: 2, updatedAt: '2026-10-13T10:00:00Z' }),
      ],
    },
    expected: [{ jobId: 'job-test-z' }, { jobId: 'job-test-offset' }],
  },
  {
    name: 'kind order wins over age: a 1-day late line precedes a 30-day requires_invoicing line',
    input: {
      jobs: [
        job({ id: 'job-test-ri', bucket: 'requires_invoicing', jobNumber: 1, updatedAt: '2026-09-14T11:00:00Z' }),
        job({ id: 'job-test-late', bucket: 'late', jobNumber: 2, updatedAt: '2026-10-13T11:00:00Z' }),
      ],
    },
    expected: [
      { jobId: 'job-test-late', ageDays: 1 },
      { jobId: 'job-test-ri', ageDays: 30 },
    ],
  },
  // --- sinceAt source ---
  {
    name: 'observed bucket instant is used and flagged observed',
    input: {
      jobs: [job({ id: 'job-test-1', bucket: 'late', updatedAt: '2026-10-13T11:00:00Z' })],
      bucketSeen: { 'job-test-1': { late: '2026-10-07T11:00:00Z' } },
    },
    expected: [{ sinceAt: '2026-10-07T11:00:00Z', sinceSource: 'observed', ageDays: 7 }],
  },
  {
    name: 'no observation → updatedAt is used and flagged updatedAt',
    input: {
      jobs: [job({ id: 'job-test-1', bucket: 'late', updatedAt: '2026-10-13T11:00:00Z' })],
      bucketSeen: {},
    },
    expected: [{ sinceAt: '2026-10-13T11:00:00Z', sinceSource: 'updatedAt', ageDays: 1 }],
  },
  {
    name: 'observation for a different bucket of the same job does not count',
    input: {
      jobs: [job({ id: 'job-test-1', bucket: 'requires_invoicing', updatedAt: '2026-10-13T11:00:00Z' })],
      bucketSeen: { 'job-test-1': { late: '2026-10-01T11:00:00Z' } },
    },
    expected: [{ sinceAt: '2026-10-13T11:00:00Z', sinceSource: 'updatedAt' }],
  },
  // --- ageDays ---
  {
    name: 'ageDays crosses local midnight: 23:30 local yesterday → 00:30 local today = 1',
    input: {
      jobs: [job({ id: 'job-test-1', bucket: 'late', updatedAt: '2026-10-14T03:30:00Z' })], // 23:30 EDT Oct 13
      now: '2026-10-14T04:30:00Z', // 00:30 EDT Oct 14
    },
    expected: [{ ageDays: 1 }],
  },
  {
    name: 'ageDays is 0 on the same local day even many hours apart',
    input: {
      jobs: [job({ id: 'job-test-1', bucket: 'late', updatedAt: '2026-10-14T04:00:00Z' })], // 00:00 EDT Oct 14
      now: '2026-10-15T03:59:00Z', // 23:59 EDT Oct 14
    },
    expected: [{ ageDays: 0 }],
  },
  {
    name: 'ageDays clamps at 0 when sinceAt is in the future',
    input: {
      jobs: [job({ id: 'job-test-1', bucket: 'late', updatedAt: '2026-10-16T11:00:00Z' })],
      now: NOW,
    },
    expected: [{ ageDays: 0 }],
  },
  // --- label (decision 4) ---
  {
    name: 'label is LASTNAME · CITY · SCOPE uppercase with a middle dot',
    input: { jobs: [job({ id: 'job-test-1', bucket: 'late', lastName: 'Nowak', city: 'Testville', scope: 'ATT' })] },
    expected: [{ label: 'NOWAK · TESTVILLE · ATT' }],
  },
  {
    name: 'label uppercases mixed-case input and keeps the dash scope',
    input: { jobs: [job({ id: 'job-test-1', bucket: 'action_required', lastName: 'de la Cruz', city: 'Grand Blanc', scope: '—' })] },
    expected: [{ label: 'DE LA CRUZ · GRAND BLANC · —' }],
  },
  // --- owner ---
  {
    name: 'ownerFor result is carried through per line',
    input: {
      jobs: [
        job({ id: 'job-test-late', bucket: 'late', jobNumber: 1 }),
        job({ id: 'job-test-ri', bucket: 'requires_invoicing', jobNumber: 2 }),
      ],
      ownerFor: (_j, kind) => (kind === 'late' ? { initials: 'JJ' } : { role: 'OFFICE' }),
    },
    expected: [
      { jobId: 'job-test-late', owner: { initials: 'JJ' } },
      { jobId: 'job-test-ri', owner: { role: 'OFFICE' } },
    ],
  },
  // --- empty ---
  { name: 'empty jobs → []', input: { jobs: [] }, expected: [] },
];

describe('attentionLines (decision 29)', () => {
  it.each(LINES_CASES)('$name', ({ input, expected }) => {
    const lines = attentionLines(input.jobs, input.bucketSeen ?? {}, input.now ?? NOW, input.ownerFor ?? officeOwner);
    expect(lines).toHaveLength(expected.length);
    expect(lines).toMatchObject(expected);
  });

  it('ownerFor receives the job and its kind', () => {
    const seen: Array<[string, AttentionBucket]> = [];
    const j = job({ id: 'job-test-1', bucket: 'action_required' });
    attentionLines([j], {}, NOW, (jb, kind) => {
      seen.push([jb.id, kind]);
      return OFFICE;
    });
    expect(seen).toEqual([['job-test-1', 'action_required']]);
  });

  it('every line carries the full AttentionLine shape', () => {
    const [line] = attentionLines([job({ id: 'job-test-1', bucket: 'late' })], {}, NOW, officeOwner);
    expect(line).toEqual({
      kind: 'late',
      jobId: 'job-test-1',
      label: 'NOWAK · TESTVILLE · ATT',
      sinceAt: '2026-10-10T11:00:00Z',
      sinceSource: 'updatedAt',
      ageDays: 4,
      owner: OFFICE,
    });
  });
});

describe('attentionSince', () => {
  it.each<{ name: string; input: { job: Job; bucketSeen: BucketSeen }; expected: ReturnType<typeof attentionSince> }>([
    {
      name: 'observed instant for the current bucket',
      input: {
        job: job({ id: 'job-test-1', bucket: 'late', updatedAt: '2026-10-13T11:00:00Z' }),
        bucketSeen: { 'job-test-1': { late: '2026-10-07T11:00:00Z' } },
      },
      expected: { sinceAt: '2026-10-07T11:00:00Z', sinceSource: 'observed' },
    },
    {
      name: 'job not in bucketSeen → updatedAt',
      input: { job: job({ id: 'job-test-1', bucket: 'late', updatedAt: '2026-10-13T11:00:00Z' }), bucketSeen: {} },
      expected: { sinceAt: '2026-10-13T11:00:00Z', sinceSource: 'updatedAt' },
    },
    {
      name: 'job in bucketSeen but not for this bucket → updatedAt',
      input: {
        job: job({ id: 'job-test-1', bucket: 'requires_invoicing', updatedAt: '2026-10-13T11:00:00Z' }),
        bucketSeen: { 'job-test-1': { late: '2026-10-01T11:00:00Z', action_required: '2026-10-05T11:00:00Z' } },
      },
      expected: { sinceAt: '2026-10-13T11:00:00Z', sinceSource: 'updatedAt' },
    },
    {
      name: 'works for non-attention buckets too (caller decides whether a line exists)',
      input: {
        job: job({ id: 'job-test-1', bucket: 'today', updatedAt: '2026-10-13T11:00:00Z' }),
        bucketSeen: { 'job-test-1': { today: '2026-10-14T10:00:00Z' } },
      },
      expected: { sinceAt: '2026-10-14T10:00:00Z', sinceSource: 'observed' },
    },
  ])('$name', ({ input, expected }) => {
    expect(attentionSince(input.job, input.bucketSeen)).toEqual(expected);
  });
});
