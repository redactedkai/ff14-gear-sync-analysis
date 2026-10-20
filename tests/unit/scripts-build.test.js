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

/* The bundled libraries' MIT notices reach the page (their own comments are stripped by legalComments: 'none'). */
test('build keeps the MIT notices of Alpine.js and @vue/reactivity', () => {
  const banner = esbuildOptions().banner.js;
  assert.match(banner, /^\/\*!/);
  assert.match(banner, /MIT/);
  assert.match(banner, /Alpine\.js, \(c\) 2019-present Caleb Porzio/);
  assert.match(banner, /@vue\/reactivity.*Evan\) You/);
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

test('page template: both tabs take their filter menus from the partials', async () => {
  const { readFile } = await import('node:fs/promises');
  const html = await readFile(new URL('../../src/index.html', import.meta.url), 'utf8');
  const page = expandIncludes(html);
  for (const id of ['o', 'b']) {
    for (const el of [`${id}-exp-menu`, `${id}-from-menu`, `${id}-market`, `${id}-from-desc`]) assert.match(page, new RegExp(`id="${el}"`));
  }
  assert.match(page, /\$store\.app\.opt\.market = /);
  assert.match(page, /\$store\.app\.browse\.market = /);
  assert.doesNotMatch(page, /\{\{|INCLUDE/);
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
  const { optimizerInputs } = await import('../../src/ui/settings.js');
  const { restoreState } = await import('../../src/ui/state.js');
  const { createAppStore } = await import('../../src/ui/store.js');
  const inputs = optimizerInputs(createAppStore(restoreState({ job: 'WHM', sync: true, cap: 200, level: 100, opt: { food: true } })));
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
