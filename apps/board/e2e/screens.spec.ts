import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expectButtonsTappable, expectMinFontSize, expectNoHorizontalScroll, openBoard, screenshot, openTab } from './helpers';

const PEOPLE = [
  { jobberUserId: 'u-test-owner', lastName: 'TESTOWNER', initials: 'JT', role: 'owner', reviewPass: 2 },
  { jobberUserId: 'u-test-office', lastName: 'TESTOFFICE', initials: 'JA', role: 'office', reviewPass: 0 },
  { jobberUserId: 'u-test-ashby', lastName: 'ASHBY', initials: 'HA', role: 'crewLead', reviewPass: 1 },
];

interface Call {
  path: string;
  body: unknown;
  auth: string | undefined;
}

/**
 * A stand-in for the service's identity and write endpoints so the signed-in screens can be exercised
 * without it. Every write is recorded with its body and its Authorization header.
 */
async function mockService(page: Page): Promise<Call[]> {
  const calls: Call[] = [];
  await page.route('**/api/people', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, people: PEOPLE }) }));
  await page.route('**/api/pin', async (route) => {
    const body = route.request().postDataJSON() as { userId: string; pin: string };
    const person = PEOPLE.find((p) => p.jobberUserId === body.userId);
    if (person && body.pin === '1234') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, token: 't-test', person }) });
    return route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'wrong PIN', attemptsLeft: 2 }) });
  });
  const answers: Record<string, unknown> = {
    review: { ok: true, rowIndex: 17, deduped: false },
    ack: { ok: true, status: 'queued' },
    focus: { ok: true },
    responder: { ok: true },
    flag: { ok: true },
    owner: { ok: true },
  };
  for (const [name, answer] of Object.entries(answers)) {
    await page.route(`**/api/${name}`, (route) => {
      calls.push({ path: `/api/${name}`, body: route.request().postDataJSON(), auth: route.request().headers().authorization });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(answer) });
    });
  }
  return calls;
}

async function signIn(page: Page, userId: string): Promise<void> {
  await page.getByTestId(`pin-tile-${userId}`).click();
  for (const d of ['1', '2', '3', '4']) await page.getByTestId(`pin-key-${d}`).click();
}

const posted = (calls: Call[], path: string): Call[] => calls.filter((c) => c.path === path);

/** Select a REVIEW queue card, paging the queue with its `+N more ›` tile until the card shows. */
async function pickQueueCard(page: Page, jobId: string): Promise<void> {
  const card = page.getByTestId(`review-job-${jobId}`);
  for (let i = 0; i < 6 && (await card.count()) === 0; i++) await page.getByTestId('review-queue-more').click();
  await card.click();
}

test('STAGES opens from its tab with seven columns and the WIP cap line', async ({ page }, info) => {
  await openBoard(page, 'default');
  await openTab(page, 'stages');
  await expect(page.getByTestId('screen-stages')).toBeVisible();
  await expect(page.locator('[data-testid^="stage-col-"]')).toHaveCount(7);
  await expect(page.getByTestId('packages-open')).toHaveText('Packages open 11 / cap 15');
  await expect(page.getByTestId('stage-col-requires_invoicing')).toContainText('12');
  await expect(page.getByTestId('stage-col-on_hold')).toContainText('show 1');
  await expect(page.locator('[data-testid^="stage-row-"]').filter({ hasText: 'ZHANG' })).toHaveCount(0);
  await page.getByTestId('reveal-on-hold').click();
  await expect(page.getByTestId('stage-col-on_hold')).toContainText('ZHANG');
  await screenshot(page, info, 'stages');
  // No city · scope line is cut.
  const cutWhere = await page.locator('.stage-row__where .ellipsis').evaluateAll((els) => els.filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => e.closest('.stage-row')?.getAttribute('data-testid')));
  expect(cutWhere).toEqual([]);
  await expectNoHorizontalScroll(page);
  await expectMinFontSize(page, 24);
  await expectButtonsTappable(page);
  await page.getByTestId('toggle-hard-red').click();
  await expect(page.locator('[data-testid^="stage-row-"]')).toHaveCount(1);
  await expect(page.getByTestId('stage-row-j-test-bauer')).toBeVisible();
});

