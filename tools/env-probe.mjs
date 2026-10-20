#!/usr/bin/env node
// Boot probe: loads the page and reports, every few seconds, how far boot got
// (readyState, performance marks, console output). For diagnosing a stall in
// the synchronous part of boot (texture generation) under headless Chromium.
// Usage: node tools/env-probe.mjs <url> [seconds]
import { chromium } from 'playwright';

const url = process.argv[2] || 'http://localhost:5188/?qa=1';
const seconds = Number(process.argv[3] || 90);
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--disable-gpu-vsync'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('console', (m) => console.log(`[console.${m.type()}] ${m.text().slice(0, 200)}`));
page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`));
const t0 = Date.now();
await page.goto(url, { waitUntil: 'commit', timeout: 30000 });
console.log(`committed at ${Date.now() - t0} ms`);
for (let i = 0; i < seconds / 3; i++) {
  await page.waitForTimeout(3000);
  try {
    const info = await Promise.race([
      page.evaluate(() => ({
        readyState: document.readyState,
        marks: performance.getEntriesByType('mark').map((m) => `${m.name}@${Math.round(m.startTime)}`),
        ready: !!(window.__table && window.__table.ready),
      })),
      new Promise((_, rej) => setTimeout(() => rej(new Error('evaluate blocked (main thread busy)')), 2500)),
    ]);
    console.log(`${Math.round((Date.now() - t0) / 1000)}s`, JSON.stringify(info));
    if (info.ready) break;
  } catch (e) {
    console.log(`${Math.round((Date.now() - t0) / 1000)}s`, e.message);
  }
}
await browser.close();
