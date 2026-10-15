/**
 * Every route in docs/http-api.md through real HTTP on port 0, against the TESTVILLE default
 * scenario frozen at 2026-10-14 09:30 Detroit (13:30Z).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { assertNoPrivateText, problemAckOverdue, verdictsByJob } from '@sealtech/domain';
import { fixtureSource } from '../src/sources/fixture.js';
import type { Instant } from '@sealtech/domain';
import type { Source } from '../src/sources/types.js';
import { FIXTURE_NOW, PIN, TestClock, liveRoster, startHarness, tempDir, type Harness } from './helpers.js';

const HENRY = 'u-test-ashby'; // crewLead, review pass 1
const JACK = 'u-test-owner'; // owner, review pass 2
const OFFICE = 'u-test-office'; // office, JA
const DALE = 'u-test-dale'; // crewLead

let h: Harness;
afterEach(async () => {
  if (h) await h.close();
});

describe('PIN and identity', () => {
  it('people lists the roster without hashes; wrong PIN ×3 locks for 60 s; the right PIN works after the window', async () => {
    h = await startHarness();
    const people = await h.api('GET', '/api/people');
    expect(people.status).toBe(200);
    expect(people.json.people).toHaveLength(11);
    expect(people.text).not.toContain('pinHash');
    expect(readFileSync(join(h.dir, 'roster.json'), 'utf8')).toContain('pinHash');

    const r1 = await h.api('POST', '/api/pin', { userId: HENRY, pin: '0000' });
    expect(r1.status).toBe(401);
    expect(r1.json).toMatchObject({ ok: false, attemptsLeft: 2 });
    const r2 = await h.api('POST', '/api/pin', { userId: HENRY, pin: '0000' });
    expect(r2.json.attemptsLeft).toBe(1);
    const r3 = await h.api('POST', '/api/pin', { userId: HENRY, pin: '0000' });
    expect(r3.status).toBe(423);
    expect(r3.json).toMatchObject({ ok: false, lockedForSec: 60 });
    const locked = await h.api('POST', '/api/pin', { userId: HENRY, pin: PIN });
    expect(locked.status).toBe(423);
    expect(locked.json.lockedForSec).toBeGreaterThan(0);

    h.clock.advance(61_000);
    const ok = await h.api('POST', '/api/pin', { userId: HENRY, pin: PIN });
    expect(ok.status).toBe(200);
    expect(ok.json.token).toMatch(/^[0-9a-f]{64}$/);
    expect(ok.json.person).toEqual({ jobberUserId: HENRY, lastName: 'ASHBY', initials: 'HA', role: 'crewLead', reviewPass: 1 });

    // a token expires after 8 hours
    h.clock.advance(8 * 3600_000 + 1000);
    const expired = await h.api('POST', '/api/focus', { text: 'x' }, ok.json.token);
    expect(expired.status).toBe(401);
  });

  it('requireRole: a crew lead may not set the focus line (403); no token is 401; bad body is 400', async () => {
    h = await startHarness();
    const dale = await h.login(DALE);
    expect((await h.api('POST', '/api/focus', { text: 'PHOTOS' }, dale)).status).toBe(403);
    expect((await h.api('POST', '/api/focus', { text: 'PHOTOS' })).status).toBe(401);
    expect((await h.api('POST', '/api/pin', { userId: 1 })).status).toBe(400);
    expect((await h.api('POST', '/api/pin', { userId: 'nobody', pin: PIN })).status).toBe(401);
  });

  it('unknown ids get the 401 shape without a pin_failures row; an id over 64 characters is 400', async () => {
    h = await startHarness();
    for (let i = 0; i < 5; i++) expect((await h.api('POST', '/api/pin', { userId: `nobody-${i}`, pin: '0' })).status).toBe(401);
    expect(h.service.db.pinFailureCount()).toBe(0);
    expect((await h.api('POST', '/api/pin', { userId: 'x'.repeat(65), pin: '0' })).status).toBe(400);
    expect(h.service.db.pinFailureCount()).toBe(0);
  });
});

describe('review', () => {
  it('Henry READY on CARTER appends a pass-1 row; the next snapshot shows it and pass1Ready; no private text', async () => {
    h = await startHarness();
    const henry = await h.login(HENRY);
    const rowsBefore = h.snapshot().reviewRows.length;
    const r = await h.api('POST', '/api/review', { jobId: 'j-test-carter', pass: 1, verdict: 'READY', notes: 'all nine photo types present' }, henry);
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ ok: true, rowIndex: rowsBefore + 2, deduped: false }); // source rows are indices 2..16
    const snap = h.snapshot();
    expect(snap.reviewRows).toHaveLength(rowsBefore + 1);
    const row = snap.reviewRows.at(-1)!;
    expect(row).toMatchObject({
      rowIndex: rowsBefore + 2,
      checked: '2026-10-14',
      verdict: 'READY',
      pass: 1,
      reviewerUserId: HENRY,
      reviewedAt: FIXTURE_NOW,
      jobberJobId: 'j-test-carter',
      jobNumber: 9010,
      reviewNotes: 'all nine photo types present',
      match: 'exact',
      matchedJobId: 'j-test-carter',
      application: 'STI_ATTIC_CARTER_…', // A–L copied from the checker row, redacted on the wall
      tech: 'Ashby',
    });
    expect(row.submissionId).toMatch(/^[0-9a-f]{64}$/);
    expect(verdictsByJob(snap.reviewRows)['j-test-carter']?.pass1Ready).toBe(true);
    expect(assertNoPrivateText(snap)).toEqual([]);
    // the stored (unredacted) row carries the fixture file name and nothing like an address
    const stored = h.service.db.reviewRows()[0]!.row;
    expect(stored.application).toBe('STI_ATTIC_CARTER_TESTVILLE_APP.pdf');
    expect(assertNoPrivateText(stored)).toEqual([]);
    // the rail moved CARTER from AWAITING 1ST to AWAITING 2ND REVIEW
    expect(snap.cannotInvoice.find((l) => l.jobId === 'j-test-carter')?.reason).toBe('AWAITING 2ND REVIEW');
  });

  it('Jack pass-2 READY before Henry on ROSSI is 409; after Henry it is accepted', async () => {
    h = await startHarness();
    const jack = await h.login(JACK);
    const henry = await h.login(HENRY);
    const early = await h.api('POST', '/api/review', { jobId: 'j-test-rossi', pass: 2, verdict: 'READY' }, jack);
    expect(early.status).toBe(409);
    expect((await h.api('POST', '/api/review', { jobId: 'j-test-rossi', pass: 1, verdict: 'READY' }, henry)).status).toBe(200);
    const late = await h.api('POST', '/api/review', { jobId: 'j-test-rossi', pass: 2, verdict: 'READY' }, jack);
    expect(late.status).toBe(200);
    expect(verdictsByJob(h.snapshot().reviewRows)['j-test-rossi']).toMatchObject({ pass1Ready: true, pass2Ready: true });
  });

  it('double tap within 2 min dedupes: second returns deduped:true and the row count is unchanged', async () => {
    h = await startHarness();
    const henry = await h.login(HENRY);
    const first = await h.api('POST', '/api/review', { jobId: 'j-test-carter', pass: 1, verdict: 'READY' }, henry);
    const second = await h.api('POST', '/api/review', { jobId: 'j-test-carter', pass: 1, verdict: 'READY' }, henry);
    expect(second.status).toBe(200);
    expect(second.json).toEqual({ ok: true, rowIndex: first.json.rowIndex, deduped: true });
    expect(h.service.db.reviewRowCount()).toBe(1);
    expect(h.service.db.submissionCount()).toBe(1);
  });

  it('FIX without fixPick is 400; HOLD without holdReason is 400; wrong pass is 403; unknown job is 404; money in notes is 400', async () => {
    h = await startHarness();
    const henry = await h.login(HENRY);
    expect((await h.api('POST', '/api/review', { jobId: 'j-test-carter', pass: 1, verdict: 'FIX' }, henry)).status).toBe(400);
    expect((await h.api('POST', '/api/review', { jobId: 'j-test-carter', pass: 1, verdict: 'FIX', fixPick: 'not on the list' }, henry)).status).toBe(400);
    expect((await h.api('POST', '/api/review', { jobId: 'j-test-carter', pass: 1, verdict: 'HOLD' }, henry)).status).toBe(400);
    expect((await h.api('POST', '/api/review', { jobId: 'j-test-carter', pass: 2, verdict: 'READY' }, henry)).status).toBe(403);
    expect((await h.api('POST', '/api/review', { jobId: 'j-test-nobody', pass: 1, verdict: 'READY' }, henry)).status).toBe(404);
    expect((await h.api('POST', '/api/review', { jobId: 'j-test-carter', pass: 1, verdict: 'READY', notes: 'add $450 for the hatch' }, henry)).status).toBe(400);
    // ROSSI: its checker row is dated yesterday, so Henry's FIX is the latest row in review order
    // (a checker row checked today sorts at local noon in the domain, after a morning verdict).
    const fix = await h.api('POST', '/api/review', { jobId: 'j-test-rossi', pass: 1, verdict: 'FIX', fixPick: 'Hatch not shown' }, henry);
    expect(fix.status).toBe(200);
    expect(h.snapshot().cannotInvoice.find((l) => l.jobId === 'j-test-rossi')).toMatchObject({ reason: 'FIX OPEN', fixPick: 'Hatch not shown' });
  });

  it('a live-mode service refuses -test- targets with 409 (flag included, by the job its number resolves to) and -test- sign-ins with 403', async () => {
    // Live mode never writes a roster by itself and refuses a fixture one; seed a real-shaped roster.
    const dir = tempDir();
    writeFileSync(join(dir, 'roster.json'), JSON.stringify(liveRoster()));
    h = await startHarness({ dir, env: { BOARD_DATA_SOURCE: 'live' }, deps: { source: fixtureSource('default') } });
    const henry = await h.login('u-live-henry');
    const jamie = await h.login('u-live-jamie');
    expect(h.snapshot().mode).toBe('live');
    expect((await h.api('POST', '/api/review', { jobId: 'j-test-carter', pass: 1, verdict: 'READY' }, henry)).status).toBe(409);
    expect((await h.api('POST', '/api/recap', { visitId: 'v-test-santos-1', result: 'Completed' }, henry)).status).toBe(409);
    const flag = await h.api('POST', '/api/flag', { issue: 'Professionalism', jobNumber: 9004, employee: 'DALE', crewOnReport: 'TD', notes: '', rr: 'Y' }, jamie);
    expect(flag.status).toBe(409);
    expect(h.service.db.flagRowCount()).toBe(0);
    expect((await h.api('POST', '/api/pin', { userId: JACK, pin: PIN })).status).toBe(403);
  });

  it('a FIXTURE_NOW with a UTC offset still dedupes a double tap', async () => {
    h = await startHarness({ env: { FIXTURE_NOW: '2026-10-14T09:30:00-04:00' } });
    const henry = await h.login(HENRY);
    await h.api('POST', '/api/review', { jobId: 'j-test-carter', pass: 1, verdict: 'READY' }, henry);
    const second = await h.api('POST', '/api/review', { jobId: 'j-test-carter', pass: 1, verdict: 'READY' }, henry);
    expect(second.json.deduped).toBe(true);
    expect(h.service.db.reviewRowCount()).toBe(1);
    expect(h.snapshot().generatedAt).toBe('2026-10-14T13:30:00.000Z');
  });
});

describe('recap', () => {
  it('Dale Completed on SANTOS queues a write; the snapshot shows recapQueued and synced:queued; a second recap supersedes', async () => {
    h = await startHarness();
    const dale = await h.login(DALE);
    const r = await h.api('POST', '/api/recap', { visitId: 'v-test-santos-1', result: 'Completed' }, dale);
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ ok: true, status: 'queued' });
    let snap = h.snapshot();
    expect(snap.queuedWrites).toHaveLength(1);
    expect(snap.queuedWrites[0]).toMatchObject({ kind: 'visit_note', targetId: 'v-test-santos-1', status: 'queued', createdBy: DALE, createdAt: FIXTURE_NOW });
    expect(snap.visits.find((v) => v.id === 'v-test-santos-1')).toMatchObject({ result: 'Completed', resultSource: 'recapQueued', resultAt: FIXTURE_NOW });
    expect(snap.cardMeta['v-test-santos-1']?.synced).toBe('queued');

    const again = await h.api('POST', '/api/recap', { visitId: 'v-test-santos-1', result: 'Return needed', missReason: 'MATERIALS', note: 'short two bags' }, dale);
    expect(again.json).toEqual({ ok: true, status: 'superseded' });
    snap = h.snapshot();
    expect(snap.queuedWrites).toHaveLength(1);
    expect(snap.visits.find((v) => v.id === 'v-test-santos-1')).toMatchObject({ result: 'Return needed', missReason: 'MATERIALS', resultSource: 'recapQueued' });
    expect(h.service.db.latestWriteFor('visit_note', 'v-test-santos-1')?.payload.line).toBe('VISIT RESULT: Return needed / MATERIALS — short two bags');

    const same = await h.api('POST', '/api/recap', { visitId: 'v-test-santos-1', result: 'Return needed', missReason: 'MATERIALS', note: 'short two bags' }, dale);
    expect(same.json).toMatchObject({ ok: true, deduped: true });
    expect((await h.api('GET', '/health')).json.queued).toBe(1);
  });

  it('a visit already answered in Jobber (job form) refuses a recap with 409', async () => {
    h = await startHarness();
    const dale = await h.login(DALE);
    expect(h.snapshot().visits.find((v) => v.id === 'v-test-mbeki-1')?.resultSource).toBe('jobForm');
    const r = await h.api('POST', '/api/recap', { visitId: 'v-test-mbeki-1', result: 'Return needed', missReason: 'ACCESS' }, dale);
    expect(r.status).toBe(409);
    expect(r.json.error).toBe('already answered in Jobber');
    expect(h.service.db.queuedWrites()).toHaveLength(0);
  });

  it('Return needed without missReason is 400; office may not recap (403); unknown visit 404', async () => {
    h = await startHarness();
    const dale = await h.login(DALE);
    const office = await h.login(OFFICE);
    expect((await h.api('POST', '/api/recap', { visitId: 'v-test-santos-1', result: 'Return needed' }, dale)).status).toBe(400);
    expect((await h.api('POST', '/api/recap', { visitId: 'v-test-santos-1', result: 'Problem' }, dale)).status).toBe(400);
    expect((await h.api('POST', '/api/recap', { visitId: 'v-test-santos-1', result: 'Not started' }, dale)).status).toBe(400);
    expect((await h.api('POST', '/api/recap', { visitId: 'v-test-santos-1', result: 'Completed' }, office)).status).toBe(403);
    expect((await h.api('POST', '/api/recap', { visitId: 'v-test-ghost-1', result: 'Completed' }, dale)).status).toBe(404);
  });

  it('after JOBBER_WRITES=on the write is sent, the result comes from the note, and a further recap is refused', async () => {
    h = await startHarness();
    const dale = await h.login(DALE);
    await h.api('POST', '/api/recap', { visitId: 'v-test-santos-1', result: 'Completed', note: 'blower door passed' }, dale);
    const dir = h.dir;
    await h.close(true);

    h = await startHarness({ dir, env: { JOBBER_WRITES: 'on' } });
    const snap = h.snapshot();
    expect(snap.queuedWrites[0]).toMatchObject({ status: 'sent', targetId: 'v-test-santos-1' });
    expect(snap.visits.find((v) => v.id === 'v-test-santos-1')).toMatchObject({ result: 'Completed', resultSource: 'note' });
    expect(snap.cardMeta['v-test-santos-1']?.synced).toBe('jobber');
    const dale2 = await h.login(DALE);
    expect((await h.api('POST', '/api/recap', { visitId: 'v-test-santos-1', result: 'Completed' }, dale2)).status).toBe(409);
    // a fresh recap on another visit with writes on is sent at once
    const r = await h.api('POST', '/api/recap', { visitId: 'v-test-patel-1', result: 'Completed' }, dale2);
    expect(r.json.status).toBe('queued');
    expect(h.snapshot().queuedWrites.find((w) => w.targetId === 'v-test-patel-1')?.status).toBe('sent');
    // the identical recap replayed after it was sent is the same submission: 200 deduped, not 409
    const replay = await h.api('POST', '/api/recap', { visitId: 'v-test-patel-1', result: 'Completed' }, dale2);
    expect(replay.status).toBe(200);
    expect(replay.json).toEqual({ ok: true, status: 'queued', deduped: true });
  });
});

describe('ack', () => {
  it('office ACK on NGUYEN shows ack JA and clears the overdue border; non-Problem is 409; crew lead is 403', async () => {
    h = await startHarness();
    const office = await h.login(OFFICE);
    const before = h.snapshot().visits.find((v) => v.id === 'v-test-nguyen-1')!;
    expect(problemAckOverdue(before, FIXTURE_NOW)).toBe(true);
    const r = await h.api('POST', '/api/ack', { visitId: 'v-test-nguyen-1' }, office);
    expect(r.json).toEqual({ ok: true, status: 'queued' });
    const snap = h.snapshot();
    const after = snap.visits.find((v) => v.id === 'v-test-nguyen-1')!;
    expect(after.ack).toEqual({ at: FIXTURE_NOW, initials: 'JA' });
    expect(after.result).toBe('Problem');
    expect(problemAckOverdue(after, FIXTURE_NOW)).toBe(false);
    expect(snap.queuedWrites).toHaveLength(1);
    expect(snap.queuedWrites[0]).toMatchObject({ kind: 'ack', targetId: 'v-test-nguyen-1', status: 'queued' });
    expect(h.service.db.latestWriteFor('ack', 'v-test-nguyen-1')?.payload.line).toBe('ACK 9:30 JA');
    expect((await h.api('POST', '/api/ack', { visitId: 'v-test-nguyen-1' }, office)).json).toMatchObject({ ok: true, deduped: true });

    expect((await h.api('POST', '/api/ack', { visitId: 'v-test-santos-1' }, office)).status).toBe(409);
    const dale = await h.login(DALE);
    expect((await h.api('POST', '/api/ack', { visitId: 'v-test-nguyen-1' }, dale)).status).toBe(403);
  });

  it('a second ACK a minute later while the first is queued is deduped even when the card still shows no ACK (live)', async () => {
    const dir = tempDir();
    writeFileSync(join(dir, 'roster.json'), JSON.stringify(liveRoster()));
    // A live-shaped source: ids without -test-, so the live refusal does not apply; no note overlay in live mode.
    const inner = fixtureSource('default');
    const relabel = <T>(v: T): T => JSON.parse(JSON.stringify(v).replaceAll('-test-', '-live-')) as T;
    const source: Source = { name: 'live', load: async (now: Instant) => relabel(await inner.load(now)) };
    const clock = new TestClock();
    h = await startHarness({ dir, env: { BOARD_DATA_SOURCE: 'live', FIXTURE_NOW: '' }, deps: { source, clock } });
    const jamie = await h.login('u-live-jamie');
    const first = await h.api('POST', '/api/ack', { visitId: 'v-live-nguyen-1' }, jamie);
    expect(first.json).toEqual({ ok: true, status: 'queued' });
    expect(h.snapshot().visits.find((v) => v.id === 'v-live-nguyen-1')?.ack).toBeUndefined(); // live: no overlay
    clock.advance(60_000);
    const again = await h.api('POST', '/api/ack', { visitId: 'v-live-nguyen-1' }, jamie);
    expect(again.json).toMatchObject({ ok: true, deduped: true });
    expect(h.service.db.queuedWrites().filter((w) => w.kind === 'ack')).toHaveLength(1);
    expect((await h.api('GET', '/health')).json.queued).toBe(1);
  });

  it('fixture mode: yesterday\'s ACK and queued recap do not carry into the regenerated next board day', async () => {
    const clock = new TestClock();
    h = await startHarness({ env: { FIXTURE_NOW: '' }, deps: { clock } });
    const office = await h.login(OFFICE);
    const dale = await h.login(DALE);
    expect((await h.api('POST', '/api/ack', { visitId: 'v-test-nguyen-1' }, office)).json).toEqual({ ok: true, status: 'queued' });
    expect((await h.api('POST', '/api/recap', { visitId: 'v-test-santos-1', result: 'Completed' }, dale)).status).toBe(200);
    expect(h.snapshot().visits.find((v) => v.id === 'v-test-nguyen-1')?.ack).toBeDefined();
    expect(h.snapshot().visits.find((v) => v.id === 'v-test-santos-1')?.resultSource).toBe('recapQueued');

    clock.advance(24 * 3600_000);
    await h.service.poll({ quiet: true });
    const next = h.snapshot();
    expect(next.boardDate).toBe('2026-10-15');
    expect(next.visits.find((v) => v.id === 'v-test-nguyen-1')?.ack).toBeUndefined();
    expect(next.visits.find((v) => v.id === 'v-test-santos-1')?.resultSource).not.toBe('recapQueued');
    expect(next.queuedWrites).toHaveLength(0);
    // and today's ACK is a fresh write, not "deduped" by yesterday's
    const office2 = await h.login(OFFICE);
    expect((await h.api('POST', '/api/ack', { visitId: 'v-test-nguyen-1' }, office2)).json).toEqual({ ok: true, status: 'queued' });
    expect(h.snapshot().visits.find((v) => v.id === 'v-test-nguyen-1')?.ack).toBeDefined();
  });
});

describe('focus and responder', () => {
  it('31 characters is 400; "photos first" becomes PHOTOS FIRST; responder initials are validated', async () => {
    h = await startHarness();
    const office = await h.login(OFFICE);
    expect((await h.api('POST', '/api/focus', { text: 'x'.repeat(31) }, office)).status).toBe(400);
    const r = await h.api('POST', '/api/focus', { text: '  photos   first ' }, office);
    expect(r.json).toEqual({ ok: true });
    expect(h.snapshot().focusLine).toBe('photos first'); // stored as typed (revision G)
    expect((await h.api('POST', '/api/focus', { text: 'x'.repeat(30) }, office)).status).toBe(200);

    expect((await h.api('POST', '/api/responder', { initials: 'k' }, office)).status).toBe(400);
    expect((await h.api('POST', '/api/responder', { initials: 'ka' }, office)).json).toEqual({ ok: true });
    expect(h.snapshot().responderInitials).toBe('KA');
  });

  it('a street address is refused as typed and in capitals (decision 4); the stored focus line is unchanged', async () => {
    h = await startHarness();
    const office = await h.login(OFFICE);
    for (const text of ['2635 Needham St', '2635 NEEDHAM ST', '2635 needham st', 'call (555) 123-4567', 'add $450']) {
      const r = await h.api('POST', '/api/focus', { text }, office);
      expect(r.status).toBe(400);
      expect(r.json.error).toMatch(/money, a street address or a phone number/);
    }
    expect(h.snapshot().focusLine).toBe('PHOTOS BEFORE YOU LEAVE');
  });
});

describe('flag', () => {
  it('appends to flag_rows and leaves the snapshot untouched', async () => {
    h = await startHarness();
    const office = await h.login(OFFICE);
    const etagBefore = h.service.etag();
    const bodyBefore = h.service.body();
    const r = await h.api('POST', '/api/flag', { issue: 'Missing Photos or Paperwork', jobNumber: 9004, employee: 'DALE', crewOnReport: 'TD', notes: 'no depth marker photo', rr: 'N' }, office);
    expect(r.json).toEqual({ ok: true });
    expect(h.service.db.flagRowCount()).toBe(1);
    expect(h.service.db.flagRows()[0]).toEqual({ date: '2026-10-14', employee: 'DALE', type: 'Compliance', rr: 'N', flagType: 'Pictures', jobNumber: 9004, notes: 'no depth marker photo', crewOnReport: 'TD' });
    expect(h.service.etag()).toBe(etagBefore);
    expect(h.service.body()).toBe(bodyBefore);
    // force the next build and read what the TV would read: nothing of the flag may be in it (decision 16)
    expect((await h.service.poll({ quiet: true })).ok).toBe(true);
    const served = await h.api('GET', '/snapshot.json');
    expect(served.status).toBe(200);
    for (const text of ['no depth marker photo', '"crewonreport"', '"flagtype"', '"employee"']) {
      expect(served.text.toLowerCase()).not.toContain(text);
      expect(JSON.stringify(h.snapshot()).toLowerCase()).not.toContain(text);
    }
    expect(h.snapshot().queuedWrites.some((w) => w.kind === 'flag_row')).toBe(false);
    expect((await h.api('POST', '/api/flag', { issue: 'Bad thing', jobNumber: 9004, employee: 'DALE', crewOnReport: 'TD', notes: '', rr: 'N' }, office)).status).toBe(400);
    expect((await h.api('POST', '/api/flag', { issue: 'Professionalism', jobNumber: 1, employee: 'DALE', crewOnReport: 'TD', notes: '', rr: 'Y' }, office)).status).toBe(404);
    const dale = await h.login(DALE);
    expect((await h.api('POST', '/api/flag', { issue: 'Professionalism', jobNumber: 9004, employee: 'DALE', crewOnReport: 'TD', notes: '', rr: 'Y' }, dale)).status).toBe(403);
  });
});

describe('owner and tap', () => {
  it('owner override changes the rail line owner; tap is recorded without a token', async () => {
    h = await startHarness();
    const jack = await h.login(JACK);
    expect(h.snapshot().cannotInvoice.find((l) => l.jobId === 'j-test-carter')?.owner).toEqual({ initials: 'JA' });
    const r = await h.api('POST', '/api/owner', { jobId: 'j-test-carter', initials: 'td' }, jack);
    expect(r.json).toEqual({ ok: true });
    expect(h.snapshot().cannotInvoice.find((l) => l.jobId === 'j-test-carter')?.owner).toEqual({ initials: 'TD' });
    expect(h.service.db.ownerOverrides()['j-test-carter']).toEqual({ initials: 'TD', setOn: '2026-10-14' });
    expect((await h.api('POST', '/api/owner', { jobId: 'j-test-nobody', initials: 'TD' }, jack)).status).toBe(404);
    // CARTER has a Review row: the OWNER line is queued for that row's Owner notes (column L), never appended as a new row
    const latest = verdictsByJob(h.snapshot().reviewRows)['j-test-carter']?.latest;
    expect(latest).toBeDefined();
    expect(h.service.db.ownerNotes()).toMatchObject([{ jobId: 'j-test-carter', rowIndex: latest!.rowIndex, line: 'OWNER:TD 2026-10-14', status: 'queued', createdBy: JACK }]);
    expect(h.service.db.reviewRowCount()).toBe(0);
    expect(h.snapshot().queuedWrites).toHaveLength(0); // service-only queue; not a domain QueuedWrite kind
    // the same override again queues nothing new
    await h.api('POST', '/api/owner', { jobId: 'j-test-carter', initials: 'TD' }, jack);
    expect(h.service.db.ownerNotes()).toHaveLength(1);

    expect((await h.api('POST', '/api/tap', { screen: 'TODAY', target: 'v-test-santos-1' })).json).toEqual({ ok: true });
    expect(h.service.db.tapCount()).toBe(1);
  });
});

describe('restart', () => {
  it('replays nothing twice: one review row and one submission after a restart on the same DATA_DIR', async () => {
    h = await startHarness();
    const henry = await h.login(HENRY);
    await h.api('POST', '/api/review', { jobId: 'j-test-carter', pass: 1, verdict: 'READY' }, henry);
    const dir = h.dir;
    await h.close(true);
    h = await startHarness({ dir });
    expect(h.service.db.reviewRowCount()).toBe(1);
    expect(h.service.db.submissionCount()).toBe(1);
    expect(h.snapshot().reviewRows.filter((r) => r.reviewerUserId === HENRY && r.jobberJobId === 'j-test-carter')).toHaveLength(1);
    // the token from before the restart is gone
    expect((await h.api('POST', '/api/focus', { text: 'x' }, henry)).status).toBe(401);
  });

  it('writes wait (503) for the first poll after a restart; the reloaded snapshot alone is read-only', async () => {
    h = await startHarness();
    const dir = h.dir;
    await h.close(true);
    h = await startHarness({ dir, poll: false });
    expect((await h.api('GET', '/snapshot.json')).status).toBe(200); // reads are served from the reloaded file
    const henry = await h.login(HENRY);
    const early = await h.api('POST', '/api/review', { jobId: 'j-test-carter', pass: 1, verdict: 'READY' }, henry);
    expect(early.status).toBe(503);
    expect(h.service.db.reviewRowCount()).toBe(0);
    await h.service.poll({ quiet: true });
    expect((await h.api('POST', '/api/review', { jobId: 'j-test-carter', pass: 1, verdict: 'READY' }, henry)).status).toBe(200);
  });

  it('a write whose post-commit rebuild fails still answers its documented 200', async () => {
    const inner = fixtureSource('default');
    const src = { name: 'fixtures' as const, fail: false, load: (now: Instant) => (src.fail ? Promise.reject(new Error('HTTP 502 from Jobber')) : inner.load(now)) };
    h = await startHarness({ deps: { source: src } });
    const office = await h.login(OFFICE);
    const henry = await h.login(HENRY);
    src.fail = true;
    const focus = await h.api('POST', '/api/focus', { text: 'stored anyway' }, office);
    expect(focus.status).toBe(200);
    expect(focus.json).toEqual({ ok: true });
    expect(h.service.db.getSetting('focusLine')).toBe('stored anyway');
    const review = await h.api('POST', '/api/review', { jobId: 'j-test-carter', pass: 1, verdict: 'READY' }, henry);
    expect(review.status).toBe(200);
    expect(review.json).toMatchObject({ ok: true, deduped: false });
    expect(h.service.db.reviewRowCount()).toBe(1);
    src.fail = false;
    await h.service.poll({ quiet: true });
    expect(h.snapshot().focusLine).toBe('stored anyway');
  });
});

describe('reads', () => {
  it('/snapshot.json carries the generatedAt ETag, answers 304 to If-None-Match, and changes after a write', async () => {
    h = await startHarness();
    const r = await h.api('GET', '/snapshot.json');
    expect(r.status).toBe(200);
    expect(r.headers.get('etag')).toMatch(new RegExp(`^"${FIXTURE_NOW.replace(/[.]/g, '\\.')};[0-9a-f]{16}"$`));
    expect(r.headers.get('cache-control')).toBe('no-store');
    expect(r.json.generatedAt).toBe(FIXTURE_NOW);
    const etag = r.headers.get('etag')!;
    const res = await fetch(`${h.baseUrl}/snapshot.json`, { headers: { 'if-none-match': etag } });
    expect(res.status).toBe(304);
    await res.text();

    const office = await h.login(OFFICE);
    await h.api('POST', '/api/focus', { text: 'NEW LINE' }, office);
    const after = await fetch(`${h.baseUrl}/snapshot.json`, { headers: { 'if-none-match': etag } });
    expect(after.status).toBe(200);
    expect(after.headers.get('etag')).not.toBe(etag);
    expect(after.headers.get('etag')).toContain(FIXTURE_NOW);
    expect(((await after.json()) as { focusLine: string }).focusLine).toBe('NEW LINE');

    // a restart on the same DATA_DIR under the same frozen clock never re-binds the pre-write tag
    const dir = h.dir;
    await h.close(true);
    h = await startHarness({ dir, poll: false });
    const reloaded = await fetch(`${h.baseUrl}/snapshot.json`, { headers: { 'if-none-match': etag } });
    expect(reloaded.status).toBe(200);
    expect(((await reloaded.json()) as { focusLine: string }).focusLine).toBe('NEW LINE');
  });

  it('405 carries an Allow header', async () => {
    h = await startHarness();
    const put = await fetch(`${h.baseUrl}/api/focus`, { method: 'PUT' });
    expect(put.status).toBe(405);
    expect(put.headers.get('allow')).toBe('POST');
    await put.text();
    const post = await fetch(`${h.baseUrl}/snapshot.json`, { method: 'POST' });
    expect(post.status).toBe(405);
    expect(post.headers.get('allow')).toBe('GET, HEAD');
    await post.text();
    const get = await fetch(`${h.baseUrl}/api/review`);
    expect(get.headers.get('allow')).toBe('POST');
    await get.text();
  });

  it('/health, 503 before the first poll, 404 for unknown /api/*, static fallback when the board is not built', async () => {
    h = await startHarness({ poll: false });
    expect((await h.api('GET', '/snapshot.json')).status).toBe(503);
    expect((await h.api('GET', '/health')).status).toBe(503);
    await h.service.poll({ quiet: true });
    const health = await h.api('GET', '/health');
    expect(health.status).toBe(200);
    expect(health.json).toMatchObject({ ok: true, build: 'test', mode: 'fixtures', generatedAt: FIXTURE_NOW, boardDate: '2026-10-14', queued: 0 });
    expect(health.json.sources.jobber.ok).toBe(true);
    expect((await h.api('GET', '/api/nothing')).status).toBe(404);
    expect((await h.api('GET', '/api/review')).status).toBe(405);
    const page = await fetch(`${h.baseUrl}/review`);
    expect(page.status).toBe(404);
    expect(await page.text()).toContain('board not built');
  });
});
