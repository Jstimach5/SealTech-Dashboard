/**
 * TODAY, revision G. On the wall projects (1920×1080): zone boxes match the zone map in
 * docs/board-brief.md, the exact strings come from the domain rules (fixtures/test/wall.test.ts holds
 * the same strings), nothing clips or collides, red sits only where decisions 31 and 41 put it, and
 * the ACK button and ring follow decision 41's clock. On laptop and phone: the same content as a list.
 */
import { expect, test, type Page } from '@playwright/test';
import { expectButtonsTappable, expectMinFontSize, expectNoHorizontalScroll, openBoard, screenshot } from './helpers';

const ALL = ['default', 'typical', 'huddle-day', 'late-afternoon', 'stale', 'overflow', 'busy', 'all-clear', 'monday-scorecard'] as const;
const RED_FILL = 'rgb(229, 50, 45)';
const RED_TEXT = 'rgb(185, 28, 28)';

async function layout(page: Page): Promise<string | null> {
  return page.getByTestId('screen-today').getAttribute('data-layout');
}

/** Text boxes of every leaf element with text inside the wall. */
async function leafBoxes(page: Page) {
  return page.evaluate(() => {
    const out: Array<{ t: string; x: number; y: number; r: number; b: number; sw: number; cw: number; ov: string; fs: number; tt: string }> = [];
    for (const el of Array.from(document.querySelectorAll('[data-testid="screen-today"] *'))) {
      const own = Array.from(el.childNodes).some((n) => n.nodeType === 3 && (n.textContent ?? '').trim() !== '');
      if (!own) continue;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      out.push({ t: (el.textContent ?? '').trim().slice(0, 40), x: r.left, y: r.top, r: r.right, b: r.bottom, sw: el.scrollWidth, cw: el.clientWidth, ov: cs.overflow, fs: parseFloat(cs.fontSize), tt: cs.textTransform });
    }
    return out;
  });
}

