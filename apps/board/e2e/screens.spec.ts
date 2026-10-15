import { expect, test, type Page } from '@playwright/test';
import { expectButtonsTappable, expectMinFontSize, expectNoHorizontalScroll, openBoard, screenshot } from './helpers';

const PEOPLE = [
  { jobberUserId: 'u-test-owner', lastName: 'TESTOWNER', initials: 'JT', role: 'owner', reviewPass: 2 },
  { jobberUserId: 'u-test-office', lastName: 'TESTOFFICE', initials: 'JA', role: 'office', reviewPass: 0 },
  { jobberUserId: 'u-test-ashby', lastName: 'ASHBY', initials: 'HA', role: 'crewLead', reviewPass: 1 },
];

/** A stand-in for the service's identity endpoints so the signed-in REVIEW screen can be exercised without it. */
async function mockService(page: Page): Promise<string[]> {
  const posts: string[] = [];
  await page.route('**/api/people', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, people: PEOPLE }) }));
  await page.route('**/api/pin', async (route) => {
    const body = route.request().postDataJSON() as { userId: string; pin: string };
    const person = PEOPLE.find((p) => p.jobberUserId === body.userId);
    if (person && body.pin === '1234') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, token: 't-test', person }) });
    return route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'wrong PIN', attemptsLeft: 2 }) });
  });
  await page.route('**/api/review', (route) => {
    posts.push(route.request().postData() ?? '');
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, rowIndex: 17, deduped: false }) });
  });
  return posts;
}

test('STAGES opens from a counts box with seven columns and the WIP cap line', async ({ page }, info) => {
  await openBoard(page, 'default');
  await page.getByTestId('counts-requires_invoicing').click();
  await expect(page.getByTestId('screen-stages')).toBeVisible();
  await expect(page.locator('[data-testid^="stage-col-"]')).toHaveCount(7);
  await expect(page.getByTestId('packages-open')).toHaveText('Packages open 11 / cap 15');
  await expect(page.getByTestId('stage-col-requires_invoicing')).toContainText('12');
  await expect(page.getByTestId('stage-col-on_hold')).toContainText('show 1');
  await expect(page.locator('[data-testid^="stage-row-"]').filter({ hasText: 'ZHANG' })).toHaveCount(0);
  await page.getByTestId('reveal-on-hold').click();
  await expect(page.getByTestId('stage-col-on_hold')).toContainText('ZHANG');
  await screenshot(page, info, 'stages');
  await expectNoHorizontalScroll(page);
  await expectMinFontSize(page, 24);
  await expectButtonsTappable(page);
  await page.getByTestId('toggle-hard-red').click();
  await expect(page.locator('[data-testid^="stage-row-"]')).toHaveCount(1);
  await expect(page.getByTestId('stage-row-j-test-bauer')).toBeVisible();
});

test('CANNOT INVOICE opens from the rail and lists 12 rows across 2 pages', async ({ page }, info) => {
  await openBoard(page, 'default');
  await page.getByTestId('rail').click();
  await expect(page.getByTestId('screen-cannot-invoice')).toBeVisible();
  const rows = page.locator('[data-testid^="cannot-row-"]');
  await expect(rows).toHaveCount(8);
  await expect(rows.first()).toHaveAttribute('data-testid', 'cannot-row-j-test-bauer');
  await expect(rows.first()).toContainText('NO-REMINDER');
  await expect(rows.first()).toContainText('done 23 Sep');
  await expect(page.getByTestId('cannot-page')).toHaveText('1–8 of 12');
  await screenshot(page, info, 'cannot-invoice');
  await expectNoHorizontalScroll(page);
  await expectMinFontSize(page, 24);
  await expectButtonsTappable(page);
  await page.getByTestId('cannot-next').click();
  await expect(rows).toHaveCount(4);
  await expect(page.getByTestId('cannot-page')).toHaveText('9–12 of 12');
  await expect(rows.last()).toHaveAttribute('data-testid', 'cannot-row-j-test-lindqvist');
  await expect(page.getByTestId('cannot-next')).toBeDisabled();
});

test('REVIEW shows the PIN pad with keys of at least 96 px', async ({ page }, info) => {
  await openBoard(page, 'default');
  await page.getByTestId('tab-review').click();
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
  await page.getByTestId('pin-tile-u-test-ashby').click();
  for (const d of ['1', '2', '3', '4']) await page.getByTestId(`pin-key-${d}`).click();
  await expect(page.getByTestId('pin-pad')).toContainText('needs the service');
});

test('REVIEW after a PIN: the first-pass queue, both verdicts, FIX picklist, POST /api/review', async ({ page }, info) => {
  const posts = await mockService(page);
  await openBoard(page, 'default');
  await page.getByTestId('tab-review').click();
  await page.getByTestId('pin-tile-u-test-ashby').click();
  for (const d of ['1', '2', '3', '4']) await page.getByTestId(`pin-key-${d}`).click();
  await expect(page.getByTestId('review-detail-j-test-carter').or(page.locator('[data-testid^="review-detail-"]').first())).toBeVisible();
  await expect(page.getByTestId('cutoffs')).toContainText('16:30');
  await expect(page.getByTestId('unmatched')).toContainText('STI_ATTIC_NOVAK');
  await expect(page.getByTestId('unmatched')).toContainText('no verdict shown on the wall');
  // Henry (pass 1): jobs already READY at pass 1 are not in the queue.
  await expect(page.getByTestId('review-job-j-test-lindqvist')).toHaveCount(0);
  await expect(page.getByTestId('review-job-j-test-carter')).toBeVisible();
  await page.getByTestId('review-job-j-test-carter').click();
  await expect(page.getByTestId('review-detail-j-test-carter')).toContainText('READY');
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
  expect(posts).toHaveLength(1);
  expect(JSON.parse(posts[0] ?? '{}')).toEqual({ jobId: 'j-test-carter', pass: 1, verdict: 'FIX', fixPick: 'No depth marker or ruler' });
  // Ashby is a crew lead: no FLAG / FOCUS / RESPONDER tools.
  await expect(page.getByTestId('tools')).toHaveCount(0);
});

