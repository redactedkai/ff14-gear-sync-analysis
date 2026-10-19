#!/usr/bin/env node
/* Build the single-file page: bundle src/main.js (and the CSS it imports) with esbuild,
   then inline both into src/index.html -> dist/index.html. The result opens straight from file://.

   Run from anywhere:  node scripts/build/build.mjs   (or: npm run build)
   scripts/build/dev.mjs reuses the exports below for watch + serve. */
import * as esbuild from 'esbuild';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const SRC = join(ROOT, 'src');
export const DIST = join(ROOT, 'dist');

/* The MIT notices of the bundled libraries, kept at the top of the page's script. esbuild's own legal comments are
   off (legalComments: 'none'): its 'eof' mode keeps only the Vue notice, since Alpine.js ships none in its bundle. */
export const LICENSE_BANNER = `/*! Bundles third-party code under the MIT licence (https://opensource.org/license/mit):
  Alpine.js, (c) 2019-present Caleb Porzio and contributors
  @vue/reactivity and @vue/shared, (c) 2018-present Yuxi (Evan) You and Vue contributors */`;

export function esbuildOptions({ minify = true } = {}) {
  return {
    entryPoints: [join(SRC, 'main.js')],
    bundle: true,
    format: 'iife',
    target: 'es2020',
    minify,
    banner: { js: LICENSE_BANNER },
    legalComments: 'none',
    write: false,
    outdir: join(DIST, 'assets'), // required for the separate CSS output; nothing is written there
    logLevel: 'warning',
  };
}

/* The branch and short commit being built: GitHub Actions' variables when set, else git. Either is null when unknown
   (no git, or a detached HEAD). */
export function buildInfo() {
  const git = args => {
    try {
      return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    } catch {
      return null;
    }
  };
  const branch = process.env.GITHUB_REF_NAME || git(['rev-parse', '--abbrev-ref', 'HEAD']);
  const commit = process.env.GITHUB_SHA?.slice(0, 7) || git(['rev-parse', '--short', 'HEAD']);
  return { branch: branch && branch !== 'HEAD' ? branch : null, commit: commit || null };
}

const escapeHtml = s => s.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);

/* What a build on this branch shows (CLAUDE.md, Branches): nothing on main or an unknown branch (the live page looks
   as it always has); on any other branch a "DEV" badge with the branch and commit in the footer, so a test build is
   never mistaken for the live one. */
export function buildMarks({ branch, commit }) {
  if (!branch || branch === 'main') return { badge: '', footer: '' };
  const label = 'DEV';
  const where = escapeHtml(branch) + (commit ? ` @ ${escapeHtml(commit)}` : '');
  return {
    badge: ` <span class="build-badge" title="Test build from branch ${where}, not the live page">${label}</span>`,
    footer: `<span class="build-info">${label} build: ${where}</span>`,
  };
}

/* Inline the bundle outputs into the HTML template and write dist/index.html. Returns the byte size. `info`: the
   branch and commit (buildInfo), which decide the test-build marks. */
export function writePage(outputFiles, info = buildInfo()) {
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
  for (const marker of ['<!-- STYLES -->', '<!-- SCRIPT -->', '<!-- BUILD_BADGE -->', '<!-- BUILD_INFO -->']) {
    if (!template.includes(marker)) throw new Error(`src/index.html is missing the ${marker} marker`);
  }
  // function replacements, so "$&"-style sequences in the bundle are not treated as patterns
  const marks = buildMarks(info);
  const html = template
    .replace('<!-- BUILD_BADGE -->', () => marks.badge)
    .replace('<!-- BUILD_INFO -->', () => marks.footer)
    .replace('<!-- STYLES -->', () => `<style>\n${css}</style>`)
    .replace('<!-- SCRIPT -->', () => `<script>\n${js}</script>`);
  mkdirSync(DIST, { recursive: true });
  writeFileSync(join(DIST, 'index.html'), html, 'utf8');
  return Buffer.byteLength(html);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const result = await esbuild.build(esbuildOptions());
  const size = writePage(result.outputFiles);
  const { branch } = buildInfo();
  const tag = branch && branch !== 'main' ? `, ${branch} build` : '';
  console.log(`Built dist/index.html (${(size / 1e6).toFixed(1)} MB${tag})`);
}
