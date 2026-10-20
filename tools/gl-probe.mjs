// Which GL does each Playwright launch mode get on this machine? Prints the unmasked renderer string.
import { chromium } from 'playwright';
const modes = [
  { name: 'new-headless+metal', opts: { headless: true, channel: 'chromium', args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu-rasterization'] } },
  { name: 'new-headless', opts: { headless: true, channel: 'chromium', args: ['--ignore-gpu-blocklist'] } },
];
for (const m of modes) {
  try {
    const b = await chromium.launch(m.opts);
    const p = await b.newPage();
    await p.setContent('<canvas id=c></canvas>');
    const r = await p.evaluate(() => { const gl = document.getElementById('c').getContext('webgl2'); if (!gl) return 'no webgl2'; const d = gl.getExtension('WEBGL_debug_renderer_info'); return d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER); });
    console.log(m.name, '→', r);
    await b.close();
  } catch (e) { console.log(m.name, 'failed:', e.message.split('\n')[0]); }
}
