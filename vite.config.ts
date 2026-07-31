import { defineConfig } from 'vite';
import { resolve } from 'path';

const src = resolve(__dirname, 'src');

// Handles popup SPA, components SPA, and background service worker.
// root=src means HTML outputs land directly in dist/popup/ and dist/components/.
export default defineConfig({
  root: src,
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: false,
    rollupOptions: {
      input: {
        popup: resolve(src, 'popup/popup.html'),
        components: resolve(src, 'components/index.html'),
        'service-worker': resolve(src, 'background/service-worker.ts'),
      },
      output: {
        entryFileNames: (chunk) => {
          if (chunk.name === 'service-worker') return 'background/service-worker.js';
          return '[name]/[name].js';
        },
        chunkFileNames: 'shared/[name]-[hash].js',
        assetFileNames: (asset) => {
          if (asset.name?.endsWith('.css')) return 'components/styles/[name][extname]';
          return 'assets/[name][extname]';
        },
        format: 'es',
      },
    },
    target: 'chrome116',
    minify: false,
    sourcemap: true,
  },
});
