/**
 * Build orchestrator for the Component Preview Chrome extension.
 *
 * Step 1: esbuild bundles the SDK as a standalone IIFE (no Chrome APIs)
 * Step 2: esbuild bundles the bridge script (ISOLATED world relay)
 * Step 3: Vite builds extension pages (popup, components SPA) and the service worker (ESM)
 * Step 4: Copy manifest.json to dist/
 */

import { build as esbuild } from 'esbuild';
import { build as viteBuild } from 'vite';
import { copyFile, mkdir, rm } from 'fs/promises';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function run() {
  await rm(resolve(__dirname, 'dist'), { recursive: true, force: true });
  await mkdir(resolve(__dirname, 'dist/sdk'), { recursive: true });
  await mkdir(resolve(__dirname, 'dist/content'), { recursive: true });

  console.log('→ Building SDK (esbuild IIFE)…');
  await esbuild({
    entryPoints: [resolve(__dirname, 'sdk/index.ts')],
    bundle: true,
    outfile: resolve(__dirname, 'dist/sdk/component-preview-sdk.js'),
    format: 'iife',
    globalName: 'ComponentPreview',
    target: 'chrome116',
    tsconfig: resolve(__dirname, 'tsconfig.json'),
    sourcemap: true,
  });
  console.log('  ✓ dist/sdk/component-preview-sdk.js');

  console.log('→ Building bridge script (esbuild IIFE)…');
  await esbuild({
    entryPoints: [resolve(__dirname, 'src/content/bridge.ts')],
    bundle: true,
    outfile: resolve(__dirname, 'dist/content/bridge.js'),
    format: 'iife',
    target: 'chrome116',
    tsconfig: resolve(__dirname, 'tsconfig.json'),
    sourcemap: true,
  });
  console.log('  ✓ dist/content/bridge.js');

  console.log('→ Building extension pages + service worker (Vite ESM)…');
  await viteBuild({ logLevel: 'warn' });
  console.log('  ✓ dist/popup/, dist/components/, dist/background/');

  console.log('→ Copying manifest.json…');
  await copyFile(
    resolve(__dirname, 'src/manifest.json'),
    resolve(__dirname, 'dist/manifest.json')
  );
  console.log('  ✓ dist/manifest.json');

  console.log('\n✅ Build complete → dist/');
  console.log('   Load unpacked: chrome://extensions → Load unpacked → select dist/');
  console.log('   Standalone SDK: dist/sdk/component-preview-sdk.js');
}

run().catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});
