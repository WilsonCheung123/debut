#!/usr/bin/env node
// Close-up renders of the puppet's grips from several angles (headless, software GL).
// Focuses the puppet, then asks the object's ?qa=1 hook to render the scene from
// a camera `dist` metres off each item at the given azimuth/elevation and saves
// the PNGs. Usage: node tools/puppet-closeup.mjs <url> <outdir>
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const [url0, outdir] = process.argv.slice(2);
if (!url0 || !outdir) { console.error('usage: node tools/puppet-closeup.mjs <url> <outdir>'); process.exit(1); }
fs.mkdirSync(outdir, { recursive: true });
const u = new URL(url0);
u.searchParams.set('qa', '1');
const SLOW = Math.max(1, Number(process.env.SHOT_TIMEOUT_SCALE) || 1);

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--disable-gpu-vsync', '--disable-accelerated-2d-canvas'],
});
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
const problems = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') problems.push(`[console.${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`));
await page.goto(u.toString(), { waitUntil: 'domcontentloaded', timeout: 60000 * SLOW });
await page.waitForFunction(() => window.__table && window.__table.ready, null, { timeout: 60000 * SLOW });
await page.evaluate(() => window.__table.focus('puppet'));
await page.waitForFunction(() => window.__table.timeline.some((m) => m.ev === 'focus:settled'), null, { timeout: 60000 * SLOW });

// item, azimuth (deg, + = from the viewer's left), elevation, distance
const views = [
  ['phone', -15, 15, 0.16], ['phone', 55, 10, 0.16], ['phone', -5, 55, 0.16], ['phone', 150, 10, 0.16],
  ['camera', 0, 15, 0.19], ['camera', -60, 10, 0.19], ['camera', 20, 60, 0.19], ['camera', 170, 5, 0.19],
  ['puppet', 24, 38, 0.6],
];
for (const [item, az, el, dist] of views) {
  const data = await page.evaluate(([i, a, e, d]) => window.__puppet.snap(i, a, e, d), [item, az, el, dist]);
  const file = path.join(outdir, `${item}-az${az}-el${el}.png`);
  fs.writeFileSync(file, Buffer.from(data.split(',')[1], 'base64'));
  console.log(`shot: ${file}`);
}
const clearance = await page.evaluate(() => window.__puppet.clearance());
console.log('clearance (m):', JSON.stringify(clearance));
const noise = /GL Driver Message|KHR_parallel_shader_compile/;
for (const p of problems) if (!noise.test(p)) console.log(p);
await browser.close();
