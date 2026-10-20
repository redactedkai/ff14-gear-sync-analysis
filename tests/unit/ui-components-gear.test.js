/* The gear browser's component (src/ui/components/gear.js), bound to a plain store as Alpine binds it: its view built
   only while the tab is open and only when its inputs change, the sort headings and Reset filters. What the list shows
   is checked in ui-views-gear.test.js. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gear } from '../../src/ui/components/gear.js';
import { syncSettings } from '../../src/ui/settings.js';
import { defaultBrowse, restoreState } from '../../src/ui/state.js';
import { createAppStore } from '../../src/ui/store.js';
import { gearView } from '../../src/ui/views/gear.js';

/* The component bound to the store of `saved`, as Alpine binds it ($store.app). */
function bound(saved = { job: 'SGE', tab: 'browse', sync: true, cap: 123 }) {
  const app = createAppStore(restoreState(saved));
  return { app, c: Object.assign(gear(), { $store: { app } }) };
}

test('gear browser: the view is the list for the settings now, built once per change, kept while the tab is hidden', () => {
  const { app, c } = bound({ job: 'SGE', tab: 'opt', sync: true, cap: 123 });
  // not built before the tab is first opened
  assert.equal(c.view, null);
  app.showTab('browse');
  const first = c.view;
  assert.deepEqual(first, gearView(app.jobCtx, syncSettings(app), app.browse));
  assert.equal(c.view, first, 'the same settings: the same view, not built again');
  assert.equal(c.emptyBoxes, first.emptyBoxes);
  // a filter changes: a new list
  app.browse.q = 'ring';
  const ring = c.view;
  assert.notEqual(ring, first);
  assert.ok(ring.shown.every(x => /ring/i.test(x.name)));
  // hidden, the tab keeps its last list whatever changes; shown again, it follows the settings
  app.showTab('opt');
  app.browse.q = 'bracelet';
  assert.equal(c.view, ring);
  app.showTab('browse');
  assert.ok(c.view.shown.every(x => /bracelet/i.test(x.name)));
  // the sync settings and the job are inputs too
  const before = c.view;
  app.cap = 300;
  assert.notEqual(c.view, before);
  app.setJob('WAR');
  assert.ok(c.view.shown.every(x => x.cells.length === app.jobCtx.stats.length));
});

test('gear browser: a heading sorts high first (names A to Z), again flips; Reset filters keeps the sort', () => {
  const { app, c } = bound();
  c.sortBy('crit');
  assert.deepEqual([app.browse.sort, app.browse.dir, c.sortState('crit'), c.sortState('ilvl')], ['crit', 'desc', 'descending', 'none']);
  c.sortBy('crit');
  assert.deepEqual([app.browse.dir, c.sortState('crit')], ['asc', 'ascending']);
  c.sortBy('name');
  assert.deepEqual([app.browse.sort, app.browse.dir], ['name', 'asc']);
  assert.equal(c.filtered, false);
  Object.assign(app.browse, { q: 'ward', min: 100, type: 'ring' });
  assert.equal(c.filtered, true);
  c.resetBrowseFilters();
  const { sort, dir, ...filters } = defaultBrowse(app.jobCtx);
  for (const [field, value] of Object.entries(filters)) assert.deepEqual(app.browse[field], value, field);
  assert.deepEqual([app.browse.sort, app.browse.dir], ['name', 'asc']);
  assert.equal(c.filtered, false);
});

test('gear browser: "/" jumps to the search box, but not from inside another box or on another tab', () => {
  const { app, c } = bound();
  let focused = 0,
    prevented = 0;
  c.$refs = { search: { focus: () => focused++ } };
  const key = (k, inBox = false) => ({ key: k, target: { closest: () => inBox }, preventDefault: () => prevented++ });
  c.slashToSearch(key('/'));
  c.slashToSearch(key('a'));
  c.slashToSearch(key('/', true));
  app.showTab('opt');
  c.slashToSearch(key('/'));
  assert.deepEqual([focused, prevented], [1, 1]);
});
