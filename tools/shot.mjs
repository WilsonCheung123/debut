#!/usr/bin/env node
// Screenshots + scripted visits for Wilson's table, adapted from
// ~/apps/tools/screenshot.mjs. Drives the real pointer (mouse on desktop,
// taps on phones) against the page's __table test hooks, records console
// errors/warnings, page errors and failed requests to <name>-problems.txt.
//
// Usage:
//   node tools/shot.mjs <url> <outdir> [--viewport desktop|iphone|pixel] [--hover <id>] [--focus <id>]
//                       [--scenario file.json] [--name base] [--reduced-motion] [--clock]
//
// Scenario: JSON array of steps, in order:
//   {"action":"wait","ready":true}               wait until the lamp has warmed up
//   {"action":"wait","ms":500} | {"action":"wait","selector":"#panel:not([hidden])"}
//   {"action":"hover","id":"book.inferno"}        move the mouse onto the object (no-op on touch)
//   {"action":"focus","id":"id-card","frames":0}  click/tap it, wait for focus:settled; frames>0 grabs a burst mid-move
//   {"action":"focus","id":"book.demi-gods","cluster":true}  on touch, a member hidden behind a sibling is focused via the hook (noted)
//   {"action":"exit"}                             Escape, wait for exit:settled
//   {"action":"click","selector":"..."} | {"action":"tap","selector":"..."} | {"action":"fill","selector":"...","text":"..."}
//   {"action":"press","key":"Tab"}
//   {"action":"shot","name":"rest"}
//   {"action":"eval","js":"..."}
//   {"action":"assert","name":"...","js":"expression"}
//   {"action":"audit","name":"sizes","minWidth":60,"clusterPrefixes":["book."]}
//        projected widths ≥ minWidth on desktop; on touch, a 44 px target whose centre resolves to the object
//        (cluster members are reported as notes: thin books cannot have exclusive 44 px targets)
//   {"action":"timing","name":"focus"}                checks the last focus marks against SPEC 3
//   {"action":"click-object","id":"id-card"}           click without waiting (pair with clock steps)
//   {"action":"clock","pause":true} / {"action":"clock","runFor":450}   needs --clock (fake timers)
//   {"action":"mock","url":"glob","file":"fixture.json","status":200}
//   {"action":"http","name":"…","method":"POST","url":"/api/note","body":{…},"expectStatus":400}   a request from node
// A final screenshot <name>.png is always taken.

import { chromium, devices } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const url0 = args[0];
const outdir = args[1];
if (!url0 || !outdir || url0.startsWith('--')) {
  console.error('usage: node tools/shot.mjs <url> <outdir> [--viewport desktop|iphone|pixel] [--hover id] [--focus id] [--scenario file.json] [--name base]');
  process.exit(1);
}
const opt = (flag, dflt = null) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : dflt);
const viewportName = opt('--viewport', 'desktop');
const hoverId = opt('--hover');
const focusId = opt('--focus');
const scenarioPath = opt('--scenario');
const baseName = opt('--name', viewportName);
const reduced = args.includes('--reduced-motion');
// SHOT_TIMEOUT_SCALE=4 on a loaded machine: scales the page-load, ready and default timeouts (software GL plus other work).
const SLOW = Math.max(1, Number(process.env.SHOT_TIMEOUT_SCALE) || 1);
const u = new URL(url0);
if (reduced) u.searchParams.set('motion', 'reduce');
u.searchParams.set('qa', '1'); // headless GPUs are slow: lock the tier, wall-clock tweens (keeps any #hash)
const url = u.toString();

fs.mkdirSync(outdir, { recursive: true });

const VIEWPORTS = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
  hd: { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
  iphone: { ...devices['iPhone 13'], deviceScaleFactor: 2 },
  pixel: { ...devices['Pixel 7'], deviceScaleFactor: 2 },
};
const device = VIEWPORTS[viewportName];
if (!device) { console.error(`unknown viewport ${viewportName}`); process.exit(1); }
const touch = !!device.hasTouch;

