#!/usr/bin/env node
// End-to-end for the Thinking, Fast and Slow panel (SPEC 4.2) with real input:
// a real mouse press-and-hold on the illusion (with deterministic mid-animation
// frames under Playwright's fake clock), a real keyboard hold (Tab, Space down /
// up), the anchoring flow typed and submitted with Enter against the local
// worker, the returning-visitor path, and the API-down path (route aborted).
// Fails on any console error/warning, page error, failed request or assert,
// except the SwiftShader driver noise and the one network error the API-down
// step deliberately provokes.
//
// Usage: node tests/kahneman.e2e.mjs [url] [outdir]      (dev server + worker up)
//   E2E_SLOW=3 multiplies every timeout (a shared, loaded machine).
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const url = new URL(process.argv[2] || 'http://localhost:5180/');
url.searchParams.set('qa', '1'); // locks the quality tier; gsap follows the (fake) clock
const outdir = process.argv[3] || 'shots/kahneman-e2e';
fs.mkdirSync(outdir, { recursive: true });
const SLOW = Number(process.env.E2E_SLOW) || 1;
const T = (ms) => ms * SLOW;
const BOOK = 'book.thinking-fast-slow';

const problems = [];
const note = (s) => { problems.push(s); console.log(`  ! ${s}`); };
const check = (name, ok, detail = '') => { if (ok) console.log(`PASS ${name}`); else note(`[assert:${name} FAILED] ${detail}`); };
const ENV_NOISE = /KHR_parallel_shader_compile|GL Driver Message/;
let apiDown = false; // the API-down step expects exactly one kind of network error

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--disable-gpu-vsync'],
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, serviceWorkers: 'block' });
const page = await context.newPage();
page.setDefaultTimeout(T(30000));
await page.clock.install();
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

const now = () => page.evaluate(() => performance.now());
const until = (fn, arg, timeout = T(15000)) => page.waitForFunction(fn, arg, { timeout }).then(() => true, () => false);
const q = (sel) => page.locator(sel).first();
const K = '#panel .kahneman';

/** Screenshot that works under a paused fake clock (page.screenshot waits on rAFs the clock must deliver). */
async function shot(name, paused = false) {
  const file = path.join(outdir, `${name}.png`);
  if (!paused) { await page.screenshot({ path: file, timeout: T(60000) }); console.log(`shot: ${file}`); return; }
  let done = false;
  const p = cdp.send('Page.captureScreenshot', { format: 'png' }).then((r) => fs.writeFileSync(file, Buffer.from(r.data, 'base64'))).finally(() => { done = true; });
  const t0 = Date.now();
  while (!done && Date.now() - t0 < T(60000)) await page.clock.runFor(4);
  await p;
  console.log(`shot: ${file}`);
}

async function focusBook() {
  const t0 = await now();
  await page.evaluate((id) => { window.__table.focus(id); }, BOOK);
  const settled = await until(([t0]) => window.__table.timeline.some((m) => m.ev === 'focus:settled' && m.t >= t0), [t0], T(40000));
  check('focus-settled', settled);
  await q(K).waitFor({ timeout: T(15000) });
  await page.waitForTimeout(T(600)); // the panel entrance (420 ms)
}
async function exitFocus() {
  const t0 = await now();
  await page.keyboard.press('Escape');
  check('exit-settled', await until(([t0]) => window.__table.timeline.some((m) => m.ev === 'exit:settled' && m.t >= t0), [t0], T(40000)));
  await page.waitForTimeout(T(300));
}
const fieldOpacity = () => page.evaluate((K) => +getComputedStyle(document.querySelector(`${K} .field`)).opacity, K);
const held = () => page.evaluate((K) => document.querySelector(K).dataset.held === '1', K);
const stats = async () => (await (await fetch(new URL('/api/anchor/stats', url))).json());
const fmt = (v) => (Number.isInteger(v) ? String(v) : v.toFixed(1));

