import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMarks, esbuildOptions, expandIncludes } from '../../scripts/build/build.mjs';

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
});

/* The bundled libraries' MIT notices reach the page (their own comments are stripped by legalComments: 'none'). */
test('build keeps the MIT notices of Alpine.js and @vue/reactivity', () => {
  const banner = esbuildOptions().banner.js;
  assert.match(banner, /^\/\*!/);
  assert.match(banner, /MIT/);
  assert.match(banner, /Alpine\.js, \(c\) 2019-present Caleb Porzio/);
  assert.match(banner, /@vue\/reactivity.*Evan\) You/);
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
