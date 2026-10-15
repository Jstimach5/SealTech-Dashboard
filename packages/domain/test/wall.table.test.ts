/**
 * Revision G wall rules that are not scenario-shaped: wording, fitting, due dates, the future guard,
 * the last worked day. Scenario-level strings live in fixtures/test/wall.test.ts.
 */
import { describe, expect, it } from 'vitest';
import {
  displayName,
  fitJoin,
  fmtTime,
  measureText,
  plural,
  sentenceCase,
  weekdayDayMonth,
} from '../src/derive/display.js';
import { fixDueAt, fitLine2, namesLine, ledgerSlots, compareLedgerRows, type LedgerRow } from '../src/derive/needsYou.js';
import { moneySlots } from '../src/derive/wall.js';
import { crewTokenBudget } from '../src/derive/crewRows.js';
import { dropFuture, lastWorkedDay } from '../src/snapshot.js';
import type { SourceInputs, Visit } from '../src/types.js';

describe('display wording (decision 54)', () => {
  it.each([
    ['2026-10-14T13:05:00Z', false, '9:05 am'],
    ['2026-10-14T20:30:00Z', false, '4:30 pm'],
    ['2026-10-14T16:05:00Z', false, '12:05 pm'],
    ['2026-10-14T04:00:00Z', false, '12:00 am'],
    ['2026-10-14T17:00:00Z', true, '1 pm'],
    ['2026-10-14T17:30:00Z', true, '1:30 pm'],
  ])('fmtTime(%s, short=%s) → %s', (at, short, want) => {
    expect(fmtTime(at, short)).toBe(want);
  });

  it('weekday dates read `Wed 14 Oct`', () => {
    expect(weekdayDayMonth('2026-10-14T13:30:00Z')).toBe('Wed 14 Oct');
    expect(weekdayDayMonth('2026-10-11T16:00:00Z')).toBe('Sun 11 Oct');
  });

  it.each([
    ['NGUYEN', 'Nguyen'],
    ['MCDONALD', 'McDonald'],
    ["O'BRIEN", "O'Brien"],
    ['ABERNATHY-COLE', 'Abernathy-Cole'],
    ['de Vries', 'de Vries'],
  ])('displayName(%s) → %s', (name, want) => {
    expect(displayName(name)).toBe(want);
  });

  it('sentenceCase only touches upper-case text', () => {
    expect(sentenceCase('PHOTOS BEFORE YOU LEAVE')).toBe('Photos before you leave');
    expect(sentenceCase('Check CO alarms')).toBe('Check CO alarms');
    expect(sentenceCase('EQUIPMENT/TRUCK')).toBe('Equipment/truck');
  });

  it('plural', () => {
    expect(plural(1, 'job')).toBe('1 job');
    expect(plural(12, 'job')).toBe('12 jobs');
  });
});

describe('measure and fitting (pixel budgets, not characters)', () => {
  it('measures with Inter advances: wider weight is wider, tabular digits are equal', () => {
    expect(measureText('Nguyen', 56, 600)).toBeGreaterThan(measureText('Nguyen', 56, 400));
    expect(measureText('1111', 56, 600, true)).toBeCloseTo(measureText('0000', 56, 600, true), 5);
  });

  it('fitJoin drops items from the end until the line fits', () => {
    const r = fitJoin(['Wed 14 Oct', 'Demo data', 'Sources 9:29 am', 'x'.repeat(200)], 1728, 30, 500);
    expect(r.kept).toBe(3);
    expect(r.text).toBe('Wed 14 Oct · Demo data · Sources 9:29 am');
  });

  it('fitLine2 keeps a short why, ellipsizes a long one, never overflows', () => {
    expect(fitLine2('FIX', 'No depth marker or ruler')).toBe('No depth marker or ruler');
    const long = fitLine2('FIX', 'Blower-door reading not photographed on the second visit after the re-test');
    expect(long.endsWith('…')).toBe(true);
    expect(measureText('FIX', 42, 600) + measureText(` · ${long}`, 42, 400) + 0.78 * 42 + 12).toBeLessThanOrEqual(680);
  });

  it('crew token budget never drops under 352 px and grows beside a short name', () => {
    expect(crewTokenBudget('Ashby')).toBeGreaterThan(352);
    expect(crewTokenBudget('Wojciechowski-Abernathy')).toBe(352);
  });

  it('money table lines by crew count: 7 / 5 / 3 / 1 for 2 / 3 / 4 / 5 crews', () => {
    expect([2, 3, 4, 5].map(moneySlots)).toEqual([7, 5, 3, 1]);
    expect(moneySlots(1)).toBe(7); // a row is always kept for at least two crews
  });
});

