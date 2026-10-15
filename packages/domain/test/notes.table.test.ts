import { describe, expect, it } from 'vitest';
import { CLOSE_CODES, MISS_REASONS, VISIT_RESULTS, type CloseCode, type MissReason, type VisitResult } from '../src/enums.js';
import {
  formatAckLine,
  formatCloseLine,
  formatVisitResultLine,
  parseNoteText,
  parseNotes,
  type ParsedNotes,
} from '../src/derive/notes.js';
import type { Instant, NoteLine } from '../src/types.js';

// Wed Oct 14 2026, EDT (offset -240). 09:14 local = 13:14Z; 16:00 local (the close) = 20:00Z.
const AT_MORNING: Instant = '2026-10-14T13:14:00Z';
const AT_CLOSE: Instant = '2026-10-14T20:00:00Z';
const AT_NEXT_DAY: Instant = '2026-10-15T12:00:00Z';

describe('parseNoteText: one note body (decisions 11, 41, 42)', () => {
  const closeCodeCases = CLOSE_CODES.map((code) => ({
    name: `CLOSE: ${code} → closeCode ${code}`,
    input: `CLOSE: ${code}`,
    expected: { closeCode: code, closeAt: AT_CLOSE } as Partial<ParsedNotes>,
  }));

  const cases: Array<{ name: string; input: string; expected: Partial<ParsedNotes> }> = [
    ...closeCodeCases,
    {
      name: 'CLOSE: PR / ACCESS → code + reason',
      input: 'CLOSE: PR / ACCESS',
      expected: { closeCode: 'PR', closeAt: AT_CLOSE, closeMissReason: 'ACCESS' },
    },
    {
      name: "CLOSE: NW-R / pre existing → 'PRE-EXISTING' (hyphen/space tolerant)",
      input: 'CLOSE: NW-R / pre existing',
      expected: { closeCode: 'NW-R', closeAt: AT_CLOSE, closeMissReason: 'PRE-EXISTING' },
    },
    {
      name: 'CLOSE: RS / Equipment / Truck → EQUIPMENT/TRUCK (first slash splits, spaces around the second are dropped)',
      input: 'CLOSE: RS / Equipment / Truck',
      expected: { closeCode: 'RS', closeAt: AT_CLOSE, closeMissReason: 'EQUIPMENT/TRUCK' },
    },
    {
      name: 'close: cm. (lowercase, trailing period, extra spaces) → CM',
      input: '  close :   cm .  ',
      expected: { closeCode: 'CM', closeAt: AT_CLOSE },
    },
    {
      name: 'CLOSE: PR / BOGUS → code kept, unknown reason dropped',
      input: 'CLOSE: PR / BOGUS',
      expected: { closeCode: 'PR', closeAt: AT_CLOSE },
    },
    ...VISIT_RESULTS.map((result) => ({
      name: `VISIT RESULT: ${result} → visitResult ${result}`,
      input: `VISIT RESULT: ${result}`,
      expected: { visitResult: result, visitResultAt: AT_CLOSE } as Partial<ParsedNotes>,
    })),
    {
      name: 'visit result: return needed (lowercase) → Return needed',
      input: 'visit result: return needed',
      expected: { visitResult: 'Return needed', visitResultAt: AT_CLOSE },
    },
    {
      name: 'VISIT RESULT: Problem / ACCESS — gate locked, nobody home → reason kept, free text ignored (em dash)',
      input: 'VISIT RESULT: Problem / ACCESS — gate locked, nobody home',
      expected: { visitResult: 'Problem', visitResultAt: AT_CLOSE, visitMissReason: 'ACCESS' },
    },
    {
      name: 'VISIT RESULT: Not started / weather - rain all day → reason kept, free text ignored (hyphen)',
      input: 'VISIT RESULT: Not started / weather - rain all day',
      expected: { visitResult: 'Not started', visitResultAt: AT_CLOSE, visitMissReason: 'WEATHER' },
    },
    {
      name: 'VISIT RESULT: Completed — all good. → free text with no reason ignored',
      input: 'VISIT RESULT: Completed — all good.',
      expected: { visitResult: 'Completed', visitResultAt: AT_CLOSE },
    },
    {
      name: 'VISIT RESULT: Return needed / scope-changed → SCOPE CHANGED',
      input: 'VISIT RESULT: Return needed / scope-changed',
      expected: { visitResult: 'Return needed', visitResultAt: AT_CLOSE, visitMissReason: 'SCOPE CHANGED' },
    },
    {
      name: 'PR: day 2 of 3 → prDay {2, 3}',
      input: 'PR: day 2 of 3',
      expected: { prDay: { n: 2, m: 3, at: AT_CLOSE } },
    },
    {
      name: 'pr: DAY 1 OF 1. → prDay {1, 1}',
      input: 'pr: DAY 1 OF 1.',
      expected: { prDay: { n: 1, m: 1, at: AT_CLOSE } },
    },
    {
      name: 'ACK 9:14 JJ → ack {hhmm 9:14, JJ, at = note at}',
      input: 'ACK 9:14 JJ',
      expected: { ack: { at: AT_CLOSE, initials: 'JJ', hhmm: '9:14' } },
    },
    {
      name: 'ACK 14:05 KLM → ack {hhmm 14:05, KLM}',
      input: 'ACK 14:05 KLM',
      expected: { ack: { at: AT_CLOSE, initials: 'KLM', hhmm: '14:05' } },
    },
    {
      name: 'ack 9:14 jj. → initials uppercased, trailing period tolerated',
      input: 'ack 9:14 jj.',
      expected: { ack: { at: AT_CLOSE, initials: 'JJ', hhmm: '9:14' } },
    },
    {
      name: 'multi-line body: CLOSE and ACK in one note',
      input: 'CLOSE: PR / ACCESS\nACK 16:02 JJ',
      expected: { closeCode: 'PR', closeAt: AT_CLOSE, closeMissReason: 'ACCESS', ack: { at: AT_CLOSE, initials: 'JJ', hhmm: '16:02' } },
    },
    {
      name: 'multi-line body with CRLF and unknown lines around a VISIT RESULT',
      input: 'Crew note for the office\r\nVISIT RESULT: Prepped\r\nback tomorrow',
      expected: { visitResult: 'Prepped', visitResultAt: AT_CLOSE },
    },
    {
      name: 'same kind twice in one body → the lower line wins',
      input: 'CLOSE: PR\nCLOSE: C',
      expected: { closeCode: 'C', closeAt: AT_CLOSE },
    },
    // Garbage: never throws, never yields a value.
    { name: "garbage 'hello' → {}", input: 'hello', expected: {} },
    { name: "garbage 'CLOSE:' (no code) → {}", input: 'CLOSE:', expected: {} },
    { name: "garbage 'CLOSE: XX' (unknown code) → {}", input: 'CLOSE: XX', expected: {} },
    { name: "garbage 'ACK JJ' (no time) → {}", input: 'ACK JJ', expected: {} },
    { name: "garbage 'ACK 25:99 JJ' (impossible time) → {}", input: 'ACK 25:99 JJ', expected: {} },
    { name: "garbage 'ACK 9:14 J' (one letter) → {}", input: 'ACK 9:14 J', expected: {} },
    { name: "garbage 'VISIT RESULT: Maybe' → {}", input: 'VISIT RESULT: Maybe', expected: {} },
    { name: "garbage 'VISIT RESULT:' → {}", input: 'VISIT RESULT:', expected: {} },
    { name: "garbage 'PR: day two of three' → {}", input: 'PR: day two of three', expected: {} },
    { name: "garbage 'PR: day 0 of 3' → {}", input: 'PR: day 0 of 3', expected: {} },
    { name: "garbage 'CLOSED: C' (wrong keyword) → {}", input: 'CLOSED: C', expected: {} },
    { name: 'empty string → {}', input: '', expected: {} },
    { name: 'whitespace only → {}', input: '   \n  \n', expected: {} },
  ];

  it.each(cases)('$name', ({ input, expected }) => {
    expect(parseNoteText(input, AT_CLOSE)).toEqual(expected);
  });
});

