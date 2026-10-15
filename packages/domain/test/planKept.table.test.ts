import { describe, expect, it } from 'vitest';
import { isKept, planKept, type PlanKeptCounts } from '../src/derive/planKept.js';
import type { Instant, Visit } from '../src/types.js';

// Tue Oct 13 2026 ("yesterday" for a Wed Oct 14 board), EDT (offset -240): 08:00–15:00 local.
const START: Instant = '2026-10-13T12:00:00Z';
const END: Instant = '2026-10-13T19:00:00Z';

let seq = 0;
function mkVisit(overrides: Partial<Visit> = {}): Visit {
  seq++;
  return {
    id: `visit-test-${seq}`,
    jobId: `job-test-${seq}`,
    startAt: START,
    endAt: END,
    createdAt: '2026-10-09T14:00:00Z',
    isComplete: false,
    isLastScheduledVisit: true,
    incompleteJobFormsCount: 0,
    formsSeenMax: 1,
    assignedUserIds: ['user-test-lead-1'],
    plannedAsPrep: false,
    resultSource: 'jobForm',
    ...overrides,
  };
}

describe('isKept (decision 46)', () => {
  const cases: Array<{ name: string; input: Visit; expected: boolean }> = [
    { name: 'Completed → kept', input: mkVisit({ result: 'Completed' }), expected: true },
    { name: 'Prepped on a visit planned as a prep day → kept', input: mkVisit({ result: 'Prepped', plannedAsPrep: true }), expected: true },
    { name: 'Prepped on a visit NOT planned as prep → not kept (a miss)', input: mkVisit({ result: 'Prepped', plannedAsPrep: false }), expected: false },
    { name: 'Return needed → not kept', input: mkVisit({ result: 'Return needed', missReason: 'MATERIALS' }), expected: false },
    { name: 'Problem → not kept', input: mkVisit({ result: 'Problem', missReason: 'PRE-EXISTING' }), expected: false },
    { name: 'Not started → not kept', input: mkVisit({ result: 'Not started', missReason: 'WEATHER' }), expected: false },
    { name: 'Customer cancelled → not kept (and not planned either)', input: mkVisit({ result: 'Customer cancelled' }), expected: false },
    { name: 'no result (unknown) → not kept', input: mkVisit({ resultSource: 'unknown' }), expected: false },
    { name: 'Completed on a prep-planned visit → still kept (plannedAsPrep only matters for Prepped)', input: mkVisit({ result: 'Completed', plannedAsPrep: true }), expected: true },
  ];

  it.each(cases)('$name', ({ input, expected }) => {
    expect(isKept(input)).toBe(expected);
  });
});

