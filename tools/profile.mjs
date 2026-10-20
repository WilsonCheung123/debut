#!/usr/bin/env node
// Headed-Chromium profile on the real GPU (SPEC 0.2): opens the page in a visible
// window at a given viewport and device pixel ratio, lets the tier logic run
// unlocked (no ?qa=1), and reports __table.info() plus frame-time statistics at
// rest, during a focus move, in focus, and after the exit. Also saves screenshots
// at the real DPR for a visual check of what the owner sees.
//
//   node tools/profile.mjs http://localhost:5181/ shots/profile [--viewport 1440x900] [--dpr 2] [--focus id-card] [--tier high] [--shots]
//
// Keep the window brief (it is the owner's screen): the whole run is ~8 s.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const url0 = args[0] || 'http://localhost:5181/';
const outdir = args[1] || 'shots/profile';
const opt = (f, d = null) => (args.includes(f) ? args[args.indexOf(f) + 1] : d);
const [vw, vh] = (opt('--viewport', '1440x900')).split('x').map(Number);
const dpr = Number(opt('--dpr', '2'));
const focusId = opt('--focus', 'id-card');
const tier = opt('--tier', null);
const takeShots = args.includes('--shots');
const u = new URL(url0);
if (tier) u.searchParams.set('tier', tier);
fs.mkdirSync(outdir, { recursive: true });

const browser = await chromium.launch({ headless: false, args: ['--ignore-gpu-blocklist', '--enable-gpu-rasterization'] });
const context = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: dpr, serviceWorkers: 'block' });
const page = await context.newPage();
const problems = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') problems.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`));

const stats = (arr) => {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const mean = s.reduce((a, b) => a + b, 0) / s.length;
  const p = (q) => s[Math.min(s.length - 1, Math.floor(q * s.length))];
  return { n: s.length, mean: +mean.toFixed(1), p50: +p(0.5).toFixed(1), p95: +p(0.95).toFixed(1), max: +s[s.length - 1].toFixed(1), over50: s.filter((x) => x > 50).length };
};
const report = {};
const sampleFrames = async (label, ms) => {
  const frames = await page.evaluate(async (ms) => {
    const out = [];
    let last = performance.now();
    await new Promise((res) => {
      const t0 = performance.now();
      const tick = (now) => { out.push(now - last); last = now; if (now - t0 < ms) requestAnimationFrame(tick); else res(); };
      requestAnimationFrame(tick);
    });
    return out.slice(1);
  }, ms);
  const info = await page.evaluate(() => { const i = window.__table.info(); return { dpr: i.dpr, tier: i.tier, mode: i.mode, drawCalls: i.drawCalls, triangles: i.triangles, lastMove: i.lastMove, quality: i.quality }; });
  report[label] = { ...stats(frames), ...info };
  console.log(label, JSON.stringify(report[label]));
};

try {
  const t0 = Date.now();
  await page.goto(u.toString(), { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__table && window.__table.ready, null, { timeout: 150000 });
  report.readyMs = Date.now() - t0;
  console.log('ready in', report.readyMs, 'ms; devicePixelRatio', await page.evaluate(() => devicePixelRatio), 'gl', await page.evaluate(() => { const c = document.createElement('canvas'); const gl = c.getContext('webgl2'); const d = gl.getExtension('WEBGL_debug_renderer_info'); return d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : 'n/a'; }));
  await page.waitForTimeout(1500); // past the 90-frame warm-up skip
  await sampleFrames('rest', 2000);
  if (takeShots) await page.screenshot({ path: path.join(outdir, `rest-${vw}x${vh}@${dpr}.png`) });
  // hover
  const r = await page.evaluate((id) => window.__table.rect(id, 0), focusId);
  await page.mouse.move(r.x + r.w / 2, r.y + r.h / 2, { steps: 8 });
  await sampleFrames('hover', 800);
  // focus move: sample during the 900 ms move
  const moveP = sampleFrames('focus-move', 900);
  await page.evaluate((id) => { window.__table.focus(id); }, focusId);
  await moveP;
  await page.waitForFunction(() => window.__table.info().mode === 'focus', null, { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(700);
  await sampleFrames('focused', 1500);
  if (takeShots) await page.screenshot({ path: path.join(outdir, `focus-${focusId}-${vw}x${vh}@${dpr}.png`) });
  const exitP = sampleFrames('exit-move', 800);
  await page.keyboard.press('Escape');
  await exitP;
  await page.waitForTimeout(600);
  await sampleFrames('rest-after', 1500);
  report.problems = problems;
  fs.writeFileSync(path.join(outdir, `profile-${vw}x${vh}@${dpr}${tier ? '-' + tier : ''}.json`), JSON.stringify(report, null, 2));
  if (problems.length) console.log('problems:', problems.join('\n'));
} finally {
  await browser.close();
}
