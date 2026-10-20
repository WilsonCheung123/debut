// Boot diagnostic in a headed Chromium: prints console output, performance marks and visibility every 2.5 s until ready.
import { chromium } from 'playwright';
const url = process.argv[2] || 'http://localhost:5181/';
const browser = await chromium.launch({ headless: false, args: ['--ignore-gpu-blocklist'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const page = await context.newPage();
page.on('console', (m) => console.log('[console.' + m.type() + ']', m.text().slice(0, 200)));
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
const t0 = Date.now();
await page.goto(url, { waitUntil: 'domcontentloaded' });
for (let i = 0; i < 8; i++) {
  await page.waitForTimeout(2500);
  const s = await page.evaluate(() => ({ hidden: document.hidden, vis: document.visibilityState, marks: performance.getEntriesByType('mark').map((m) => m.name + '@' + Math.round(m.startTime)), ready: !!(window.__table && window.__table.ready), info: window.__table ? window.__table.info() : null, dpr: devicePixelRatio }));
  console.log(Date.now() - t0, JSON.stringify(s).slice(0, 400));
  if (s.ready) break;
}
await browser.close();