describe('planKept (decisions 44, 46)', () => {
  // The brief's worked example lists 12 visits (6 + 1 + 1 + 1 + 1 + 2), of which 9 are planned:
  //   planned = 6 Completed + 1 Prepped (planned) + 1 Prepped (unplanned) + 1 Return needed = 9
  //   kept    = 6 Completed + 1 Prepped (planned)                                        = 7
  //   unknown = 2 (no result); Customer cancelled is neither planned nor a miss
  //   misses  = ACCESS 1 (unplanned Prepped) + OTHER 1 (Return needed with no reason coded)
  // The wall renders this as "kept 7 of 9 (2 unknown)".
  const briefExample: Visit[] = [
    mkVisit({ result: 'Completed' }),
    mkVisit({ result: 'Completed' }),
    mkVisit({ result: 'Completed' }),
    mkVisit({ result: 'Completed' }),
    mkVisit({ result: 'Completed' }),
    mkVisit({ result: 'Completed' }),
    mkVisit({ result: 'Prepped', plannedAsPrep: true }),
    mkVisit({ result: 'Prepped', plannedAsPrep: false, missReason: 'ACCESS' }),
    mkVisit({ result: 'Return needed' }),
    mkVisit({ result: 'Customer cancelled' }),
    mkVisit({ resultSource: 'unknown' }),
    mkVisit({ resultSource: 'unknown', incompleteJobFormsCount: 1 }),
  ];

  const cases: Array<{ name: string; input: Visit[]; expected: PlanKeptCounts }> = [
    {
      name: '12 visits: 6 Completed, 1 Prepped planned, 1 Prepped unplanned ACCESS, 1 Return needed no reason, 1 cancelled, 2 unknown → kept 7 of 9 (2 unknown), misses {ACCESS 1, OTHER 1}',
      input: briefExample,
      expected: { kept: 7, planned: 9, unknown: 2, misses: { ACCESS: 1, OTHER: 1 } },
    },
    {
      name: 'all unknown (3 visits, no result) → {0, 0, 3, {}}',
      input: [mkVisit({ resultSource: 'unknown' }), mkVisit({ resultSource: 'unknown' }), mkVisit({ resultSource: 'unknown' })],
      expected: { kept: 0, planned: 0, unknown: 3, misses: {} },
    },
    {
      name: 'empty list → {0, 0, 0, {}}',
      input: [],
      expected: { kept: 0, planned: 0, unknown: 0, misses: {} },
    },
    {
      name: 'all Customer cancelled → neither planned nor a miss → {0, 0, 0, {}}',
      input: [mkVisit({ result: 'Customer cancelled' }), mkVisit({ result: 'Customer cancelled', missReason: 'OTHER' })],
      expected: { kept: 0, planned: 0, unknown: 0, misses: {} },
    },
    {
      name: 'every miss result carries its reason: Problem WEATHER, Not started OVERCOMMITTED, Return needed MATERIALS ×2 → kept 0 of 4',
      input: [
        mkVisit({ result: 'Problem', missReason: 'WEATHER' }),
        mkVisit({ result: 'Not started', missReason: 'OVERCOMMITTED' }),
        mkVisit({ result: 'Return needed', missReason: 'MATERIALS' }),
        mkVisit({ result: 'Return needed', missReason: 'MATERIALS' }),
      ],
      expected: { kept: 0, planned: 4, unknown: 0, misses: { WEATHER: 1, OVERCOMMITTED: 1, MATERIALS: 2 } },
    },
    {
      name: 'misses with no reason coded all fall under OTHER (Not started, Problem, unplanned Prepped) → kept 1 of 4',
      input: [
        mkVisit({ result: 'Completed' }),
        mkVisit({ result: 'Not started' }),
        mkVisit({ result: 'Problem' }),
        mkVisit({ result: 'Prepped', plannedAsPrep: false }),
      ],
      expected: { kept: 1, planned: 4, unknown: 0, misses: { OTHER: 3 } },
    },
    {
      name: 'a kept visit with a stray missReason is still kept and adds no miss (planned Prepped + ACCESS)',
      input: [mkVisit({ result: 'Prepped', plannedAsPrep: true, missReason: 'ACCESS' }), mkVisit({ result: 'Completed', missReason: 'OTHER' })],
      expected: { kept: 2, planned: 2, unknown: 0, misses: {} },
    },
    {
      name: 'all kept → kept 3 of 3, no misses',
      input: [mkVisit({ result: 'Completed' }), mkVisit({ result: 'Completed' }), mkVisit({ result: 'Prepped', plannedAsPrep: true })],
      expected: { kept: 3, planned: 3, unknown: 0, misses: {} },
    },
  ];

  it.each(cases)('$name', ({ input, expected }) => {
    expect(planKept(input)).toEqual(expected);
  });

  it('kept + every miss = planned, and unknown is outside planned (brief example)', () => {
    const out = planKept(briefExample);
    const missTotal = Object.values(out.misses).reduce((a, b) => a + b, 0);
    expect(out.kept + missTotal).toBe(out.planned);
    expect(out.planned + out.unknown).toBeLessThan(briefExample.length); // the cancelled visit is in neither
    expect(Number.isInteger(out.kept) && Number.isInteger(out.planned) && Number.isInteger(out.unknown)).toBe(true);
  });
});
