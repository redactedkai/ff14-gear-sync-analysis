/* The build script (scripts/build/build.mjs): the DEV marks outside main, the page template, and the
   licence notices kept in the bundle. */
import { test } from 'node:test';
import * as esbuild from 'esbuild';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { readStyles } from '../../../scripts/build/styles.mjs';
import { buildMarks, esbuildOptions, SRC, startupScript } from '../../../scripts/build/build.mjs';

/* esbuild reads a .ts module imported with its .ts extension (which Node's type stripping needs too), strips the types
   and bundles it; the page's own text.ts and view-cache.ts are built this way. */
test('build: esbuild bundles a .ts module imported by its .ts extension, types stripped', async () => {
  const result = await esbuild.build({
    stdin: {
      contents:
        "import { plural } from './src/ui/text.ts';\nimport { viewCache } from './src/ui/view-cache.ts';\nglobalThis.out = [plural, viewCache];",
      resolveDir: fileURLToPath(new URL('../../../', import.meta.url)),
      loader: 'js',
    },
    bundle: true,
    write: false,
    format: 'esm',
  });
  const code = result.outputFiles[0].text;
  assert.match(code, /NumberFormat\("en-US"\)/, 'the body of text.ts is in the bundle');
  assert.doesNotMatch(code, /:\s*(number|string|unknown)\b/, 'no type annotation is left');
});

/* A build marks itself as a test build everywhere but main (CLAUDE.md, Branches); the marks are data the page's root element draws. */
test('build marks: none on main or an unknown branch; DEV elsewhere, with branch and commit', () => {
  assert.equal(buildMarks({ branch: 'main', commit: 'abc1234' }), null);
  assert.equal(buildMarks({ branch: null, commit: null }), null);
  assert.deepEqual(buildMarks({ branch: 'dev', commit: null }), { label: 'DEV', where: 'dev' });
  assert.deepEqual(buildMarks({ branch: 'feature/x', commit: 'f' }), { label: 'DEV', where: 'feature/x @ f' });
});

test('build: a test build carries its marks in the page code, the live build none', async () => {
  const script = async info => {
    const result = await esbuild.build(esbuildOptions({ info }));
    return result.outputFiles.find(file => file.path.endsWith('.js')).text;
  };
  assert.match(await script({ branch: 'dev', commit: 'abc1234' }), /dev @ abc1234/);
  assert.doesNotMatch(await script({ branch: 'main', commit: 'abc1234' }), /abc1234/);
});

/* src/index.html as the tests below read it: Biome formats the file (it breaks a long tag over lines and may put a `>` on a line of its
   own), so runs of white space become one space and a space before a `>` goes. The same text as the browser parses, for these checks. */
async function readTemplate() {
  const { readFile } = await import('node:fs/promises');
  const html = await readFile(new URL('../../../src/index.html', import.meta.url), 'utf8');
  return html.replace(/\s+/g, ' ').replace(/ >/g, '>');
}

/* Audit 13, finding 1: a render-blocking Google Fonts link held first paint until a stalled request gave up (8 s in a
   test). The link loads as print-only and switches to all once loaded; a <noscript> copy covers pages without JS. */
test('page template: the Google Fonts stylesheet does not block first paint', async () => {
  const html = await readTemplate();
  const head = html.slice(0, html.indexOf('</head>'));
  const links = [...head.matchAll(/<link[^>]*fonts\.googleapis\.com[^>]*>/g)].map(m => m[0]);
  const noscript = head.match(/<noscript>([\s\S]*?)<\/noscript>/)?.[1] ?? '';
  const outside = links.filter(link => !noscript.includes(link));
  assert.equal(outside.length, 1, 'one fonts link outside <noscript>');
  assert.match(outside[0], /media="print"/);
  assert.match(outside[0], /onload="this\.media='all'"/);
  assert.match(noscript, /<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com/);
  // audit 12, finding 7: no referrer, so Google is not told which page loaded the fonts
  for (const link of links) {
    assert.match(link, /referrerpolicy="no-referrer"/);
  }
});

/* The page painted half-built for a moment on every load (owner's report): the app script is the last thing in the file, and the
   browser paints the markup above it while still reading it. The body holds the page as one empty element, <gsa-app class="wrap">,
   which the startup script keeps unpainted until the check has run (the boot shell shows meanwhile), so nothing of the page
   can show half-built. checkFirstPaint (tests/e2e/checks/settings/first-paint.mjs) watches the frames themselves. */