test('CANNOT INVOICE opens from the money zone, grouped by next move, 12 rows across 2 pages', async ({ page }, info) => {
  await openBoard(page, 'default');
  await page.getByTestId('money').click();
  await expect(page.getByTestId('screen-cannot-invoice')).toBeVisible();
  await expect(page.getByTestId('cannot-reconcile')).toHaveText("Jobber counts 12 · 11 of them listed here · Mbeki invoiced, not closed · Bauer listed, not in Jobber's count");
  const rows = page.locator('[data-testid^="cannot-row-"]');
  await expect(rows).toHaveCount(6);
  await expect(rows.first()).toHaveAttribute('data-testid', 'cannot-row-j-test-kowalski');
  await expect(page.getByTestId('cannot-group-bill')).toHaveText('Bill today · JA');
  await expect(page.getByTestId('cannot-group-first')).toHaveText('1st pass · HA by 4:30 pm');
  const bauer = page.getByTestId('cannot-row-j-test-bauer');
  await expect(bauer).toContainText('not in Requires invoicing');
  // Hard red carries a word and an icon (decision 27), and the stage words are decision 31's.
  await expect(page.getByTestId('hard-red-j-test-bauer')).toHaveText('⚠ 20+ d unsubmitted');
  await expect(bauer).toContainText('done 23 Sep');
  await expect(bauer).toContainText('submitted —');
  await expect(bauer).toContainText('accepted —');
  await expect(bauer).not.toContainText(/\bsent\b|\bok\b/);
  // FIX OPEN shows its picklist item and the CREW role word, and offers no OWNER control.
  await expect(page.getByTestId('owner-j-test-bauer')).toBeVisible();
  await expect(page.getByTestId('cannot-page')).toHaveText('1–6 of 12');
  await page.getByTestId('cannot-next').click();
  const osei = page.getByTestId('cannot-row-j-test-osei');
  await expect(osei).toContainText('FIX open');
  await expect(osei).toContainText('No depth marker or ruler');
  await expect(page.getByTestId('cannot-owner-j-test-osei')).toHaveText('CREW');
  await expect(page.getByTestId('owner-j-test-osei')).toHaveCount(0);
  await expect(page.getByTestId('owner-j-test-price')).toHaveCount(0);
  await expect(page.getByTestId('cannot-page')).toHaveText('7–12 of 12');
  await screenshot(page, info, 'cannot-invoice');
  await expectNoHorizontalScroll(page);
  await expectMinFontSize(page, 24);
  await expectButtonsTappable(page);
  // Nothing on a row is cut sideways.
  const cut = await rows.evaluateAll((els) =>
    els.flatMap((el) => Array.from(el.querySelectorAll<HTMLElement>('.cannot-row__top, .cannot-row__clocks')).filter((e) => e.scrollWidth > e.clientWidth + 1).map(() => el.getAttribute('data-testid'))),
  );
  expect(cut).toEqual([]);
  // All six rows of the page sit whole inside the list.
  const fit = await page.locator('.cannot__rows').evaluate((el) => ({ zone: el.getBoundingClientRect().bottom, last: (el.lastElementChild as HTMLElement).getBoundingClientRect().bottom }));
  expect(fit.last).toBeLessThanOrEqual(fit.zone + 1);
  await expect(rows).toHaveCount(6);
  await expect(rows.last()).toHaveAttribute('data-testid', 'cannot-row-j-test-lindqvist');
  await expect(page.getByTestId('cannot-next')).toBeDisabled();
});

test('OWNER on a CANNOT INVOICE row: office PIN, initials tiles, POST /api/owner, then the session ends', async ({ page }) => {
  const calls = await mockService(page);
  await openBoard(page, 'default');
  await page.getByTestId('money').click();
  await page.getByTestId('owner-j-test-bauer').click();
  await expect(page.getByTestId('screen-owner-pin')).toBeVisible();
  // Only office and owner people may change a line owner.
  await expect(page.getByTestId('pin-tile-u-test-ashby')).toHaveCount(0);
  await signIn(page, 'u-test-office');
  await expect(page.getByTestId('owner-picker')).toBeVisible();
  await expect(page.getByTestId('owner-pick-A2')).toHaveCount(0);
  await expectMinFontSize(page, 24);
  await expectButtonsTappable(page);
  await page.getByTestId('owner-pick-MC').click();
  await expect(page.getByTestId('owner-note-j-test-bauer')).toContainText('saved');
  expect(posted(calls, '/api/owner')).toEqual([{ path: '/api/owner', body: { jobId: 'j-test-bauer', initials: 'MC' }, auth: 'Bearer t-test' }]);
  // The session ended with the write: the next OWNER asks for a PIN again.
  await page.getByTestId('owner-j-test-novak-b').click();
  await expect(page.getByTestId('screen-owner-pin')).toBeVisible();
  await page.getByTestId('pin-cancel').click();
  await expect(page.getByTestId('screen-cannot-invoice')).toBeVisible();
});

