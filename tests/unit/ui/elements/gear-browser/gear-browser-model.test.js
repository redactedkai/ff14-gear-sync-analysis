/* What the Gear browser works out with no DOM (src/ui/elements/gear-browser/gear-browser-model.ts): its list built once per change
   and only while its tab is open, the page line, the sort headings, Reset filters and the "/" key. What the list shows is
   checked in ui/views/gear.test.js; the table's rows in the smoke step checkBrowserRowsMatchView. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  GearBrowserModel,
  resetPatch,
  sortPatch,
  sortState,
  wantsSearchFocus,
} from '../../../../../src/ui/elements/gear-browser/gear-browser-model.ts';
import { syncSettings } from '../../../../../src/ui/job-sync-panel.ts';
import { defaultBrowse } from '../../../../../src/ui/state.ts';
import { gearView } from '../../../../../src/ui/views/gear.ts';
import { restoreOpen } from '../../../helpers/common.js';
import { createAppFacade } from '../../../helpers/stores.js';

/* The store of `saved` and a model reading it the way the element does: `list()` is the model's list for the store now. */
function bound(saved = { job: 'SGE', tab: 'browse', sync: true, cap: 123 }) {
  const app = createAppFacade(restoreOpen(saved));
  const model = new GearBrowserModel();
  const list = () => model.view(app.panel('browse'), app.browse, app.tab === 'browse');
  return { app, model, list };
}

test('gear browser: the list is the one for the settings now, built once per change, kept while the tab is hidden', () => {
  const { app, list } = bound({ job: 'SGE', tab: 'opt', sync: true, cap: 123 });
  // not built before the tab is first opened
  assert.equal(list(), null);
  app.showTab('browse');
  const first = list();
  assert.deepEqual(first, gearView(app.jobCtx, syncSettings(app), app.browse));
  assert.equal(list(), first, 'the same settings: the same list, not built again');
  // a filter changes: a new list
  app.editBrowse({ q: 'ring' });
  const ring = list();
  assert.notEqual(ring, first);
  assert.ok(ring.shown.every(x => /ring/i.test(x.name)));
  // hidden, the tab keeps its last list whatever changes; shown again, it follows the settings
  app.showTab('opt');
  app.editBrowse({ q: 'bracelet' });
  assert.equal(list(), ring);
  app.showTab('browse');
  assert.ok(list().shown.every(x => /bracelet/i.test(x.name)));
  // the sync settings and the job are inputs too
  const before = list();
  app.editPanel({ cap: 300 });
  assert.notEqual(list(), before);
  app.setJob('WAR');
  assert.ok(list().shown.every(x => x.cells.length === app.jobCtx.stats.length));
});

test('gear browser: a heading sorts high first (names A to Z), again flips; Reset filters keeps the sort', () => {
  const { app } = bound();
  const heading = key => app.editBrowse(sortPatch(app.browse, key));
  heading('crit');
  assert.deepEqual(
    [app.browse.sort, app.browse.dir, sortState(app.browse, 'crit'), sortState(app.browse, 'ilvl')],
    ['crit', 'desc', 'descending', 'none'],
  );
  heading('crit');
  assert.deepEqual([app.browse.dir, sortState(app.browse, 'crit')], ['asc', 'ascending']);
  heading('name');
  assert.deepEqual([app.browse.sort, app.browse.dir], ['name', 'asc']);
  assert.equal(GearBrowserModel.filtered(app.panel('browse'), app.browse), false);
  app.editBrowse({ q: 'ward', min: 100, type: 'ring' });
  assert.equal(GearBrowserModel.filtered(app.panel('browse'), app.browse), true);
  app.editBrowse(resetPatch(app.jobCtx));
  const { sort, dir, ...filters } = defaultBrowse(app.jobCtx);
  for (const [field, value] of Object.entries(filters)) {
    assert.deepEqual(app.browse[field], value, field);
  }
  assert.deepEqual([app.browse.sort, app.browse.dir], ['name', 'asc']);
  assert.equal(GearBrowserModel.filtered(app.panel('browse'), app.browse), false);
});

test('gear browser: "/" jumps to the search box, but not from inside another box or on another tab', () => {
  const key = (k, inBox = false) => ({ key: k, target: { closest: () => inBox } });
  assert.equal(wantsSearchFocus(key('/'), true), true);
  assert.equal(wantsSearchFocus(key('a'), true), false);
  assert.equal(wantsSearchFocus(key('/', true), true), false);
  assert.equal(wantsSearchFocus(key('/'), false), false);
});

/* The page line (owner's pick P1 a): a page button shows its page; any change to the list (filter, search, slot, sort, job,
   level, sync) goes back to page 1, also when the old setting comes back; the page is not saved. */
test('gear browser: any change to the list goes back to page 1, also when the old setting comes back', () => {
  const { app, model, list } = bound({ job: 'SGE', tab: 'browse', level: 100 });
  list();
  model.goPage(9);
  assert.equal(list().page, 9);
  const changes = [
    () => app.editBrowse({ type: 'head' }),
    () => app.editBrowse({ q: 'healing' }),
    () => app.editBrowse({ min: 300 }),
    () => app.editBrowse(sortPatch(app.browse, 'crit')),
    () => app.editPanel({ level: 90 }),
    () => app.editPanel({ sync: true, cap: 375 }),
    () => app.setJob('WHM'),
  ];
  for (const change of changes) {
    model.goPage(2);
    assert.equal(list().page, 2);
    change();
    assert.equal(list().page, 1, String(change));
  }
  // back to the sort the page was picked under: still page 1
  model.goPage(2);
  app.editBrowse(sortPatch(app.browse, 'det'));
  list();
  app.editBrowse(sortPatch(app.browse, 'crit'));
  assert.equal(list().page, 1);
  assert.ok(!('page' in app) && !JSON.stringify(app.browse).includes('page'), 'the page is not in the saved state');
});