test('page template: the body is the boot shell and one empty page root, nothing else', async () => {
  const html = await readTemplate();
  const css = readStyles();
  const body = html.slice(html.indexOf('<body>') + '<body>'.length, html.indexOf('<!-- SCRIPT -->'));
  // the <noscript> line (JavaScript off) and the boot shell (#boot: static, hidden by the stylesheet unless the startup script
  // shows it, with no data-tab) are the only things beside the root
  const noComments = body
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<noscript>[\s\S]*?<\/noscript>/, '')
    .trim();
  const shell = noComments.match(/^<div class="boot" id="boot"[\s\S]*?(?=<gsa-app )/)?.[0] ?? '';
  assert.ok(shell, 'the boot shell comes first');
  assert.ok(!/data-tab|role="tab"/.test(shell), 'the boot shell has no tab links of the page');
  assert.match(css, /\.boot\s*\{\s*display:\s*none;?\s*\}/, 'the boot shell is hidden unless the startup script shows it');
  assert.equal(noComments.slice(shell.length), '<gsa-app class="wrap"></gsa-app>', 'the page root is empty: its element draws the page');
});

/* The bundled libraries' MIT notices reach the page through esbuild's legalComments: 'eof', which moves the legal
   comments found in the bundled code to the end of the script (Lit's). */
test('build keeps the MIT notices found in the bundled code', async () => {
  const { build } = await import('esbuild');
  const result = await build(esbuildOptions());
  const script = result.outputFiles.find(f => f.path.endsWith('.js')).text;
  assert.match(script, /Bundled license information/);
  assert.match(script, /SPDX-License-Identifier: BSD-3-Clause/);
});

/* Audit 16, R9 (owner, 2026-10-19): the data files reach the page as JSON.parse of one string each, not as an object
   literal, and parse to exactly what the files hold. */
