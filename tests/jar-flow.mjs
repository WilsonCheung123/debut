#!/usr/bin/env node
// The jar's error paths, driven by Playwright directly (tools/shot.mjs counts
// every 4xx/5xx as a problem, and these cases are deliberate):
//   1. the API is unreachable (request aborted)        -> "out of reach" line, slip kept, button back
//   2. the worker answers 429 (rate limit)             -> "full for now" line
//   3. the worker answers 400 for the email            -> error under the email field
//   4. the real worker accepts                         -> the slip folds, drops, the 3D slip lands, the line appears
// Usage: node tests/jar-flow.mjs [http://localhost:5187/]
// Fails (exit 1) on any console error / page error other than the browser's own
// "Failed to load resource" note for the deliberate 4xx/5xx responses.
import { chromium } from 'playwright';

const base = process.argv[2] || 'http://localhost:5187/';
const url = new URL(base); url.searchParams.set('qa', '1');
const problems = [];
const expectedNoise = /Failed to load resource|net::ERR_FAILED|net::ERR_CONNECTION_REFUSED/;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--disable-gpu-vsync', '--disable-accelerated-2d-canvas'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.setDefaultTimeout(30000);
page.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && !expectedNoise.test(m.text()) && !/KHR_parallel_shader_compile|GL Driver Message/.test(m.text())) problems.push(`[console.${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`));

const ok = (name, cond) => { console.log(`${cond ? 'PASS' : 'FAIL'} ${name}`); if (!cond) problems.push(`[assert:${name} FAILED]`); };
const fill = async (name, email, note) => {
  await page.fill('#panel input[name=name]', name);
  await page.fill('#panel input[name=email]', email);
  await page.fill('#panel textarea[name=note]', note);
};
const submit = async () => page.click('#panel .jar-slip button[type=submit]');
const errorText = async () => page.textContent('#panel .jar-error');

await page.goto(url.toString(), { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForFunction(() => window.__table && window.__table.ready, null, { timeout: 120000 });
await page.evaluate(() => { window.__jarDrops = 0; addEventListener('jar:dropped', () => { window.__jarDrops++; }); });
await page.evaluate(() => window.__table.focus('jar'));
await page.waitForSelector('#panel .jar-slip');
await page.waitForTimeout(900);

// 1. API unreachable
await page.route('**/api/note', (route) => route.abort('connectionrefused'));
await fill('A visitor', 'visitor@example.com', 'The API is down for this one.');
await submit();
await page.waitForFunction(() => document.querySelector('#panel .jar-error').textContent.length > 0);
ok('api-down shows the out-of-reach line', /out of reach/.test(await errorText()));
ok('api-down keeps the slip and its text', (await page.inputValue('#panel textarea[name=note]')) === 'The API is down for this one.' && (await page.isVisible('#panel .jar-slip')));
ok('api-down re-enables the button', !(await page.isDisabled('#panel .jar-slip button[type=submit]')));
await page.unroute('**/api/note');

// 2. rate limited
await page.route('**/api/note', (route) => route.fulfill({ status: 429, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'too many notes for now; try again in an hour' }) }));
await page.fill('#panel textarea[name=note]', 'Rate limited this time.');
await submit();
await page.waitForFunction(() => /full for now/.test(document.querySelector('#panel .jar-error').textContent));
ok('429 shows the jar-is-full line', true);
await page.unroute('**/api/note');

// 3. server-side field error
await page.route('**/api/note', (route) => route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'email: does not look like an address' }) }));
await page.fill('#panel textarea[name=note]', 'The server rejects the address.');
await submit();
await page.waitForSelector('#panel .jar-field[data-field=email].bad');
ok('400 for email lands under the email field', (await page.textContent('#panel .jar-field[data-field=email] .jar-hint')).length > 0 && (await page.evaluate(() => document.activeElement === document.querySelector('#panel input[name=email]'))));
ok('400 leaves the general error line empty', (await errorText()) === '');
await page.unroute('**/api/note');

// 4. the real worker
await page.fill('#panel input[name=email]', 'visitor@example.com');
await page.fill('#panel textarea[name=note]', 'A real submit from tests/jar-flow.mjs.');
const t0 = Date.now();
await submit();
await page.waitForSelector('#panel .jar-done.show', { timeout: 30000 });
await page.waitForFunction(() => window.__jarDrops === 1, null, { timeout: 30000 });
ok('success shows the Namiya line', (await page.textContent('#panel .jar-done')).startsWith('In the jar.'));
ok('success hides the slip', (await page.evaluate(() => getComputedStyle(document.querySelector('#panel .jar-wrap')).display)) === 'none');
ok('the 3D slip landed', true);
console.log(`submit → landed in ${((Date.now() - t0) / 1000).toFixed(1)} s (SwiftShader frames are slow)`);
await page.screenshot({ path: 'shots/jar/flow-done.png' });

// closing the panel while a request is in flight must not throw
await page.evaluate(() => window.__table.exit());
await page.waitForTimeout(1200);
ok('exit returns to rest', (await page.evaluate(() => window.__table.info().mode)) === 'rest');

await browser.close();
if (problems.length) { console.log('\nPROBLEMS:\n' + problems.join('\n')); process.exit(1); }
console.log('\nall jar flows pass, no console errors');
