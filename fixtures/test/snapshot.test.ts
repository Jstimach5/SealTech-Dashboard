/**
 * End-to-end: the TESTVILLE dataset through buildSnapshot. Every assertion here is something a
 * person at the 7:00 huddle would read off the wall, so a failing line names a visible defect.
 */
import { describe, expect, it } from 'vitest';
import { SnapshotSchema, assertNoPrivateText, cardState, problemAckOverdue, verdictsByJob, type Snapshot } from '@sealtech/domain';
import { buildScenario } from '../build.js';
import { SCENARIOS } from '../scenarios.js';

const snap = buildScenario('default');
const job = (snap: Snapshot, key: string) => snap.jobs.find((j) => j.id === `j-test-${key}`)!;
const visit = (snap: Snapshot, key: string, n = 1) => snap.visits.find((v) => v.id === `v-test-${key}-${n}`)!;
const line = (snap: Snapshot, key: string) => snap.cannotInvoice.find((l) => l.jobId === `j-test-${key}`);

describe('TESTVILLE default scenario (Wed 2026-10-14 09:30 local)', () => {
  it('validates against the schema, carries no private text and is deterministic', () => {
    expect(() => SnapshotSchema.parse(snap)).not.toThrow();
    expect(assertNoPrivateText(snap)).toEqual([]);
    expect(buildScenario('default')).toEqual(snap);
    expect(snap.boardDate).toBe('2026-10-14');
    expect(snap.mode).toBe('fixtures');
  });

  it('every id carries the -test- marker so live writers refuse it', () => {
    for (const j of snap.jobs) expect(j.id).toContain('-test-');
    for (const v of snap.visits) expect(v.id).toContain('-test-');
    for (const p of snap.people) expect(p.jobberUserId).toContain('-test-');
  });

  it('hero is Jobber’s own Requires Invoicing count; the rail lists what cannot be billed plus the leak', () => {
    const ri = snap.jobs.filter((j) => j.bucket === 'requires_invoicing').length;
    expect(snap.hero.cannotInvoice).toBe(ri);
    expect(snap.counts.requires_invoicing).toBe(ri);
    // MBEKI is invoiced (DONE) so it leaves the rail; BAUER leaked in, so the count is unchanged.
    expect(snap.cannotInvoice.length).toBe(ri);
    expect(line(snap, 'mbeki')).toBeUndefined();
    expect(line(snap, 'bauer')?.tags).toEqual(['NO-REMINDER']);
    expect(line(snap, 'bauer')?.hardRed).toBe(true);
    expect(snap.cannotInvoice[0]?.jobId).toBe('j-test-bauer'); // hard red first
    expect(snap.cannotInvoice.at(-1)?.reason).toBe('PROGRAM-WAIT'); // grey last
  });

  it.each([
    ['carter', 'AWAITING 1ST REVIEW', 'none'],
    ['ellis', 'AWAITING 2ND REVIEW', 'none'],
    ['osei', 'FIX OPEN', 'amber'],
    ['price', 'HOLD', 'red'],
    ['diaz', 'RETURN NEEDED', 'none'],
    ['weiss', 'BLOWER DOOR FAIL', 'none'],
    ['rossi', 'FORM/QUANTITIES MISSING', 'none'],
    ['farah', 'INSPECTION/PERMIT', 'red'],
    ['lindqvist', 'PROGRAM-WAIT', 'grey'],
    ['kowalski', 'READY TO INVOICE', 'none'],
    ['novak-b', 'AWAITING 1ST REVIEW', 'amber'],
    ['bauer', 'AWAITING 1ST REVIEW', 'red'],
  ])('%s reads %s (%s)', (key, reason, colour) => {
    const l = line(snap, key);
    expect(l?.reason).toBe(reason);
    expect(l?.colour).toBe(colour);
  });

  it('owners default by reason; FIX and HOLD show a role word; the huddle override wins', () => {
    expect(line(snap, 'osei')?.owner).toEqual({ role: 'CREW' });
    expect(line(snap, 'price')?.owner).toEqual({ role: 'OFFICE' });
    expect(line(snap, 'diaz')?.owner).toEqual({ initials: 'MC' }); // CORDER ran the visit
    expect(line(snap, 'carter')?.owner).toEqual({ initials: 'JA' }); // office
    expect(line(snap, 'farah')?.owner).toEqual({ initials: 'KA' }); // override
    expect(line(snap, 'osei')?.fixPick).toBe('No depth marker or ruler');
  });

  it('NEEDS ATTENTION: VARGA (late) then HOLT (action required) then the oldest requires-invoicing lines', () => {
    expect(snap.attention.slice(0, 2).map((a) => [a.kind, a.label])).toEqual([
      ['late', 'VARGA · TESTVILLE · ATT'],
      ['action_required', 'HOLT · TESTVILLE · ATT'],
    ]);
    expect(snap.attention[0]?.ageDays).toBe(2);
    expect(snap.attention[0]?.sinceSource).toBe('observed');
    expect(snap.attention[2]?.jobId).toBe('j-test-lindqvist'); // oldest requires_invoicing first
    expect(snap.attention.every((a) => a.kind !== 'today' as never)).toBe(true);
  });

  it('lanes: NGUYEN is a Problem 25 min without ACK; ROWE day 2 is NOW; MBEKI is DONE; IBRAHIM not started', () => {
    const nguyen = visit(snap, 'nguyen');
    expect(nguyen.result).toBe('Problem');
    expect(nguyen.resultSource).toBe('note');
    expect(nguyen.missReason).toBe('ACCESS');
    expect(problemAckOverdue(nguyen, snap.generatedAt)).toBe(true);

    const verdicts = verdictsByJob(snap.reviewRows);
    const state = (key: string, n = 1) => {
      const v = visit(snap, key, n);
      const j = job(snap, key);
      const vj = verdicts[j.id];
      return cardState({ visit: v, job: j, pass2Ready: vj?.pass2Ready ?? false, now: snap.generatedAt, ...(vj?.latestVerdict ? { latestVerdict: vj.latestVerdict } : {}) });
    };
    expect(state('rowe', 2).kind).toBe('NOW');
    expect(visit(snap, 'rowe', 2).plannedAsPrep).toBe(false);
    expect(state('mbeki')).toMatchObject({ kind: 'DONE', grey: true });
    expect(state('ibrahim').kind).toBe('NOT STARTED');
    expect(state('santos').kind).toBe('NOW');
    expect(state('carter').showInLane).toBe(false); // yesterday
  });

  it('ROWE day 1 was a planned prep day: Prepped from CLOSE: PR, plannedAsPrep, counted as kept', () => {
    const rowe1 = visit(snap, 'rowe', 1);
    expect(rowe1.plannedAsPrep).toBe(true);
    expect(rowe1.result).toBe('Prepped');
    expect(rowe1.closeCode).toBe('PR');
    expect(rowe1.resultSource).toBe('note');
  });

  it('scoreline: yesterday kept 5 of 7 (2 unknown), misses MATERIALS and WEATHER', () => {
    // kept: ROWE day 1 (planned prep), CARTER, FOSTER, MORGAN, ELLIS; misses: DIAZ materials, QUINN weather;
    // BAKER cancelled (excluded); GREENE and ALVAREZ unknown.
    expect(snap.scoreline).toMatchObject({ kept: 5, planned: 7, unknown: 2, misses: { MATERIALS: 1, WEATHER: 1 } });
    // Week of Mon 12 Oct, earliest pass-1 verdict per job: KOWALSKI READY (Mon), WEISS FIX (Tue), ELLIS READY (Wed),
    // MBEKI READY (Wed). OSEI's FIX was Sat 10 Oct, last week.
    expect(snap.scoreline.firstPassReady).toEqual({ ready: 3, total: 4 });
  });

  it('review rows: CARTER inferred from the file stem, NOVAK twin-surname unmatched, file names redacted', () => {
    const carter = snap.reviewRows.find((r) => r.application.startsWith('STI_ATTIC_CARTER'));
    expect(carter?.match).toBe('inferred');
    expect(carter?.matchedJobId).toBe('j-test-carter');
    const novak = snap.reviewRows.find((r) => r.application.startsWith('STI_ATTIC_NOVAK'));
    expect(novak?.match).toBe('none');
    expect(snap.unmatchedReviewRows).toBe(1);
    for (const r of snap.reviewRows) expect(r.application).toMatch(/^STI_[A-Z]+_[A-Z]+_…$/);
  });

  it('counts: UNANSWERED counts yesterday’s unanswered forms (FOSTER, GREENE), unknown is separate (ALVAREZ, MORGAN)', () => {
    expect(snap.counts.unanswered).toBe(0 + snap.visits.filter((v) => ['v-test-foster-1', 'v-test-greene-1'].includes(v.id) && v.result === undefined).length);
    expect(snap.unansweredUnknown).toBe(1); // ALVAREZ: complete, never had a form, no note; MORGAN has CLOSE: CM
    expect(snap.counts.today).toBe(6);
    expect(snap.counts.late).toBe(1);
    expect(snap.counts.action_required).toBe(1);
  });

  it('hero secondary numbers and review queue', () => {
    expect(snap.hero.visitsNotReady).toBe(0); // MBEKI is READY; no other Completed visit today yet
    expect(snap.hero.reviewQueue).toEqual({ pass1: 3, pass2: 1, fix: 1, hold: 1 });
    expect(snap.hero.oldestDays).toBe(21);
    expect(snap.packagesOpen).toBe(snap.cannotInvoice.length - 1);
  });
});

