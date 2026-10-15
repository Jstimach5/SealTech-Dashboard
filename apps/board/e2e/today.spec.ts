import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SCENARIOS, expectButtonsTappable, expectMinFontSize, expectNoHorizontalScroll, openBoard, screenshot } from './helpers';

const ACT_RED = 'rgb(229, 50, 45)';

interface FixtureSnapshot {
  focusLine: string;
  cannotInvoice: Array<{ jobId: string; reason: string; fixPick?: string }>;
}

function fixture(scenario: string, testDir: string): FixtureSnapshot {
  return JSON.parse(readFileSync(join(testDir, '..', '..', '..', 'fixtures', 'snapshots', `${scenario}.json`), 'utf8')) as FixtureSnapshot;
}

for (const scenario of SCENARIOS) {
  test.describe(`TODAY · ${scenario}`, () => {
    test.beforeEach(async ({ page }) => {
      await openBoard(page, scenario);
    });

    test('renders at 1920×1080 with no overflow, tier floors and tappable targets', async ({ page }, info) => {
      await screenshot(page, info, scenario);
      await expectNoHorizontalScroll(page);
      await expectMinFontSize(page, 24);
      await expectButtonsTappable(page);
      await expect(page.getByTestId('hero')).toHaveCSS('font-size', '140px');
      for (const zone of ['topbar', 'scoreline', 'attention', 'lanes', 'rail', 'counts', 'footer']) {
        await expect(page.getByTestId(zone)).toBeVisible();
      }
      // Tabs stay tappable at tier D.
      for (const tab of ['today', 'stages', 'cannot-invoice', 'review', 'scorecard']) {
        const box = await page.getByTestId(`tab-${tab}`).boundingBox();
        expect(box?.height ?? 0).toBeGreaterThanOrEqual(48);
      }
      // The DPR warning never shows outside kiosk mode (laptop phase is scale 1 by design).
      await expect(page.getByTestId('dpr-warning')).toHaveCount(0);
    });

    test('no counts label is clipped', async ({ page }) => {
      const clipped = await page.evaluate(() =>
        Array.from(document.querySelectorAll('[data-testid^="counts-label-"]'))
          .map((el) => {
            const box = el.closest('.count-box') as HTMLElement;
            const size = parseFloat(getComputedStyle(el).fontSize);
            const lines = Math.round(el.getBoundingClientRect().height / size);
            const words = (el.textContent ?? '').replace(/­/g, '').split(/[  ]/).length;
            const boxRect = box.getBoundingClientRect();
            const lowest = Math.max(...Array.from(box.children).map((c) => c.getBoundingClientRect().bottom));
            return {
              id: el.getAttribute('data-testid'),
              wide: el.scrollWidth > el.clientWidth + 1,
              lines,
              hyphenated: lines > words,
              tall: lowest > boxRect.bottom + 1,
              boxWide: boxRect.right > (box.parentElement as HTMLElement).getBoundingClientRect().right + 1,
            };
          })
          .filter((r) => r.wide || r.lines > 2 || r.hyphenated || r.tall || r.boxWide)
          .map((r) => JSON.stringify(r)),
      );
      expect(clipped).toEqual([]);
      await expect(page.locator('[data-testid^="counts-label-"]')).toHaveCount(8);
    });

    test('NEEDS ATTENTION leads with VARGA then HOLT', async ({ page }) => {
      const ids = await page.locator('[data-testid^="attention-row-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')));
      expect(ids.slice(0, 2)).toEqual(['attention-row-j-test-varga', 'attention-row-j-test-holt']);
      expect(ids.length).toBeLessThanOrEqual(4);
      await expect(page.getByTestId('attention-row-j-test-varga')).toContainText('LATE');
      await expect(page.getByTestId('attention-row-j-test-holt')).toContainText('ACTION REQUIRED');
    });

    test('the rail leads with BAUER (NO-REMINDER), never ends on PROGRAM-WAIT, and every reason is whole', async ({ page }, info) => {
      const rows = page.locator('[data-testid^="rail-row-"]');
      const n = await rows.count();
      expect(n).toBeGreaterThan(0);
      expect(n).toBeLessThanOrEqual(3);
      await expect(rows.first()).toHaveAttribute('data-testid', 'rail-row-j-test-bauer');
      await expect(rows.first()).toContainText('NO-REMINDER');
      if (n >= 3) await expect(rows.last()).not.toHaveAttribute('data-reason', 'PROGRAM-WAIT');
      const lines = fixture(scenario, info.project.testDir).cannotInvoice;
      const seen = await rows.evaluateAll((els) =>
        els.map((el) => {
          const reason = el.querySelector('[data-testid="rail-reason"]') as HTMLElement | null;
          return {
            id: el.getAttribute('data-testid') ?? '',
            text: reason?.textContent ?? '',
            clipped: reason ? reason.scrollWidth > reason.clientWidth + 1 : true,
          };
        }),
      );
      for (const row of seen) {
        const line = lines.find((l) => `rail-row-${l.jobId}` === row.id);
        expect(line, row.id).toBeDefined();
        expect(row.text).toContain(line?.reason ?? '');
        if (line?.fixPick) expect(row.text).toContain(line.fixPick);
        expect(row.clipped, `${row.id} reason clipped`).toBe(false);
      }
    });
  });
}

