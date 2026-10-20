#!/usr/bin/env node
/* Build the single-file page: bundle src/main.js (and the CSS it imports) with esbuild,
   then inline both into src/index.html -> dist/index.html. The result opens straight from file://.

   Run from anywhere:  node scripts/build/build.mjs   (or: npm run build)
   scripts/build/dev.mjs reuses the exports below for watch + serve. */
import * as esbuild from 'esbuild';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const SRC = join(ROOT, 'src');
export const DIST = join(ROOT, 'dist');
export const PARTIALS = join(SRC, 'partials');

/* The MIT notices of the bundled libraries, kept at the top of the page's script. esbuild's own legal comments are
   off (legalComments: 'none'): its 'eof' mode keeps only the Vue notice, since Alpine.js ships none in its bundle. */
export const LICENSE_BANNER = `/*! Bundles third-party code under the MIT licence (https://opensource.org/license/mit):
  Alpine.js, (c) 2019-present Caleb Porzio and contributors
  @vue/reactivity and @vue/shared, (c) 2018-present Yuxi (Evan) You and Vue contributors */`;

/* The oldest browsers the page runs in. The floor is set by the JS APIs the page calls, which esbuild does not
   polyfill: Array.prototype.findLast (Chrome 97, Firefox 104, Safari 15.4) and .at(). Naming the browsers instead of
   an ES version also lets esbuild add the CSS prefixes they need (mask: -webkit-mask before Chrome 120). */
export const BROWSER_TARGETS = ['chrome97', 'firefox104', 'safari15.4'];

/* esbuild plugin: each generated data file (src/data/*.json) goes into the bundle as `JSON.parse("...")`, not as the
   object literal esbuild writes for a JSON import, so the page loads data as data, as Node (and so the tests) does.
   Browsers parse JSON faster than the same object as JavaScript: 49 ms against 76 ms for the item database here, 204
   against 381 ms on a 4x slower CPU (docs/engineering/data-pipeline.md section 8, audit 16 R9). The text is compacted
   first (the files keep one row per line for readable diffs). The text is also exported (`text`), for the optimizer's
   worker (solverWorker): the page hands it the same strings instead of carrying a second copy of the data. */
const DATA_FILE = /[\\/]src[\\/]data[\\/][^\\/]+\.json$/;
const compactText = path => JSON.stringify(JSON.parse(readFileSync(path, 'utf8')));
export const jsonParseData = {
  name: 'json-parse-data',
  setup(build) {
    build.onLoad({ filter: DATA_FILE }, ({ path }) => ({
      contents: `export const text = ${JSON.stringify(compactText(path))};\nexport default JSON.parse(text);`,
      loader: 'js',
    }));
  },
};

/* The global the worker's data modules read their texts from, {file name: text}, set from the page's first message
   and deleted once the worker's modules have loaded (solverWorker). */
const WORKER_DATA_GLOBAL = '__solverData';

/* esbuild plugin for the worker bundle only: each data file is `JSON.parse` of the text the page posted (in
   self[WORKER_DATA_GLOBAL]), not a copy of it. `names` collects the file names the worker imports. */
function workerData(names) {
  return {
    name: 'worker-data',
    setup(build) {
      build.onLoad({ filter: DATA_FILE }, ({ path }) => {
        const name = basename(path);
        names.push(name);
        return { contents: `export default JSON.parse(self.${WORKER_DATA_GLOBAL}[${JSON.stringify(name)}]);`, loader: 'js' };
      });
    },
  };
}

/* esbuild plugin: the module `solver-worker:bundle` (imported by main.js) is the optimizer's Web Worker (audit 16 R8),
   bundled by its own esbuild build from src/ui/solver-worker.js. It exports
   - WORKER_SOURCE: the worker's code as a string, started by the page from a Blob URL (the page stays one file that
     opens from file://). The bundle is wrapped in the worker's first message handler: that message carries the data
     texts, which the bundle's data modules read while it loads (workerData).
   - WORKER_DATA: {file name: text} of each data file the worker imports, the same strings the page's own data modules
     parse (jsonParseData's `text`), so the page holds the data once; the worker parses its copy on its own thread.
   The worker's source files are watched too (npm run dev). */