test('REVIEW shows the PIN pad with keys of at least 96 px', async ({ page }, info) => {
  await openBoard(page, 'default');
  await openTab(page, 'review');
  await expect(page.getByTestId('screen-review')).toBeVisible();
  await expect(page.getByTestId('pin-pad')).toBeVisible();
  const keys = page.locator('[data-testid^="pin-key-"]');
  await expect(keys).toHaveCount(12);
  for (const key of await keys.all()) {
    const box = await key.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(96);
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(96);
  }
  // Without the service the tiles come from the snapshot's people (office / owner / crew leads only).
  await expect(page.locator('[data-testid^="pin-tile-"]')).toHaveCount(7);
  await expect(page.getByTestId('pin-tile-u-test-a2')).toHaveCount(0);
  await screenshot(page, info, 'review-pin');
  await expectNoHorizontalScroll(page);
  await expectMinFontSize(page, 24);
  await expectButtonsTappable(page);
  // A wrong PIN against the stubbed /api shows the sentence, never a crash.
  await signIn(page, 'u-test-ashby');
  await expect(page.getByTestId('pin-pad')).toContainText('needs the service');
});

test('PIN lockout: the 423 message clears when the window ends', async ({ page }) => {
  await page.clock.install();
  await page.route('**/api/people', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, people: PEOPLE }) }));
  let attempts = 0;
  await page.route('**/api/pin', (route) => {
    attempts += 1;
    if (attempts < 3) return route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'wrong PIN', attemptsLeft: 3 - attempts }) });
    return route.fulfill({ status: 423, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'locked for 60 s after 3 wrong PINs', lockedForSec: 60 }) });
  });
  await openBoard(page, 'default');
  await openTab(page, 'review');
  await page.getByTestId('pin-tile-u-test-ashby').click();
  for (let i = 0; i < 3; i++) for (const d of ['9', '9', '9', '9']) await page.getByTestId(`pin-key-${d}`).click();
  await expect(page.getByTestId('pin-pad')).toContainText('locked · try again in');
  await expect(page.getByTestId('pin-key-1')).toBeDisabled();
  // Touches keep the screen (and the auto-return) alive while the lock runs out.
  await page.clock.fastForward(40_000);
  await page.getByTestId('pin-pad').click({ position: { x: 5, y: 5 } });
  await page.clock.fastForward(21_000);
  await expect(page.getByTestId('pin-key-1')).toBeEnabled();
  await expect(page.getByTestId('pin-pad')).not.toContainText('locked');
  await expect(page.getByTestId('pin-pad')).not.toContainText('left');
});

