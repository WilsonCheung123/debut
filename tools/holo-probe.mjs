#!/usr/bin/env node
// A quick probe of the hologram's playback on a real browser: focus, measure texture uploads vs video
// time, exercise cinema + Escape, refocus. Usage: node tools/holo-probe.mjs <url> [--headed]
import { chromium } from 'playwright';
const url = process.argv[2] || 'http://localhost:5197/?holo=hls';
const headed = process.argv.includes('--headed');
const browser = await chromium.launch(headed ? { headless: false } : { args: ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--disable-gpu-vsync'] });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('  console.' + m.type(), m.text().slice(0, 160)); });
page.on('pageerror', (e) => console.log('  pageerror', e.message));
const u = new URL(url); u.searchParams.set('qa', '1');
await page.goto(u.toString(), { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__table && window.__table.ready, null, { timeout: 180000 });
const until = (f, ms) => page.waitForFunction(f, null, { timeout: ms }).then(() => true).catch(() => false);
const status = () => page.evaluate(() => { const s = window.__hologram.status(); return { live: s.live, playing: s.playing, paused: s.paused, cinema: s.cinema, fs: !!document.fullscreenElement, t: +s.currentTime.toFixed(2), ver: window.__hologram.textureVersion, mix: window.__hologram.liveMix, err: s.error, tail: s.events.slice(-5) }; });
const measure = async (label) => {
  const r = await page.evaluate(async () => {
    const H = window.__hologram; const v = document.querySelector('video.holo-video');
    let rvfc = 0; const id = v.requestVideoFrameCallback(function cb() { rvfc++; v.requestVideoFrameCallback(cb); });
    const q0 = v.getVideoPlaybackQuality().totalVideoFrames, v0 = H.textureVersion, t0 = v.currentTime;
    await new Promise((r) => setTimeout(r, 2000));
    v.cancelVideoFrameCallback(id);
    return { uploads: H.textureVersion - v0, decoded: v.getVideoPlaybackQuality().totalVideoFrames - q0, rvfc, dt: +(v.currentTime - t0).toFixed(2), mix: H.liveMix, live: H.status().live };
  });
  console.log(label, JSON.stringify(r));
  return r;
};
const focus = async () => { await page.evaluate(() => window.__table.focus('hologram')); await until(() => window.__table.state.focused === 'hologram', 10000); };
const exit = async () => { await page.keyboard.press('Escape'); await until(() => window.__table.state.focused === null, 10000); };
try {
  await until(() => { const s = window.__hologram.status(); return !s.playing && (s.mode !== 'hls' || s.hls); }, 20000);
  await focus();
  console.log('first live', await until(() => window.__hologram.status().live && window.__hologram.liveMix > 0.95, 60000), JSON.stringify(await status()));
  await measure('first');
  await exit();
  await page.waitForTimeout(4500);
  console.log('re-prepared', JSON.stringify(await status()));
  await focus();
  console.log('second live', await until(() => window.__hologram.status().live && window.__hologram.liveMix > 0.95, 60000), JSON.stringify(await status()));
  await measure('second');
  await page.locator('#panel .films .film[data-index="3"]').click();
  console.log('switched live', await until(() => window.__hologram.selected === 3 && window.__hologram.status().live && window.__hologram.liveMix > 0.95, 60000), JSON.stringify(await status()));
  await measure('switched');
  await page.locator('#panel .sound').click();
  console.log('cinema', await until(() => window.__hologram.status().cinema, 10000), JSON.stringify(await status()));
  await page.waitForTimeout(1500);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(1000);
  console.log('after escape', JSON.stringify(await status()));
  await measure('after-cinema');
  await exit();
  await page.waitForTimeout(4500);
  await focus();
  console.log('third live', await until(() => window.__hologram.status().live && window.__hologram.liveMix > 0.95, 60000), JSON.stringify(await status()));
  await measure('third');
  await exit();
} finally { await browser.close(); }
