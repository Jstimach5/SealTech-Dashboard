import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config.js';
import { boardStale, sourceFreshness, type BoardStaleness, type Freshness } from '../src/derive/staleness.js';
import { addMinutes } from '../src/derive/time.js';
import type { Instant, SourceName, SourceStatus } from '../src/types.js';

// Wed Oct 14 2026, EDT (offset -240): 07:00 local.
const NOW: Instant = '2026-10-14T11:00:00Z';
const AMBER = CONFIG.STALE_AMBER_MIN;
const RED = CONFIG.STALE_RED_MIN;

/** A source whose last complete successful load was `minutesAgo` before NOW. */
function okAgo(minutesAgo: number): Instant {
  return addMinutes(NOW, -minutesAgo);
}

function mkSource(overrides: Partial<SourceStatus> = {}): SourceStatus {
  return { connected: true, ok: true, lastOkAt: okAgo(1), ...overrides };
}

function mkSources(overrides: Partial<Record<SourceName, SourceStatus>> = {}): Record<SourceName, SourceStatus> {
  return {
    jobber: mkSource(),
    reviewSheet: mkSource(),
    flagsSheet: mkSource(),
    companyCam: { connected: false, ok: false },
    ...overrides,
  };
}

describe('sourceFreshness (brief §2 stale indicator)', () => {
  const cases: Array<{ name: string; input: SourceStatus; expected: Freshness }> = [
    { name: 'loaded just now → green', input: mkSource({ lastOkAt: okAgo(0) }), expected: 'green' },
    { name: `${AMBER - 1} min (9) → green`, input: mkSource({ lastOkAt: okAgo(AMBER - 1) }), expected: 'green' },
    { name: `${AMBER} min (10) → amber (boundary)`, input: mkSource({ lastOkAt: okAgo(AMBER) }), expected: 'amber' },
    { name: `${RED - 1} min (29) → amber`, input: mkSource({ lastOkAt: okAgo(RED - 1) }), expected: 'amber' },
    { name: `${RED} min (30) → red (boundary)`, input: mkSource({ lastOkAt: okAgo(RED) }), expected: 'red' },
    { name: '4 hours → red', input: mkSource({ lastOkAt: okAgo(240) }), expected: 'red' },
    {
      name: 'connected but never loaded (no lastOkAt) → red',
      input: { connected: true, ok: false, lastAttemptAt: okAgo(1), error: 'timeout' },
      expected: 'red',
    },
    {
      name: 'not connected with a fresh lastOkAt → off (negative: connection wins)',
      input: mkSource({ connected: false, lastOkAt: okAgo(1) }),
      expected: 'off',
    },
    { name: 'not connected and never loaded → off', input: { connected: false, ok: false }, expected: 'off' },
    {
      name: 'fresh lastAttemptAt but old lastOkAt → red (negative: attempts are not loads)',
      input: mkSource({ lastOkAt: okAgo(RED + 5), lastAttemptAt: okAgo(0), ok: false, error: '502' }),
      expected: 'red',
    },
    {
      name: 'old lastAttemptAt with fresh lastOkAt → green (lastAttemptAt ignored both ways)',
      input: mkSource({ lastOkAt: okAgo(2), lastAttemptAt: okAgo(RED + 5) }),
      expected: 'green',
    },
    {
      name: 'ok:false with a fresh lastOkAt → green (ok flag says nothing about freshness)',
      input: mkSource({ ok: false, error: 'last poll failed', lastOkAt: okAgo(3) }),
      expected: 'green',
    },
  ];

  it.each(cases)('$name', ({ input, expected }) => {
    expect(sourceFreshness(input, NOW)).toBe(expected);
  });
});

describe('boardStale (decision 1; revision G: Jobber or the Review sheet)', () => {
  const cases: Array<{ name: string; input: Record<SourceName, SourceStatus>; expected: BoardStaleness }> = [
    {
      name: 'everything fresh → not stale, echoes jobber lastOkAt and 1 min',
      input: mkSources(),
      expected: { stale: false, lastJobberOkAt: okAgo(1), minutesSince: 1 },
    },
    {
      name: 'review sheet red but jobber green → stale on the review sheet (revision G: the wall reads both)',
      input: mkSources({ reviewSheet: mkSource({ lastOkAt: okAgo(RED + 10) }) }),
      expected: { stale: true, source: 'reviewSheet', lastOkAt: okAgo(RED + 10), lastJobberOkAt: okAgo(1), minutesSince: 1 },
    },
    {
      name: 'flags sheet red alone → not stale (negative: the wall does not read Flags)',
      input: mkSources({ flagsSheet: mkSource({ lastOkAt: okAgo(RED + 10) }) }),
      expected: { stale: false, lastJobberOkAt: okAgo(1), minutesSince: 1 },
    },
    {
      name: 'jobber amber (15 min) → not stale yet',
      input: mkSources({ jobber: mkSource({ lastOkAt: okAgo(15) }) }),
      expected: { stale: false, lastJobberOkAt: okAgo(15), minutesSince: 15 },
    },
    {
      name: `jobber exactly ${RED} min → stale`,
      input: mkSources({ jobber: mkSource({ lastOkAt: okAgo(RED) }) }),
      expected: { stale: true, source: 'jobber', lastOkAt: okAgo(RED), lastJobberOkAt: okAgo(RED), minutesSince: RED },
    },
    {
      name: 'jobber red while sheets green → stale (jobber alone decides)',
      input: mkSources({ jobber: mkSource({ lastOkAt: okAgo(45), ok: false, error: 'rate limited' }) }),
      expected: { stale: true, source: 'jobber', lastOkAt: okAgo(45), lastJobberOkAt: okAgo(45), minutesSince: 45 },
    },
    {
      name: 'minutesSince rounds down (30.9 min → 30)',
      input: mkSources({ jobber: mkSource({ lastOkAt: addMinutes(NOW, -30.9) }) }),
      expected: { stale: true, source: 'jobber', lastOkAt: addMinutes(NOW, -30.9), lastJobberOkAt: addMinutes(NOW, -30.9), minutesSince: 30 },
    },
    {
      name: 'jobber connected but never loaded → stale, no lastJobberOkAt / minutesSince',
      input: mkSources({ jobber: { connected: true, ok: false, lastAttemptAt: okAgo(0), error: 'boot' } }),
      expected: { stale: true, source: 'jobber' },
    },
    {
      name: 'jobber not connected (fixtures mode, decision 47) → off, not stale',
      input: mkSources({ jobber: { connected: false, ok: false } }),
      expected: { stale: false },
    },
  ];

  it.each(cases)('$name', ({ input, expected }) => {
    expect(boardStale(input, NOW)).toStrictEqual(expected);
  });
});
