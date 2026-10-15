import { expect, test, type Page, type Route } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { openBoard } from './helpers';

const SNAPSHOT = '**/snapshots/default.json';

function defaultJson(testDir: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(testDir, '..', '..', '..', 'fixtures', 'snapshots', 'default.json'), 'utf8')) as Record<string, unknown>;
}

/** The same snapshot with one field the strict schema refuses. */
function badJson(testDir: string): Record<string, unknown> {
  const s = defaultJson(testDir);
  (s.hero as Record<string, unknown>).cannotInvoice = 'x';
  return s;
}

const good = (route: Route, body: unknown) => route.fulfill({ status: 200, contentType: 'application/json', headers: { ETag: '"good"' }, body: JSON.stringify(body) });

/** One 15-second poll tick, waiting until the board has asked for the snapshot again. */
async function tick(page: Page, polls: () => number): Promise<void> {
  const before = polls();
  await page.clock.fastForward(15_000);
  await expect.poll(polls).toBeGreaterThan(before);
}

test('a snapshot the schema refuses, a 500 and a network failure keep the last good snapshot and print the error in the footer', async ({ page }, info) => {
  await page.clock.install();
  let n = 0;
  await page.route(SNAPSHOT, (route) => {
    n += 1;
    if (n === 1 || n === 5) return good(route, defaultJson(info.project.testDir));
    if (n === 2) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(badJson(info.project.testDir)) });
    if (n === 3) return route.fulfill({ status: 500, contentType: 'application/json', body: '{"ok":false,"error":"boom"}' });
    return route.abort('failed');
  });
  await openBoard(page, 'default');
  await expect(page.getByTestId('hero')).toHaveText('12');
  await expect(page.getByTestId('snapshot-error')).toHaveCount(0);

  await tick(page, () => n);
  await expect(page.getByTestId('snapshot-error')).toContainText('snapshot schema: hero.cannotInvoice');
  await expect(page.getByTestId('screen-today')).toBeVisible();
  await expect(page.getByTestId('hero')).toHaveText('12');

  await tick(page, () => n);
  await expect(page.getByTestId('snapshot-error')).toContainText('snapshot 500');
  await expect(page.getByTestId('hero')).toHaveText('12');

  await tick(page, () => n);
  await expect(page.getByTestId('snapshot-error')).toBeVisible();
  await expect(page.getByTestId('snapshot-error')).not.toContainText('snapshot 500');
  await expect(page.getByTestId('hero')).toHaveText('12');
  await expect(page.getByTestId('ledger')).toBeVisible();

  await tick(page, () => n);
  await expect(page.getByTestId('snapshot-error')).toHaveCount(0);
  await expect(page.getByTestId('hero')).toHaveText('12');
});

test('a cold start on a refused snapshot waits on the loading screen with the reason, then draws the first good one', async ({ page }, info) => {
  await page.clock.install();
  let n = 0;
  await page.route(SNAPSHOT, (route) => {
    n += 1;
    if (n === 1) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(badJson(info.project.testDir)) });
    return good(route, defaultJson(info.project.testDir));
  });
  await page.goto('/?scenario=default');
  await expect(page.getByTestId('loading')).toContainText('snapshot schema: hero.cannotInvoice');
  await expect(page.getByTestId('screen-today')).toHaveCount(0);
  await tick(page, () => n);
  await expect(page.getByTestId('screen-today')).toBeVisible();
  await expect(page.getByTestId('hero')).toHaveText('12');
  await expect(page.getByTestId('snapshot-error')).toHaveCount(0);
});

test('304: every poll after the first sends If-None-Match and the board stays drawn with a clean footer', async ({ page }) => {
  await page.clock.install();
  const seen: Array<{ status: number; ifNoneMatch: string | undefined }> = [];
  page.on('response', (res) => {
    if (res.url().includes('/snapshots/default.json')) seen.push({ status: res.status(), ifNoneMatch: res.request().headers()['if-none-match'] });
  });
  await openBoard(page, 'default');
  await expect.poll(() => seen.length).toBe(1);
  for (let i = 0; i < 3; i++) await tick(page, () => seen.length);
  expect(seen.map((r) => r.status)).toEqual([200, 304, 304, 304]);
  expect(seen[0]?.ifNoneMatch).toBeUndefined();
  for (const r of seen.slice(1)) expect(r.ifNoneMatch).toMatch(/^".+"$/);
  await expect(page.getByTestId('snapshot-error')).toHaveCount(0);
  await expect(page.getByTestId('hero')).toHaveText('12');
  await expect(page.locator('.tick-dot--bad')).toHaveCount(0);
});

test.describe('kiosk watchdog (?kiosk=1)', () => {
  test('reloads the page after five minutes without a good poll', async ({ page }, info) => {
    await page.clock.install();
    let navigations = 0;
    page.on('request', (req) => {
      if (req.isNavigationRequest() && req.frame() === page.mainFrame()) navigations += 1;
    });
    let n = 0;
    await page.route(SNAPSHOT, (route) => {
      n += 1;
      if (n === 1) return good(route, defaultJson(info.project.testDir));
      return route.fulfill({ status: 500, contentType: 'application/json', body: '{"ok":false}' });
    });
    await openBoard(page, 'default', '&kiosk=1');
    expect(navigations).toBe(1);
    await page.clock.fastForward(4 * 60_000);
    await page.waitForTimeout(200);
    expect(navigations).toBe(1);
    await page.clock.fastForward(60_000 + 31_000);
    await expect.poll(() => navigations).toBe(2);
  });

  test('does not reload while polls succeed (304s count)', async ({ page }) => {
    await page.clock.install();
    let navigations = 0;
    page.on('request', (req) => {
      if (req.isNavigationRequest() && req.frame() === page.mainFrame()) navigations += 1;
    });
    let polls = 0;
    page.on('response', (res) => {
      if (res.url().includes('/snapshots/default.json')) polls += 1;
    });
    await openBoard(page, 'default', '&kiosk=1');
    // Ten minutes in 15-second steps, each one a real (304) poll.
    for (let i = 0; i < 40; i++) await tick(page, () => polls);
    expect(navigations).toBe(1);
    await expect(page.getByTestId('screen-today')).toBeVisible();
  });
});
