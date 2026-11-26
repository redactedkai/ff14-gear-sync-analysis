#!/usr/bin/env node
/* Build the single-file page: bundle src/main.js (and the CSS it imports: src/styles/*.css) with esbuild,
   then inline both into src/index.html -> dist/index.html. The result opens straight from file://.

   Run from anywhere:  node scripts/build/build.mjs   (or: npm run build)
   scripts/build/dev.mjs reuses the exports below for watch + serve. */
import * as esbuild from 'esbuild';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ENTRY_FILE, STYLES_DIR } from './styles.mjs';
import { STORE_KEY } from '../../src/ui/store-key.ts';
import { UNLOAD_GUARD_OFF_KEY } from '../../src/ui/router/unload-guard.ts';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const SRC = join(ROOT, 'src');
export const DIST = join(ROOT, 'dist');

/* The oldest browsers the page runs in: the Baseline 2024 floor, the first version of each core browser that has every
   feature that became Baseline newly available in 2024 (Chrome and Edge 130, Firefox 132, Safari 18.2; from the
   baseline-browser-mapping package, getCompatibleVersions({ targetYear: 2024 }), which reads the web-features data; the
   package is not a dependency of this repo, so run it with npx to check the numbers).
   The page uses nothing newer. Naming the browsers instead of an ES version lets esbuild decide what to lower: at this
   floor it lowers no JS the page writes, and no CSS prefix or fallback is needed for the features the stylesheet uses
   (cascade layers, :has(), color-mix(), mask, the inherited ::backdrop variable). */
