#!/usr/bin/env node
// End-to-end for the Thinking, Fast and Slow panel (SPEC 4.2) with real input.
//
//   A. real time: a real mouse press-and-hold on the illusion, a real keyboard
//      hold (Tab, Space down / up), the anchoring flow typed and submitted with
//      Enter against the local worker, the returning-visitor path, and the
//      API-down path (route aborted).
//   B. frame by frame: a second page with Playwright's fake clock, paused right
//      after the lamp warms up and stepped with runFor, so the hold and release
//      are captured at exact moments (120 ms, 260 ms, settled, 180 ms into the
//      release) for the craft check.
//
// Screenshots go through CDP (page.screenshot pre-waits on animation frames,
// which SwiftShader on a loaded machine starves), and clicks go by
// coordinates (no actionability waits). Fails on any console error/warning,
// page error, failed request or assert, except the SwiftShader driver noise
// and the one network error the API-down step deliberately provokes.
//
// Usage: node tests/kahneman.e2e.mjs [url] [outdir]      (dev server + worker up)
//   E2E_SLOW=4 multiplies every timeout (a shared, loaded machine).
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const url = new URL(process.argv[2] || 'http://localhost:5180/');
url.searchParams.set('qa', '1'); // locks the quality tier; gsap follows the (possibly fake) clock
const outdir = process.argv[3] || 'shots/kahneman-e2e';
fs.mkdirSync(outdir, { recursive: true });
const SLOW = Number(process.env.E2E_SLOW) || 1;
const T = (ms) => ms * SLOW;
const BOOK = 'book.thinking-fast-slow';
const K = '#panel .kahneman';
const BRIDGE_HIDDEN = 33.78; // stroke-dashoffset of the undrawn bridge (src/panels/kahneman.ts)

const problems = [];
const note = (s) => { problems.push(s); console.log(`  ! ${s}`); };
const check = (name, ok, detail = '') => { if (ok) console.log(`PASS ${name}`); else note(`[assert:${name} FAILED] ${detail}`); };
const ENV_NOISE = /KHR_parallel_shader_compile|GL Driver Message/;
let apiDown = false; // the API-down step expects exactly one kind of network error

const browser = await chromium.launch({
  // --disable-accelerated-2d-canvas: with the GPU blocklist ignored, headless Chromium would route canvas 2D
  // through SwiftShader and the engine's procedural textures take minutes instead of milliseconds.
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--disable-gpu-vsync', '--disable-accelerated-2d-canvas'],
});

async function openPage({ clock }) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, serviceWorkers: 'block' });
  const page = await context.newPage();
  page.setDefaultTimeout(T(60000));
  if (clock) await page.clock.install();
  const cdp = await context.newCDPSession(page);
  page.on('console', (m) => {
    const type = m.type(), text = m.text();
    if (type === 'error') { if (apiDown && /Failed to load resource|ERR_FAILED|ERR_CONNECTION/.test(text)) return; note(`[console.error] ${text}`); }
    else if (type === 'warning') { if (!ENV_NOISE.test(text)) note(`[console.warn] ${text}`); }
  });
  page.on('pageerror', (e) => note(`[pageerror] ${e.message}`));
  page.on('requestfailed', (r) => {
    if (apiDown && r.url().includes('/api/anchor')) return;
    const f = r.failure();
    if (f && f.errorText !== 'net::ERR_ABORTED') note(`[requestfailed] ${r.url()} — ${f.errorText}`);
  });
  page.on('response', (r) => { if (r.status() >= 400) note(`[http ${r.status()}] ${r.url()}`); });
  return { context, page, cdp };
}

/** CDP capture. With a paused fake clock, `tick` steps it until the frame lands. */
async function shot(cdp, name, tick = null) {
  const file = path.join(outdir, `${name}.png`);
  let done = false;
  const p = cdp.send('Page.captureScreenshot', { format: 'png' }).then((r) => fs.writeFileSync(file, Buffer.from(r.data, 'base64'))).finally(() => { done = true; });
  if (tick) { const t0 = Date.now(); while (!done && Date.now() - t0 < T(120000)) await tick(); }
  await p;
  console.log(`shot: ${file}`);
}
const until = (page, fn, arg, timeout = T(30000)) => page.waitForFunction(fn, arg, { timeout, polling: 250 }).then(() => true, () => false);
async function clickEl(page, sel) {
  const b = await page.locator(sel).first().boundingBox();
  if (!b) throw new Error(`no box for ${sel}`);
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
}
async function load(page) {
  console.log('loading (SwiftShader; a loaded machine can take minutes)...');
  await page.goto(url.toString(), { waitUntil: 'commit', timeout: T(120000) });
  return until(page, () => window.__table && window.__table.ready, null, T(300000));
}
const stats = async () => (await (await fetch(new URL('/api/anchor/stats', url))).json());
const fmt = (v) => (Number.isInteger(v) ? String(v) : v.toFixed(1));
const heldJs = (K) => document.querySelector(K).dataset.held === '1';
/** How far the picture has dissolved: 0 = the illusion, 1 = bare paper with the two squares and the bridge. */
const fieldJs = (K) => 1 - +getComputedStyle(document.querySelector(`${K} .trick img`)).opacity;
const promptJs = (K) => document.querySelector(`${K} .prompt`).textContent;
const bridgeJs = (K) => +document.querySelector(`${K} .bridge`).getAttribute('stroke-dashoffset');