const browser = await chromium.launch({
  // --disable-accelerated-2d-canvas: with --ignore-gpu-blocklist Chromium "accelerates" canvas 2D through SwiftShader,
  // and the procedural textures (hundreds of stroked polylines) then take minutes instead of milliseconds
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--disable-gpu-vsync', '--disable-accelerated-2d-canvas'],
});
const context = await browser.newContext({
  ...device,
  reducedMotion: reduced ? 'reduce' : 'no-preference',
  serviceWorkers: 'block',
});
const page = await context.newPage();
// SHOT_TIMEOUT_SCALE=4 stretches every wait (a loaded machine with several
// software-GL browsers boots the page in minutes, not seconds).
page.setDefaultTimeout(20000 * SLOW);
// --clock installs Playwright's fake clock before the page loads, so a scenario
// can step virtual time (clock runFor) and read choreography marks exactly.
const useClock = args.includes('--clock');
if (useClock) await page.clock.install();
const cdp = useClock ? await context.newCDPSession(page) : null;

const problems = [];
const note = (s) => { problems.push(s); console.log(`  ! ${s}`); };
// SwiftShader-only noise (not present on real GPUs): recorded, not counted.
const ENV_NOISE = /KHR_parallel_shader_compile|GL Driver Message/;
// Third-party noise: Chromium warns about the Spotify embed's own iframe markup (allow="…fullscreen" plus
// allowfullscreen); it is Spotify's element, not ours. Recorded as [3p.warn], not counted.
const THIRD_PARTY_NOISE = /Allow attribute will take precedence over 'allowfullscreen'/;
page.on('console', (msg) => {
  const type = msg.type();
  const text = msg.text();
  if (type === 'error') note(`[console.error] ${text}`);
  else if (type === 'warning') note(ENV_NOISE.test(text) ? `[env.warn] ${text}` : THIRD_PARTY_NOISE.test(text) ? `[3p.warn] ${text}` : `[console.warn] ${text}`);
});
page.on('pageerror', (err) => note(`[pageerror] ${err.message}`));
page.on('requestfailed', (req) => {
  const f = req.failure();
  if (f && f.errorText !== 'net::ERR_ABORTED') note(`[requestfailed] ${req.url()} — ${f.errorText}`);
});
page.on('response', (res) => { if (res.status() >= 400) note(`[http ${res.status()}] ${res.url()}`); });

const sleep = (ms) => page.waitForTimeout(ms);
const T = () => page.evaluate(() => window.__table);

async function waitReady(timeout = 30000) {
  await page.waitForFunction(() => window.__table && window.__table.ready, null, { timeout: timeout * SLOW });
}
async function centre(id, minPx = 0) {
  const r = await page.evaluate(([id, m]) => window.__table.rect(id, m), [id, minPx]);
  if (!r) throw new Error(`no rect for ${id}`);
  return { x: r.x + r.w / 2, y: r.y + r.h / 2, r };
}
/** A point inside the object's projected rect that actually resolves to it (what a person aims at): nearest to the centre. */
async function aimPoint(id, minPx = 0) {
  return page.evaluate(([id, m]) => {
    const t = window.__table;
    const r = t.rect(id, m);
    if (!r) return null;
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    const pts = [];
    const n = 9;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const x = r.x + (i + 0.5) / n * r.w, y = r.y + (j + 0.5) / n * r.h;
      pts.push({ x, y, d: Math.hypot(x - cx, y - cy) });
    }
    pts.sort((a, b) => a.d - b.d);
    for (const p of pts) if (t.pickAt(p.x, p.y) === id) return { x: p.x, y: p.y, r, resolves: id };
    return { x: cx, y: cy, r, resolves: t.pickAt(cx, cy) };
  }, [id, minPx]);
}
async function marksSince(t0) {
  return page.evaluate((t0) => window.__table.timeline.filter((m) => m.t >= t0), t0);
}
async function waitMark(ev, id, t0, timeout = 8000 * SLOW) {
  await page.waitForFunction(([ev, id, t0]) => window.__table.timeline.some((m) => m.ev === ev && m.t >= t0 && (!id || m.id === id)), [ev, id, t0], { timeout });
}
const now = () => page.evaluate(() => performance.now());
/** Waits until the engine is idle (not busy) and `n` more frames have rendered, so projected rects are current. */
async function settle(n = 2, timeout = 15000 * SLOW) {
  await page.waitForFunction(() => !window.__table.info().busy, null, { timeout }).catch(() => {});
  const f = await page.evaluate(() => window.__table.info().frame);
  await page.waitForFunction(([f, n]) => window.__table.info().frame >= f + n, [f, n], { timeout }).catch(() => {});
}