try {
  console.log('loading (SwiftShader; a loaded machine can take minutes)...');
  await page.goto(url.toString(), { waitUntil: 'commit', timeout: T(120000) });
  check('table-ready', await until(() => window.__table && window.__table.ready, null, T(300000)));
  await page.evaluate(() => { localStorage.removeItem('kahneman.group'); localStorage.removeItem('kahneman.guess'); });

  // ---- 1. the illusion: real mouse press-and-hold, frames under a paused clock ----
  await focusBook();
  check('kahneman-panel', await page.evaluate((K) => !!document.querySelector(K) && document.getElementById('panel-title').textContent === 'Thinking, Fast and Slow', K));
  check('newsreader-loaded', await page.evaluate(() => document.fonts.check('17px Newsreader')), 'Newsreader is not available to the panel');
  check('image-loaded', await until((K) => { const i = document.querySelector(`${K} .trick img`); return i.complete && i.naturalWidth > 0; }, K));
  const box = await q(`${K} .trick`).boundingBox();
  check('figure-visible', !!box && box.width > 300, JSON.stringify(box));
  await shot('e2e-1-rest');
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 1);
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.55);
  await page.mouse.down();
  await page.clock.runFor(16);
  check('held-on-mousedown', await held());
  await page.clock.runFor(100);
  await shot('e2e-2-hold-120ms', true);
  const midBridge = await page.evaluate((K) => document.querySelector(`${K} .bridge`).getAttribute('transform') || '', K);
  await page.clock.runFor(140);
  await shot('e2e-3-hold-260ms', true);
  await page.clock.runFor(400);
  await shot('e2e-4-hold-settled', true);
  check('field-fully-in', (await fieldOpacity()) > 0.98, `opacity ${await fieldOpacity()}`);
  check('bridge-was-growing', /scale|matrix/.test(midBridge), `transform at 120 ms: "${midBridge}"`);
  check('prompt-says-let-go', await page.evaluate((K) => document.querySelector(`${K} .prompt`).textContent === 'now let go', K));
  await page.mouse.up();
  await page.clock.runFor(180);
  await shot('e2e-5-release-180ms', true);
  const midOut = await fieldOpacity();
  await page.clock.runFor(600);
  check('released-on-mouseup', !(await held()));
  check('field-fades-back', (await fieldOpacity()) < 0.02 && midOut > 0.02 && midOut < 0.98, `mid ${midOut}, end ${await fieldOpacity()}`);
  check('prompt-back', await page.evaluate((K) => document.querySelector(`${K} .prompt`).textContent === 'press and hold the picture', K));
  await page.clock.resume();

  // ---- 2. keyboard: Tab reaches the figure, Space holds, release lets go ----
  await page.evaluate(() => document.querySelector('#panel .back').focus());
  await page.keyboard.press('Tab');
  check('tab-reaches-figure', await page.evaluate((K) => document.activeElement === document.querySelector(`${K} .trick`), K));
  await page.keyboard.down('Space');
  check('space-holds', await until((K) => document.querySelector(K).dataset.held === '1' && +getComputedStyle(document.querySelector(`${K} .field`)).opacity > 0.98, K));
  await page.keyboard.up('Space');
  check('space-release', await until((K) => !document.querySelector(K).dataset.held && +getComputedStyle(document.querySelector(`${K} .field`)).opacity < 0.02, K));
  await page.keyboard.press('Tab');
  check('tab-reaches-older', await page.evaluate((K) => document.activeElement === document.querySelector(`${K} .choices button[data-choice=older]`), K));
  await page.keyboard.press('Tab');
  check('tab-reaches-younger', await page.evaluate((K) => document.activeElement === document.querySelector(`${K} .choices button[data-choice=younger]`), K));

  // ---- 3. the anchoring flow, typed, submitted with Enter, against the local worker ----
  const group = await page.evaluate(() => localStorage.getItem('kahneman.group'));
  check('group-assigned', group === 'A' || group === 'B', String(group));
  check('question-one-anchor', await page.evaluate(([K, g]) => document.querySelector(`${K} .q`).textContent === `Was Gandhi older or younger than ${g === 'A' ? 114 : 35} when he died?`, [K, group]));
  const before = await stats();
  await q(`${K} .choices button[data-choice=older]`).click();
  check('question-two-focused', await until((K) => document.querySelector(K).dataset.step === 'q2' && document.activeElement === document.querySelector(`${K} input`), K));
  await page.waitForTimeout(T(500));
  await shot('e2e-6-question-two');
  await page.keyboard.type('200');
  await page.keyboard.press('Enter');
  check('rejects-200', await until((K) => document.querySelector(`${K} .hint`).textContent.length > 0 && document.querySelector(K).dataset.step === 'q2', K));
  await page.keyboard.type('60'); // the invalid value was selected: typing replaces it
  check('input-is-60', await page.evaluate((K) => document.querySelector(`${K} input`).value === '60', K), await page.evaluate((K) => document.querySelector(`${K} input`).value, K));
  await page.keyboard.press('Enter');
  await q(`${K} .reveal`).waitFor({ timeout: T(20000) });
  const after = await stats();
  const mine = group === 'A' ? 'A' : 'B';
  check('row-recorded', after[mine].n === before[mine].n + 1, `${before[mine].n} -> ${after[mine].n}`);
  check('reveal-numbers', await until(([K, s]) => { const t = [...document.querySelectorAll(`${K} .num`)].map((e) => e.textContent); const f = (v) => (Number.isInteger(v) ? String(v) : v.toFixed(1)); return t[0] === f(s.A.mean) && t[1] === f(s.B.mean) && t[2] === '78'; }, [K, after]), `expected ${fmt(after.A.mean)}, ${fmt(after.B.mean)}, 78`);
  check('reveal-counts', await page.evaluate(([K, s]) => { const t = [...document.querySelectorAll(`${K} .col .n`)].map((e) => e.textContent); return t[0] === `from ${s.A.n} people` && t[1] === `from ${s.B.n} people` && t[2] === '1869 to 1948'; }, [K, after]));
  check('own-column-lit', await until(([K, g]) => { const cols = [...document.querySelectorAll(`${K} .col`)]; const m = cols[g === 'A' ? 0 : 1]; return m.classList.contains('mine') && m.classList.contains('lit') && m.querySelector('.you').textContent === 'you said 60' && cols.filter((c) => c.classList.contains('mine')).length === 1; }, [K, group]));
  check('guess-persisted', await page.evaluate(() => localStorage.getItem('kahneman.guess') === '60'));
  check('explain-verbatim', await page.evaluate((K) => document.querySelector(`${K} .explain`).textContent === "The first number was random and obviously wrong. It still pulled your guess toward it. That's anchoring: the mind starts from whatever it was handed and doesn't adjust far enough.", K));
  check('close-verbatim', await page.evaluate((K) => document.querySelector(`${K} .closing`).textContent === 'Like squares A and B: you can know the number is irrelevant and still be moved by it.', K));
  check('focus-stays-in-dialog', await page.evaluate(() => document.getElementById('panel').contains(document.activeElement)));
  await page.waitForTimeout(T(800));
  await shot('e2e-7-reveal');
  await exitFocus();

  // ---- 4. returning visitor: straight to the reveal, not asked twice ----
  await focusBook();
  check('returning-reveal', await until((K) => document.querySelector(K).dataset.step === 'reveal' && !document.querySelector(`${K} .q1`) && document.querySelector(`${K} .col.mine.lit .you`)?.textContent === 'you said 60' && document.querySelectorAll(`${K} .num`)[2]?.textContent === '78', K, T(20000)));
  await shot('e2e-8-returning');
  await exitFocus();

  // ---- 5. API down: the real answer still shows, the averages are declared unavailable ----
  await page.evaluate(() => { localStorage.removeItem('kahneman.group'); localStorage.removeItem('kahneman.guess'); });
  await context.route('**/api/anchor', (route) => route.abort('connectionrefused'));
  apiDown = true;
  await focusBook();
  await q(`${K} .choices button[data-choice=younger]`).click();
  check('q2-after-younger', await until((K) => document.querySelector(K).dataset.step === 'q2' && document.activeElement === document.querySelector(`${K} input`), K));
  await page.keyboard.type('70');
  await page.keyboard.press('Enter');
  await q(`${K} .reveal`).waitFor({ timeout: T(20000) });
  check('down-real-answer', await until((K) => [...document.querySelectorAll(`${K} .num`)].map((e) => e.textContent).join() === '—,—,78', K));
  check('down-unavailable-line', await page.evaluate((K) => document.querySelector(`${K} .unavailable`)?.textContent === 'The averages are unavailable right now.', K));
  check('down-own-guess', await until((K) => document.querySelector(`${K} .col.mine.lit .you`)?.textContent === 'you said 70', K));
  await page.waitForTimeout(T(600));
  await shot('e2e-9-api-down');
  await context.unroute('**/api/anchor');
  apiDown = false;
  await exitFocus();
  check('back-at-rest', await page.evaluate(() => window.__table.info().mode === 'rest' && location.hash === ''));
} catch (e) {
  note(`[script] ${e.message.split('\n')[0]}`);
} finally {
  const file = path.join(outdir, 'e2e-problems.txt');
  fs.writeFileSync(file, problems.length ? problems.join('\n') : '(none)');
  console.log(`problems: ${problems.length} → ${file}`);
  await browser.close();
}
process.exit(problems.length ? 1 : 0);