describe('scenario overlays', () => {
  it.each(Object.keys(SCENARIOS))('%s builds, validates and stays private', (name) => {
    const s = buildScenario(name);
    expect(() => SnapshotSchema.parse(s)).not.toThrow();
    expect(assertNoPrivateText(s)).toEqual([]);
  });

  it('huddle-day at 07:00: nothing started, no Problem yet, scoreline unchanged', () => {
    const s = buildScenario('huddle-day');
    expect(visit(s, 'nguyen').result).toBeUndefined();
    expect(visit(s, 'mbeki').isComplete).toBe(false);
    expect(s.scoreline.kept).toBe(5);
    const nguyen = cardState({ visit: visit(s, 'nguyen'), job: job(s, 'nguyen'), pass2Ready: false, now: s.generatedAt });
    expect(nguyen.kind).toBe('NOT STARTED');
  });

  it('late-afternoon: ACK recorded, SANTOS recap queued and marked queued on the card', () => {
    const s = buildScenario('late-afternoon');
    expect(visit(s, 'nguyen').ack).toEqual({ at: expect.any(String), initials: 'JA' });
    expect(problemAckOverdue(visit(s, 'nguyen'), s.generatedAt)).toBe(false);
    expect(visit(s, 'santos')).toMatchObject({ result: 'Completed', resultSource: 'recapQueued' });
    expect(s.cardMeta['v-test-santos-1']?.synced).toBe('queued');
    expect(s.queuedWrites).toHaveLength(1);
  });

  it('stale: Jobber red for 45 minutes', () => {
    const s = buildScenario('stale');
    expect(s.sources.jobber.ok).toBe(false);
    expect(s.sources.jobber.lastOkAt).toBe('2026-10-14T12:45:00.000Z');
  });

  it('overflow: five crews', () => {
    const s = buildScenario('overflow');
    expect(s.crews).toHaveLength(5);
    expect(s.visits.some((v) => v.id === 'v-test-ulrich-1')).toBe(true);
  });

  it('monday-scorecard: thirteen weeks ending last week', () => {
    const s = buildScenario('monday-scorecard');
    expect(s.boardDate).toBe('2026-10-19');
    expect(s.scorecard).toHaveLength(13);
    expect(s.scorecard.at(-1)?.weekStart).toBe('2026-10-12');
  });
});