test('REVIEW after a PIN: the queue from the cannot-invoice lines, both verdicts, FIX picklist, POST /api/review with the token', async ({ page }, info) => {
  const calls = await mockService(page);
  await openBoard(page, 'default');
  await openTab(page, 'review');
  await signIn(page, 'u-test-ashby');
  await expect(page.getByTestId('review-queue')).toBeVisible();
  await expect(page.getByTestId('cutoffs')).toContainText('16:30');
  await expect(page.getByTestId('unmatched')).toContainText('STI_ATTIC_NOVAK');
  await expect(page.getByTestId('unmatched')).toContainText('no verdict shown on the wall');
  // Henry (pass 1): the queue follows snapshot.cannotInvoice, so the leaked BAUER line (Jobber bucket
  // Unscheduled) is first; jobs already READY at pass 1 are not in it.
  await expect(page.locator('[data-testid^="review-job-"]').first()).toHaveAttribute('data-testid', 'review-job-j-test-bauer');
  await expect(page.getByTestId('review-detail-j-test-bauer')).toBeVisible();
  await expect(page.getByTestId('review-job-j-test-lindqvist')).toHaveCount(0);
  await expect(page.getByTestId('review-job-j-test-ellis')).toHaveCount(0);
  // A non-default card: OSEI's detail replaces BAUER's; the human card shows Henry's FIX with his initials.
  await pickQueueCard(page, 'j-test-osei');
  await expect(page.getByTestId('review-detail-j-test-osei')).toBeVisible();
  await expect(page.getByTestId('review-detail-j-test-bauer')).toHaveCount(0);
  await expect(page.getByTestId('verdict-human')).toContainText('Latest human · 1st pass');
  await expect(page.getByTestId('verdict-human')).toContainText('FIX');
  await expect(page.getByTestId('verdict-human')).toContainText('No depth marker or ruler');
  await expect(page.getByTestId('verdict-human')).toContainText('· HA');
  // CARTER: the overnight checker's READY with its note; no human row yet.
  await pickQueueCard(page, 'j-test-carter');
  await expect(page.getByTestId('review-detail-j-test-carter')).toBeVisible();
  await expect(page.getByTestId('verdict-checker')).toContainText('READY');
  await expect(page.getByTestId('verdict-checker')).toContainText('All 9 photo types present');
  await expect(page.getByTestId('verdict-human')).toContainText('no row');
  for (const id of ['verdict-ready', 'verdict-fix', 'verdict-hold']) {
    const box = await page.getByTestId(id).boundingBox();
    expect(box?.width).toBe(160);
    expect(box?.height).toBe(120);
  }
  await screenshot(page, info, 'review');
  await expectNoHorizontalScroll(page);
  await expectMinFontSize(page, 24);
  await expectButtonsTappable(page);
  await page.getByTestId('verdict-fix').click();
  await expect(page.getByTestId('fix-pick')).toHaveCount(12);
  await page.getByTestId('fix-pick').nth(1).click();
  await expect(page.getByTestId('review-status')).toContainText('saved');
  expect(posted(calls, '/api/review')).toEqual([
    { path: '/api/review', body: { jobId: 'j-test-carter', pass: 1, verdict: 'FIX', fixPick: 'No depth marker or ruler' }, auth: 'Bearer t-test' },
  ]);
  // Ashby is a crew lead: no FLAG / FOCUS / RESPONDER tools.
  await expect(page.getByTestId('tools')).toHaveCount(0);
});

test('REVIEW: a reviewer missing from the roster prints ?, never the viewer\'s initials', async ({ page }, info) => {
  await mockService(page);
  const file = join(info.project.testDir, '..', '..', '..', 'fixtures', 'snapshots', 'default.json');
  const snap = JSON.parse(readFileSync(file, 'utf8')) as { people: Array<{ jobberUserId: string }> };
  snap.people = snap.people.filter((p) => p.jobberUserId !== 'u-test-ashby');
  await page.route('**/snapshots/default.json', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(snap) }));
  await openBoard(page, 'default');
  await openTab(page, 'review');
  await signIn(page, 'u-test-owner');
  await pickQueueCard(page, 'j-test-osei');
  await expect(page.getByTestId('verdict-human')).toContainText('FIX');
  await expect(page.getByTestId('verdict-human')).toContainText('· ?');
  await expect(page.getByTestId('verdict-human')).not.toContainText('JT');
});

test('REVIEW as the owner: pass-2 READY waits for a 1st pass READY; HOLD needs a reason and posts it', async ({ page }) => {
  const calls = await mockService(page);
  await openBoard(page, 'default');
  await openTab(page, 'review');
  await signIn(page, 'u-test-owner');
  await expect(page.getByTestId('tools')).toBeVisible();
  // OSEI: pass-1 FIX → pass-2 READY disabled with the words.
  await pickQueueCard(page, 'j-test-osei');
  await expect(page.getByTestId('verdict-ready')).toBeDisabled();
  await expect(page.getByTestId('review-detail-j-test-osei')).toContainText('needs 1st pass READY');
  // ELLIS: pass-1 READY → pass-2 READY enabled.
  await pickQueueCard(page, 'j-test-ellis');
  await expect(page.getByTestId('verdict-ready')).toBeEnabled();
  await page.getByTestId('verdict-hold').click();
  await expect(page.getByTestId('hold-form')).toBeVisible();
  await expect(page.getByTestId('hold-save')).toBeDisabled();
  await page.getByLabel('hold reason').fill('   ');
  await expect(page.getByTestId('hold-save')).toBeDisabled();
  await page.getByLabel('hold reason').fill('  waiting on the utility rebate form  ');
  await page.getByTestId('hold-save').click();
  await expect(page.getByTestId('review-status')).toContainText('saved');
  expect(posted(calls, '/api/review')).toEqual([
    { path: '/api/review', body: { jobId: 'j-test-ellis', pass: 2, verdict: 'HOLD', holdReason: 'waiting on the utility rebate form' }, auth: 'Bearer t-test' },
  ]);
  await expectMinFontSize(page, 24);
  await expectButtonsTappable(page);
});

