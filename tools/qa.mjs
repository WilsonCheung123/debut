#!/usr/bin/env node
// npm run qa: the scripted desktop visit (SPEC 0.1: desktop first), failing on
// any console error, page error, failed assert, audit finding or timing miss.
// Needs the dev server on 5180 (and the worker on 8780 for API steps).
// Under software GL a run must stay well under ten minutes, so the full visit
// is two halves and every builder flow is its own run. `npm run qa a b` runs
// only the named runs.
import { spawnSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// QA runs against the static preview (5181, `npm run build && npm run preview`) when it is up: the dev
// server reloads every open page on a source edit, which kills a run in progress. QA_URL overrides.
const probe = async (u) => { try { return (await fetch(u, { signal: AbortSignal.timeout(1500) })).ok; } catch { return false; } };
const url = process.env.QA_URL || ((await probe('http://localhost:5181/')) ? 'http://localhost:5181/' : 'http://localhost:5180/');
console.log(`qa against ${url}`);
// software GL plus a busy machine: every page wait is stretched unless the caller set the scale
process.env.SHOT_TIMEOUT_SCALE ||= '3';
const outdir = process.env.QA_OUT || 'shots/qa';
const D = ['--viewport', 'desktop'];
const runs = [
  { name: 'visit-a', args: [...D, '--scenario', 'tests/scenarios/full-visit-a.json'] },   // rest, API, hovers, the ID flip
  { name: 'visit-books', args: [...D, '--scenario', 'tests/scenarios/full-visit-books.json'] },   // the nine books' panels
  { name: 'visit-b', args: [...D, '--scenario', 'tests/scenarios/full-visit-b.json'] },   // the other objects, the Austen trick, keyboard
  { name: 'reduced', args: [...D, '--reduced-motion', '--scenario', 'tests/scenarios/reduced-motion.json'] },
  // choreography timings under a fake clock: panel at +450 ms, camera settled at +900 ms, exit at +800 ms
  { name: 'timing', args: [...D, '--clock', '--scenario', 'tests/scenarios/timing.json'] },
  // deep link: /#jar focuses the jar after the warm-up; back/Escape clears the hash
  { name: 'deep-link', url: '#jar', args: [...D, '--scenario', 'tests/scenarios/deep-link.json'] },
  // the builders' flows
  { name: 'shelf', args: [...D, '--scenario', 'tests/scenarios/shelf.json'] },   // shelf mode end to end: scroll, lean, open, keyboard, Kahneman, the Austen letter, restore
  { name: 'hologram', args: [...D, '--scenario', 'tests/scenarios/hologram.json'] },   // native HLS path (headless Chromium plays the m3u8 itself)
  { name: 'hologram-hls', url: '?holo=hls', args: [...D, '--scenario', 'tests/scenarios/hologram.json'] },   // the hls.js path real Chrome takes
  { name: 'hologram-again', url: '?holo=hls', args: [...D, '--scenario', 'tests/scenarios/hologram-again.json'] },   // the sheet keeps advancing on a second focus, after a film switch, after cinema (texture uploads counted per rendered frame)
  { name: 'puppet', args: [...D, '--scenario', 'tests/scenarios/puppet.json'] },   // intro, hover tags, the three item views
  { name: 'vinyl', args: [...D, '--scenario', 'tests/scenarios/vinyl.json'] },
  { name: 'vinyl-offline', args: [...D, '--scenario', 'tests/scenarios/vinyl-offline.json'] },
  { name: 'vinyl-silent', args: [...D, '--scenario', 'tests/scenarios/vinyl-silent.json'] },
  { name: 'jar', args: [...D, '--scenario', 'tests/scenarios/jar.json'] },
  { name: 'kahneman', args: [...D, '--scenario', 'tests/scenarios/kahneman.json'] },
  { name: 'four-objects', args: [...D, '--scenario', 'tests/scenarios/four-objects.json'] },
  { name: 'id-flip', args: [...D, '--clock', '--scenario', 'tests/scenarios/id-flip.json'] },   // the ID opens its panel at +450 ms, no flip, second click inert
  { name: 'texts', args: [...D, '--scenario', 'tests/scenarios/texts.json'] },   // every panel's rendered text: no [brackets], no email, the verbatim lines
  { name: 'four-clock', args: [...D, '--clock', '--scenario', 'tests/scenarios/four-clock.json'] },   // ID, FPGA (link card), die-cast, capo under the fake clock
];
const only = process.argv.slice(2);
for (const n of only) if (!runs.some((r) => r.name === n)) { console.error(`unknown run ${n}; runs: ${runs.map((r) => r.name).join(' ')}`); process.exit(2); }

// The full visit posts to /api through the Vite proxy; make sure the worker is up.
let worker = null;
const apiUp = async () => { try { const r = await fetch(new URL('/api/anchor/stats', url)); return r.ok; } catch { return false; } };
if (!(await apiUp())) {
  console.log('starting the worker (wrangler dev --local on 8780)...');
  worker = spawn('npx', ['wrangler', 'dev', '--config', 'worker/wrangler.toml', '--local', '--port', '8780', '--var', 'NOTE_LIMIT_PER_HOUR:500'], { stdio: 'ignore', detached: true });
  for (let i = 0; i < 40 && !(await apiUp()); i++) await new Promise((r) => setTimeout(r, 1000));
  if (!(await apiUp())) { console.error('worker did not come up; API asserts will fail'); }
}
process.on('exit', () => { if (worker) try { process.kill(-worker.pid); } catch { /* gone */ } });

let failed = false;
const t0 = Date.now();
for (const run of runs) {
  if (only.length && !only.includes(run.name)) continue;
  console.log(`\n=== ${run.name} ===`);
  const t = Date.now();
  // shotlock serialises headless Chromium across parallel runs on this machine (two slots)
  const r = spawnSync('bash', ['tools/shotlock.sh', 'node', 'tools/shot.mjs', url + (run.url || ''), outdir, '--name', run.name, ...run.args], { stdio: 'inherit' });
  const file = path.join(outdir, `${run.name}-problems.txt`);
  const text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '(missing)';
  const bad = text.split('\n').filter((l) => /^\[(console\.error|console\.warn|pageerror|assert|audit|timing|hover|focus|exit|scenario|requestfailed|http )/.test(l));
  const secs = Math.round((Date.now() - t) / 1000);
  if (r.status !== 0 || bad.length) {
    failed = true;
    console.log(`FAIL ${run.name} (${secs} s): ${bad.length} problem(s)\n${bad.map((l) => '  ' + l).join('\n')}`);
  } else console.log(`PASS ${run.name} (${secs} s)`);
}
console.log(`\n${failed ? 'FAILED' : 'ALL PASS'} in ${Math.round((Date.now() - t0) / 60000)} min`);
process.exit(failed ? 1 : 0);
