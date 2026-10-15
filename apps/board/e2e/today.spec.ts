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

    test('the rail leads with BAUER (NO-REMINDER, hard red with its word), and no rail row is cut', async ({ page }, info) => {
      const rows = page.locator('[data-testid^="rail-row-"]');
      const n = await rows.count();
      expect(n).toBeGreaterThan(0);
      expect(n).toBeLessThanOrEqual(3);
      await expect(rows.first()).toHaveAttribute('data-testid', 'rail-row-j-test-bauer');
      await expect(rows.first()).toContainText('NO-REMINDER');
      await expect(page.getByTestId('hard-red-j-test-bauer')).toHaveText('⚠ 20+ d UNSUBMITTED');
      const lines = fixture(scenario, info.project.testDir).cannotInvoice;
      const seen = await rows.evaluateAll((els) =>
        els.map((el) => ({
          id: el.getAttribute('data-testid') ?? '',
          text: el.querySelector('[data-testid="rail-reason"]')?.textContent ?? '',
          city: el.querySelector('[data-testid="rail-city"]') as HTMLElement | null,
          cut: el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1 || Array.from(el.querySelectorAll<HTMLElement>('.rail-row__top > *')).some((c) => c.scrollWidth > c.clientWidth + 1),
          bottom: el.getBoundingClientRect().bottom,
          zoneBottom: (el.parentElement as HTMLElement).getBoundingClientRect().bottom,
        })),
      );
      for (const row of seen) {
        const line = lines.find((l) => `rail-row-${l.jobId}` === row.id);
        expect(line, row.id).toBeDefined();
        expect(row.text).toContain(line?.reason ?? '');
        expect(row.cut, `${row.id} cut`).toBe(false);
        expect(row.bottom, `${row.id} inside the rail`).toBeLessThanOrEqual(row.zoneBottom + 1);
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
  await expect(nguyen).not.toHaveClass(/now-card--ack/);
  await expect(nguyen).toHaveCSS('border-top-width', '0px');
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

test('09:10, five minutes after NGUYEN\'s Problem: the ACK button is already there, no red border yet', async ({ page }) => {
  await openBoard(page, 'default', '&now=2026-10-14T13:10:00Z');
  const nguyen = page.getByTestId('card-v-test-nguyen-1');
  await expect(nguyen).toHaveClass(/now-card/);
  await expect(nguyen).toHaveAttribute('data-ack-overdue', 'false');
  await expect(nguyen).not.toHaveCSS('border-top-color', ACT_RED);
  await expect(page.getByTestId('ack-v-test-nguyen-1')).toBeVisible();
  await expect(nguyen).toContainText('Problem');
});

test('13:30: the un-ACKed Problem stays the NOW card with its red border and ACK while OKAFOR waits', async ({ page }) => {
  await openBoard(page, 'default', '&now=2026-10-14T17:30:00Z');
  await expect(page.getByTestId('clock')).toContainText('13:30');
  const nguyen = page.getByTestId('card-v-test-nguyen-1');
  await expect(nguyen).toHaveClass(/now-card/);
  await expect(nguyen).toHaveAttribute('data-ack-overdue', 'true');
  await expect(nguyen).toHaveCSS('border-top-color', ACT_RED);
  await expect(page.getByTestId('ack-v-test-nguyen-1')).toBeVisible();
  await expect(page.getByTestId('card-v-test-okafor-1')).toHaveClass(/next-row/);
});

test('late-afternoon: an ACKed Problem in the DONE line reads ⚠ NGUYEN · Problem in red', async ({ page }) => {
  await openBoard(page, 'late-afternoon');
  const nguyen = page.getByTestId('card-v-test-nguyen-1');
  await expect(nguyen).toHaveClass(/done-row__item/);
  await expect(nguyen).toHaveText('⚠ NGUYEN · Problem');
  await expect(nguyen).toHaveCSS('color', ACT_RED);
});

test('red words and counts carry the ⚠ icon (decision 27)', async ({ page }) => {
  await openBoard(page, 'default');
  await expect(page.getByTestId('attention-row-j-test-varga').locator('.attention__word')).toHaveText('⚠ LATE');
  await expect(page.getByTestId('counts-num-late')).toHaveText('⚠1');
  await expect(page.getByTestId('counts-num-action_required')).toHaveText('⚠1');
  await expect(page.getByTestId('rail-row-j-test-price').getByTestId('rail-days')).toHaveText('⚠12 d');
  // The REQUIRES INVOICING trigger word never drops below 32 px (abbreviated where it cannot fit).
  const words = await page.locator('.attention__word--requires_invoicing > span').evaluateAll((els) => els.map((e) => ({ size: parseFloat(getComputedStyle(e).fontSize), cut: e.scrollWidth > e.clientWidth + 1, text: e.textContent })));
  expect(words.length).toBeGreaterThan(0);
  for (const w of words) {
    expect(w.size).toBeGreaterThanOrEqual(32);
    expect(w.cut).toBe(false);
    expect(['REQUIRES INVOICING', 'REQ. INVOICING']).toContain(w.text);
  }
});

test('targets on TODAY keep 8 px gaps', async ({ page }) => {
  await openBoard(page, 'default');
  for (const sel of ['.topbar__tabs > button', '.counts > button']) {
    const rects = await page.locator(sel).evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => ({ left: r.left, right: r.right })));
    for (let i = 1; i < rects.length; i++) expect((rects[i]?.left ?? 0) - (rects[i - 1]?.right ?? 0), sel).toBeGreaterThanOrEqual(8 - 0.5);
  }
});

/** The default fixture, changed to exercise the legibility rules with long words. */
function stressed(testDir: string): unknown {
  const s = JSON.parse(readFileSync(join(testDir, '..', '..', '..', 'fixtures', 'snapshots', 'default.json'), 'utf8')) as {
    scoreline: { misses: Record<string, number> };
    jobs: Array<{ id: string; lastName: string; city: string }>;
    visits: Array<{ id: string; result?: string; resultAt?: string; completedAt?: string; startAt: string; endAt: string; assignedUserIds: string[] }>;
    cannotInvoice: Array<{ jobId: string; label: string; fixPick?: string }>;
  };
  s.scoreline.misses = { ACCESS: 2, 'SCOPE CHANGED': 1, 'PRE-EXISTING': 1, 'EQUIPMENT/TRUCK': 1, OVERCOMMITTED: 1 };
  const santos = s.visits.find((v) => v.id === 'v-test-santos-1');
  if (santos) {
    santos.result = 'Customer cancelled';
    santos.resultAt = '2026-10-14T13:00:00.000Z';
  }
  // CORDER finished FOSTER and MORGAN before MBEKI: three names on one DONE line.
  for (const [id, h] of [
    ['v-test-foster-1', '09'],
    ['v-test-morgan-1', '10'],
  ] as const) {
    const v = s.visits.find((x) => x.id === id);
    if (!v) continue;
    v.assignedUserIds = ['u-test-corder', 'u-test-c2'];
    v.startAt = `2026-10-14T${h}:00:00.000Z`;
    v.endAt = `2026-10-14T${h}:30:00.000Z`;
    v.resultAt = v.endAt;
    v.completedAt = v.endAt;
  }
  // OSEI (FIX OPEN, the longest picklist item, a 10-character city) is the top rail line.
  const i = s.cannotInvoice.findIndex((l) => l.jobId === 'j-test-osei');
  const [osei] = s.cannotInvoice.splice(i, 1);
  if (osei) {
    osei.fixPick = 'Blower-door reading not photographed';
    osei.label = 'OSEI · KALAMAZOOX · WALL';
    s.cannotInvoice.unshift(osei);
  }
  return s;
}

test('legibility under long words: rail reason · FIX pick wraps, cities print whole, chips wrap, DONE and scoreline say +N more', async ({ page }, info) => {
  const snap = stressed(info.project.testDir);
  await page.route('**/snapshots/default.json', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(snap) }));
  await openBoard(page, 'default');
  await expectNoHorizontalScroll(page);
  await expectMinFontSize(page, 24);

  const osei = page.getByTestId('rail-row-j-test-osei');
  await expect(page.locator('[data-testid^="rail-row-"]').first()).toHaveAttribute('data-testid', 'rail-row-j-test-osei');
  await expect(osei.getByTestId('rail-reason')).toHaveText('FIX OPEN · Blower-door reading not photographed');
  await expect(osei.getByTestId('rail-city')).toHaveText('KALAMAZOOX');
  const rail = await page.locator('[data-testid^="rail-row-"]').evaluateAll((els) =>
    els.map((el) => ({
      id: el.getAttribute('data-testid'),
      cut: el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1 || Array.from(el.querySelectorAll<HTMLElement>('.rail-row__top > *')).some((c) => c.scrollWidth > c.clientWidth + 1),
      out: el.getBoundingClientRect().bottom > (el.parentElement as HTMLElement).getBoundingClientRect().bottom + 1,
    })),
  );
  for (const r of rail) expect(r, `${r.id}`).toEqual({ id: r.id, cut: false, out: false });

  // A chip word that does not fit at tier D wraps to a second line instead of being cut.
  const chip = await page.getByTestId('card-v-test-santos-1').locator('.now-card__chip .chip > span').evaluate((e) => ({ size: parseFloat(getComputedStyle(e).fontSize), sw: e.scrollWidth, cw: e.clientWidth, text: e.textContent }));
  expect(chip.text).toBe('✕ Customer cancelled');
  expect(chip.size).toBeGreaterThanOrEqual(24);
  expect(chip.sw).toBeLessThanOrEqual(chip.cw + 1);

  // DONE: whole names, then +N more.
  const done = page.getByTestId('lane-CORDER').getByTestId('done-row');
  await expect(done).toContainText('✓ FOSTER');
  await expect(page.getByTestId('lane-CORDER').getByTestId('done-more')).toHaveText(/^\+\d more$/);
  const doneBox = await done.evaluate((e) => ({ sw: e.scrollWidth, cw: e.clientWidth }));
  expect(doneBox.sw).toBeLessThanOrEqual(doneBox.cw + 1);

  // Scoreline: the first two miss reasons and +N more; the READY FIRST PASS number stays on the wall.
  await expect(page.getByTestId('scoreline-more')).toHaveText(/\+3 more/);
  await expect(page.getByTestId('scoreline')).toContainText('ACCESS');
  await expect(page.getByTestId('scoreline')).toContainText('SCOPE CHANGED');
  const right = await page.getByTestId('scoreline-right').evaluate((e) => ({ right: e.getBoundingClientRect().right, zone: (e.parentElement as HTMLElement).getBoundingClientRect().right, sw: e.scrollWidth, cw: e.clientWidth }));
  expect(right.right).toBeLessThanOrEqual(right.zone + 1);
  expect(right.sw).toBeLessThanOrEqual(right.cw + 1);
  await expect(page.getByTestId('scoreline-right')).toContainText('3 of 4');
});
