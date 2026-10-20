import { defineConfig } from 'vite';

// Dev server on 5180; /api is proxied to the Cloudflare Worker running under
// `npm run worker` (wrangler dev --local on 8780). WORKER_PORT overrides the
// proxy target so parallel builders can run their own worker on another port.
const workerPort = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.WORKER_PORT || '8780';
const api = { target: `http://localhost:${workerPort}`, changeOrigin: true };

export default defineConfig({
  server: {
    port: 5180,
    strictPort: true,
    proxy: { '/api': api },
  },
  preview: {
    port: 5181,
    strictPort: true,
    proxy: { '/api': api },
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
