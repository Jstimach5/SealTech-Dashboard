/**
 * Revision G: the exact strings the TODAY wall prints on every fixture scenario. A failure here is a
 * visible defect on the TV or a rule that drifted from docs/board-brief.md and the plan's §4.
 */
import { describe, expect, it } from 'vitest';
import {
  crewRows,
  firstPassLine,
  headline,
  keptLine,
  ledgerSlots,
  measureText,
  metaLine,
  moneyLines,
  moneySlots,
  needsYou,
  staleLine,
  type LedgerRow,
} from '@sealtech/domain';
import { buildScenario } from '../build.js';
import { SCENARIOS } from '../scenarios.js';

function wall(name: string) {
  const s = buildScenario(name);
  const now = s.generatedAt;
  const rows = needsYou(s, now);
  return {
    s,
    rows,
    slots: ledgerSlots(rows),
    head: headline(rows, s, now),
    right: staleLine(s, now) ?? firstPassLine(s),
    kept: keptLine(s),
    money: moneyLines(s, now).slice(0, moneySlots(s.crews.length)),
    crews: crewRows(s, now),
    meta: metaLine(s, now),
  };
}
const brief = (r: LedgerRow) => `${r.who} | ${r.age} | ${r.owner} | ${r.status} · ${r.why} | ${r.ack ? (r.ack.overdue ? 'ACK+ring' : 'ACK') : r.next}`;

describe('default, Wed 14 Oct 9:30 am (the stress fixture)', () => {
  const w = wall('default');
  it('answer, win lines and head', () => {
    expect(w.head.text).toBe('Nguyen Problem · no ACK since 9:05 am');
    expect(w.right).toBe('READY 1st pass 3 of 4 jobs');
    expect(w.kept).toBe('Tue 5 of 7 visits kept · 2 unanswered');
  });
  it('ledger: five rows in band order, then every hidden name', () => {
    expect(w.slots.visible.map(brief)).toEqual([
      'Nguyen | 9:05 am | JA | Problem · Access | ACK+ring',
      'Varga | 2 d | AB | Late · Sun 11 Oct visit open | → done or not?',
      'Bauer | 21 d | JA | 1st review · no review row | → HA 4:30 pm',
      'Price | 11 d | OFFICE | HOLD · owner decides | → huddle',
      'Osei | 4 d | CREW | FIX · No depth marker or ruler | → was due Mon',
    ]);
    expect(w.slots.visible[2]?.secondary).toBe('Jobber: Unscheduled');
    expect(w.slots.names).toBe('+5 · Holt · Kowalski · Diaz · Rossi · Greene');
  });
  it('red marks only where decisions 31 and 41 put them: 3 rows', () => {
    expect(w.rows.filter((r) => r.ageTone === 'red' || r.statusTone === 'red').map((r) => r.who)).toEqual(['Nguyen', 'Bauer', 'Price']);
  });
  it('money table, crews and meta', () => {
    expect(w.s.hero.cannotInvoice).toBe(12);
    expect(w.money.map((m) => `${m.label}=${m.count}`)).toEqual(['done today, not READY=0', '1st pass · HA 4:30 pm=4', '2nd pass · JT 5 pm=1']);
    expect(w.crews.map((c) => `${c.name} ${c.token} / ${c.job} ${c.status}`)).toEqual([
      'Ashby → Okafor 1 pm / Nguyen Problem',
      'Brant last day · 2 of 2 / Rowe Now',
      'Corder Mbeki done / Ibrahim 10 am',
      'Dale → Patel 1 pm / Santos Now',
    ]);
    expect(w.meta).toBe('Wed 14 Oct · Demo data · Sources 9:29 am · Responder JA · No photo feed · 1 unmatched row · 1 form unanswered');
  });
});

describe('huddle-day, 7:00 am', () => {
  const w = wall('huddle-day');
  it('answer adds up and the future 8:50 review row is ignored', () => {
    expect(w.head.text).toBe('5 to act on now · 4 more today');
    expect(w.right).toBe('READY 1st pass 1 of 2 jobs');
    expect(w.s.hero.cannotInvoice).toBe(11);
    expect(w.money.map((m) => m.count)).toEqual([0, 5, 0]);
    expect(w.slots.names).toBe('+4 · Kowalski · Diaz · Rossi · Greene');
    expect(w.crews.map((c) => `${c.token} / ${c.job} ${c.status}`)).toEqual([
      '→ Okafor 1 pm / Nguyen 8 am',
      'last day · 2 of 2 / Rowe 8 am',
      '→ Ibrahim 10 am / Mbeki Now',
      '→ Patel 1 pm / Santos 8:30 am',
    ]);
  });
});

describe('late-afternoon, 4:10 pm', () => {
  const w = wall('late-afternoon');
  it('Ibrahim still open leads; Nguyen dropped to a return to book; crews flipped to tomorrow', () => {
    expect(w.head.text).toBe('6 to act on now · 5 more today');
    expect(brief(w.slots.visible[0] as LedgerRow)).toBe('Ibrahim | 2 h | CREW | Still open · ended 2 pm | → answer it');
    expect(w.rows.find((r) => r.who === 'Nguyen') && brief(w.rows.find((r) => r.who === 'Nguyen') as LedgerRow)).toBe('Nguyen | today | HA | Problem · ACK 9:14 am | → book return');
    expect(w.slots.names).toBe('+6 · Holt · Kowalski · Diaz · Nguyen · Rossi · Greene');
    expect(w.money.map((m) => `${m.label}=${m.count}`)).toEqual(['done today, not READY=2', '1st pass · HA 4:30 pm=4', '2nd pass · JT 5 pm=1']);
    expect(w.crews.map((c) => `${c.token}${c.tokenTone === 'amber' ? '!' : ''} / ${c.job} ${c.status}`)).toEqual([
      'tomorrow Lee / Okafor Now',
      'none tomorrow! / Rowe Completed',
      'tomorrow Tanaka / Ibrahim Still open',
      'tomorrow Quinn / Patel Now',
    ]);
    expect(w.meta.endsWith('1 write queued') || w.meta.includes('1 form unanswered')).toBe(true);
  });
});