test.describe('wall layout', () => {
  test.beforeEach(async ({ page }, info) => {
    test.skip(info.project.name !== 'wall-4k' && info.project.name !== 'laptop', 'wall layout only');
  });

  for (const scenario of ALL) {
    test(`${scenario}: fixed zones, nothing clipped, no upper-case styling, type floors`, async ({ page }, info) => {
      await openBoard(page, scenario);
      expect(await layout(page)).toBe('wall');
      await screenshot(page, info, `today-${scenario}`);
      await expectNoHorizontalScroll(page);
      await expectButtonsTappable(page);
      const boxes = await leafBoxes(page);
      for (const b of boxes) {
        expect(b.sw, `"${b.t}" clipped`).toBeLessThanOrEqual(b.cw + 1);
        expect(b.r, `"${b.t}" right edge`).toBeLessThanOrEqual(1824 + 1);
        expect(b.tt, `"${b.t}" text-transform`).toBe('none');
        if (b.y < 980) expect(b.fs, `"${b.t}" font size`).toBeGreaterThanOrEqual(42);
        else expect(b.fs, `"${b.t}" meta size`).toBeGreaterThanOrEqual(30);
      }
      await expect(page.getByTestId('hero')).toBeVisible();
      const hero = await page.locator('.w-hero__n').boundingBox();
      expect(hero?.x).toBe(1280);
      const answer = await page.getByTestId('answer').boundingBox();
      expect(answer).toMatchObject({ x: 96, y: 54, width: 1728, height: 84 });
      const meta = await page.getByTestId('meta-line').boundingBox();
      expect(meta).toMatchObject({ x: 96, y: 990, width: 1728, height: 36 });
      // Red only inside ledger rows (decisions 31, 41); never elsewhere on the wall.
      const strayRed = await page.evaluate(
        ([fill, text]) =>
          Array.from(document.querySelectorAll('[data-testid="screen-today"] *'))
            .filter((el) => !el.closest('.lrow'))
            .filter((el) => {
              const cs = getComputedStyle(el);
              return cs.color === text || cs.color === fill || cs.backgroundColor === fill;
            })
            .map((el) => (el.textContent ?? '').slice(0, 30)),
        [RED_FILL, RED_TEXT],
      );
      expect(strayRed).toEqual([]);
      const banned = /\b(confirmed|safe|passed|compliant|stopped|on plan)\b/i;
      expect(await page.getByTestId('screen-today').innerText()).not.toMatch(banned);
    });
  }

  test('default 9:30: the exact wall', async ({ page }) => {
    await openBoard(page, 'default');
    await expect(page.getByTestId('answer')).toHaveText('Nguyen Problem · no ACK since 9:05 am');
    await expect(page.getByTestId('focus-line')).toHaveText('Focus: Photos before you leave');
    await expect(page.getByTestId('win-line')).toHaveText('READY 1st pass 3 of 4 jobs');
    await expect(page.getByTestId('kept-line')).toHaveText('Tue 5 of 7 visits kept · 2 unanswered');
    const rows = page.locator('.lrow');
    await expect(rows).toHaveCount(5);
    const ids = await rows.evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')));
    expect(ids).toEqual(['row-j-test-nguyen', 'row-j-test-varga', 'row-j-test-bauer', 'row-j-test-price', 'row-j-test-osei']);
    await expect(page.getByTestId('row-j-test-varga')).toContainText('Late · Sun 11 Oct visit open');
    await expect(page.getByTestId('row-j-test-bauer')).toContainText('Jobber: Unscheduled');
    await expect(page.getByTestId('names-line')).toHaveText('+5 · Holt · Kowalski · Diaz · Rossi · Greene');
    await expect(page.locator('.w-hero__n')).toHaveText('12');
    await expect(page.locator('.w-mline')).toHaveCount(3);
    await expect(page.getByTestId('money-first_pass')).toHaveText(/1st pass · HA 4:30 pm\s*4/);
    await expect(page.getByTestId('crew-u-test-corder')).toContainText('Mbeki done');
    await expect(page.getByTestId('meta-line')).toHaveText('Wed 14 Oct · Demo data · Sources 9:29 am · Responder JA · No photo feed · 1 unmatched row · 1 form unanswered');
    const red = await page.locator('.lrow[data-red="true"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')));
    expect(red).toEqual(['row-j-test-nguyen', 'row-j-test-bauer', 'row-j-test-price']);
  });

  test('decision 41: ACK from the first minute, the red ring only from 15 minutes', async ({ page }) => {
    await openBoard(page, 'default', '&now=2026-10-14T13:10:00Z');
    const row = page.getByTestId('row-j-test-nguyen');
    await expect(page.getByTestId('ack-v-test-nguyen-1')).toBeVisible();
    await expect(row).not.toHaveClass(/lrow--ring/);
    await expect(row.locator('.lrow__age')).not.toHaveCSS('color', RED_TEXT);
    await openBoard(page, 'default', '&now=2026-10-14T13:20:00Z');
    await expect(page.getByTestId('row-j-test-nguyen')).toHaveClass(/lrow--ring/);
    await expect(page.getByTestId('row-j-test-nguyen')).toHaveCSS('border-left-color', RED_FILL);
    // No text touches the ring: every cell ends at x ≤ 1200.
    const right = await page.getByTestId('row-j-test-nguyen').evaluate((row) => Math.max(...Array.from(row.querySelectorAll('div, span, button')).map((e) => e.getBoundingClientRect().right)));
    expect(right).toBeLessThanOrEqual(1200.5);
  });

  test('late-afternoon: Still open leads, crews flipped to tomorrow, the 4:30 cut-off turns amber after it passes', async ({ page }) => {
    await openBoard(page, 'late-afternoon');
    await expect(page.getByTestId('answer')).toHaveText('6 to act on now · 5 more today');
    await expect(page.locator('.lrow').first()).toContainText('Still open · ended 2 pm');
    await expect(page.getByTestId('crew-u-test-brant')).toContainText('none tomorrow');
    await expect(page.getByTestId('money-first_pass')).toContainText('HA 4:30 pm');
    await openBoard(page, 'late-afternoon', '&now=2026-10-14T20:40:00Z');
    await expect(page.getByTestId('money-first_pass')).toContainText('past 4:30');
    await expect(page.getByTestId('money-first_pass').locator('span').first()).toHaveCSS('color', 'rgb(162, 74, 0)');
  });

  test('stale: the Problem stays on line 1 with what the data knows, the amber bar sits in the margin, no ring', async ({ page }) => {
    await openBoard(page, 'stale');
    await expect(page.getByTestId('answer')).toHaveText('Nguyen Problem · no ACK as of 8:45 am');
    await expect(page.getByTestId('stale-banner')).toHaveText('Stale · Jobber as of 8:45 am');
    const bar = await page.getByTestId('stale-bar').boundingBox();
    expect(bar).toMatchObject({ x: 72, width: 12 });
    await expect(page.getByTestId('row-j-test-nguyen')).not.toHaveClass(/lrow--ring/);
  });

  test('overflow and busy: every crew keeps a row; the names line ends in … when names do not fit', async ({ page }) => {
    await openBoard(page, 'overflow');
    await expect(page.locator('.crow')).toHaveCount(5);
    await expect(page.locator('.w-mline')).toHaveCount(1);
    await openBoard(page, 'busy');
    await expect(page.getByTestId('answer')).toHaveText('2 Problems · no ACK · first 9:05 am');
    await expect(page.getByTestId('names-line')).toHaveText(/…$/);
  });

  test('typical: two crews, seven money lines, empty slots stay empty', async ({ page }) => {
    await openBoard(page, 'typical');
    await expect(page.getByTestId('answer')).toHaveText('2 to act on now · 2 more today');
    await expect(page.locator('.lrow')).toHaveCount(4);
    await expect(page.locator('.w-mline')).toHaveCount(7);
    await expect(page.locator('.crow')).toHaveCount(2);
  });

  test('all-clear: says nothing is open and what was looked at', async ({ page }) => {
    await openBoard(page, 'all-clear');
    await expect(page.getByTestId('answer')).toHaveText(/^Nothing open · \d+ visits today$/);
    await expect(page.getByTestId('ledger-empty')).toHaveText('No open items for the office');
  });

  test('the nav shows on a touch of the answer line and hides after 10 s', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-10-14T13:30:00Z') });
    await openBoard(page, 'default');
    await expect(page.getByTestId('tab-stages')).toHaveCount(0);
    await page.getByTestId('answer').click();
    await expect(page.getByTestId('tab-stages')).toBeVisible();
    await page.clock.fastForward(11_000);
    await expect(page.getByTestId('tab-stages')).toHaveCount(0);
  });

  test('the Requires-invoicing zone opens Cannot invoice', async ({ page }) => {
    await openBoard(page, 'default');
    await page.getByTestId('money').click();
    await expect(page.getByTestId('screen-cannot-invoice')).toBeVisible();
    await expect(page.getByTestId('cannot-reconcile')).toContainText('Jobber counts 12');
  });
});