test('default: the focus line shows whole; NGUYEN is a Problem with the red border and ACK; MBEKI is grey DONE', async ({ page }, info) => {
  await openBoard(page, 'default');
  const focus = fixture('default', info.project.testDir).focusLine;
  const focusEl = page.getByTestId('focus-line');
  await expect(focusEl).toHaveText(focus);
  const focusBox = await focusEl.evaluate((el) => {
    const text = el.firstElementChild as HTMLElement;
    const size = parseFloat(getComputedStyle(text).fontSize);
    return { sw: text.scrollWidth, cw: text.clientWidth, lines: Math.round(text.getBoundingClientRect().height / size), size };
  });
  // Not clipped sideways, at most two lines inside the 64 px bar, never below 32 px.
  expect(focusBox.sw).toBeLessThanOrEqual(focusBox.cw + 1);
  expect(focusBox.lines).toBeLessThanOrEqual(2);
  expect(focusBox.size).toBeGreaterThanOrEqual(32);
  const nguyen = page.getByTestId('card-v-test-nguyen-1');
  await expect(nguyen).toHaveAttribute('data-ack-overdue', 'true');
  await expect(nguyen).toHaveCSS('border-top-color', ACT_RED);
  await expect(nguyen).toHaveCSS('border-top-width', '6px');
  const ack = nguyen.getByRole('button', { name: /acknowledge/i });
  await expect(ack).toBeVisible();
  expect((await ack.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(56);
  await expect(nguyen).toContainText('Problem');
  await expect(page.getByTestId('meta-time-v-test-nguyen-1')).toHaveText('08:00–12:00');
  await expect(nguyen).toContainText('photos 3');
  const mbeki = page.getByTestId('card-v-test-mbeki-1');
  await expect(mbeki).toHaveAttribute('data-state', 'DONE');
  await expect(mbeki).toHaveAttribute('data-grey', 'true');
  await expect(page.getByTestId('stale-banner')).toHaveCount(0);
  await expect(page.getByTestId('scoreline')).toContainText('5 of 7');
  await expect(page.getByTestId('scoreline')).toContainText('3 of 4');
  await expect(page.getByTestId('fixtures-tag')).toBeVisible();
  await expect(page.getByTestId('clock')).toContainText('Wed 14 Oct · 09:30');
  await expect(page.getByTestId('not-ready')).toContainText('NOT YET READY');
  await expect(page.getByTestId('visits-not-ready')).toHaveText('0');
  await expect(page.getByTestId('counts-unknown')).toHaveText('+1 unknown');
});

test('late-afternoon: the ACK landed on NGUYEN and the DALE lane shows TOMORROW', async ({ page }) => {
  await openBoard(page, 'late-afternoon');
  const nguyen = page.getByTestId('card-v-test-nguyen-1');
  await expect(nguyen).toHaveAttribute('data-ack-overdue', 'false');
  await expect(nguyen).not.toHaveCSS('border-top-color', ACT_RED);
  await expect(page.getByTestId('lane-DALE')).toContainText('TOMORROW');
  await expect(page.getByTestId('tomorrow-DALE')).toContainText('QUINN');
  await expect(page.getByTestId('tomorrow-ASHBY')).toContainText('LEE');
  await expect(page.getByTestId('card-v-test-santos-1')).toContainText('SANTOS');
  await expect(page.getByTestId('queued')).toContainText('1');
  await expect(page.getByTestId('card-v-test-ibrahim-1')).toHaveAttribute('data-state', 'LATE');
});

test('stale: the red banner replaces the focus line', async ({ page }) => {
  await openBoard(page, 'stale');
  await expect(page.getByTestId('stale-banner')).toBeVisible();
  await expect(page.getByTestId('stale-banner')).toContainText('DATA STALE');
  await expect(page.getByTestId('stale-banner')).toContainText('45 min');
  await expect(page.getByTestId('focus-line')).toHaveCount(0);
  await expect(page.getByTestId('fresh-jobber')).toHaveAttribute('data-freshness', 'red');
});

test('overflow: four lanes and a +1 crew note', async ({ page }) => {
  await openBoard(page, 'overflow');
  await expect(page.locator('[data-testid^="lane-"]')).toHaveCount(4);
  await expect(page.getByTestId('lanes-overflow')).toContainText(/\+1\s*crew/i);
  await expect(page.getByTestId('lane-DALE')).toBeVisible();
});

test('huddle-day: nothing started, the NOW cards read NOT STARTED or NOW', async ({ page }) => {
  await openBoard(page, 'huddle-day');
  await expect(page.getByTestId('card-v-test-nguyen-1')).toHaveAttribute('data-state', 'NOT STARTED');
  await expect(page.getByTestId('card-v-test-mbeki-1')).toHaveAttribute('data-state', 'NOW');
  await expect(page.getByTestId('card-v-test-nguyen-1')).toHaveAttribute('data-ack-overdue', 'false');
});