async function shot(name) {
  await sleep(120);
  const file = path.join(outdir, `${name}.png`);
  if (useClock) {
    // page.screenshot waits on animation frames that a paused fake clock never delivers: capture via CDP
    let done = false;
    const p = cdp.send('Page.captureScreenshot', { format: 'png' }).then((r) => { fs.writeFileSync(file, Buffer.from(r.data, 'base64')); }).finally(() => { done = true; });
    const t0 = Date.now();
    while (!done && Date.now() - t0 < 30000) await page.clock.runFor(4);
    await p;
  } else {
    await page.screenshot({ path: file });
  }
  console.log(`shot: ${file}`);
  await auditDom(name);
}

const auditSeen = new Set();
async function auditDom(label) {
  try {
    const out = await page.evaluate(() => {
      const res = [];
      const els = document.querySelectorAll('#ui button, #ui a, #ui input, #ui [role="button"]');
      for (const el of els) {
        if (el.closest('.sr-only')) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (r.bottom < 0 || r.top > innerHeight) continue;
        const cs = getComputedStyle(el);
        if (cs.visibility === 'hidden' || +cs.opacity === 0) continue;
        if (r.width < 43.5 || r.height < 43.5) {
          const nm = (el.getAttribute('aria-label') || el.id || el.textContent || el.className).toString().trim().slice(0, 40);
          res.push(`[audit:tap-target] ${Math.round(r.width)}x${Math.round(r.height)} — ${el.tagName.toLowerCase()} "${nm}"`);
        }
      }
      return res;
    });
    for (const line of out) {
      if (auditSeen.has(line)) continue;
      auditSeen.add(line);
      note(`${line} (at shot:${label})`);
    }
  } catch { /* best effort */ }
}

async function doHover(id) {
  if (touch) return; // nothing on touch
  await settle();
  const aim = await aimPoint(id);
  if (!aim) throw new Error(`no rect for ${id}`);
  if (aim.resolves !== id) note(`[hover:${id}] no point of its projected rect resolves to it (centre resolves to ${aim.resolves})`);
  const { x, y } = aim;
  await page.mouse.move(x, y, { steps: 6 });
  // wait for the spring + label to land (several frames; headless frames are slow)
  await page.waitForFunction((id) => {
    const t = window.__table;
    const op = +getComputedStyle(document.getElementById('label')).opacity;
    return t.state.hovered === id && op >= 0.99 && (t.state.reducedMotion || t.liftOf(id) >= 0.95);
  }, id, { timeout: 8000 * SLOW }).catch(() => {});
  const info = await page.evaluate((id) => {
    const t = window.__table;
    const label = document.getElementById('label');
    const lr = label.getBoundingClientRect();
    return { hovered: t.state.hovered, lift: t.liftOf(id), labelOpacity: +getComputedStyle(label).opacity, labelText: label.textContent, lr: { x: lr.x, y: lr.y, w: lr.width, h: lr.height }, obj: t.visibleRect(id), vw: innerWidth, vh: innerHeight };
  }, id);
  if (info.hovered !== id) note(`[hover:${id}] hovered=${info.hovered} (pointer at ${Math.round(x)},${Math.round(y)})`);
  if (info.labelOpacity < 0.95) note(`[hover:${id}] label opacity ${info.labelOpacity}`);
  if (info.obj && info.lr.w > 0) {
    const a = info.lr, b = info.obj;
    const overlap = a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
    if (overlap) note(`[audit:label-overlap] "${info.labelText}" overlaps its object`);
    if (a.x < 0 || a.y < 0 || a.x + a.w > info.vw || a.y + a.h > info.vh) note(`[audit:label-offscreen] "${info.labelText}"`);
  }
  const reducedMotion = await page.evaluate(() => window.__table.state.reducedMotion);
  if (!reducedMotion && info.lift < 0.9) note(`[hover:${id}] lift ${info.lift.toFixed(2)} did not land`);
}

async function doFocus(id, frames = 0, name = id, cluster = false) {
  await settle(); // rects must come from a rendered frame at rest, not a stale camera
  const aim = await aimPoint(id, touch ? 44 : 0);
  if (!aim) throw new Error(`no rect for ${id}`);
  const { x, y, resolves } = aim;
  const t0 = await now();
  if (resolves !== id && touch && cluster) {
    // a cluster member hidden behind a sibling on a phone (lower books of a stack): record it, focus via the hook
    note(`[note:tap] ${id}: on this viewport its centre tap resolves to ${resolves}; focused via hook to exercise its panel`);
    await page.evaluate((id) => { window.__table.focus(id); }, id);
  } else {
    if (resolves !== id) note(`[focus:${id}] no point of its projected rect resolves to it (centre resolves to ${resolves})`);
    if (touch) await page.touchscreen.tap(x, y); else await page.mouse.click(x, y);
  }
  if (frames > 0) {
    for (let i = 0; i < frames; i++) {
      await page.screenshot({ path: path.join(outdir, `${baseName}-${name}-f${i}.png`) });
    }
  }
  try { await waitMark('focus:settled', id, t0); }
  catch { note(`[focus:${id}] never settled (focused=${await page.evaluate(() => window.__table.state.focused)})`); return; }
  await page.waitForFunction(() => { const p = document.getElementById('panel'); return p && !p.hidden; }, null, { timeout: 4000 * SLOW }).catch(() => note(`[focus:${id}] panel did not open`));
  await sleep(500); // panel entrance (420 ms) settles
  lastFocusT0 = t0;
}
let lastFocusT0 = 0;

