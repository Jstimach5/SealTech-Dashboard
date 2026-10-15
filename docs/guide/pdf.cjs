const { chromium } = require(require('path').resolve(__dirname, '../../node_modules/@playwright/test'));
const fs = require('fs'), path = require('path');
const exe = (() => { const r = '/opt/pw-browsers'; for (const d of fs.readdirSync(r).filter(d => d.startsWith('chromium-')).sort().reverse()) { const p = path.join(r, d, 'chrome-linux/chrome'); if (fs.existsSync(p)) return p; } })();
(async () => {
  const [html, pdf] = process.argv.slice(2);
  const b = await chromium.launch({ executablePath: exe });
  const pg = await b.newPage({ viewport: { width: 1056, height: 816 } });
  await pg.setContent(fs.readFileSync(html, 'utf8'), { waitUntil: 'load' });
  const over = await pg.evaluate(() => [...document.querySelectorAll('.pg')].map((p, i) => {
    let maxB = 0; const top = p.getBoundingClientRect().top;
    for (const c of p.children) { if (c.classList.contains('foot')) continue; maxB = Math.max(maxB, c.getBoundingClientRect().bottom - top); }
    return [i + 1, Math.round(maxB), Math.round(p.getBoundingClientRect().height)]; }));
  await pg.pdf({ path: pdf, width: '11in', height: '8.5in', printBackground: true, preferCSSPageSize: true, margin: { top: '0', bottom: '0', left: '0', right: '0' } });
  await b.close();
  process.stdout.write(JSON.stringify(over));
})().catch(e => { console.error(e); process.exit(1); });