test.describe('compact layout (laptop and phone)', () => {
  test.beforeEach(async ({ page }, info) => {
    test.skip(info.project.name === 'wall-4k' || info.project.name === 'laptop', 'compact layout only');
  });

  for (const scenario of ['default', 'typical', 'late-afternoon', 'stale'] as const) {
    test(`${scenario}: every row, no sideways scroll, readable type, tappable`, async ({ page }, info) => {
      await openBoard(page, scenario);
      expect(await layout(page)).toBe('compact');
      await screenshot(page, info, `today-${scenario}`);
      await expectNoHorizontalScroll(page);
      await expectMinFontSize(page, 14);
      const small = await page.evaluate(() =>
        Array.from(document.querySelectorAll('button'))
          .map((b) => b.getBoundingClientRect())
          .filter((r) => r.width > 0 && (r.height < 44 || r.width < 44)).length,
      );
      expect(small).toBe(0);
    });
  }

  test('default: all ten rows under band headings; the ACK button is full width', async ({ page }) => {
    await openBoard(page, 'default');
    await expect(page.locator('.c-row')).toHaveCount(10);
    await expect(page.locator('.c-h3')).toHaveText(['Act now', 'Today']);
    await expect(page.getByTestId('ack-v-test-nguyen-1')).toBeVisible();
    await expect(page.getByTestId('tab-stages')).toBeVisible();
  });
});