test('office tools: FOCUS, RESPONDER and FLAG post their bodies with the token', async ({ page }) => {
  const calls = await mockService(page);
  await openBoard(page, 'default');
  await openTab(page, 'review');
  await signIn(page, 'u-test-office');
  await expect(page.getByTestId('tools')).toBeVisible();

  await page.getByTestId('tool-focus').click();
  await page.locator('#focus-text').fill('');
  await page.locator('#focus-text').pressSequentially('call the inspector before the crew leaves today');
  await page.getByTestId('focus-save').click();
  await expect(page.getByTestId('focus-form')).toContainText('saved');
  const focus = posted(calls, '/api/focus');
  expect(focus).toHaveLength(1);
  const text = (focus[0]?.body as { text: string }).text;
  expect(text).toBe('CALL THE INSPECTOR BEFORE THE');
  expect(text.length).toBeLessThanOrEqual(30);
  expect(focus[0]?.auth).toBe('Bearer t-test');

  await page.getByTestId('tool-responder').click();
  await page.getByRole('button', { name: 'responder TESTINTAKE' }).click();
  await expect(page.getByTestId('responder-form')).toContainText('saved');
  expect(posted(calls, '/api/responder')).toEqual([{ path: '/api/responder', body: { initials: 'KA' }, auth: 'Bearer t-test' }]);

  await page.getByTestId('tool-flag').click();
  await expect(page.getByTestId('flag-save')).toBeDisabled();
  await page.getByRole('button', { name: 'issue Improper Install' }).click();
  await page.getByTestId('flag-form').getByLabel('Employee').fill('  ASHBY-2 ');
  await page.getByTestId('flag-form').getByLabel('Job number').fill('9001');
  await page.getByRole('button', { name: 'crew ASHBY' }).click();
  await page.getByTestId('flag-form').getByLabel('Notes').fill('baffles missing at the north eave');
  await expect(page.getByTestId('flag-save')).toBeDisabled();
  await page.getByRole('button', { name: 'RR yes' }).click();
  await page.getByTestId('flag-save').click();
  await expect(page.getByTestId('flag-form')).toContainText('saved');
  expect(posted(calls, '/api/flag')).toEqual([
    {
      path: '/api/flag',
      body: { issue: 'Improper Install', jobNumber: 9001, employee: 'ASHBY-2', crewOnReport: 'ASHBY', notes: 'baffles missing at the north eave', rr: 'Y' },
      auth: 'Bearer t-test',
    },
  ]);
});

test('SCORECARD after a PIN: one row per week, dashes for missing feeds, no targets', async ({ page }, info) => {
  await mockService(page);
  await openBoard(page, 'monday-scorecard');
  await openTab(page, 'scorecard');
  await expect(page.getByTestId('screen-scorecard')).toBeVisible();
  await signIn(page, 'u-test-owner');
  await expect(page.locator('[data-testid^="scorecard-row-"]')).toHaveCount(13);
  await expect(page.getByTestId('screen-scorecard')).toContainText('—');
  await expect(page.getByTestId('screen-scorecard')).not.toContainText(/target/i);
  await expect(page.getByTestId('scorecard-crews')).toContainText('HA');
  await screenshot(page, info, 'scorecard');
  await expectNoHorizontalScroll(page);
  await expectMinFontSize(page, 24);
  await expectButtonsTappable(page);
});

test('ACK on a Problem card asks for a PIN, then POSTs /api/ack, shows the outcome, and the session ends', async ({ page }) => {
  const calls = await mockService(page);
  await openBoard(page, 'default');
  await page.getByTestId('ack-v-test-nguyen-1').click();
  await expect(page.getByTestId('screen-ack-pin')).toBeVisible();
  await expect(page.getByTestId('screen-today')).toHaveCount(0);
  // Only office and owner people may ACK.
  await expect(page.getByTestId('pin-tile-u-test-ashby')).toHaveCount(0);
  await signIn(page, 'u-test-office');
  await expect(page.getByTestId('screen-today')).toBeVisible();
  await expect(page.getByTestId('ack-note-v-test-nguyen-1')).toHaveText('queued');
  expect(posted(calls, '/api/ack')).toEqual([{ path: '/api/ack', body: { visitId: 'v-test-nguyen-1' }, auth: 'Bearer t-test' }]);
  // The office token does not linger: the next ACK and REVIEW both ask for a PIN.
  await page.getByTestId('ack-v-test-nguyen-1').click();
  await expect(page.getByTestId('screen-ack-pin')).toBeVisible();
  await page.getByTestId('pin-cancel').click();
  await openTab(page, 'review');
  await expect(page.getByTestId('pin-pad')).toBeVisible();
  expect(posted(calls, '/api/ack')).toHaveLength(1);
});