describe('parseNotes: newest line of each kind wins (decisions 11, 41)', () => {
  const note = (at: Instant, text: string): NoteLine => ({ at, text });

  const cases: Array<{ name: string; input: NoteLine[]; expected: ParsedNotes }> = [
    { name: 'empty array → {}', input: [], expected: {} },
    {
      name: 'earlier CLOSE: PR then later CLOSE: C → C at the later note',
      input: [note(AT_CLOSE, 'CLOSE: PR'), note(AT_NEXT_DAY, 'CLOSE: C')],
      expected: { closeCode: 'C', closeAt: AT_NEXT_DAY },
    },
    {
      name: 'later note listed first still wins (ordered by at, not by array position)',
      input: [note(AT_NEXT_DAY, 'CLOSE: C'), note(AT_CLOSE, 'CLOSE: PR')],
      expected: { closeCode: 'C', closeAt: AT_NEXT_DAY },
    },
    {
      name: 'equal at → later in the array wins',
      input: [note(AT_CLOSE, 'CLOSE: PR'), note(AT_CLOSE, 'CLOSE: RS')],
      expected: { closeCode: 'RS', closeAt: AT_CLOSE },
    },
    {
      name: 'newer CLOSE without a reason clears the older reason',
      input: [note(AT_CLOSE, 'CLOSE: PR / ACCESS'), note(AT_NEXT_DAY, 'CLOSE: C')],
      expected: { closeCode: 'C', closeAt: AT_NEXT_DAY },
    },
    {
      name: 'kinds resolve independently: ACK from the morning note, CLOSE from the close note',
      input: [note(AT_MORNING, 'ACK 9:14 JJ'), note(AT_CLOSE, 'CLOSE: PR / ACCESS')],
      expected: { closeCode: 'PR', closeAt: AT_CLOSE, closeMissReason: 'ACCESS', ack: { at: AT_MORNING, initials: 'JJ', hhmm: '9:14' } },
    },
    {
      name: 'VISIT RESULT from the crew, later overridden by the closer (decision 42 override at 16:00)',
      input: [
        note(AT_MORNING, 'VISIT RESULT: Problem / ACCESS — gate locked'),
        note(AT_CLOSE, 'VISIT RESULT: Return needed / SCOPE CHANGED'),
      ],
      expected: { visitResult: 'Return needed', visitResultAt: AT_CLOSE, visitMissReason: 'SCOPE CHANGED' },
    },
    {
      name: 'PR day advances with the newest note',
      input: [note(AT_CLOSE, 'PR: day 1 of 3'), note(AT_NEXT_DAY, 'PR: day 2 of 3')],
      expected: { prDay: { n: 2, m: 3, at: AT_NEXT_DAY } },
    },
    {
      name: 'all four kinds across three notes',
      input: [
        note(AT_MORNING, 'VISIT RESULT: Problem / MATERIALS — short on batts'),
        note(AT_MORNING, 'ACK 9:14 JJ'),
        note(AT_CLOSE, 'CLOSE: NW-W / materials\nPR: day 1 of 2'),
      ],
      expected: {
        closeCode: 'NW-W',
        closeAt: AT_CLOSE,
        closeMissReason: 'MATERIALS',
        visitResult: 'Problem',
        visitResultAt: AT_MORNING,
        visitMissReason: 'MATERIALS',
        prDay: { n: 1, m: 2, at: AT_CLOSE },
        ack: { at: AT_MORNING, initials: 'JJ', hhmm: '9:14' },
      },
    },
    {
      name: 'garbage notes mixed in are ignored',
      input: [note(AT_MORNING, 'hello'), note(AT_CLOSE, 'CLOSE: XX'), note(AT_CLOSE, 'ACK JJ'), note(AT_NEXT_DAY, 'CLOSE: C')],
      expected: { closeCode: 'C', closeAt: AT_NEXT_DAY },
    },
    {
      name: 'a note with an unparseable at is skipped, never thrown',
      input: [note('not-a-date', 'CLOSE: C'), note(AT_CLOSE, 'CLOSE: PR')],
      expected: { closeCode: 'PR', closeAt: AT_CLOSE },
    },
    {
      name: 'a note whose text is not a string is skipped, never thrown',
      input: [{ at: AT_CLOSE, text: undefined as unknown as string }, note(AT_CLOSE, 'ACK 16:02 KLM')],
      expected: { ack: { at: AT_CLOSE, initials: 'KLM', hhmm: '16:02' } },
    },
  ];

  it.each(cases)('$name', ({ input, expected }) => {
    expect(parseNotes(input)).toEqual(expected);
  });
});