export const solverWorker = {
  name: 'solver-worker',
  setup(build) {
    build.onResolve({ filter: /^solver-worker:bundle$/ }, ({ path }) => ({ path, namespace: 'solver-worker' }));
    build.onLoad({ filter: /.*/, namespace: 'solver-worker' }, async () => {
      // 1. the worker's own bundle, its data modules reading the posted texts
      const names = [];
      const result = await esbuild.build({
        entryPoints: [join(SRC, 'ui', 'solver-worker.js')],
        bundle: true,
        format: 'iife',
        target: BROWSER_TARGETS,
        minify: build.initialOptions.minify,
        legalComments: 'none',
        write: false,
        metafile: true,
        logLevel: 'warning',
        plugins: [workerData(names)],
      });

      // 2. wrapped to run on the first message (the data texts), after which the bundle's own handler takes the requests
      const bundle = result.outputFiles[0].text;
      const source =
        `self.onmessage = function (event) {\n'use strict';\nself.onmessage = null;\n` +
        `self.${WORKER_DATA_GLOBAL} = event.data.data;\n${bundle}\ndelete self.${WORKER_DATA_GLOBAL};\n};\n`;

      // 3. the module: the texts from the page's data modules, and the source
      const imports = names.map(
        // with the same import attribute as core/tables.js, or esbuild bundles the file a second time
        (name, i) => `import { text as text${i} } from ${JSON.stringify(join(SRC, 'data', name))} with { type: 'json' };`,
      );
      const data = names.map((name, i) => `${JSON.stringify(name)}: text${i}`).join(', ');
      return {
        contents: `${imports.join('\n')}\nexport const WORKER_DATA = { ${data} };\nexport const WORKER_SOURCE = ${JSON.stringify(source)};\n`,
        loader: 'js',
        resolveDir: SRC,
        watchFiles: Object.keys(result.metafile.inputs).map(input => resolve(input)), // relative to the working directory
      };
    });
  },
};

export function esbuildOptions({ minify = true } = {}) {
  return {
    plugins: [jsonParseData, solverWorker],
    entryPoints: [join(SRC, 'main.js')],
    bundle: true,
    format: 'iife',
    target: BROWSER_TARGETS,
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

/* The template with every `<!-- INCLUDE name.html key=value ... -->` line replaced by src/partials/name.html: each
   {{key}} in the partial becomes its value, the partial's leading comment (what it is and its keys) is dropped, and its
   lines take the marker's indentation. One copy of markup the page shows twice (the Expansion and "Gear from" menus of
   the optimizer and the browser). Throws on a missing partial or a {{key}} the marker does not give. */
export function expandIncludes(template, readPartial = name => readFileSync(join(PARTIALS, name), 'utf8')) {
  return template.replace(/^([ \t]*)<!-- INCLUDE (\S+)((?: [\w-]+=\S+)*) -->\r?$/gm, (_, indent, name, args) => {
    const values = Object.fromEntries(
      args
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map(arg => arg.split('=')),
    );
    const body = readPartial(name)
      .replace(/^<!--[\s\S]*?-->\r?\n/, '')
      .replace(/\{\{(\w+)\}\}/g, (__, key) => {
        if (!(key in values)) throw new Error(`${name}: no value for {{${key}}}`);
        return values[key];
      });
    return body
      .replace(/\r?\n$/, '')
      .split(/\r?\n/)
      .map(line => (line ? indent + line : line))
      .join('\n');
  });
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
  const template = expandIncludes(readFileSync(join(SRC, 'index.html'), 'utf8'));
  if (template.includes('<!-- INCLUDE')) throw new Error('src/index.html has an INCLUDE marker the build cannot read');
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