test('ACK without the service shows the sentence and never crashes', async ({ page }) => {
  await openBoard(page, 'default');
  await page.getByTestId('ack-v-test-nguyen-1').click();
  await expect(page.getByTestId('screen-ack-pin')).toBeVisible();
  await page.getByTestId('pin-cancel').click();
  await expect(page.getByTestId('screen-today')).toBeVisible();
  await expect(page.getByTestId('row-j-test-nguyen')).toHaveClass(/ring/);
});

test('auto-return: STAGES goes back to TODAY after 60 s without a touch', async ({ page }) => {
  await page.clock.install();
  await openBoard(page, 'default');
  await openTab(page, 'stages');
  await expect(page.getByTestId('screen-stages')).toBeVisible();
  await page.clock.fastForward(61_000);
  await expect(page.getByTestId('screen-today')).toBeVisible();
  await expect(page.getByTestId('screen-stages')).toHaveCount(0);
});

test('auto-return: CANNOT INVOICE goes back to TODAY after 60 s without a touch', async ({ page }) => {
  await page.clock.install();
  await openBoard(page, 'default');
  await openTab(page, 'cannot-invoice');
  await expect(page.getByTestId('screen-cannot-invoice')).toBeVisible();
  await page.clock.fastForward(61_000);
  await expect(page.getByTestId('screen-today')).toBeVisible();
  await expect(page.getByTestId('screen-cannot-invoice')).toHaveCount(0);
});

test.describe('the PIN session ends on every exit route', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.install();
    await mockService(page);
    await openBoard(page, 'default');
    await openTab(page, 'review');
    await signIn(page, 'u-test-ashby');
    await expect(page.getByTestId('review-queue')).toBeVisible();
  });

  test('← TODAY', async ({ page }) => {
    await page.getByTestId('screen-review').getByRole('button', { name: 'back to today' }).click();
    await expect(page.getByTestId('screen-today')).toBeVisible();
    await openTab(page, 'review');
    await expect(page.getByTestId('pin-pad')).toBeVisible();
  });

  test('a tab to another screen', async ({ page }) => {
    await openTab(page, 'stages');
    await expect(page.getByTestId('screen-stages')).toBeVisible();
    await openTab(page, 'review');
    await expect(page.getByTestId('pin-pad')).toBeVisible();
  });

  test('the TODAY tab', async ({ page }) => {
    await openTab(page, 'today');
    await openTab(page, 'scorecard');
    await expect(page.getByTestId('pin-pad')).toBeVisible();
  });

  test('lock', async ({ page }) => {
    await page.getByTestId('lock').click();
    await expect(page.getByTestId('pin-pad')).toBeVisible();
  });

  test('auto-return after 60 s idle', async ({ page }) => {
    await page.clock.fastForward(61_000);
    await expect(page.getByTestId('screen-today')).toBeVisible();
    await openTab(page, 'review');
    await expect(page.getByTestId('pin-pad')).toBeVisible();
  });

  test('touches restart the 60 s clock', async ({ page }) => {
    await page.clock.fastForward(50_000);
    await pickQueueCard(page, 'j-test-osei');
    await page.clock.fastForward(50_000);
    await expect(page.getByTestId('screen-review')).toBeVisible();
    await expect(page.getByTestId('review-detail-j-test-osei')).toBeVisible();
    await expect(page.getByTestId('pin-pad')).toHaveCount(0);
    await page.keyboard.press('Shift');
    await page.clock.fastForward(50_000);
    await expect(page.getByTestId('pin-pad')).toHaveCount(0);
    await page.clock.fastForward(11_000);
    await expect(page.getByTestId('screen-today')).toBeVisible();
  });
});

test('taps are posted to /api/tap on tab changes and zone taps', async ({ page }) => {
  const taps: unknown[] = [];
  await page.route('**/api/tap', (route) => {
    taps.push(route.request().postDataJSON());
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
  });
  await openBoard(page, 'default');
  await openTab(page, 'stages');
  await openTab(page, 'today');
  await page.getByTestId('money').click();
  await expect.poll(() => taps.length).toBe(3);
  expect(taps[0]).toEqual({ screen: 'today', target: 'tab:stages' });
  expect(taps[2]).toEqual({ screen: 'today', target: 'money' });
});
