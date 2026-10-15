import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config.js';
import {
  recapDecision,
  sha256Hex,
  shouldDropReview,
  stableJson,
  submissionId,
  type RecapDecision,
  type ReviewTap,
} from '../src/derive/dedupe.js';
import { addMinutes } from '../src/derive/time.js';
import type { Instant } from '../src/types.js';

// Wed Oct 14 2026, EDT (offset -240): 16:20 local, inside Henry's first-pass window (decision 40).
const AT: Instant = '2026-10-14T20:20:00Z';
const WINDOW = CONFIG.REVIEW_DEDUPE_MIN;

describe('sha256Hex (pure JS, UTF-8)', () => {
  const cases: Array<{ name: string; input: string; expected: string }> = [
    { name: 'empty string', input: '', expected: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' },
    { name: 'abc', input: 'abc', expected: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad' },
    { name: 'é (two UTF-8 bytes, not one UTF-16 unit)', input: 'é', expected: '4a99557e4033c3539de2eb65472017cad5f9557f7a0625a09f1c3f6e2ba69c4c' },
    { name: 'café', input: 'café', expected: '850f7dc43910ff890f8879c0ed26fe697c93a067ad93a7d50f466a7028a9bf4e' },
    {
      name: '56 bytes (FIPS vector; padding spills into a second block)',
      input: 'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq',
      expected: '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    },
    { name: '55 bytes (last size that pads in one block)', input: 'a'.repeat(55), expected: '9f4390f8d30c2dd92ec9f095b65e2b9ae9b0a925a5258e241c9f1e910f734318' },
    { name: '64 bytes (exactly one block of message)', input: 'a'.repeat(64), expected: 'ffe054fe7ae0cb6dc65c3af9b61d5209f439851db43d0ba5997337df154668eb' },
    { name: '1000 bytes', input: 'a'.repeat(1000), expected: '41edece42d63e8d9bf515a9ba6932e1c20cbc9f5a5d134645adb5db1b9737ea3' },
    { name: 'wall label with middle dot', input: 'SMITH · TESTVILLE · ATT', expected: 'c9072b1b6ac1c7979c75cf14334390c14a6ca18f9016b1768152d8ac5c09355a' },
  ];

  it.each(cases)('$name', ({ input, expected }) => {
    expect(sha256Hex(input)).toBe(expected);
  });
});

describe('stableJson', () => {
  const cases: Array<{ name: string; input: unknown; expected: string }> = [
    { name: 'sorts top-level keys', input: { b: 1, a: 2 }, expected: '{"a":2,"b":1}' },
    { name: 'already sorted is unchanged', input: { a: 2, b: 1 }, expected: '{"a":2,"b":1}' },
    {
      name: 'nested objects sorted, arrays keep order',
      input: { z: [{ y: 1, x: 2 }, 3, [{ d: 4, c: 5 }]], a: { m: 1, k: 2 } },
      expected: '{"a":{"k":2,"m":1},"z":[{"x":2,"y":1},3,[{"c":5,"d":4}]]}',
    },
    { name: 'array order is significant (negative)', input: [2, 1], expected: '[2,1]' },
    { name: 'undefined values are dropped like JSON.stringify', input: { b: undefined, a: 1 }, expected: '{"a":1}' },
    { name: 'null is kept', input: { a: null }, expected: '{"a":null}' },
    { name: 'primitives pass through', input: 'x', expected: '"x"' },
    { name: 'top-level undefined → null text', input: undefined, expected: 'null' },
  ];

  it.each(cases)('$name', ({ input, expected }) => {
    expect(stableJson(input)).toBe(expected);
  });

  it('key order independence: {b:1,a:2} === {a:2,b:1}', () => {
    expect(stableJson({ b: 1, a: 2 })).toBe(stableJson({ a: 2, b: 1 }));
  });
});

describe('submissionId (decisions 1, 8, 11)', () => {
  const payloadA = { verdict: 'READY', notes: 'all shots present', pass: 1 };
  const payloadB = { pass: 1, notes: 'all shots present', verdict: 'READY' };

  const cases: Array<{ name: string; left: string; right: string; same: boolean }> = [
    {
      name: 'same payload with different key order → same id',
      left: submissionId('review_row', 'job-test-1', 1, payloadA),
      right: submissionId('review_row', 'job-test-1', 1, payloadB),
      same: true,
    },
    {
      name: 'pass 1 vs pass 2 → different ids (negative)',
      left: submissionId('review_row', 'job-test-1', 1, payloadA),
      right: submissionId('review_row', 'job-test-1', 2, payloadA),
      same: false,
    },
    {
      name: 'pass undefined vs pass 1 → different ids',
      left: submissionId('review_row', 'job-test-1', undefined, payloadA),
      right: submissionId('review_row', 'job-test-1', 1, payloadA),
      same: false,
    },
    {
      name: 'different kind, same target and payload → different ids',
      left: submissionId('visit_note', 'visit-test-1', undefined, { text: 'ACK 9:14 JJ' }),
      right: submissionId('ack', 'visit-test-1', undefined, { text: 'ACK 9:14 JJ' }),
      same: false,
    },
    {
      name: 'different target → different ids',
      left: submissionId('ack', 'visit-test-1', undefined, { initials: 'JJ' }),
      right: submissionId('ack', 'visit-test-2', undefined, { initials: 'JJ' }),
      same: false,
    },
  ];

  it.each(cases)('$name', ({ left, right, same }) => {
    expect(left).toMatch(/^[0-9a-f]{64}$/);
    if (same) expect(left).toBe(right);
    else expect(left).not.toBe(right);
  });

  it('is sha256 of kind|targetId|pass|stableJson(payload)', () => {
    expect(submissionId('ack', 'visit-test-1', 2, { b: 1, a: 2 })).toBe(sha256Hex('ack|visit-test-1|2|{"a":2,"b":1}'));
    expect(submissionId('ack', 'visit-test-1', undefined, { b: 1, a: 2 })).toBe(sha256Hex('ack|visit-test-1||{"a":2,"b":1}'));
  });
});

describe('shouldDropReview (decisions 5, 8; REVIEW_DEDUPE_MIN)', () => {
  function mkTap(overrides: Partial<ReviewTap> = {}): ReviewTap {
    return { targetId: 'job-test-1', pass: 1, reviewerUserId: 'user-test-henry', verdict: 'READY', at: AT, ...overrides };
  }
  /** The same tap `minutes` after the prior one. */
  function later(minutes: number): ReviewTap {
    return mkTap({ at: addMinutes(AT, minutes) });
  }

  const cases: Array<{ name: string; existing: ReviewTap[]; incoming: ReviewTap; expected: boolean }> = [
    { name: 'identical tap 1 min later → drop', existing: [mkTap()], incoming: later(1), expected: true },
    { name: `identical tap exactly ${WINDOW} min later → drop (boundary inclusive)`, existing: [mkTap()], incoming: later(WINDOW), expected: true },
    { name: `identical tap ${WINDOW + 1} min later → keep`, existing: [mkTap()], incoming: later(WINDOW + 1), expected: false },
    { name: 'identical tap 1 min EARLIER than the existing one → drop (absolute distance)', existing: [mkTap()], incoming: later(-1), expected: true },
    { name: 'same instant → drop', existing: [mkTap()], incoming: mkTap(), expected: true },
    { name: 'different verdict 1 min later → keep (negative)', existing: [mkTap()], incoming: mkTap({ verdict: 'FIX', at: addMinutes(AT, 1) }), expected: false },
    {
      name: 'different reviewer 1 min later → keep (negative; decision 5 identity on every verdict)',
      existing: [mkTap()],
      incoming: mkTap({ reviewerUserId: 'user-test-jack', at: addMinutes(AT, 1) }),
      expected: false,
    },
    { name: 'different pass 1 min later → keep', existing: [mkTap()], incoming: mkTap({ pass: 2, at: addMinutes(AT, 1) }), expected: false },
    { name: 'different target 1 min later → keep', existing: [mkTap()], incoming: mkTap({ targetId: 'job-test-2', at: addMinutes(AT, 1) }), expected: false },
    { name: 'no existing taps → keep', existing: [], incoming: mkTap(), expected: false },
    {
      name: 'only an old identical tap and a recent different one → keep',
      existing: [later(-60), mkTap({ verdict: 'HOLD' })],
      incoming: later(1),
      expected: false,
    },
    {
      name: 'one matching tap among several → drop',
      existing: [mkTap({ targetId: 'job-test-9' }), later(-60), later(-1)],
      incoming: mkTap(),
      expected: true,
    },
    {
      name: 'both pass undefined and both reviewer undefined → drop',
      existing: [{ targetId: 'job-test-1', verdict: 'READY', at: AT }],
      incoming: { targetId: 'job-test-1', verdict: 'READY', at: addMinutes(AT, 1) },
      expected: true,
    },
  ];

  it.each(cases)('$name', ({ existing, incoming, expected }) => {
    expect(shouldDropReview(existing, incoming)).toBe(expected);
  });
});

describe('recapDecision (decisions 11, 12: one recap per visit)', () => {
  const cases: Array<{
    name: string;
    existing: { visitId: string; flushed: boolean } | undefined;
    incoming: { visitId: string };
    expected: RecapDecision;
  }> = [
    { name: 'no existing recap → accept', existing: undefined, incoming: { visitId: 'visit-test-1' }, expected: 'accept' },
    { name: 'existing still queued → supersede', existing: { visitId: 'visit-test-1', flushed: false }, incoming: { visitId: 'visit-test-1' }, expected: 'supersede' },
    { name: 'existing already flushed to Jobber → refuse', existing: { visitId: 'visit-test-1', flushed: true }, incoming: { visitId: 'visit-test-1' }, expected: 'refuse' },
    {
      name: 'existing is for a different visit → accept (nothing to supersede or refuse)',
      existing: { visitId: 'visit-test-2', flushed: true },
      incoming: { visitId: 'visit-test-1' },
      expected: 'accept',
    },
  ];

  it.each(cases)('$name', ({ existing, incoming, expected }) => {
    expect(recapDecision(existing, incoming)).toBe(expected);
  });
});
