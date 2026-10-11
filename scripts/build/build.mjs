#!/usr/bin/env node
/* Build the single-file page: bundle src/main.js (and the CSS it imports) with esbuild,
   then inline both into src/index.html -> dist/index.html. The result opens straight from file://.

   Run from anywhere:  node scripts/build/build.mjs   (or: npm run build)
   scripts/build/dev.mjs reuses the exports below for watch + serve. */
import * as esbuild from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const SRC = join(ROOT, 'src');
export const DIST = join(ROOT, 'dist');

export function esbuildOptions({ minify = true } = {}) {
  return {
    entryPoints: [join(SRC, 'main.js')],
    bundle: true,
    format: 'iife',
    target: 'es2020',
    minify,
    legalComments: 'none',
    write: false,
    outdir: join(DIST, 'assets'), // required for the separate CSS output; nothing is written there
    logLevel: 'warning',
  };
}

/* Inline the bundle outputs into the HTML template and write dist/index.html. Returns the byte size. */
export function writePage(outputFiles) {
  const pick = ext =>
    outputFiles
      .filter(f => f.path.endsWith(ext))
      .map(f => f.text)
      .join('\n');
  const js = pick('.js'),
    css = pick('.css');
  if (!js) throw new Error('esbuild produced no JavaScript output');
  if (/<\/script/i.test(js)) throw new Error('bundle contains "</script", which would end the inline script early');
  const template = readFileSync(join(SRC, 'index.html'), 'utf8');
  for (const marker of ['<!-- STYLES -->', '<!-- SCRIPT -->']) {
    if (!template.includes(marker)) throw new Error(`src/index.html is missing the ${marker} marker`);
  }
  // function replacements, so "$&"-style sequences in the bundle are not treated as patterns
  const html = template
    .replace('<!-- STYLES -->', () => `<style>\n${css}</style>`)
    .replace('<!-- SCRIPT -->', () => `<script>\n${js}</script>`);
  mkdirSync(DIST, { recursive: true });
  writeFileSync(join(DIST, 'index.html'), html, 'utf8');
  return Buffer.byteLength(html);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const result = await esbuild.build(esbuildOptions());
  const size = writePage(result.outputFiles);
  console.log(`dist/index.html ${size.toLocaleString('en-US')} bytes`);
}