async function doExit() {
  await settle(1);
  const t0 = await now();
  await page.keyboard.press('Escape');
  try { await waitMark('exit:settled', null, t0); }
  catch { note(`[exit] never settled (focused=${await page.evaluate(() => window.__table.state.focused)})`); }
  await sleep(200);
}

async function doTiming(name) {
  const marks = await marksSince(lastFocusT0);
  const start = marks.find((m) => m.ev === 'focus:start');
  const panel = marks.find((m) => m.ev === 'panel:open');
  const settled = marks.find((m) => m.ev === 'focus:settled');
  const reducedMotion = await page.evaluate(() => window.__table.state.reducedMotion);
  if (!start || !panel || !settled) { note(`[timing:${name}] missing marks ${JSON.stringify(marks)}`); return; }
  const dPanel = panel.t - start.t, dCam = settled.t - start.t;
  const [ePanel, eCam] = reducedMotion ? [200, 200] : [450, 900];
  const tol = useClock ? 40 : (reducedMotion ? 120 : 90);
  const line = `panel at +${Math.round(dPanel)} ms (spec ${ePanel}), camera settled at +${Math.round(dCam)} ms (spec ${eCam})`;
  if (Math.abs(dPanel - ePanel) > tol || Math.abs(dCam - eCam) > tol) note(`[timing:${name}] ${line}`);
  else console.log(`timing ${name}: ${line}`);
}

async function doAudit(name, minWidth, clusterPrefixes = []) {
  const res = await page.evaluate(([minWidth, touch, clusterPrefixes]) => {
    const t = window.__table;
    const out = [];
    for (const id of t.ids) {
      const raw = t.rect(id, 0);
      if (!raw) { out.push(`[audit:${id}] no projected rect`); continue; }
      if (!touch && raw.w < minWidth - 0.5) out.push(`[audit:size] ${id} is ${Math.round(raw.w)} px wide (< ${minWidth})`);
      if (touch) {
        const r = t.rect(id, 44);
        const centreHit = t.pickAt(r.x + r.w / 2, r.y + r.h / 2);
        const inCluster = clusterPrefixes.some((p) => id.startsWith(p));
        if (centreHit !== id) out.push(`[${inCluster ? 'note' : 'audit'}:tap] ${id}: a tap at its centre resolves to ${centreHit}${inCluster ? ' (cluster member: see docs/QA.md on touch targets in clusters)' : ''}`);
        if (r.w < 44 || r.h < 44) out.push(`[audit:tap] ${id}: target ${Math.round(r.w)}x${Math.round(r.h)} < 44`);
        if (r.x < 0 || r.y < 0 || r.x + r.w > innerWidth || r.y + r.h > innerHeight) out.push(`[audit:tap] ${id}: target leaves the viewport`);
        // informational: how much of the 44 px square is exclusive (neighbours' real meshes win a raycast)
        const corners = [[r.x + 1, r.y + 1], [r.x + r.w - 1, r.y + 1], [r.x + 1, r.y + r.h - 1], [r.x + r.w - 1, r.y + r.h - 1]];
        const miss = corners.filter(([x, y]) => t.pickAt(x, y) !== id);
        if (miss.length) out.push(`[note:tap] ${id}: raw ${Math.round(raw.w)}x${Math.round(raw.h)} px; ${miss.length}/4 corners of its 44 px square belong to a neighbour`);
      }
    }
    return out;
  }, [minWidth, touch, clusterPrefixes]);
  for (const line of res) note(`${line} (audit:${name})`);
  if (!res.some((l) => l.startsWith('[audit'))) console.log(`audit ${name}: ok`);
}