describe('format helpers produce the canonical strings', () => {
  const cases: Array<{ name: string; input: () => string; expected: string }> = [
    { name: 'formatCloseLine(PR, ACCESS)', input: () => formatCloseLine('PR', 'ACCESS'), expected: 'CLOSE: PR / ACCESS' },
    { name: 'formatCloseLine(C)', input: () => formatCloseLine('C'), expected: 'CLOSE: C' },
    {
      name: 'formatVisitResultLine(Problem, ACCESS, note)',
      input: () => formatVisitResultLine('Problem', 'ACCESS', 'gate locked'),
      expected: 'VISIT RESULT: Problem / ACCESS — gate locked',
    },
    {
      name: 'formatVisitResultLine(Completed) has no reason or dash',
      input: () => formatVisitResultLine('Completed'),
      expected: 'VISIT RESULT: Completed',
    },
    {
      name: 'formatVisitResultLine(Completed, undefined, note) keeps the note without a reason',
      input: () => formatVisitResultLine('Completed', undefined, 'left key under mat'),
      expected: 'VISIT RESULT: Completed — left key under mat',
    },
    {
      name: 'formatVisitResultLine flattens a multi-line note and drops an empty one',
      input: () => formatVisitResultLine('Problem', 'OTHER', '  dog loose\n in yard  '),
      expected: 'VISIT RESULT: Problem / OTHER — dog loose in yard',
    },
    {
      name: 'formatVisitResultLine with a blank note omits the dash',
      input: () => formatVisitResultLine('Problem', 'OTHER', '   '),
      expected: 'VISIT RESULT: Problem / OTHER',
    },
    { name: 'formatAckLine(9:14, JJ)', input: () => formatAckLine('9:14', 'JJ'), expected: 'ACK 9:14 JJ' },
    { name: 'formatAckLine(14:05, klm) uppercases initials', input: () => formatAckLine('14:05', 'klm'), expected: 'ACK 14:05 KLM' },
  ];

  it.each(cases)('$name', ({ input, expected }) => {
    expect(input()).toBe(expected);
  });
});

