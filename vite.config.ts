import { defineConfig, searchForWorkspaceRoot } from 'vite';

// Dev server on 5180; /api is proxied to the Cloudflare Worker running under
// `npm run worker` (wrangler dev --local on 8780). WORKER_PORT overrides the
// proxy target so parallel builders can run their own worker on another port.
const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
const workerPort = env.WORKER_PORT || '8780';
const api = { target: `http://localhost:${workerPort}`, changeOrigin: true };
// VITE_CACHE_DIR gives a checkout its own optimiser cache when several share one node_modules.
const cacheDir = env.VITE_CACHE_DIR || 'node_modules/.vite';

// Builders' checkouts share the main one's node_modules through a symlink; Vite
// serves only under the workspace root, so the symlink's real path is allowed too.
async function realNodeModules(): Promise<string> {
  try {
    const fs = (await import(/* @vite-ignore */ 'node:' + 'fs')) as { realpathSync(p: string): string };
    return fs.realpathSync('node_modules');
  } catch { return 'node_modules'; }
}

export default defineConfig(async () => ({
  cacheDir,
  server: {
    port: 5180,
    strictPort: true,
    proxy: { '/api': api },
    fs: { allow: [searchForWorkspaceRoot('.'), await realNodeModules()] },
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
        manualChunks(id: string) {
          if (id.includes('node_modules/three')) return 'three';
          if (id.includes('node_modules/gsap')) return 'gsap';
          return undefined;
        },
      },
    },
  },
}));