test('build loads each data file as JSON.parse of its compacted text, equal to the file', async () => {
  const { build } = await import('esbuild');
  const { readFileSync, readdirSync } = await import('node:fs');
  const { join } = await import('node:path');
  const dataDir = join(SRC, 'data');
  const files = readdirSync(dataDir).filter(name => name.endsWith('.json'));
  const imports = files.map((name, i) => `import d${i} from './${name}' with { type: 'json' };`);
  const result = await build({
    stdin: {
      contents: `${imports.join('\n')}\nglobalThis.__data = [${files.map((_, i) => `d${i}`).join(',')}];`,
      resolveDir: dataDir,
      loader: 'js',
    },
    bundle: true,
    format: 'iife',
    plugins: esbuildOptions().plugins,
    write: false,
    logLevel: 'error',
  });
  const script = result.outputFiles[0].text;
  assert.equal(script.match(/JSON\.parse\(/g)?.length, files.length);
  const sandbox = {};
  new Function('globalThis', script)(sandbox);
  files.forEach((name, i) => {
    assert.deepEqual(sandbox.__data[i], JSON.parse(readFileSync(join(dataDir, name), 'utf8')), name);
  });
});

/* The page's bytes must not change between builds of the same source: the worker's data module lists its files in the
   order esbuild's onLoad callbacks ran, which is not stable, so the list is sorted before use. Five
   builds of one tree gave four different hashes, differing only in WORKER_DATA's key order. */
test('build: two builds of the same source give the same page', async () => {
  const { build } = await import('esbuild');
  const page = async () => {
    const result = await build(esbuildOptions());
    return result.outputFiles
      .filter(f => f.path.endsWith('.js'))
      .map(f => f.text)
      .join('\n');
  };
  const first = await page();
  assert.equal(await page(), first);
  assert.match(first, /"food\.json":/); // the worker's data map is there, in a fixed order
});

/* The page's size is a feature: it is opened from disk and parsed on every load, and the item database is most of it.
   A ceiling catches a careless import (a whole icon set, an unshaken library) that would otherwise ship unnoticed.
   The ceiling is 5 MB because the item database is most of the page and the rest (the app, Lit, Zag) is small next to it,
   so 5 MB leaves room for new widgets but not for a second large library. Raise it deliberately, with a reason. */
test('build: the page stays under its size ceiling', async () => {
  const { build } = await import('esbuild');
  const result = await build(esbuildOptions());
  const bytes = result.outputFiles.reduce((total, file) => total + file.text.length, 0);
  assert.ok(bytes < 5_000_000, `page is ${bytes} bytes, over the 5 MB ceiling`);
});

/* Audit 16 R8 (owner, 2026-10-19): the optimizer's worker. Its bundle, built as the page builds it, runs here with a
   stand-in for the worker's `self`: the first message hands it the data texts (the page's own strings, bundled once),
   then it answers each request as the page thread's solver does. */
test('build: the solver worker loads from the posted data texts and answers like the page thread', async () => {
  const { build } = await import('esbuild');
  const { readFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const result = await build({
    stdin: {
      // the page's data modules imported too, as core/tables.ts does: the worker's texts must be the same strings
      contents: [
        "import { WORKER_DATA, WORKER_SOURCE } from 'solver-worker:bundle';",
        "import { ITEMS } from './core/tables.ts';",
        'globalThis.__worker = { WORKER_DATA, WORKER_SOURCE, items: ITEMS.length };',
      ].join('\n'),
      resolveDir: SRC,
      loader: 'js',
    },
    bundle: true,
    format: 'iife',
    plugins: esbuildOptions().plugins,
    write: false,
    logLevel: 'error',
  });
  const script = result.outputFiles[0].text;
  const sandbox = {};
  new Function('globalThis', script)(sandbox);
  const { WORKER_DATA, WORKER_SOURCE } = sandbox.__worker;
  assert.ok(sandbox.__worker.items > 0);
  assert.ok('items.json' in WORKER_DATA && 'item-level.json' in WORKER_DATA);

  // the item database is in the script once: the worker's copy is the page's string, not a second literal
  const items = JSON.stringify(JSON.parse(readFileSync(join(SRC, 'data', 'items.json'), 'utf8')));
  assert.equal(WORKER_DATA['items.json'], items);
  // twice the database would make the script over twice its size (it was 5.6 MB when the attributes differed)
  assert.ok(script.length < items.length * 1.5, `${script.length} bytes for ${items.length} of items`);

  // the worker: loads on the first message, then answers requests tagged with their ids
  const posted = [];
  const self = { postMessage: message => posted.push(structuredClone(message)) };
  new Function('self', WORKER_SOURCE)(self);
  self.onmessage({ data: { data: structuredClone(WORKER_DATA) } });
  assert.equal(self.__solverData, undefined, 'the texts are let go once loaded');
  const { inProcessSolver, solverRequest } = await import('../../../src/ui/solver.js');
  const { inputsOf, makeApp } = await import('../helpers/views.js');
  const app = makeApp('WHM', { cap: 200, level: 100 });
  app.recipe.food = true;
  const inputs = inputsOf(app);
  // pool items' own ids ('i1552') count the items built in their thread, so they differ between the two
  const withoutPoolIds = view =>
    JSON.parse(JSON.stringify(view, (key, value) => (key === 'id' && /^i\d+$/.test(value) ? undefined : value)));
  for (const kind of ['gearToSearch', 'solve']) {
    const request = solverRequest(kind, inputs);
    self.onmessage({ data: structuredClone({ id: 7, ...request }) });
    const reply = posted.pop();
    assert.equal(reply.id, 7);
    const local = (await inProcessSolver().request(request)).result;
    assert.deepEqual(withoutPoolIds(reply.result), withoutPoolIds(local), kind);
  }
});

/* The "failed to start" script (src/startup-failure.js): first in <head> of the built page, before the big <style>, as one
   classic script that cannot end early, with the saved-data key written once (src/ui/store-key.js). */
test('built page: the startup script is first in head, before the style, and holds no closing script tag', async () => {
  const { readFile } = await import('node:fs/promises');
  const html = await readFile(new URL('../../../dist/index.html', import.meta.url), 'utf8');
  const open = html.indexOf('<script>');
  const close = html.indexOf('</script>');
  assert.ok(open > 0 && open < html.indexOf('<style>'), 'the first script comes before the first <style>');
  assert.ok(open < html.indexOf('<link'), 'and before the fonts link');
  assert.equal(html.slice(html.indexOf('<head>'), open).replace(/<meta[^>]*>|\s/g, ''), '<head>', 'only meta tags before it');
  const script = html.slice(open + '<script>'.length, close);
  assert.ok(script.includes('startfail'), 'it is the startup script');
  assert.ok(!/<\/script/i.test(script));
  assert.ok(script.length < 5000, `${script.length} bytes`);
});

test('startupScript: the key comes from STORE_KEY, the code is ES5 with no literal color and no leftover marker', async () => {
  const { STORE_KEY } = await import('../../../src/ui/store-key.js');
  const code = startupScript();
  const { UNLOAD_GUARD_OFF_KEY } = await import('../../../src/ui/router/unload-guard.js');
  assert.ok(code.includes(JSON.stringify(STORE_KEY)));
  assert.ok(code.includes(JSON.stringify(UNLOAD_GUARD_OFF_KEY)), 'the dev flag is named, so the reset leaves it out');
  assert.ok(!code.includes('@STORE_KEY@') && !code.includes('@UNLOAD_GUARD_OFF_KEY@'));
  esbuild.transformSync(code, { target: 'es5' }); // throws on syntax newer than ES5
  assert.deepEqual(code.match(/#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(/gi), null, 'system colors only');
});
