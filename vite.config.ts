import { defineConfig } from 'vite';

// Dev server on 5180; /api is proxied to the Cloudflare Worker running under
// `npm run worker` (wrangler dev --local on 8780).
//
// node_modules may be a symlink (builder worktrees share the main checkout's).
// Vite serves files by their real path, so the real node_modules must be on
// the allow list or the @fontsource files 403. Node's resolver follows the
// symlink, which gives the real path without any Node typings.
const here = decodeURIComponent(new URL('.', import.meta.url).pathname);
const realModules = (() => {
  try {
    const url = (import.meta as unknown as { resolve(s: string): string }).resolve('three');
    const m = /^file:\/\/(.*\/node_modules)\//.exec(url);
    return m ? decodeURIComponent(m[1]) : null;
  } catch { return null; }
})();

export default defineConfig({
  server: {
    port: 5180,
    strictPort: true,
    fs: { allow: [here, ...(realModules ? [realModules] : [])] },
    proxy: {
      '/api': { target: 'http://localhost:8780', changeOrigin: true },
    },
  },
  preview: {
    port: 5181,
    strictPort: true,
    proxy: {
      '/api': { target: 'http://localhost:8780', changeOrigin: true },
    },
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three')) return 'three';
          if (id.includes('node_modules/gsap')) return 'gsap';
          return undefined;
        },
      },
    },
  },
});
