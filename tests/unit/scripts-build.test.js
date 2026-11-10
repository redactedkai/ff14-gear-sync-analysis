/* The build script (scripts/build/build.mjs): the DEV marks outside main, the page template and its partials, and the
   licence notices kept in the bundle. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMarks, esbuildOptions, expandIncludes, SRC } from '../../scripts/build/build.mjs';

/* A build marks itself as a test build everywhere but main (CLAUDE.md, Branches). */
test('build marks: none on main or an unknown branch; DEV elsewhere, with branch and commit', () => {
  assert.deepEqual(buildMarks({ branch: 'main', commit: 'abc1234' }), { badge: '', footer: '' });
  assert.deepEqual(buildMarks({ branch: null, commit: null }), { badge: '', footer: '' });
  const dev = buildMarks({ branch: 'dev', commit: null });
  assert.match(dev.badge, />DEV</);
  assert.match(dev.footer, /DEV build: dev</);
  assert.match(buildMarks({ branch: 'feature/<x>', commit: 'f' }).footer, /feature\/&#60;x&#62;/); // escaped
});

/* Audit 13, finding 1: a render-blocking Google Fonts link held first paint until a stalled request gave up (8 s in a
   test). The link loads as print-only and switches to all once loaded; a <noscript> copy covers pages without JS. */
test('page template: the Google Fonts stylesheet does not block first paint', async () => {
  const { readFile } = await import('node:fs/promises');
  const html = await readFile(new URL('../../src/index.html', import.meta.url), 'utf8');
  const head = html.slice(0, html.indexOf('</head>'));
  const links = [...head.matchAll(/<link[^>]*fonts\.googleapis\.com[^>]*>/g)].map(m => m[0]);
  const noscript = head.match(/<noscript>([\s\S]*?)<\/noscript>/)?.[1] ?? '';
  const outside = links.filter(link => !noscript.includes(link));
  assert.equal(outside.length, 1, 'one fonts link outside <noscript>');
  assert.match(outside[0], /media="print"/);
  assert.match(outside[0], /onload="this\.media='all'"/);
  assert.match(noscript, /<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com/);
  // audit 12, finding 7: no referrer, so Google is not told which page loaded the fonts
  for (const link of links) assert.match(link, /referrerpolicy="no-referrer"/);
});

/* The page painted half-built for a moment on every load (owner's report): the script is the last thing in the file, and
   the browser paints the markup above it while still reading it, before Alpine runs. An x-show shows its element until
   Alpine evaluates it, so the Job and sync panel (x-show: not on the Sheets tab) showed, empty, with the tab bar and no
   tab. The page root carries x-cloak (hidden by styles.css until Alpine removes it) and holds every element of the
   body, so no x-show, tab-dependent or not, can show before Alpine. tests/e2e/smoke.mjs checkFirstPaint watches the
   frames themselves. */
test('page template: nothing paints before Alpine has built it', async () => {
  const { readFile } = await import('node:fs/promises');
  const html = expandIncludes(await readFile(new URL('../../src/index.html', import.meta.url), 'utf8'));
  const css = await readFile(new URL('../../src/styles.css', import.meta.url), 'utf8');
  assert.match(css, /\[x-cloak\]\s*\{\s*display:\s*none\s*!important;?\s*\}/);
  const body = html.slice(html.indexOf('<body>') + '<body>'.length, html.indexOf('<!-- SCRIPT -->'));
  const noComments = body.replace(/<!--[\s\S]*?-->/g, '').trim();
  const root = noComments.match(/^<div class="wrap"[^>]*>/)?.[0];
  assert.ok(root, 'the body starts with the page root');
  assert.match(root, /\sx-cloak[\s>]/, 'the page root is cloaked');
  assert.ok(noComments.endsWith('</div>'), 'nothing after the page root');
  // the root's own closing tag ends the body: every <div> opened in it is closed before the end
  let depth = 0;
  for (const tag of noComments.matchAll(/<(\/?)div\b/g)) {
    depth += tag[1] ? -1 : 1;
    if (depth === 0) assert.equal(tag.index + '</div>'.length, noComments.length, 'the page root closes before the end of the body');
  }
  // the tab-dependent bindings are all inside it (the Job and sync panel among them)
  assert.ok(body.includes(`x-show="$store.app.tab !== 'sheets'"`));
});

/* The bundled libraries' MIT notices reach the page through esbuild's legalComments: 'eof', which moves the legal
   comments found in the bundled code to the end of the script. Alpine ships no notice of its own, so none is invented
   for it; the page credits the project in its footer instead (src/index.html). */
test('build keeps the MIT notices found in the bundled code', async () => {
  const { build } = await import('esbuild');
  const result = await build(esbuildOptions());
  const script = result.outputFiles.find(f => f.path.endsWith('.js')).text;
  assert.match(script, /Bundled license information/);
  assert.match(script, /@vue\/reactivity.*Evan\) You/s);
  assert.match(script, /@vue\/shared.*Evan\) You/s);
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

/* Audit 02, finding 3: the Expansion and "Gear from" menus were copied in index.html for the optimizer and the
   browser. One partial each now, filled in at build time with the tab's id prefix and store part. */
test('build includes: a partial is filled in, indented like its marker, its leading comment dropped', () => {
  const partials = { 'm.html': '<!-- about m: {{id}} -->\n<div id="{{id}}-x">\n  <i x-text="$store.app.{{part}}.q"></i>\n</div>\n' };
  const out = expandIncludes('<p>\n    <!-- INCLUDE m.html id=o part=opt -->\n</p>', name => partials[name]);
  assert.equal(out, '<p>\n    <div id="o-x">\n      <i x-text="$store.app.opt.q"></i>\n    </div>\n</p>');
  assert.throws(() => expandIncludes('<!-- INCLUDE m.html id=o -->', name => partials[name]), /no value for \{\{part\}\}/);
});

/* A13: a partial may include partials (the set page holds the two filter menus); a loop or a deep chain stops the build. */
test('build includes: a partial can include another, keeping the indentation; a cycle or too deep a chain throws', () => {
  const including = name => `<!-- a partial that includes ${name} -->\n<!-- INCLUDE ${name} -->\n`;
  const partials = {
    'outer.html': '<!-- outer -->\n<section>\n  <!-- INCLUDE inner.html id={{id}} -->\n</section>\n',
    'inner.html': '<!-- inner -->\n<b id="{{id}}">\n  x\n</b>\n',
    'a.html': including('b.html'),
    'b.html': including('a.html'),
    'd1.html': including('d2.html'),
    'd2.html': including('d3.html'),
    'd3.html': including('d4.html'),
    'd4.html': including('leaf.html'),
    'leaf.html': '<i></i>\n',
  };
  const read = name => partials[name];
  assert.equal(
    expandIncludes('<div>\n  <!-- INCLUDE outer.html id=q -->\n</div>', read),
    '<div>\n  <section>\n    <b id="q">\n      x\n    </b>\n  </section>\n</div>',
  );
  assert.throws(() => expandIncludes('<!-- INCLUDE a.html -->', read), /includes itself/);
  assert.throws(() => expandIncludes('<!-- INCLUDE d1.html -->', read), /nest deeper than 3/);
  assert.equal(expandIncludes('<!-- INCLUDE d3.html -->', read), '<i></i>');
});

test('page template: the browser and a set page take their filter menus from the partials', async () => {
  const { readFile } = await import('node:fs/promises');
  const html = await readFile(new URL('../../src/index.html', import.meta.url), 'utf8');
  const page = expandIncludes(html);
  for (const id of ['b', 's']) {
    for (const el of [`${id}-exp-menu`, `${id}-from-menu`, `${id}-market`, `${id}-from-desc`]) assert.match(page, new RegExp(`id="${el}"`));
  }
  // the market switch goes through the component's own accessor (helpers.js gearFromToggles), never the store directly
  assert.match(page, /@change="setMarket\(\$event\.target\.checked\)"/);
  assert.doesNotMatch(page, /\$store\.app\.\w+\.market = /);
  assert.doesNotMatch(page, /\{\{|INCLUDE/);
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
   Raise it deliberately, with a reason. Current output is about 3.07 MB; the ceiling leaves room to grow. */
test('build: the page stays under its size ceiling', async () => {
  const { build } = await import('esbuild');
  const result = await build(esbuildOptions());
  const bytes = result.outputFiles.reduce((total, file) => total + file.text.length, 0);
  assert.ok(bytes < 4_000_000, `page is ${bytes} bytes, over the 4 MB ceiling`);
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
      // the page's data modules imported too, as core/tables.js does: the worker's texts must be the same strings
      contents: [
        "import { WORKER_DATA, WORKER_SOURCE } from 'solver-worker:bundle';",
        "import { ITEMS } from './core/tables.js';",
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
  const { inProcessSolver, solverRequest } = await import('../../src/ui/solver.js');
  const { inputsOf, makeApp } = await import('./helpers/views.js');
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
