import { expect, type Page, type TestInfo } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

export const SCENARIOS = ['default', 'typical', 'huddle-day', 'late-afternoon', 'stale', 'overflow', 'busy', 'all-clear'] as const;
export type Scenario = (typeof SCENARIOS)[number];

export function screenshotDir(info: TestInfo): string {
  const dir = join(info.project.testDir, '__screenshots__');
  mkdirSync(dir, { recursive: true });
  return dir;
}

export async function openBoard(page: Page, scenario: Scenario | string, extra: string = ''): Promise<void> {
  await page.goto(`/?scenario=${scenario}${extra}`);
  await expect(page.getByTestId('screen-today')).toBeVisible();
  await expect(page.getByTestId('hero')).toBeVisible();
  // Let the font-fit and row-fit measurements settle.
  await page.evaluate(() => (document as Document & { fonts: FontFaceSet }).fonts.ready.then(() => undefined));
  await page.waitForTimeout(150);
}

export async function screenshot(page: Page, info: TestInfo, name: string): Promise<void> {
  await page.screenshot({ path: join(screenshotDir(info), `${name}-${info.project.name}.png`), fullPage: false });
}

/** No horizontal overflow anywhere: the document never scrolls sideways. */
export async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const r = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    cw: document.documentElement.clientWidth,
    bw: document.body.scrollWidth,
  }));
  expect(r.sw, 'documentElement.scrollWidth <= clientWidth').toBeLessThanOrEqual(r.cw);
  expect(r.bw, 'body.scrollWidth <= clientWidth').toBeLessThanOrEqual(r.cw);
}

/** Every visible element with its own text has a computed font-size of at least 24 CSS px. */
export async function expectMinFontSize(page: Page, min: number = 24): Promise<void> {
  const offenders = await page.evaluate((minPx) => {
    const bad: string[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const seen = new Set<Element>();
    let node: Node | null;
    while ((node = walker.nextNode())) {
      if (!node.textContent || node.textContent.trim() === '') continue;
      const el = node.parentElement;
      if (!el || seen.has(el)) continue;
      seen.add(el);
      if (el.closest('[aria-hidden="true"]')) continue;
      if (el.closest('script, style, title')) continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;
      const size = parseFloat(cs.fontSize);
      if (size < minPx) bad.push(`${el.tagName.toLowerCase()}.${el.className} "${node.textContent.trim().slice(0, 30)}" = ${size}px`);
    }
    return bad;
  }, min);
  expect(offenders, 'text below the tier D floor').toEqual([]);
}

/** Every visible <button> is at least 48×48 CSS px. */
export async function expectButtonsTappable(page: Page): Promise<void> {
  const small = await page.evaluate(() => {
    const bad: string[] = [];
    for (const b of Array.from(document.querySelectorAll('button'))) {
      const r = b.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      if (r.width < 48 || r.height < 48) bad.push(`${b.getAttribute('data-testid') ?? b.getAttribute('aria-label') ?? b.textContent?.trim()} ${Math.round(r.width)}×${Math.round(r.height)}`);
    }
    return bad;
  });
  expect(small, 'buttons smaller than 48×48').toEqual([]);
}

/** Open a screen by its tab. On the wall TODAY the nav hides until the answer line is touched (revision G). */
export async function openTab(page: Page, tab: string): Promise<void> {
  const t = page.getByTestId(`tab-${tab}`);
  if ((await t.count()) === 0) await page.getByTestId('answer').click();
  await t.click();
}