// =============================== A. real time ===============================
{
  const { context, page, cdp } = await openPage({ clock: false });
  const focusBook = async () => {
    const t0 = await page.evaluate(() => performance.now());
    await page.evaluate((id) => { window.__table.focus(id); }, BOOK);
    check('focus-settled', await until(page, ([t0]) => window.__table.timeline.some((m) => m.ev === 'focus:settled' && m.t >= t0), [t0], T(60000)));
    check('panel-mounted', await until(page, (K) => !!document.querySelector(K) && !document.getElementById('panel').hidden, K));
    await page.waitForTimeout(T(700)); // the panel entrance (420 ms)
  };
  const exitFocus = async () => {
    const t0 = await page.evaluate(() => performance.now());
    await page.keyboard.press('Escape');
    check('exit-settled', await until(page, ([t0]) => window.__table.timeline.some((m) => m.ev === 'exit:settled' && m.t >= t0), [t0], T(60000)));
    await page.waitForTimeout(T(300));
  };
  try {
    check('table-ready', await load(page));
    await page.evaluate(() => { localStorage.removeItem('kahneman.group'); localStorage.removeItem('kahneman.guess'); });

    // ---- 1. the illusion: a real mouse press-and-hold ----
    await focusBook();
    check('kahneman-panel', await page.evaluate((K) => !!document.querySelector(K) && document.getElementById('panel-title').textContent === 'Thinking, Fast and Slow', K));
    check('newsreader-loaded', await page.evaluate(() => document.fonts.check('17px Newsreader')), 'Newsreader is not available to the panel');
    check('image-loaded', await until(page, (K) => { const i = document.querySelector(`${K} .trick img`); return i.complete && i.naturalWidth > 0; }, K));
    const box = await page.locator(`${K} .trick`).first().boundingBox();
    check('figure-visible', !!box && box.width > 300, JSON.stringify(box));
    check('bridge-hidden-at-rest', (await page.evaluate(bridgeJs, K)) === BRIDGE_HIDDEN && (await page.evaluate(fieldJs, K)) === 0);
    await shot(cdp, 'e2e-1-rest');
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.55);
    await page.mouse.down();
    check('held-on-mousedown', await until(page, heldJs, K));
    check('proof-settles-in', await until(page, (K) => +getComputedStyle(document.querySelector(`${K} .trick img`)).opacity < 0.02 && +document.querySelector(`${K} .bridge`).getAttribute('stroke-dashoffset') === 0, K));
    check('prompt-says-let-go', (await page.evaluate(promptJs, K)) === 'now let go');
    await shot(cdp, 'e2e-2-hold');
    await page.mouse.up();
    check('released-on-mouseup', await until(page, (K) => !document.querySelector(K).dataset.held, K));
    check('illusion-comes-back', await until(page, (K) => +getComputedStyle(document.querySelector(`${K} .trick img`)).opacity > 0.98 && +document.querySelector(`${K} .bridge`).getAttribute('stroke-dashoffset') > 33, K));
    check('prompt-back', (await page.evaluate(promptJs, K)) === 'press and hold the picture');

    // ---- 2. keyboard: Tab reaches the figure, Space holds, release lets go, Tab order continues ----
    await page.evaluate(() => document.querySelector('#panel .back').focus());
    await page.keyboard.press('Tab');
    check('tab-reaches-figure', await page.evaluate((K) => document.activeElement === document.querySelector(`${K} .trick`), K));
    await page.keyboard.down('Space');
    check('space-holds', await until(page, (K) => document.querySelector(K).dataset.held === '1' && +getComputedStyle(document.querySelector(`${K} .trick img`)).opacity < 0.02, K));
    await page.keyboard.up('Space');
    check('space-release', await until(page, (K) => !document.querySelector(K).dataset.held && +getComputedStyle(document.querySelector(`${K} .trick img`)).opacity > 0.98, K));
    await page.keyboard.press('Tab');
    check('tab-reaches-older', await page.evaluate((K) => document.activeElement === document.querySelector(`${K} .choices button[data-choice=older]`), K));
    await page.keyboard.press('Tab');
    check('tab-reaches-younger', await page.evaluate((K) => document.activeElement === document.querySelector(`${K} .choices button[data-choice=younger]`), K));

    // ---- 3. the anchoring flow, typed, submitted with Enter, against the local worker ----
    const group = await page.evaluate(() => localStorage.getItem('kahneman.group'));
    check('group-assigned', group === 'A' || group === 'B', String(group));
    check('question-one-anchor', await page.evaluate(([K, g]) => document.querySelector(`${K} .q`).textContent === `Was Gandhi older or younger than ${g === 'A' ? 114 : 35} when he died?`, [K, group]));
    const before = await stats();
    await clickEl(page, `${K} .choices button[data-choice=older]`);
    check('question-two-focused', await until(page, (K) => document.querySelector(K).dataset.step === 'q2' && document.activeElement === document.querySelector(`${K} input`), K));
    await page.waitForTimeout(T(600));
    await shot(cdp, 'e2e-3-question-two');
    await page.keyboard.type('200');
    await page.keyboard.press('Enter');
    check('rejects-200', await until(page, (K) => document.querySelector(`${K} .hint`).textContent.length > 0 && document.querySelector(K).dataset.step === 'q2', K));
    await page.keyboard.type('60'); // the rejected value is selected: typing replaces it
    const typed = await page.evaluate((K) => document.querySelector(`${K} input`).value, K);
    check('input-is-60', typed === '60', `input holds "${typed}"`);
    await page.keyboard.press('Enter');
    check('reveal-shown', await until(page, (K) => !!document.querySelector(`${K} .reveal`), K, T(30000)));
    const after = await stats();
    check('row-recorded', after[group].n === before[group].n + 1, `${before[group].n} -> ${after[group].n}`);
    check('reveal-numbers', await until(page, ([K, s]) => { const t = [...document.querySelectorAll(`${K} .num`)].map((e) => e.textContent); const f = (v) => (Number.isInteger(v) ? String(v) : v.toFixed(1)); return t[0] === f(s.A.mean) && t[1] === f(s.B.mean) && t[2] === '78'; }, [K, after]), `expected ${fmt(after.A.mean)}, ${fmt(after.B.mean)}, 78`);
    check('reveal-counts', await page.evaluate(([K, s]) => { const t = [...document.querySelectorAll(`${K} .col .n`)].map((e) => e.textContent); return t[0] === `average of ${s.A.n} guesses` && t[1] === `average of ${s.B.n} guesses` && t[2] === '1869 to 1948'; }, [K, after]));
    check('reveal-kickers', await page.evaluate((K) => [...document.querySelectorAll(`${K} .col .kicker`)].map((e) => e.textContent).join('|') === 'people who saw 114|people who saw 35|the real answer', K));
    check('numbers-share-a-baseline', await page.evaluate((K) => { const tops = [...document.querySelectorAll(`${K} .num`)].map((e) => e.getBoundingClientRect().top); return Math.max(...tops) - Math.min(...tops) < 1; }, K));
    check('own-column-lit', await until(page, ([K, g]) => { const cols = [...document.querySelectorAll(`${K} .col`)]; const m = cols[g === 'A' ? 0 : 1]; return m.classList.contains('mine') && m.classList.contains('lit') && m.querySelector('.you').textContent === 'you said 60' && cols.filter((c) => c.classList.contains('mine')).length === 1; }, [K, group]));
    check('guess-persisted', await page.evaluate(() => localStorage.getItem('kahneman.guess') === '60'));
    check('explain-verbatim', await page.evaluate((K) => document.querySelector(`${K} .explain`).textContent === "The first number was random and obviously wrong. It still pulled your guess toward it. That's anchoring: the mind starts from whatever it was handed and doesn't adjust far enough.", K));
    check('close-verbatim', await page.evaluate((K) => document.querySelector(`${K} .closing`).textContent === 'Like squares A and B: you can know the number is irrelevant and still be moved by it.', K));
    check('focus-stays-in-dialog', await page.evaluate(() => document.getElementById('panel').contains(document.activeElement)));
    await page.waitForTimeout(T(900));
    await shot(cdp, 'e2e-4-reveal');
    await exitFocus();

    // ---- 4. returning visitor: straight to the reveal, not asked twice ----
    await focusBook();
    check('returning-reveal', await until(page, (K) => document.querySelector(K).dataset.step === 'reveal' && !document.querySelector(`${K} .q1`) && document.querySelector(`${K} .col.mine.lit .you`)?.textContent === 'you said 60' && document.querySelectorAll(`${K} .num`)[2]?.textContent === '78', K, T(30000)));
    await shot(cdp, 'e2e-5-returning');
    await exitFocus();

    // ---- 5. API down: the real answer still shows, the averages are declared unavailable ----
    await page.evaluate(() => { localStorage.removeItem('kahneman.group'); localStorage.removeItem('kahneman.guess'); });
    await context.route('**/api/anchor', (route) => route.abort('connectionrefused'));
    apiDown = true;
    await focusBook();
    await clickEl(page, `${K} .choices button[data-choice=younger]`);
    check('q2-after-younger', await until(page, (K) => document.querySelector(K).dataset.step === 'q2' && document.activeElement === document.querySelector(`${K} input`), K));
    await page.keyboard.type('70');
    await page.keyboard.press('Enter');
    check('down-real-answer', await until(page, (K) => [...document.querySelectorAll(`${K} .num`)].map((e) => e.textContent).join() === '—,—,78', K, T(30000)));
    check('down-unavailable-line', await page.evaluate((K) => document.querySelector(`${K} .unavailable`)?.textContent === 'The averages are unavailable right now.', K));
    check('down-own-guess', await until(page, (K) => document.querySelector(`${K} .col.mine.lit .you`)?.textContent === 'you said 70', K));
    await page.waitForTimeout(T(600));
    await shot(cdp, 'e2e-6-api-down');
    await context.unroute('**/api/anchor');
    apiDown = false;
    await exitFocus();
    check('back-at-rest', await page.evaluate(() => window.__table.info().mode === 'rest' && location.hash === ''));
  } catch (e) {
    note(`[script A] ${e.message.split('\n')[0]}`);
  }
  await context.close();
}

