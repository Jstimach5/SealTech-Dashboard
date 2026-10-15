import { describe, expect, it } from 'vitest';
import type { Crew, Job, Owner, Person, Visit } from '../src/types.js';
import { crewLeadInitialsFor, defaultOwner, latestVisitOf, officeInitials, ownerText, roleOnlyOwner } from '../src/derive/owner.js';

// Fictional roster (decision 24: TESTVILLE convention). Crew initials differ from the lead person's own
// initials on purpose, so a test can tell "found via crews.leadUserId" from "found via people".
const OWNER_P: Person = { jobberUserId: 'user-test-owner', lastName: 'Oakes', initials: 'OW', role: 'owner', reviewPass: 2 };
const OFFICE_P: Person = { jobberUserId: 'user-test-office', lastName: 'Fields', initials: 'OF', role: 'office', reviewPass: 0 };
const OFFICE_2: Person = { jobberUserId: 'user-test-office-2', lastName: 'Flint', initials: 'O2', role: 'office', reviewPass: 0 };
const LEAD_A: Person = { jobberUserId: 'user-test-lead-a', lastName: 'Alder', initials: 'HA', role: 'crewLead', reviewPass: 1 };
const LEAD_B: Person = { jobberUserId: 'user-test-lead-b', lastName: 'Birch', initials: 'HB', role: 'crewLead', reviewPass: 0 };
const MEMBER_A: Person = { jobberUserId: 'user-test-member-a', lastName: 'Moss', initials: 'MA', role: 'crew', reviewPass: 0 };

const CREW_A: Crew = { leadUserId: 'user-test-lead-a', leadLastName: 'Alder', initials: 'AL', memberUserIds: ['user-test-member-a'] };
const CREW_B: Crew = { leadUserId: 'user-test-lead-b', leadLastName: 'Birch', initials: 'BI', memberUserIds: ['user-test-member-b'] };

const PEOPLE: Person[] = [OWNER_P, OFFICE_P, OFFICE_2, LEAD_A, LEAD_B, MEMBER_A];
const CREWS: Crew[] = [CREW_A, CREW_B];

const OVERRIDE = { initials: 'ZZ', setOn: '2026-10-14' };

