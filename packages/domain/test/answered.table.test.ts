import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config.js';
import { answeredState, isPastGrace, unansweredCount, type AnsweredState } from '../src/derive/answered.js';
import { addMinutes } from '../src/derive/time.js';
import type { Instant, Visit } from '../src/types.js';

// Wed Oct 14 2026, EDT (offset -240): 08:00–15:00 local.
const START: Instant = '2026-10-14T12:00:00Z';
const END: Instant = '2026-10-14T19:00:00Z';
const GRACE = CONFIG.NO_RESULT_GRACE_MIN;

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

describe('answeredState (decisions 10, 18, 21)', () => {
  const cases: Array<{ name: string; input: Visit; expected: AnsweredState }> = [
    {
      name: 'result from note → answered even with incompleteJobFormsCount 1',
      input: mkVisit({ resultSource: 'note', result: 'Completed', incompleteJobFormsCount: 1, formsSeenMax: 1 }),
      expected: 'answered',
    },
    {
      name: 'result from jobForm → answered',
      input: mkVisit({ resultSource: 'jobForm', result: 'Return needed', incompleteJobFormsCount: 0, formsSeenMax: 1 }),
      expected: 'answered',
    },
    {
      name: 'result from recapQueued (shop touchscreen, no form ever) → answered',
      input: mkVisit({ resultSource: 'recapQueued', result: 'Prepped', incompleteJobFormsCount: 0, formsSeenMax: 0 }),
      expected: 'answered',
    },
    {
      name: 'formsSeenMax 2 + count 0 + unknown source → answered (form answered in Jobber)',
      input: mkVisit({ resultSource: 'unknown', incompleteJobFormsCount: 0, formsSeenMax: 2 }),
      expected: 'answered',
    },
    {
      name: 'formsSeenMax 0 + count 0 + unknown source → unknown (0 alone never means answered)',
      input: mkVisit({ resultSource: 'unknown', incompleteJobFormsCount: 0, formsSeenMax: 0 }),
      expected: 'unknown',
    },
    {
      name: 'count 1 + unknown source → unanswered',
      input: mkVisit({ resultSource: 'unknown', incompleteJobFormsCount: 1, formsSeenMax: 1 }),
      expected: 'unanswered',
    },
    {
      name: 'formsSeenMax 2 + count 2 + unknown source → unanswered',
      input: mkVisit({ resultSource: 'unknown', incompleteJobFormsCount: 2, formsSeenMax: 2 }),
      expected: 'unanswered',
    },
    {
      name: 'count 1 + formsSeenMax 0 (service never recorded the max) → unanswered, count wins',
      input: mkVisit({ resultSource: 'unknown', incompleteJobFormsCount: 1, formsSeenMax: 0 }),
      expected: 'unanswered',
    },
  ];

  it.each(cases)('$name', ({ input, expected }) => {
    expect(answeredState(input)).toBe(expected);
  });
});

describe('isPastGrace (decision 18, CONFIG.NO_RESULT_GRACE_MIN)', () => {
  const cases: Array<{ name: string; input: { visit: Visit; now: Instant }; expected: boolean }> = [
    {
      name: `end + ${GRACE - 1} min, not complete → false`,
      input: { visit: mkVisit(), now: addMinutes(END, GRACE - 1) },
      expected: false,
    },
    {
      name: `end + ${GRACE} min exactly, not complete → false (strictly greater)`,
      input: { visit: mkVisit(), now: addMinutes(END, GRACE) },
      expected: false,
    },
    {
      name: `end + ${GRACE + 1} min, not complete → true`,
      input: { visit: mkVisit(), now: addMinutes(END, GRACE + 1) },
      expected: true,
    },
    {
      name: 'now exactly at end, not complete → false',
      input: { visit: mkVisit(), now: END },
      expected: false,
    },
    {
      name: 'now before end (mid-visit), not complete → false',
      input: { visit: mkVisit(), now: addMinutes(START, 60) },
      expected: false,
    },
    {
      name: 'isComplete true before end → true (completion ends the grace)',
      input: { visit: mkVisit({ isComplete: true, completedAt: addMinutes(START, 60) }), now: addMinutes(START, 90) },
      expected: true,
    },
  ];

  it.each(cases)('$name', ({ input, expected }) => {
    expect(isPastGrace(input.visit, input.now)).toBe(expected);
  });
});

describe('unansweredCount (decision 18)', () => {
  // `now` is 16:00 local: END (15:00) is an hour past, well beyond grace.
  const NOW: Instant = '2026-10-14T20:00:00Z';
  const END_INSIDE_GRACE: Instant = addMinutes(NOW, -(GRACE - 5)); // ended 25 min ago: still in grace

  const cases: Array<{ name: string; input: { visits: Visit[]; now: Instant }; expected: { unanswered: number; unknown: number } }> = [
    {
      name: '2 unanswered past grace, 1 unanswered before grace, 1 unknown past grace → {2, 1}',
      input: {
        visits: [
          mkVisit({ id: 'visit-test-a', incompleteJobFormsCount: 1, formsSeenMax: 1 }),
          mkVisit({ id: 'visit-test-b', incompleteJobFormsCount: 1, formsSeenMax: 1 }),
          mkVisit({ id: 'visit-test-c', incompleteJobFormsCount: 1, formsSeenMax: 1, endAt: END_INSIDE_GRACE }),
          mkVisit({ id: 'visit-test-d', incompleteJobFormsCount: 0, formsSeenMax: 0 }),
        ],
        now: NOW,
      },
      expected: { unanswered: 2, unknown: 1 },
    },
    {
      name: 'empty list → {0, 0}',
      input: { visits: [], now: NOW },
      expected: { unanswered: 0, unknown: 0 },
    },
    {
      name: 'all answered past grace → {0, 0}',
      input: {
        visits: [
          mkVisit({ id: 'visit-test-a', resultSource: 'jobForm', result: 'Completed', formsSeenMax: 1 }),
          mkVisit({ id: 'visit-test-b', resultSource: 'unknown', incompleteJobFormsCount: 0, formsSeenMax: 1 }),
        ],
        now: NOW,
      },
      expected: { unanswered: 0, unknown: 0 },
    },
    {
      name: 'unknown and unanswered visits still inside grace count in neither → {0, 0}',
      input: {
        visits: [
          mkVisit({ id: 'visit-test-a', incompleteJobFormsCount: 0, formsSeenMax: 0, endAt: END_INSIDE_GRACE }),
          mkVisit({ id: 'visit-test-b', incompleteJobFormsCount: 1, formsSeenMax: 1, endAt: END_INSIDE_GRACE }),
        ],
        now: NOW,
      },
      expected: { unanswered: 0, unknown: 0 },
    },
    {
      name: 'complete visit with open form before its scheduled end counts as unanswered → {1, 0}',
      input: {
        visits: [
          mkVisit({ id: 'visit-test-a', isComplete: true, incompleteJobFormsCount: 1, formsSeenMax: 1, endAt: addMinutes(NOW, 120) }),
        ],
        now: NOW,
      },
      expected: { unanswered: 1, unknown: 0 },
    },
  ];

  it.each(cases)('$name', ({ input, expected }) => {
    expect(unansweredCount(input.visits, input.now)).toEqual(expected);
  });
});