describe('FIX due (decision 7: end of next business day)', () => {
  it.each([
    ['Sat 10 Oct → due end of Mon 12 Oct', '2026-10-10T20:20:00Z', '2026-10-13T04:00:00.000Z'],
    ['Thu 15 Oct → due end of Fri 16 Oct', '2026-10-15T18:00:00Z', '2026-10-17T04:00:00.000Z'],
    ['Fri 16 Oct → due end of Mon 19 Oct', '2026-10-16T18:00:00Z', '2026-10-20T04:00:00.000Z'],
  ])('%s', (_n, reviewedAt, due) => {
    expect(new Date(fixDueAt(reviewedAt)).toISOString()).toBe(due);
  });
});

const row = (who: string, band: LedgerRow['band'], klass: number, since: number, jobNumber = 1): LedgerRow => ({
  key: who,
  band,
  klass,
  jobId: `j-test-${who}`,
  jobNumber,
  who,
  icon: 'late',
  status: 'Late',
  statusTone: 'ink',
  why: '',
  age: '1 d',
  ageTone: 'ink',
  owner: 'JA',
  next: '→ x',
  since,
});

describe('ledger order and the names line', () => {
  it('band, then class, then oldest, then job number', () => {
    const rows = [row('C', 'today', 1, 1), row('B', 'act_today', 6, 5), row('A', 'act_today', 2, 9), row('Z', 'critical', 0, 3), row('Y', 'act_today', 2, 9, 0)];
    expect(rows.sort(compareLedgerRows).map((r) => r.who)).toEqual(['Z', 'Y', 'A', 'B', 'C']);
  });

  it('six rows or fewer: no names line; seven: five rows and every hidden name', () => {
    const six = ['A', 'B', 'C', 'D', 'E', 'F'].map((w, i) => row(w, 'act_today', 1, i));
    expect(ledgerSlots(six).names).toBe('');
    const seven = [...six, row('G', 'today', 1, 9)];
    const slots = ledgerSlots(seven);
    expect(slots.visible.map((r) => r.who)).toEqual(['A', 'B', 'C', 'D', 'E']);
    expect(slots.names).toBe('+2 · F · G');
  });

  it('names that do not fit end in `…`, never overflow', () => {
    const hidden = ['Wojciechowski', 'Abernathy-Cole', 'Lindqvist', 'Kowalski', 'Ibrahim', 'Nguyen', 'Greene', 'Holt', 'Santos'].map((w, i) => row(w, 'today', 1, i));
    const line = namesLine(hidden);
    expect(line.startsWith('+9 · Wojciechowski')).toBe(true);
    expect(line.endsWith('· …')).toBe(true);
    expect(measureText(line, 42, 500)).toBeLessThanOrEqual(1072);
  });
});

const v = (id: string, start: string, extra: Partial<Visit> = {}): Visit => ({
  id,
  jobId: `j-${id}`,
  startAt: start,
  endAt: start,
  createdAt: start,
  isComplete: false,
  isLastScheduledVisit: true,
  incompleteJobFormsCount: 0,
  formsSeenMax: 0,
  assignedUserIds: [],
  plannedAsPrep: false,
  resultSource: 'unknown',
  ...extra,
});

describe('last worked day and the future guard', () => {
  it('Monday reads the most recent earlier day with a visit (Sunday when crews worked it, else Friday)', () => {
    expect(lastWorkedDay([v('a', '2026-10-16T14:00:00Z'), v('b', '2026-10-18T14:00:00Z')], '2026-10-19')).toBe('2026-10-18');
    expect(lastWorkedDay([v('a', '2026-10-16T14:00:00Z'), v('c', '2026-10-19T14:00:00Z')], '2026-10-19')).toBe('2026-10-16');
    expect(lastWorkedDay([], '2026-10-19')).toBe('2026-10-18');
  });

  it('nothing dated after now exists yet: rows, notes and completions are dropped', () => {
    const now = '2026-10-19T11:10:00Z';
    const inputs = {
      now,
      jobs: [{ noteLines: [{ at: '2026-10-19T13:05:00Z', text: 'VISIT RESULT: Problem' }, { at: '2026-10-18T13:05:00Z', text: 'CLOSE: C' }], completedAt: '2026-10-19T12:30:00Z' }],
      visits: [v('m', '2026-10-19T11:00:00Z', { isComplete: true, completedAt: '2026-10-19T12:30:00Z' })],
      reviewRows: [{ reviewedAt: '2026-10-19T12:50:00Z' }, { reviewedAt: '2026-10-18T12:50:00Z' }],
      formAnswers: { m: { result: 'Completed', at: '2026-10-19T12:30:00Z' } },
      queuedRecaps: {},
    } as unknown as SourceInputs;
    const out = dropFuture(inputs);
    expect(out.jobs[0]?.noteLines).toHaveLength(1);
    expect(out.jobs[0]?.completedAt).toBeUndefined();
    expect(out.visits[0]?.isComplete).toBe(false);
    expect(out.reviewRows).toHaveLength(1);
    expect(out.formAnswers).toEqual({});
  });
});
