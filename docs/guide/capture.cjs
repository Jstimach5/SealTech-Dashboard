// Drives the real board + service (fixture mode) and saves screenshots with bounding boxes of named test ids.
const { chromium } = require(require('path').resolve(__dirname, '../../node_modules/@playwright/test'));
const fs = require('fs'), path = require('path');
const BASE = process.argv[2], OUT = 'shots';
const NOW = '2026-10-14T13:30:00.000Z';
const exe = (() => { const r = '/opt/pw-browsers'; for (const d of fs.readdirSync(r).filter(d => d.startsWith('chromium-')).sort().reverse()) { const p = path.join(r, d, 'chrome-linux/chrome'); if (fs.existsSync(p)) return p; } })();
const boxes = {};
async function shot(page, name, ids) {
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  const b = {};
  for (const id of ids) {
    const loc = page.locator(id.startsWith('css:') ? id.slice(4) : `[data-testid="${id}"]`).first();
    if (await loc.count()) { const r = await loc.boundingBox(); if (r) b[id] = [r.x, r.y, r.x + r.width, r.y + r.height].map(v => Math.round(v * 2)); }
    else b[id] = null;
  }
  boxes[name] = b;
  console.log(name, Object.entries(b).filter(([, v]) => !v).map(([k]) => 'MISSING ' + k).join(' '));
}
async function pin(page, userId) {
  await page.getByTestId(`pin-tile-${userId}`).click();
  for (const k of '1234') await page.getByTestId(`pin-key-${k}`).click();
  if (await page.getByTestId('pin-key-ok').count()) await page.getByTestId('pin-key-ok').click().catch(() => {});
  await page.waitForTimeout(800);
}
(async () => {
  const br = await chromium.launch({ executablePath: exe });
  const page = await br.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 });
  await page.goto(`${BASE}/?now=${NOW}`); await page.getByTestId('screen-today').waitFor();
  await shot(page, '01_today', ['topbar', 'focus-line', 'clock', 'scoreline', 'scoreline-right', 'attention', 'attention-row-j-test-varga', 'lanes', 'lane-ASHBY', 'card-v-test-nguyen-1', 'ack-v-test-nguyen-1', 'card-v-test-rowe-2', 'card-v-test-ibrahim-1', 'rail', 'not-ready', 'rail-row-j-test-bauer', 'counts', 'counts-unanswered', 'footer', 'fresh-jobber', 'tab-stages', 'tab-cannot-invoice', 'tab-review', 'tab-scorecard', 'done-row']);
  await page.getByTestId('tab-stages').click(); await page.getByTestId('screen-stages').waitFor();
  await shot(page, '02_stages', ['packages-open', 'stage-col-requires_invoicing', 'stage-col-late', 'tab-today']);
  await page.getByTestId('tab-cannot-invoice').click(); await page.getByTestId('screen-cannot-invoice').waitFor();
  await shot(page, '03_cannot', ['cannot-row-j-test-bauer', 'cannot-row-j-test-price', 'cannot-row-j-test-osei', 'owner-j-test-bauer', 'cannot-owner-j-test-bauer', 'cannot-page', 'cannot-next', 'cannot-hero']);
  await page.getByTestId('owner-j-test-bauer').click(); await page.getByTestId('screen-owner-pin').waitFor();
  await shot(page, '04_owner_pin', ['pin-tile-u-test-office', 'pin-pad', 'pin-key-1', 'pin-cancel']);
  await pin(page, 'u-test-office'); await page.getByTestId('owner-picker').waitFor();
  await shot(page, '05_owner_pick', ['owner-picker', 'owner-pick-KA', 'owner-cancel']);
  await page.getByTestId('owner-pick-KA').click(); await page.waitForTimeout(1500);
  await shot(page, '06_owner_saved', ['owner-note-j-test-bauer', 'cannot-owner-j-test-bauer', 'cannot-row-j-test-bauer']);
  await page.getByTestId('tab-today').click(); await page.getByTestId('screen-today').waitFor();
  await page.getByTestId('ack-v-test-nguyen-1').click(); await page.waitForTimeout(500);
  await shot(page, '07_ack_pin', ['pin-tile-u-test-office', 'pin-pad', 'css:main']);
  await pin(page, 'u-test-office'); await page.waitForTimeout(16000); // one fixture poll tick
  await page.getByTestId('screen-today').waitFor();
  await shot(page, '08_today_acked', ['card-v-test-nguyen-1', 'ack-note-v-test-nguyen-1', 'lane-ASHBY', 'queued']);
  await page.getByTestId('tab-review').click(); await page.waitForTimeout(500);
  await shot(page, '09_review_pin', ['pin-tile-u-test-ashby', 'pin-tile-u-test-owner', 'pin-pad', 'pin-key-ok']);
  await pin(page, 'u-test-ashby'); await page.getByTestId('review-queue').waitFor();
  await shot(page, '10_review', ['review-queue', 'review-job-j-test-carter', 'review-detail-j-test-carter', 'companycam', 'verdict-checker', 'verdict-human', 'verdict-ready', 'verdict-fix', 'verdict-hold', 'cutoffs', 'unmatched', 'lock']);
  await page.getByTestId('verdict-fix').click(); await page.getByTestId('fix-picklist').waitFor();
  await shot(page, '11_fix_pick', ['fix-picklist', 'css:[data-testid="fix-pick"] >> nth=1']);
  await page.locator('[data-testid="fix-pick"]').nth(1).click(); await page.waitForTimeout(1500);
  await shot(page, '12_fix_saved', ['review-status', 'review-queue']);
  await page.getByTestId('lock').click(); await page.waitForTimeout(400);
  await pin(page, 'u-test-owner'); await page.getByTestId('tools').waitFor();
  await page.getByTestId('tool-focus').click(); await page.waitForTimeout(400);
  await shot(page, '13_tools_focus', ['tools', 'tool-focus', 'tool-responder', 'tool-flag', 'focus-form']);
  await page.getByTestId('tool-flag').click(); await page.waitForTimeout(400);
  await shot(page, '14_tools_flag', ['tools', 'tool-flag', 'flag-form']);
  await page.getByTestId('tab-scorecard').click(); await page.waitForTimeout(400);
  if (await page.getByTestId('pin-pad').count()) await pin(page, 'u-test-owner');
  await page.getByTestId('screen-scorecard').waitFor();
  await shot(page, '15_scorecard', ['screen-scorecard', 'scorecard-crews']);
  fs.writeFileSync(`${OUT}/boxes.json`, JSON.stringify(boxes, null, 1));
  await br.close();
})().catch(e => { console.error(e); process.exit(1); });
