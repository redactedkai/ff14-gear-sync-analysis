/* The page root (src/ui/components/page.js), bound to a plain store as Alpine binds it: the footer, what the Job and sync strip is
   given, and the tab links. The strip's fields are checked in ui/views/cap-field.test.js and ui/elements/app/cap-follow.test.js. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_REAL, dataSourceLabel } from '../../../../src/core/tables.js';
import { page } from '../../../../src/ui/components/page.js';

import { restoreOpen } from '../../helpers/common.js';
import { createAppFacade } from '../../helpers/stores.js';

test('page: the footer names the data source', () => {
  assert.equal(page().dataSource, dataSourceLabel());
});

test("the Job and sync strip is given the Gear browser's own panel, whichever tab is open", () => {
  const app = createAppFacade(
    restoreOpen({ tab: 'math', job: 'BLU', cap: 300, sync: true, level: 70, piece: { job: 'SGE', cap: 123, sync: false, level: 90 } }),
  );
  const browse = app.panel('browse');
  const strip = Object.assign(page(), { $store: { app } }).stripInput;
  assert.deepEqual(
    [strip.job, strip.level, strip.cap, strip.sync, strip.maxLevel, strip.maxReal, strip.tab],
    [browse.job, browse.level, browse.cap, Boolean(browse.sync), browse.jobCtx.maxLevel, MAX_REAL, 'math'],
  );
  assert.notEqual(strip.job, app.panel('math').job, "not the open tab's job");
});

/* A plain click on a tab link (plain-click.js). */
const plain = { button: 0, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, preventDefault() {} };

/* A tab link (goTab): leaving the Sheets tab asks the set page first (ui/store/sheets-actions.ts askLeave); the answer opens the
   tab. Other tabs switch at once. */
test('goTab: leaving the Sheets tab with something to settle asks first; the answer opens the tab', async () => {
  const frames = globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame = fn => fn(); // the tab opens after one frame: here at once
  const settled = () => new Promise(resolve => setTimeout(resolve, 5));
  const app = createAppFacade(restoreOpen({ tab: 'sheets' }));
  let pending = null;
  let settle = true;
  const sheets = {
    askLeave: move => {
      if (!settle) {
        return false;
      }
      pending = move;
      return true;
    },
  };
  const c = Object.assign(page(), { $store: { app, sheets } });
  c.goTab('browse', plain);
  assert.equal(app.tab, 'sheets', 'the question is open: the tab stays');
  pending();
  assert.equal(app.pendingTab, 'browse', 'the tab is marked while it opens');
  await settled();
  assert.deepEqual([app.tab, app.pendingTab], ['browse', null], 'the answer opens the tab and clears the mark');
  // nothing to settle: at once
  app.showTab('sheets');
  settle = false;
  c.goTab('math', plain);
  await settled();
  assert.equal(app.tab, 'math');
  // from another tab nothing is asked
  settle = true;
  pending = null;
  c.goTab('browse', plain);
  await settled();
  assert.deepEqual([app.tab, pending], ['browse', null]);
  // the tab already open (or opening) does nothing
  c.goTab('browse', plain);
  assert.equal(app.pendingTab, null);
  // a Ctrl click is the browser's: the page does not move
  c.goTab('math', { ...plain, ctrlKey: true });
  assert.equal(app.pendingTab, null);
  globalThis.requestAnimationFrame = frames;
});