describe('stale, 9:30 am (Jobber last loaded 8:45)', () => {
  const w = wall('stale');
  it('the Problem stays on line 1 but claims only what the data knows; no ring', () => {
    expect(w.head.text).toBe('Nguyen Problem · no ACK as of 8:45 am');
    expect(w.right).toBe('Stale · Jobber as of 8:45 am');
    expect(w.rows[0]?.ack).toEqual({ overdue: false });
    expect(w.meta).toContain('Jobber 8:45 am · Review sheet 9:17 am');
  });
});

describe('overflow, five crews', () => {
  const w = wall('overflow');
  it('every crew keeps a row; money keeps one line', () => {
    expect(w.crews.map((c) => c.name)).toEqual(['Ashby', 'Brant', 'Corder', 'Dale', 'Evans']);
    expect(w.money.map((m) => m.label)).toEqual(['done today, not READY']);
  });
});

describe('monday-scorecard, Mon 19 Oct 7:10 am', () => {
  const w = wall('monday-scorecard');
  it('no Problem from the future; last worked day; last week first pass', () => {
    expect(w.rows.some((r) => r.band === 'critical')).toBe(false);
    expect(w.head.text).toBe('5 to act on now · 4 more today');
    expect(w.kept).toBe('Sun 5 of 7 visits kept · 2 unanswered');
    expect(w.right.startsWith('last week READY 1st pass')).toBe(true);
  });
});

describe('typical (live-shaped landing scenario)', () => {
  const w = wall('typical');
  it('two crews, five jobs, room to spare', () => {
    expect(w.head.text).toBe('2 to act on now · 2 more today');
    expect(w.slots.visible.map((r) => r.who)).toEqual(['Varga', 'Price', 'Kowalski', 'Rossi']);
    expect(w.s.hero.cannotInvoice).toBe(5);
    expect(w.money).toHaveLength(7);
    expect(w.crews).toHaveLength(2);
  });
});

describe('all-clear', () => {
  const w = wall('all-clear');
  it('says nothing is open and how many visits are out', () => {
    expect(w.rows).toEqual([]);
    expect(w.head.text).toMatch(/^Nothing open · \d+ visits today$/);
  });
});

describe('busy', () => {
  const w = wall('busy');
  it('two Problems name the first time; red rows still never hide behind a quiet one', () => {
    expect(w.head.text).toBe('2 Problems · no ACK · first 9:05 am');
    const firstToday = w.rows.findIndex((r) => r.band === 'today');
    expect(w.rows.slice(firstToday).every((r) => r.band === 'today')).toBe(true);
    expect(w.slots.names.endsWith('…')).toBe(true);
  });
});

describe('every scenario', () => {
  it.each(Object.keys(SCENARIOS))('%s: the answer adds up and every line fits its pixel budget', (name) => {
    const w = wall(name);
    expect(w.head.now + w.head.today).toBe(w.rows.length);
    expect(w.slots.visible.length + w.slots.hidden.length).toBe(w.rows.length);
    expect(measureText(w.head.text, 76, 'd700')).toBeLessThanOrEqual(1728);
    expect(measureText(w.meta, 30, 500)).toBeLessThanOrEqual(1728);
    expect(measureText(w.slots.names, 42, 500)).toBeLessThanOrEqual(1072);
    for (const r of w.rows) {
      expect(measureText(r.next, 42, 500), `${name} ${r.who} next`).toBeLessThanOrEqual(340);
      expect(0.78 * 42 + 12 + measureText(r.status, 42, 600) + (r.why ? measureText(` · ${r.why}`, 42, 400) : 0), `${name} ${r.who} line 2`).toBeLessThanOrEqual(680);
      expect(measureText(r.age, 56, 600, true), `${name} ${r.who} age`).toBeLessThanOrEqual(272);
    }
    for (const c of w.crews) {
      expect(measureText(c.name, 42, 500) + 40 + measureText(c.token, 42, 400), `${name} ${c.name} line 1`).toBeLessThanOrEqual(544);
      expect(measureText(c.status, 42, 600) + 0.78 * 42 + 12, `${name} ${c.name} status`).toBeLessThanOrEqual(272);
    }
    for (const m of w.money) expect(measureText(m.label, 42, 500), `${name} ${m.label}`).toBeLessThanOrEqual(470);
    const banned = /\b(confirmed|safe|passed|compliant|stopped|on plan)\b/i;
    const all = [w.head.text, w.right, w.kept, w.meta, w.slots.names, ...w.rows.flatMap((r) => [r.status, r.why, r.next]), ...w.crews.flatMap((c) => [c.token, c.status])];
    for (const t of all) expect(t, t).not.toMatch(banned);
  });
});
