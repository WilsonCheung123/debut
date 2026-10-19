#!/usr/bin/env node
// npm run qa: the full scripted visit on desktop and iPhone (plus a reduced-
// motion pass), failing on any console error, page error, failed assert,
// audit finding or timing miss. Needs the dev server on 5180 (and the worker
// on 8780 for API steps).
import { spawnSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const url = process.env.QA_URL || 'http://localhost:5180/';
const outdir = process.env.QA_OUT || 'shots/qa';
const runs = [
  { name: 'desktop', args: ['--viewport', 'desktop', '--scenario', 'tests/scenarios/full-visit.json'] },
  { name: 'iphone', args: ['--viewport', 'iphone', '--scenario', 'tests/scenarios/full-visit.json'] },
  { name: 'desktop-reduced', args: ['--viewport', 'desktop', '--reduced-motion', '--scenario', 'tests/scenarios/reduced-motion.json'] },
  // choreography timings under a fake clock: panel at +450 ms, camera settled at +900 ms, exit at +800 ms
  { name: 'timing', args: ['--viewport', 'desktop', '--clock', '--scenario', 'tests/scenarios/timing.json'] },
];
const only = process.argv[2];

// The full visit posts to /api through the Vite proxy; make sure the worker is up.
let worker = null;
const apiUp = async () => { try { const r = await fetch(new URL('/api/anchor/stats', url)); return r.ok; } catch { return false; } };
if (!(await apiUp())) {
  console.log('starting the worker (wrangler dev --local on 8780)...');
  worker = spawn('npx', ['wrangler', 'dev', '--config', 'worker/wrangler.toml', '--local', '--port', '8780'], { stdio: 'ignore', detached: true });
  for (let i = 0; i < 40 && !(await apiUp()); i++) await new Promise((r) => setTimeout(r, 1000));
  if (!(await apiUp())) { console.error('worker did not come up; API asserts will fail'); }
}
process.on('exit', () => { if (worker) try { process.kill(-worker.pid); } catch { /* gone */ } });

let failed = false;
for (const run of runs) {
  if (only && run.name !== only) continue;
  console.log(`\n=== ${run.name} ===`);
  const r = spawnSync('node', ['tools/shot.mjs', url, outdir, '--name', run.name, ...run.args], { stdio: 'inherit' });
  const file = path.join(outdir, `${run.name}-problems.txt`);
  const text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '(missing)';
  const bad = text.split('\n').filter((l) => /^\[(console\.error|console\.warn|pageerror|assert|audit|timing|hover|focus|exit|scenario|requestfailed|http )/.test(l));
  if (r.status !== 0 || bad.length) {
    failed = true;
    console.log(`FAIL ${run.name}: ${bad.length} problem(s)\n${bad.map((l) => '  ' + l).join('\n')}`);
  } else console.log(`PASS ${run.name}`);
}
process.exit(failed ? 1 : 0);