function mkJob(over: Partial<Job> = {}): Job {
  return {
    id: 'job-test-1',
    jobNumber: 1001,
    title: 'STD ATT',
    lastName: 'Nowak',
    city: 'Testville',
    scope: 'ATT',
    program: 'STANDARD',
    bucket: 'requires_invoicing',
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

/** Defaults to a completed Mon Oct 12 2026 visit, 07:00–15:00 local (EDT), led by crew A. */
function mkVisit(over: Partial<Visit> = {}): Visit {
  return {
    id: 'visit-test-1',
    jobId: 'job-test-1',
    startAt: '2026-10-12T11:00:00Z',
    endAt: '2026-10-12T19:00:00Z',
    createdAt: '2026-10-05T14:00:00Z',
    completedAt: '2026-10-12T19:10:00Z',
    isComplete: true,
    isLastScheduledVisit: true,
    incompleteJobFormsCount: 0,
    formsSeenMax: 1,
    assignedUserIds: ['user-test-lead-a', 'user-test-member-a'],
    plannedAsPrep: false,
    resultSource: 'jobForm',
    ...over,
  };
}

/** Two visits of the same job: Mon led by crew A, Tue (the latest) led by crew B, listed later-first on purpose. */
const TWO_VISITS: Visit[] = [
  mkVisit({ id: 'visit-test-2', startAt: '2026-10-13T11:00:00Z', endAt: '2026-10-13T19:00:00Z', assignedUserIds: ['user-test-lead-b'] }),
  mkVisit({ id: 'visit-test-1', startAt: '2026-10-12T11:00:00Z', endAt: '2026-10-12T19:00:00Z', assignedUserIds: ['user-test-lead-a'] }),
];

type DefaultOwnerArgs = Parameters<typeof defaultOwner>[0];

interface OwnerCase {
  name: string;
  input: DefaultOwnerArgs;
  expected: Owner;
}

const base = (over: Partial<DefaultOwnerArgs> = {}): DefaultOwnerArgs => ({
  job: mkJob(),
  visits: [mkVisit()],
  crews: CREWS,
  people: PEOPLE,
  ...over,
});

const OWNER_CASES: OwnerCase[] = [
  // --- FIX and HOLD are role words only (decision 33, 16) ---
  { name: 'FIX OPEN → CREW role word', input: base({ reason: 'FIX OPEN' }), expected: { role: 'CREW' } },
  { name: 'FIX OPEN → CREW even with a huddle override', input: base({ reason: 'FIX OPEN', override: OVERRIDE }), expected: { role: 'CREW' } },
  { name: 'HOLD → OFFICE role word', input: base({ reason: 'HOLD' }), expected: { role: 'OFFICE' } },
  { name: 'HOLD → OFFICE even with a huddle override', input: base({ reason: 'HOLD', override: OVERRIDE }), expected: { role: 'OFFICE' } },
  {
    name: 'FIX OPEN ignores an attention kind too',
    input: base({ reason: 'FIX OPEN', attentionKind: 'action_required' }),
    expected: { role: 'CREW' },
  },
  // --- override wins everywhere else (decision 33: changeable at the huddle) ---
  { name: 'override wins for RETURN NEEDED', input: base({ reason: 'RETURN NEEDED', override: OVERRIDE }), expected: { initials: 'ZZ' } },
  { name: 'override wins for AWAITING 1ST REVIEW', input: base({ reason: 'AWAITING 1ST REVIEW', override: OVERRIDE }), expected: { initials: 'ZZ' } },
  { name: 'override wins for attention late', input: base({ attentionKind: 'late', override: OVERRIDE }), expected: { initials: 'ZZ' } },
  { name: 'override wins when neither reason nor kind is given', input: base({ override: OVERRIDE }), expected: { initials: 'ZZ' } },
  // --- crew-lead reasons: lookup on the latest visit ---
  { name: 'RETURN NEEDED → crew initials via crews.leadUserId', input: base({ reason: 'RETURN NEEDED' }), expected: { initials: 'AL' } },
  { name: 'BLOWER DOOR FAIL → CREW role word: initials never beside a rate (decision 33)', input: base({ reason: 'BLOWER DOOR FAIL' }), expected: { role: 'CREW' } },
  { name: 'RETURN NEEDED → crew initials via crews.leadUserId', input: base({ reason: 'RETURN NEEDED' }), expected: { initials: 'AL' } },
  {
    name: 'FORM/QUANTITIES MISSING → falls back to a person who is not a lead',
    input: base({ reason: 'FORM/QUANTITIES MISSING', visits: [mkVisit({ assignedUserIds: ['user-test-member-a'] })] }),
    expected: { initials: 'MA' },
  },
  {
    name: 'RETURN NEEDED → CREW role word when no assigned id matches a crew or a person',
    input: base({ reason: 'RETURN NEEDED', visits: [mkVisit({ assignedUserIds: ['user-test-stranger'] })] }),
    expected: { role: 'CREW' },
  },
  {
    name: 'RETURN NEEDED → CREW role word when the visit has no assignees',
    input: base({ reason: 'RETURN NEEDED', visits: [mkVisit({ assignedUserIds: [] })] }),
    expected: { role: 'CREW' },
  },
  { name: 'RETURN NEEDED → CREW role word when the job has no visits', input: base({ reason: 'RETURN NEEDED', visits: [] }), expected: { role: 'CREW' } },
  {
    name: 'RETURN NEEDED → a lead listed after a member still wins (leads are searched first)',
    input: base({ reason: 'RETURN NEEDED', visits: [mkVisit({ assignedUserIds: ['user-test-member-a', 'user-test-lead-b'] })] }),
    expected: { initials: 'BI' },
  },
  {
    name: 'RETURN NEEDED → latest visit by startAt wins (two visits, different leads, later one listed first)',
    input: base({ reason: 'RETURN NEEDED', visits: TWO_VISITS }),
    expected: { initials: 'BI' },
  },
  {
    name: "RETURN NEEDED → another job's visit is ignored even when it is later",
    input: base({
      reason: 'RETURN NEEDED',
      visits: [mkVisit(), mkVisit({ id: 'visit-test-9', jobId: 'job-test-9', startAt: '2026-10-13T11:00:00Z', assignedUserIds: ['user-test-lead-b'] })],
    }),
    expected: { initials: 'AL' },
  },
  {
    name: 'RETURN NEEDED → a visit listed in job.visitIds counts even when its jobId is blank',
    input: base({
      reason: 'RETURN NEEDED',
      job: mkJob({ visitIds: ['visit-test-7'] }),
      visits: [mkVisit({ id: 'visit-test-7', jobId: '', assignedUserIds: ['user-test-lead-b'] })],
    }),
    expected: { initials: 'BI' },
  },
  // --- office reasons ---
  { name: "AWAITING 1ST REVIEW → first person with role 'office'", input: base({ reason: 'AWAITING 1ST REVIEW' }), expected: { initials: 'OF' } },
  { name: 'AWAITING 2ND REVIEW → office initials', input: base({ reason: 'AWAITING 2ND REVIEW' }), expected: { initials: 'OF' } },
  { name: 'INSPECTION/PERMIT → office initials', input: base({ reason: 'INSPECTION/PERMIT' }), expected: { initials: 'OF' } },
  { name: 'PROGRAM-WAIT → office initials', input: base({ reason: 'PROGRAM-WAIT' }), expected: { initials: 'OF' } },
  { name: 'READY TO INVOICE → office initials', input: base({ reason: 'READY TO INVOICE' }), expected: { initials: 'OF' } },
  {
    name: 'AWAITING 1ST REVIEW → owner when no office person',
    input: base({ reason: 'AWAITING 1ST REVIEW', people: [LEAD_A, OWNER_P] }),
    expected: { initials: 'OW' },
  },
  { name: 'AWAITING 1ST REVIEW → OFFICE role word when no people', input: base({ reason: 'AWAITING 1ST REVIEW', people: [] }), expected: { role: 'OFFICE' } },
  {
    name: 'PROGRAM-WAIT → OFFICE role word when only crew people exist',
    input: base({ reason: 'PROGRAM-WAIT', people: [LEAD_A, MEMBER_A] }),
    expected: { role: 'OFFICE' },
  },
  // --- attention kinds (decision 29 strip, owned per decision 33) ---
  { name: 'late → crew lead initials of the latest visit', input: base({ attentionKind: 'late', visits: TWO_VISITS }), expected: { initials: 'BI' } },
  { name: 'late → CREW role word when no match', input: base({ attentionKind: 'late', visits: [] }), expected: { role: 'CREW' } },
  { name: 'action_required → office initials', input: base({ attentionKind: 'action_required' }), expected: { initials: 'OF' } },
  { name: 'action_required → OFFICE role word when no people', input: base({ attentionKind: 'action_required', people: [] }), expected: { role: 'OFFICE' } },
  { name: 'requires_invoicing → office initials', input: base({ attentionKind: 'requires_invoicing' }), expected: { initials: 'OF' } },
  {
    name: 'requires_invoicing → owner when no office person',
    input: base({ attentionKind: 'requires_invoicing', people: [OWNER_P, LEAD_A] }),
    expected: { initials: 'OW' },
  },
  // --- precedence and the empty case ---
  {
    name: 'reason wins over attention kind when both are given',
    input: base({ reason: 'RETURN NEEDED', attentionKind: 'action_required' }),
    expected: { initials: 'AL' },
  },
  { name: 'neither reason nor kind → office initials', input: base(), expected: { initials: 'OF' } },
  { name: 'neither reason nor kind, no people → OFFICE role word', input: base({ people: [] }), expected: { role: 'OFFICE' } },
];

describe('defaultOwner (decision 33)', () => {
  it.each(OWNER_CASES)('$name', ({ input, expected }) => {
    expect(defaultOwner(input)).toEqual(expected);
  });

  it('never puts initials on a FIX or HOLD line for any override', () => {
    for (const reason of ['FIX OPEN', 'HOLD'] as const) {
      const owner = defaultOwner(base({ reason, override: OVERRIDE }));
      expect('initials' in owner).toBe(false);
    }
  });
});

describe('roleOnlyOwner (decision 33, 16)', () => {
  it.each([
    { name: 'FIX OPEN → CREW', input: 'FIX OPEN' as const, expected: { role: 'CREW' } as Owner | undefined },
    { name: 'HOLD → OFFICE', input: 'HOLD' as const, expected: { role: 'OFFICE' } as Owner | undefined },
    { name: 'RETURN NEEDED → not role-only', input: 'RETURN NEEDED' as const, expected: undefined },
    { name: 'no reason → not role-only', input: undefined, expected: undefined },
  ])('$name', ({ input, expected }) => {
    expect(roleOnlyOwner(input)).toEqual(expected);
  });
});

describe('crewLeadInitialsFor', () => {
  it.each([
    { name: 'lead id → crew initials, not the person initials', input: mkVisit({ assignedUserIds: ['user-test-lead-a'] }), expected: 'AL' },
    { name: 'member only → person initials', input: mkVisit({ assignedUserIds: ['user-test-member-a'] }), expected: 'MA' },
    { name: 'member then lead → lead wins', input: mkVisit({ assignedUserIds: ['user-test-member-a', 'user-test-lead-b'] }), expected: 'BI' },
    { name: 'two members → first known person', input: mkVisit({ assignedUserIds: ['user-test-nobody', 'user-test-member-a'] }), expected: 'MA' },
    { name: 'unknown ids → undefined', input: mkVisit({ assignedUserIds: ['user-test-nobody'] }), expected: undefined },
    { name: 'no assignees → undefined', input: mkVisit({ assignedUserIds: [] }), expected: undefined },
    { name: 'no visit → undefined', input: undefined, expected: undefined },
  ])('$name', ({ input, expected }) => {
    expect(crewLeadInitialsFor(input, CREWS, PEOPLE)).toBe(expected);
  });

  it('lead id with no crews falls back to the person', () => {
    expect(crewLeadInitialsFor(mkVisit({ assignedUserIds: ['user-test-lead-a'] }), [], PEOPLE)).toBe('HA');
  });
});

describe('officeInitials', () => {
  it.each([
    { name: "first 'office' person wins over a later one and over the owner", input: PEOPLE, expected: 'OF' },
    { name: "owner listed first still loses to an 'office' person", input: [OWNER_P, OFFICE_2], expected: 'O2' },
    { name: 'no office person → owner', input: [LEAD_A, OWNER_P], expected: 'OW' },
    { name: 'only crew people → undefined', input: [LEAD_A, MEMBER_A], expected: undefined },
    { name: 'no people → undefined', input: [], expected: undefined },
  ])('$name', ({ input, expected }) => {
    expect(officeInitials(input)).toBe(expected);
  });
});

describe('latestVisitOf', () => {
  it.each([
    { name: 'greatest startAt wins regardless of list order', input: { job: mkJob(), visits: TWO_VISITS }, expected: 'visit-test-2' },
    { name: 'no visits → undefined', input: { job: mkJob(), visits: [] }, expected: undefined },
    {
      name: "another job's visit is skipped",
      input: { job: mkJob(), visits: [mkVisit({ id: 'visit-test-9', jobId: 'job-test-9', startAt: '2026-10-13T11:00:00Z' })] },
      expected: undefined,
    },
    {
      name: 'tie on startAt → the first listed',
      input: { job: mkJob(), visits: [mkVisit({ id: 'visit-test-a' }), mkVisit({ id: 'visit-test-b' })] },
      expected: 'visit-test-a',
    },
  ])('$name', ({ input, expected }) => {
    expect(latestVisitOf(input.job, input.visits)?.id).toBe(expected);
  });
});

describe('ownerText', () => {
  it.each([
    { name: 'initials shape prints the initials', input: { initials: 'OF' } as Owner, expected: 'OF' },
    { name: 'CREW role prints the role word', input: { role: 'CREW' } as Owner, expected: 'CREW' },
    { name: 'OFFICE role prints the role word', input: { role: 'OFFICE' } as Owner, expected: 'OFFICE' },
  ])('$name', ({ input, expected }) => {
    expect(ownerText(input)).toBe(expected);
  });
});