// ========================= B. the hold, frame by frame =========================
{
  const { context, page, cdp } = await openPage({ clock: true });
  const tick = () => page.clock.runFor(4);
  const at = (fn) => page.evaluate(fn, K);
  try {
    check('B-table-ready', await load(page));
    await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 1);
    await page.evaluate((id) => { window.__table.focus(id); }, BOOK);
    await page.clock.runFor(1500); // camera 900 ms, panel at 450 + 420 ms
    check('B-panel-open', await at((K) => window.__table.state.focused === 'book.thinking-fast-slow' && !!document.querySelector(K) && !document.getElementById('panel').hidden));
    const box = await page.locator(`${K} .trick`).first().boundingBox();
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.55);
    await page.mouse.down();
    await page.clock.runFor(16);
    check('B-held', await at(heldJs));
    await page.clock.runFor(104);
    const bridge120 = await at(bridgeJs), field120 = await at(fieldJs);
    await shot(cdp, 'e2e-B1-hold-120ms', tick);
    await page.clock.runFor(140);
    const bridge260 = await at(bridgeJs), field260 = await at(fieldJs);
    await shot(cdp, 'e2e-B2-hold-260ms', tick);
    await page.clock.runFor(420);
    await shot(cdp, 'e2e-B3-hold-settled', tick);
    check('B-bridge-draws-first', bridge120 > 0 && bridge120 < BRIDGE_HIDDEN - 5 && field120 < 0.3, `dashoffset ${bridge120} (hidden ${BRIDGE_HIDDEN}), field ${field120} at 120 ms`);
    check('B-field-follows', bridge260 < 5 && field260 > 0.3 && field260 < 0.98, `dashoffset ${bridge260}, field ${field260} at 260 ms`);
    check('B-settled', (await at(fieldJs)) > 0.98 && (await at(bridgeJs)) === 0 && (await at(promptJs)) === 'now let go');
    await page.mouse.up();
    await page.clock.runFor(180);
    const fieldOut = await at(fieldJs);
    await shot(cdp, 'e2e-B4-release-180ms', tick);
    await page.clock.runFor(700);
    check('B-release-is-gradual', fieldOut > 0.05 && fieldOut < 0.95, `field ${fieldOut} at 180 ms into the release`);
    check('B-back-to-illusion', !(await at(heldJs)) && (await at(fieldJs)) < 0.02 && (await at(bridgeJs)) === BRIDGE_HIDDEN && (await at(promptJs)) === 'press and hold the picture');
  } catch (e) {
    note(`[script B] ${e.message.split('\n')[0]}`);
  }
  await context.close();
}

const file = path.join(outdir, 'e2e-problems.txt');
fs.writeFileSync(file, problems.length ? problems.join('\n') : '(none)');
console.log(`problems: ${problems.length} → ${file}`);
await browser.close();
process.exit(problems.length ? 1 : 0);
