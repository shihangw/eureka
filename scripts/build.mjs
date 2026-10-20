/**
 * Builds the unpacked extension into dist/: copies the static assets from
 * app/ at their existing paths and bundles each TypeScript entrypoint into a
 * classic IIFE script under dist/scripts/. Typechecking is done separately by
 * `npm run typecheck` because esbuild does not typecheck.
 */
import { cpSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('..', import.meta.url));
const appDir = `${root}app`;
const distDir = `${root}dist`;

const entrypoints = ['background', 'contentscript', 'popup', 'options'];

rmSync(distDir, { recursive: true, force: true });
cpSync(appDir, distDir, { recursive: true });

await build({
  absWorkingDir: root,
  entryPoints: Object.fromEntries(entrypoints.map((name) => [name, `src/${name}.ts`])),
  outdir: 'dist/scripts',
  bundle: true,
  // Content scripts and the classic service worker cannot load ES modules or shared chunks.
  format: 'iife',
  platform: 'browser',
  // Manifest V3 requires Chrome 88 or newer.
  target: 'chrome88',
  charset: 'utf8',
  logLevel: 'info',
});
