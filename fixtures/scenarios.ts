/**
 * Scenario overlays on the TESTVILLE dataset. Each one picks a clock and may mutate the inputs.
 * `FIXTURE_SCENARIO` selects one; `FIXTURE_NOW` overrides its clock.
 */
import { addLocalDays, fromLocal, localDate, weekStartMonday, type Instant, type SourceInputs } from '@sealtech/domain';
import { ackLine, clock, testvilleInputs } from './testville/data.js';

/** The anchor day every scenario is built on when FIXTURE_NOW is blank: Wed 14 Oct 2026, EDT. */
export const ANCHOR_DATE = '2026-10-14';

export interface Scenario {
  name: string;
  /** Local HH:MM on the anchor day. */
  localTime: string;
  /** Local date override (used by monday-scorecard). */
  localDay?: string;
  description: string;
  apply?: (inputs: SourceInputs) => SourceInputs;
}

export const SCENARIOS: Record<string, Scenario> = {
  default: {
    name: 'default',
    localTime: '09:30',
    description: 'Mid-morning: NOW cards, a Problem 25 minutes without ACK, a DONE card, the full rail.',
  },
  'huddle-day': {
    name: 'huddle-day',
    localTime: '07:00',
    description: 'The 7:00 huddle: nothing started yet, yesterday on the scoreline, strip and rail as the agenda.',
    apply: (inputs) => {
      const c = clock(inputs.now);
      // At 07:00 nothing has happened yet today: no Problem note on NGUYEN, MBEKI not started or reviewed.
      const { 'v-test-mbeki-1': _mbekiForm, ...formAnswers } = inputs.formAnswers;
      const { 'v-test-mbeki-1': _mbekiMeta, 'v-test-nguyen-1': _nguyenMeta, ...cardMeta } = inputs.cardMeta;
      return {
        ...inputs,
        jobs: inputs.jobs.map((j) =>
          j.id === 'j-test-nguyen' ? { ...j, noteLines: [] } : j.id === 'j-test-mbeki' ? { ...j, bucket: 'today' as const, invoiced: false, hasUninvoicedWork: true } : j,
        ).map((j) => {
          if (j.id !== 'j-test-mbeki') return j;
          const { completedAt: _c, ...rest } = j;
          return rest;
        }),
        formAnswers,
        visits: inputs.visits.map((v) => {
          if (v.id !== 'v-test-mbeki-1') return v;
          const { completedAt: _c, ...rest } = v;
          return { ...rest, isComplete: false, incompleteJobFormsCount: 0, formsSeenMax: 0 };
        }),
        reviewRows: inputs.reviewRows.filter((r) => r.jobberJobId !== 'j-test-mbeki'),
        cardMeta,
        sources: { ...inputs.sources, jobber: { ...inputs.sources.jobber, lastOkAt: c.at(0, '06:59'), lastAttemptAt: c.at(0, '06:59') } },
      };
    },
  },
  'late-afternoon': {
    name: 'late-afternoon',
    localTime: '16:10',
    description: 'After 15:00: the ACK landed on NGUYEN, SANTOS has a queued recap, TOMORROW flags are due in the lanes.',
    apply: (inputs) => {
      const c = clock(inputs.now);
      return {
        ...inputs,
        jobs: inputs.jobs.map((j) => (j.id === 'j-test-nguyen' ? { ...j, noteLines: [...j.noteLines, ackLine(c)] } : j)),
        visits: inputs.visits.map((v) => {
          if (v.id === 'v-test-santos-1') return { ...v, isComplete: true, completedAt: c.at(0, '12:40'), formsSeenMax: 1, incompleteJobFormsCount: 1 };
          if (v.id === 'v-test-nguyen-1') return { ...v, isComplete: true, completedAt: c.at(0, '09:10'), formsSeenMax: 1, incompleteJobFormsCount: 0 };
          if (v.id === 'v-test-rowe-2') return { ...v, isComplete: true, completedAt: c.at(0, '15:05'), formsSeenMax: 1, incompleteJobFormsCount: 0 };
          return v;
        }),
        formAnswers: { ...inputs.formAnswers, 'v-test-rowe-2': { result: 'Completed', at: c.at(0, '15:05') } },
        queuedRecaps: { 'v-test-santos-1': { result: 'Completed', at: c.at(0, '12:42'), note: 'blower door 1,880 > 1,310' } },
        queuedWrites: [
          {
            id: 'qw-test-1',
            submissionId: 'test-santos-recap',
            kind: 'visit_note',
            targetId: 'v-test-santos-1',
            status: 'queued',
            createdAt: c.at(0, '12:42'),
            createdBy: 'u-test-dale',
            attempts: 0,
          },
        ],
        cardMeta: { ...inputs.cardMeta, 'v-test-santos-1': { photosCount: 11, lastCaptureAt: c.at(0, '12:30'), synced: 'queued' } },
      };
    },
  },
  stale: {
    name: 'stale',
    localTime: '09:30',
    description: 'Jobber has not loaded for 45 minutes: red banner replaces the focus line; data is the last good snapshot.',
    apply: (inputs) => {
      const c = clock(inputs.now);
      return {
        ...inputs,
        sources: {
          ...inputs.sources,
          jobber: { connected: true, ok: false, lastOkAt: c.at(0, '08:45'), lastAttemptAt: c.at(0, '09:29'), error: 'HTTP 502 from Jobber' },
          reviewSheet: { ...inputs.sources.reviewSheet, lastOkAt: c.at(0, '09:17'), lastAttemptAt: c.at(0, '09:29') },
        },
      };
    },
  },
  overflow: {
    name: 'overflow',
    localTime: '09:30',
    description: 'Five crews on the road: the fifth lane must still read, the rail and strip must still fit.',
    apply: (inputs) => {
      const c = clock(inputs.now);
      const lead = { jobberUserId: 'u-test-evans', lastName: 'EVANS', initials: 'RE', role: 'crewLead' as const, reviewPass: 0 as const };
      const member = { jobberUserId: 'u-test-e2', lastName: 'EVANS-2', initials: 'E2', role: 'crew' as const, reviewPass: 0 as const };
      const crew = { leadUserId: 'u-test-evans', leadLastName: 'EVANS', initials: 'RE', memberUserIds: ['u-test-evans', 'u-test-e2'] };
      const job = {
        ...inputs.jobs.find((j) => j.id === 'j-test-santos')!,
        id: 'j-test-ulrich',
        jobNumber: 9030,
        title: 'TESTVILLE - CONSUMERS INSTALL - ULRICH',
        lastName: 'ULRICH',
        program: 'CE_INSULATION' as const,
        visitIds: ['v-test-ulrich-1'],
        noteLines: [],
      };
      const visit = {
        ...inputs.visits.find((v) => v.id === 'v-test-santos-1')!,
        id: 'v-test-ulrich-1',
        jobId: 'j-test-ulrich',
        startAt: c.at(0, '08:00'),
        endAt: c.at(0, '13:00'),
        assignedUserIds: ['u-test-evans', 'u-test-e2'],
      };
      return { ...inputs, people: [...inputs.people, lead, member], crews: [...inputs.crews, crew], jobs: [...inputs.jobs, job], visits: [...inputs.visits, visit] };
    },
  },
  'monday-scorecard': {
    name: 'monday-scorecard',
    localTime: '07:10',
    localDay: '2026-10-19',
    description: 'Monday 07:10: thirteen weeks of scorecard rows, baseline mode (no targets).',
    apply: (inputs) => {
      const boardDate = localDate(inputs.now);
      const thisMonday = weekStartMonday(boardDate);
      const rows = Array.from({ length: 13 }, (_, i) => {
        const weekStart = addLocalDays(thisMonday, -7 * (13 - i));
        const t = i / 12;
        return {
          weekStart,
          planKeptPct: Math.round(62 + 20 * t),
          answeredPct: Math.round(70 + 22 * t),
          firstPassReadyPct: Math.round(48 + 30 * t),
          photoCompletePct: null,
          cannotInvoiceCount: Math.round(16 - 6 * t),
          cannotInvoiceOldestDays: Math.round(31 - 13 * t),
          daysToSubmitMedian: Math.round(9 - 4 * t),
          daysToSubmitP90: Math.round(19 - 7 * t),
          firstTimeAcceptancePct: null,
          perCrewFirstPass: {
            HA: { ready: 3, total: 4 },
            AB: { ready: 2, total: 3 },
            MC: { ready: 2, total: 4 },
            TD: { ready: 1 + (i % 2), total: 3 },
          },
        };
      });
      return { ...inputs, scorecard: rows };
    },
  },
};

/** The instant a scenario runs at, unless FIXTURE_NOW overrides it. */
export function scenarioNow(s: Scenario): Instant {
  return fromLocal(s.localDay ?? ANCHOR_DATE, s.localTime);
}

/** Build the SourceInputs for a scenario at a clock. */
export function scenarioInputs(name: string, now?: Instant): SourceInputs {
  const s = SCENARIOS[name];
  if (!s) throw new Error(`Unknown fixture scenario "${name}". Known: ${Object.keys(SCENARIOS).join(', ')}`);
  const at = now ?? scenarioNow(s);
  const base = testvilleInputs(at);
  return s.apply ? s.apply(base) : base;
}
