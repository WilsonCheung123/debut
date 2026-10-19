import { defineConfig } from 'vite';

// Dev server on 5180; /api is proxied to the Cloudflare Worker running under
// `npm run worker` (wrangler dev --local on 8780).
export default defineConfig({
  server: {
    port: 5180,
    strictPort: true,
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
