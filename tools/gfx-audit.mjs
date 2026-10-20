#!/usr/bin/env node
// The graphics audit on the real GPU (SPEC 0.2), in one shot-lock hold and one
// visible window at a time, each closed as soon as its pass is done:
//   1. 1440x900 @ DPR 2, quality ladder unlocked: frame times at rest / hover / focus
//      move / focused / exit, __table.info() (tier, DPR, draw calls), plus a
//      screenshot of every focus state
//   2. 1440x900 @ DPR 1.5, locked: rest + a book focus (anti-aliasing at 1.5)
//   3. 1920x1080 @ DPR 2, locked: rest + four focus states
//   4. 1440x900 @ DPR 2, ?probe=1: the exposure probe (the ID image and cream paper in the pool)
// Usage: node tools/gfx-audit.mjs http://localhost:5181/ shots/audit [--quick]
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const url0 = process.argv[2] || 'http://localhost:5181/';
const outdir = process.argv[3] || 'shots/audit';
const quick = process.argv.includes('--quick');
fs.mkdirSync(outdir, { recursive: true });
const ALL = ['id-card', 'die-cast', 'puppet', 'guitar', 'vinyl', 'fpga', 'jar', 'hologram', 'book.inferno', 'book.thinking-fast-slow'];

const stats = (arr) => {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const mean = s.reduce((a, b) => a + b, 0) / s.length;
  const p = (q) => s[Math.min(s.length - 1, Math.floor(q * s.length))];
  return { n: s.length, mean: +mean.toFixed(1), p50: +p(0.5).toFixed(1), p95: +p(0.95).toFixed(1), max: +s[s.length - 1].toFixed(1), over50: s.filter((x) => x > 50).length };
};

async function pass({ name, vw, vh, dpr, query = '', profile = false, focus = [], shots = true }) {
  const browser = await chromium.launch({ headless: false, args: ['--ignore-gpu-blocklist'] });
  const report = { name, vw, vh, dpr, problems: [] };
  try {
    const context = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: dpr, serviceWorkers: 'block' });
    const page = await context.newPage();
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') report.problems.push(`[${m.type()}] ${m.text()}`); });
    page.on('pageerror', (e) => report.problems.push(`[pageerror] ${e.message}`));
    const u = new URL(url0);
    for (const [k, v] of new URLSearchParams(query)) u.searchParams.set(k, v);
    const t0 = Date.now();
    await page.goto(u.toString(), { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__table && window.__table.ready, null, { timeout: 180000 });
    report.readyMs = Date.now() - t0;
    report.gl = await page.evaluate(() => { const c = document.createElement('canvas'); const gl = c.getContext('webgl2'); const d = gl.getExtension('WEBGL_debug_renderer_info'); return d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : 'n/a'; });
    const info = () => page.evaluate(() => { const i = window.__table.info(); return { dpr: i.dpr, tier: i.tier, gfx: i.gfx, drawCalls: i.drawCalls, triangles: i.triangles, frames: i.frames, lastMove: i.lastMove }; });
    const sample = async (label, ms) => {
      const frames = await page.evaluate(async (ms) => {
        const out = []; let last = performance.now();
        await new Promise((res) => { const t0 = performance.now(); const tick = (now) => { out.push(now - last); last = now; if (now - t0 < ms) requestAnimationFrame(tick); else res(); }; requestAnimationFrame(tick); });
        return out.slice(1);
      }, ms);
      report[label] = { ...stats(frames), ...(await info()) };
      console.log(name, label, JSON.stringify(report[label]));
    };
    const shot = (file) => shots && page.screenshot({ path: path.join(outdir, `${name}-${file}.png`) });
    const focusOn = async (id) => {
      await page.evaluate((id) => { window.__table.focus(id); }, id);
      await page.waitForFunction(() => window.__table.info().mode === 'focus', null, { timeout: 10000 }).catch(() => {});
    };
    const exit = async () => {
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => window.__table.info().mode === 'rest', null, { timeout: 10000 }).catch(() => {});
    };
    if (profile) {
      await page.waitForTimeout(2000); // past the 90-frame settle
      await sample('rest', 2500);
      await shot('rest');
      const r = await page.evaluate(() => window.__table.rect('id-card', 0));
      await page.mouse.move(r.x + r.w / 2, r.y + r.h / 2, { steps: 8 });
      await sample('hover', 800);
      const mv = sample('focus-move', 900);
      await page.evaluate(() => { window.__table.focus('id-card'); });
      await mv;
      await page.waitForFunction(() => window.__table.info().mode === 'focus', null, { timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(800);
      await sample('focused', 1500);
      await shot('focus-id-card');
      const ex = sample('exit-move', 800);
      await page.keyboard.press('Escape');
      await ex;
      await page.waitForFunction(() => window.__table.info().mode === 'rest', null, { timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(500);
      // the jar: transmission is the costliest state
      await focusOn('jar');
      await page.waitForTimeout(800);
      await sample('focused-jar', 1500);
      await shot('focus-jar');
      await exit();
      await sample('rest-after', 2000);
      report.final = await info();
    } else {
      await page.waitForTimeout(600);
      await shot('rest');
      report.final = await info();
    }
    for (const id of focus) {
      if (profile && (id === 'id-card' || id === 'jar')) continue;
      await focusOn(id);
      await page.waitForTimeout(900);
      await shot(`focus-${id}`);
      await exit();
      await page.waitForTimeout(250);
    }
  } finally {
    await browser.close();
  }
  if (report.problems.length) console.log(name, 'problems:', report.problems.join('\n'));
  return report;
}

const reports = [];
reports.push(await pass({ name: '1440@2', vw: 1440, vh: 900, dpr: 2, profile: true, focus: quick ? ['die-cast', 'puppet'] : ALL }));
reports.push(await pass({ name: '1440@1.5', vw: 1440, vh: 900, dpr: 1.5, query: 'tier=high', focus: ['book.inferno', 'vinyl'] }));
if (!quick) reports.push(await pass({ name: '1920@2', vw: 1920, vh: 1080, dpr: 2, query: 'tier=high', focus: ['id-card', 'puppet', 'die-cast', 'vinyl'] }));
reports.push(await pass({ name: 'probe', vw: 1440, vh: 900, dpr: 2, query: 'tier=high&probe=1', focus: [] }));
fs.writeFileSync(path.join(outdir, 'audit.json'), JSON.stringify(reports, null, 2));
console.log('wrote', path.join(outdir, 'audit.json'));