describe('round trip: format → parse gives back the same values', () => {
  const closeCases: Array<{ name: string; input: { code: CloseCode; missReason?: MissReason }; expected: Partial<ParsedNotes> }> = [
    ...CLOSE_CODES.map((code) => ({
      name: `CLOSE ${code}, no reason`,
      input: { code },
      expected: { closeCode: code, closeAt: AT_CLOSE } as Partial<ParsedNotes>,
    })),
    ...MISS_REASONS.map((missReason) => ({
      name: `CLOSE PR / ${missReason}`,
      input: { code: 'PR' as CloseCode, missReason },
      expected: { closeCode: 'PR', closeAt: AT_CLOSE, closeMissReason: missReason } as Partial<ParsedNotes>,
    })),
  ];

  it.each(closeCases)('$name', ({ input, expected }) => {
    expect(parseNoteText(formatCloseLine(input.code, input.missReason), AT_CLOSE)).toEqual(expected);
  });

  const visitCases: Array<{
    name: string;
    input: { result: VisitResult; missReason?: MissReason; note?: string };
    expected: Partial<ParsedNotes>;
  }> = [
    ...VISIT_RESULTS.map((result) => ({
      name: `VISIT RESULT ${result}, no reason`,
      input: { result },
      expected: { visitResult: result, visitResultAt: AT_MORNING } as Partial<ParsedNotes>,
    })),
    ...MISS_REASONS.map((missReason) => ({
      name: `VISIT RESULT Problem / ${missReason} — with a note`,
      input: { result: 'Problem' as VisitResult, missReason, note: 'free text / with - dashes — inside' },
      expected: { visitResult: 'Problem', visitResultAt: AT_MORNING, visitMissReason: missReason } as Partial<ParsedNotes>,
    })),
  ];

  it.each(visitCases)('$name', ({ input, expected }) => {
    expect(parseNoteText(formatVisitResultLine(input.result, input.missReason, input.note), AT_MORNING)).toEqual(expected);
  });

  const ackCases: Array<{ name: string; input: { hhmm: string; initials: string }; expected: Partial<ParsedNotes> }> = [
    { name: 'ACK 9:14 JJ', input: { hhmm: '9:14', initials: 'JJ' }, expected: { ack: { at: AT_MORNING, initials: 'JJ', hhmm: '9:14' } } },
    { name: 'ACK 14:05 KLM', input: { hhmm: '14:05', initials: 'KLM' }, expected: { ack: { at: AT_MORNING, initials: 'KLM', hhmm: '14:05' } } },
    { name: 'ACK 09:14 JJ keeps the leading zero as written', input: { hhmm: '09:14', initials: 'JJ' }, expected: { ack: { at: AT_MORNING, initials: 'JJ', hhmm: '09:14' } } },
  ];

  it.each(ackCases)('$name', ({ input, expected }) => {
    expect(parseNoteText(formatAckLine(input.hhmm, input.initials), AT_MORNING)).toEqual(expected);
  });

  it('a full recap + close + ack body written by the helpers parses back whole', () => {
    const body = [formatVisitResultLine('Problem', 'ACCESS', 'gate locked'), formatCloseLine('PR', 'ACCESS'), formatAckLine('9:14', 'JJ')].join('\n');
    expect(parseNotes([{ at: AT_CLOSE, text: body }])).toEqual({
      closeCode: 'PR',
      closeAt: AT_CLOSE,
      closeMissReason: 'ACCESS',
      visitResult: 'Problem',
      visitResultAt: AT_CLOSE,
      visitMissReason: 'ACCESS',
      ack: { at: AT_CLOSE, initials: 'JJ', hhmm: '9:14' },
    });
  });
});