test('REVIEW as the owner: pass-2 READY waits for a 1st pass READY; office tools present', async ({ page }) => {
  await mockService(page);
  await openBoard(page, 'default');
  await page.getByTestId('tab-review').click();
  await page.getByTestId('pin-tile-u-test-owner').click();
  for (const d of ['1', '2', '3', '4']) await page.getByTestId(`pin-key-${d}`).click();
  await expect(page.getByTestId('tools')).toBeVisible();
  // OSEI: pass-1 FIX → pass-2 READY disabled with the words.
  await page.getByTestId('review-job-j-test-osei').click();
  await expect(page.getByTestId('verdict-ready')).toBeDisabled();
  await expect(page.getByTestId('review-detail-j-test-osei')).toContainText('needs 1st pass READY');
  // ELLIS: pass-1 READY → pass-2 READY enabled.
  await page.getByTestId('review-job-j-test-ellis').click();
  await expect(page.getByTestId('verdict-ready')).toBeEnabled();
  await page.getByTestId('tool-flag').click();
  await expect(page.getByTestId('flag-form')).toBeVisible();
  await expectMinFontSize(page, 24);
  await expectButtonsTappable(page);
});

test('SCORECARD after a PIN: one row per week, dashes for missing feeds, no targets', async ({ page }, info) => {
  await mockService(page);
  await openBoard(page, 'monday-scorecard');
  await page.getByTestId('tab-scorecard').click();
  await expect(page.getByTestId('screen-scorecard')).toBeVisible();
  await page.getByTestId('pin-tile-u-test-owner').click();
  for (const d of ['1', '2', '3', '4']) await page.getByTestId(`pin-key-${d}`).click();
  await expect(page.locator('[data-testid^="scorecard-row-"]')).toHaveCount(13);
  await expect(page.getByTestId('screen-scorecard')).toContainText('—');
  await expect(page.getByTestId('screen-scorecard')).not.toContainText(/target/i);
  await expect(page.getByTestId('scorecard-crews')).toContainText('HA');
  await screenshot(page, info, 'scorecard');
  await expectNoHorizontalScroll(page);
  await expectMinFontSize(page, 24);
  await expectButtonsTappable(page);
});

test('ACK on a Problem card asks for a PIN, then POSTs /api/ack and shows the outcome on the card', async ({ page }) => {
  await mockService(page);
  const acks: unknown[] = [];
  await page.route('**/api/ack', (route) => {
    acks.push({ body: route.request().postDataJSON(), auth: route.request().headers().authorization });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, status: 'queued' }) });
  });
  await openBoard(page, 'default');
  await page.getByTestId('ack-v-test-nguyen-1').click();
  await expect(page.getByTestId('screen-ack-pin')).toBeVisible();
  await expect(page.getByTestId('screen-today')).toHaveCount(0);
  await page.getByTestId('pin-tile-u-test-office').click();
  for (const d of ['1', '2', '3', '4']) await page.getByTestId(`pin-key-${d}`).click();
  await expect(page.getByTestId('screen-today')).toBeVisible();
  await expect(page.getByTestId('ack-note-v-test-nguyen-1')).toHaveText('queued');
  expect(acks).toEqual([{ body: { visitId: 'v-test-nguyen-1' }, auth: 'Bearer t-test' }]);
});

test('ACK without the service shows the sentence and never crashes', async ({ page }) => {
  await openBoard(page, 'default');
  await page.getByTestId('ack-v-test-nguyen-1').click();
  await expect(page.getByTestId('screen-ack-pin')).toBeVisible();
  await page.getByTestId('pin-cancel').click();
  await expect(page.getByTestId('screen-today')).toBeVisible();
  await expect(page.getByTestId('card-v-test-nguyen-1')).toHaveAttribute('data-ack-overdue', 'true');
});

test('auto-return: STAGES goes back to TODAY after 60 s without a touch', async ({ page }) => {
  await page.clock.install();
  await openBoard(page, 'default');
  await page.getByTestId('tab-stages').click();
  await expect(page.getByTestId('screen-stages')).toBeVisible();
  await page.clock.fastForward(61_000);
  await expect(page.getByTestId('screen-today')).toBeVisible();
  await expect(page.getByTestId('screen-stages')).toHaveCount(0);
});

test('taps are posted to /api/tap on tab changes and zone taps', async ({ page }) => {
  const taps: unknown[] = [];
  await page.route('**/api/tap', (route) => {
    taps.push(route.request().postDataJSON());
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
  });
  await openBoard(page, 'default');
  await page.getByTestId('tab-stages').click();
  await page.getByTestId('tab-today').click();
  await page.getByTestId('rail').click();
  await expect.poll(() => taps.length).toBe(3);
  expect(taps[0]).toEqual({ screen: 'today', target: 'tab:stages' });
  expect(taps[2]).toEqual({ screen: 'today', target: 'rail' });
});