export const BROWSER_TARGETS = ['chrome130', 'firefox132', 'safari18.2'];

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
   bundled by its own esbuild build from src/ui/solver-worker.ts. It exports
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
        entryPoints: [join(SRC, 'ui', 'solver-worker.ts')],
        bundle: true,
        format: 'iife',
        target: BROWSER_TARGETS,
        minify: build.initialOptions.minify,
        legalComments: 'none', // the worker bundles no third-party code, so there is no notice to keep
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

      // 3. the module: the texts from the page's data modules, and the source.
      // Sorted, because `names` is filled in onLoad order, which esbuild does not keep stable between builds: the
      // page's bytes would otherwise differ for the same source (checked 2026-11-03, four hashes in five builds).
      names.sort();
      const imports = names.map(
        // with the same import attribute as core/tables.ts, or esbuild bundles the file a second time
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

/* esbuild plugin: the module `styles:bundle` (imported by main.js) is the page's stylesheet: src/styles/entry.css, which
   imports the files of src/styles/ in cascade order (esbuild bundles the imports and watches them in `npm run dev`). */
export const pageStyles = {
  name: 'page-styles',
  setup(build) {
    build.onResolve({ filter: /^styles:bundle$/ }, ({ path }) => ({ path, namespace: 'page-styles' }));
    build.onLoad({ filter: /.*/, namespace: 'page-styles' }, () => ({
      contents: `@import "./${ENTRY_FILE}";`,
      loader: 'css',
      resolveDir: STYLES_DIR,
    }));
  },
};

/* The bundled packages that carry no licence notice in their code, and the package whose LICENSE file holds the notice for
   each group (the packages of one group share it: `@zag-js/*` is one project, `@floating-ui/*` another). esbuild keeps the
   notices that are in the code (Lit's); the page's script ends with these as well. */
export const NOTICE_PACKAGES = [
  { name: 'Zag', licenseOf: '@zag-js/menu', bundles: /^@zag-js\// },
  { name: 'Floating UI', licenseOf: '@floating-ui/dom', bundles: /^@floating-ui\// },
  { name: 'proxy-compare', licenseOf: 'proxy-compare', bundles: /^proxy-compare$/ },
];

/* The text that ends the page's script: for each group of NOTICE_PACKAGES, its LICENSE file as it is in node_modules. */
export function bundledLicenseNotices() {
  const notices = NOTICE_PACKAGES.map(({ name, licenseOf }) => {
    const text = readFileSync(join(ROOT, 'node_modules', licenseOf, 'LICENSE'), 'utf8')
      .trim()
      .replaceAll('*/', '* /');
    return `${name} (${licenseOf})\n\n${text}`;
  });
  return `/*! Licence notices of bundled packages (MIT)\n\n${notices.join('\n\n---\n\n')}\n*/`;
}

/* The options of the page's esbuild build. `minify`: whether to minify; `info`: the branch and commit being built (buildInfo), which
   decide the marks of a test build (buildMarks), handed to the page's code as the constant `__BUILD_MARKS__`. */
export function esbuildOptions({ minify = true, info = buildInfo() } = {}) {
  return {
    plugins: [jsonParseData, solverWorker, pageStyles],
    entryPoints: [join(SRC, 'main.js')],
    bundle: true,
    format: 'iife',
    target: BROWSER_TARGETS,
    minify,
    legalComments: 'eof', // esbuild's default, named so a later edit does not drop the bundled notices
    footer: { js: bundledLicenseNotices() },
    define: { __BUILD_MARKS__: JSON.stringify(buildMarks(info)) },
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

/* What a build on this branch shows (CLAUDE.md, Branches): null on main or an unknown branch (the live page looks as it always
   has); on any other branch {label, where}: the "DEV" badge and the branch and commit for the footer, so a test build is never
   mistaken for the live one. The page's root element draws them (src/ui/build-marks.ts reads them from the constant esbuildOptions
   defines). */
export function buildMarks({ branch, commit }) {
  if (!branch || branch === 'main') {
    return null;
  }
  return { label: 'DEV', where: branch + (commit ? ` @ ${commit}` : '') };
}

/* The "failed to start" script (src/startup-failure.js) as the page inlines it: the saved-data key and the dev flag's key written
   over its markers (src/ui/store-key.ts and src/ui/router/unload-guard.ts, the places the keys are spelled), minified to ES5. Throws if the result would end the
   inline script early or is not ES5. The page puts it first in <head> (writePage, the STARTUP marker). */
export function startupScript() {
  const source = readFileSync(join(SRC, 'startup-failure.js'), 'utf8');
  for (const marker of ['@STORE_KEY@', '@UNLOAD_GUARD_OFF_KEY@']) {
    if (!source.includes(marker)) {
      throw new Error(`src/startup-failure.js has no ${marker} marker`);
    }
  }
  const code = esbuild.transformSync(
    source.replace('@STORE_KEY@', () => STORE_KEY).replace('@UNLOAD_GUARD_OFF_KEY@', () => UNLOAD_GUARD_OFF_KEY),
    { minify: true, target: 'es5', charset: 'utf8' },
  ).code;
  if (/<\/script/i.test(code)) {
    throw new Error('the startup script contains "</script", which would end the inline script early');
  }
  return code;
}

/* Inline the bundle outputs into the HTML template and write the page to `outFile` (dist/index.html by default).
   Returns the byte size. */
export function writePage(outputFiles, outFile = join(DIST, 'index.html')) {
  const pick = ext =>
    outputFiles
      .filter(f => f.path.endsWith(ext))
      .map(f => f.text)
      .join('\n');
  const js = pick('.js'),
    css = pick('.css');
  if (!js) {
    throw new Error('esbuild produced no JavaScript output');
  }
  if (/<\/script/i.test(js)) {
    throw new Error('bundle contains "</script", which would end the inline script early');
  }
  const template = readFileSync(join(SRC, 'index.html'), 'utf8');
  for (const marker of ['<!-- STARTUP -->', '<!-- STYLES -->', '<!-- SCRIPT -->']) {
    if (!template.includes(marker)) {
      throw new Error(`src/index.html is missing the ${marker} marker`);
    }
  }
  // function replacements, so "$&"-style sequences in the bundle are not treated as patterns
  const startup = startupScript();
  const html = template
    .replace('<!-- STARTUP -->', () => `<script>\n${startup}</script>`)
    .replace('<!-- STYLES -->', () => `<style>\n${css}</style>`)
    .replace('<!-- SCRIPT -->', () => `<script>\n${js}</script>`);
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, html, 'utf8');
  return Buffer.byteLength(html);
}

/* Build the page as the live one looks (no DEV badge or branch line, as on main) into `outFile`, leaving dist/ alone:
   for the screenshot script, whose shots must not differ between branches. Returns the byte size. */
export async function buildReleasePage(outFile) {
  const result = await esbuild.build(esbuildOptions({ info: { branch: null, commit: buildInfo().commit } }));
  return writePage(result.outputFiles, outFile);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const result = await esbuild.build(esbuildOptions());
  const size = writePage(result.outputFiles);
  const { branch } = buildInfo();
  const tag = branch && branch !== 'main' ? `, ${branch} build` : '';
  console.log(`Built dist/index.html (${(size / 1e6).toFixed(1)} MB${tag})`);
}