try {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 * SLOW });
  await waitReady();
  await sleep(300);

  const steps = scenarioPath ? JSON.parse(fs.readFileSync(scenarioPath, 'utf8')) : [];
  if (hoverId) steps.push({ action: 'hover', id: hoverId });
  if (focusId) steps.push({ action: 'focus', id: focusId });

  for (const s of steps) {
    try {
      switch (s.action) {
        case 'wait':
          if (s.ready) await waitReady();
          else if (s.selector) await page.locator(s.selector).first().waitFor({ timeout: s.timeout || 15000 });
          else await sleep(s.ms || 500);
          break;
        case 'hover': await doHover(s.id); break;
        case 'click-object': { // click/tap without waiting (for clock-driven timing runs)
          const { x, y } = await aimPoint(s.id, touch ? 44 : 0);
          lastFocusT0 = await now();
          if (touch) await page.touchscreen.tap(x, y); else await page.mouse.click(x, y);
          break;
        }
        case 'clock': // {"action":"clock","pause":true} | {"action":"clock","runFor":450}
          if (s.pause) await page.clock.pauseAt(await page.evaluate(() => Date.now()) + 1);
          if (s.runFor) await page.clock.runFor(s.runFor);
          if (s.resume) await page.clock.resume();
          break;
        case 'focus': await doFocus(s.id, s.frames || 0, s.name || s.id, !!s.cluster); break;
        case 'exit': await doExit(); break;
        case 'click': await page.locator(s.selector).first().click({ timeout: 8000 * SLOW }); break;
        case 'tap': if (touch) await page.locator(s.selector).first().tap({ timeout: 8000 * SLOW }); else await page.locator(s.selector).first().click({ timeout: 8000 * SLOW }); break;
        case 'fill': await page.locator(s.selector).first().fill(s.text, { timeout: 8000 * SLOW }); break;
        case 'press': await page.keyboard.press(s.key); break;
        case 'shot': await shot(`${baseName}-${s.name}`); break;
        case 'eval': await page.evaluate(s.js); break;
        case 'http': { // a request from node (not the page): {"action":"http","name":"…","method":"POST","url":"/api/note","body":{…},"expectStatus":400}
          const target = new URL(s.url, url).toString();
          const res = await fetch(target, { method: s.method || 'GET', headers: { 'content-type': 'application/json' }, body: s.body ? JSON.stringify(s.body) : undefined });
          const ok = s.expectStatus ? res.status === s.expectStatus : res.ok;
          if (!ok) note(`[assert:${s.name || 'http'} FAILED] ${s.method || 'GET'} ${s.url} → ${res.status}`);
          else console.log(`http: ${s.name || s.url} ${res.status} PASS`);
          break;
        }
        case 'log': console.log(`log ${s.name || ''}:`, JSON.stringify(await page.evaluate(s.js))); break;
        case 'assert': {
          let ok = false, err = '';
          try { ok = !!(await page.evaluate(s.js)); } catch (e) { err = e.message.split('\n')[0]; }
          if (!ok) note(`[assert:${s.name || 'unnamed'} FAILED] ${err || 'expression was falsy'}`);
          else console.log(`assert: ${s.name || 'unnamed'} PASS`);
          break;
        }
        case 'audit': await doAudit(s.name || 'sizes', s.minWidth ?? 60, s.clusterPrefixes || []); break;
        case 'timing': await doTiming(s.name || 'focus'); break;
        case 'mock':
          // {"action":"mock","url":"glob","abort":true} blocks matching requests (as a blocked network would);
          // the abort reads as net::ERR_ABORTED, which is not counted as a failed request
          if (s.abort) { await context.route(s.url, (route) => route.abort('aborted')); break; }
          await context.route(s.url, (route) => route.fulfill({
            status: s.status || 200, contentType: s.contentType || 'application/json',
            body: fs.readFileSync(path.resolve(path.dirname(scenarioPath), s.file)),
          }));
          break;
        default: console.error(`unknown action: ${s.action}`);
      }
    } catch (e) {
      note(`[scenario:${s.action} ${s.id || s.selector || s.key || ''}] ${e.message.split('\n')[0]}`);
    }
    await sleep(s.settleMs ?? 120);
  }
  if (!useClock) await shot(baseName);
} finally {
  const logFile = path.join(outdir, `${baseName}-problems.txt`);
  fs.writeFileSync(logFile, problems.length ? problems.join('\n') : '(none)');
  console.log(`problems: ${problems.length} → ${logFile}`);
  await browser.close();
}
