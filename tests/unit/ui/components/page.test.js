/* The page root and the job and sync strip (src/ui/components/page.js), bound to a plain store as Alpine binds
   them: the job menu's rows and its open state, the cap field's error and the note after the page lowers the cap, and Reset to
   defaults asking first. Whether a cap is lowered (limitCapToLevel) is checked in ui/level-cap.test.js. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JOBS, JOB_ROWS } from '../../../../src/core/constants.js';
import { dataSourceLabel, MAX_REAL } from '../../../../src/core/tables.js';
import { page, settings } from '../../../../src/ui/components/page.js';

import { capLoweredText } from '../../../../src/ui/level-cap.js';
import { restoreOpen } from '../../helpers/common.js';
import { createAppFacade } from '../../helpers/stores.js';

/* The settings panel bound to a store of `saved` (on the Gear browser unless it says otherwise), with a stand-in for the cap field (its flash class). */
function panel(saved) {
  const app = createAppFacade(restoreOpen({ tab: 'browse', ...saved }));
  const classes = new Set();
  const cap = { classList: { add: c => classes.add(c), remove: c => classes.delete(c) }, offsetWidth: 0 };
  const c = Object.assign(settings(), { $store: { app }, $refs: { cap, jobButton: { focus() {} } }, $nextTick: fn => fn() });
  return { app, c, classes };
}

test('page: the footer names the data source', () => {
  assert.equal(page().dataSource, dataSourceLabel());
});

test('job picker: every job once, in its role row, with its name and icon; a pick switches the job', () => {
  const { app, c } = panel({});
  const shown = c.jobRows.flatMap(r => r.jobs);
  assert.deepEqual(shown.map(j => j.id).sort(), JOBS.map(j => j.id).sort());
  assert.deepEqual(
    c.jobRows.map(r => r.label),
    JOB_ROWS.map(r => r[0]),
  );
  for (const j of shown) {
    assert.equal(j.name, JOBS.find(x => x.id === j.id).name);
    assert.ok(j.icon, j.id);
  }
  c.requestJob('DRG');
  assert.equal(app.job, 'DRG');
  assert.equal(c.jobCtx.jobId, 'DRG');
});

test('cap field: no error while sync is off; while on, a missing cap or text that is no whole item level says so', () => {
  const { app, c } = panel({ job: 'SGE', sync: false });
  assert.equal(c.capError, '');
  app.editPanel({ sync: true });
  const missing = c.capError;
  assert.ok(missing.length > 0, 'a missing cap says so');
  c.onCapInput('12.5');
  assert.ok(new RegExp(`\\b${MAX_REAL}\\b`).test(c.capError), c.capError);
  assert.notEqual(c.capError, missing, 'a bad text and a missing cap say different things');
  c.onCapInput('0');
  assert.equal(c.capTypedBad, true);
  // a whole number above the highest real item level is a cap too (the page lowers it)
  c.onCapInput(`${MAX_REAL + 100}`);
  assert.equal(c.capTypedBad, false);
  app.editPanel({ cap: 300 });
  c.onCapInput('');
  assert.equal(app.cap, null, 'an empty field is no cap');
});

test('cap lowered by the page: the field flashes and the note names the cap and why; none once the cap fits', () => {
  const { app, c, classes } = panel({ job: 'SGE', sync: true, cap: 123, level: 50 });
  app.editPanel({ cap: 600 });
  c.lowerCap();
  assert.deepEqual(c.capLowered, { from: 600, to: app.cap, level: 50 });
  assert.ok(app.cap < 600);
  assert.equal(c.capLoweredNote, capLoweredText(c.capLowered)); // the sentence itself is asserted in level-cap.test.js
  assert.ok(classes.has('flash'));
  // with no level sync, the highest real item level
  c.capLowered = { from: 900, to: MAX_REAL, level: null };
  assert.equal(c.capLoweredNote, capLoweredText(c.capLowered));
  assert.notEqual(c.capLoweredNote, '');
  // an error under the field takes the note's place
  c.capTypedBad = true;
  assert.equal(c.capLoweredNote, '');
  c.capTypedBad = false;
  app.editPanel({ cap: 123 });
  c.lowerCap();
  assert.equal(c.capLowered, null);
  assert.equal(c.capLoweredNote, '');
});

test('Reset to defaults: asks first, and resets only on yes', () => {
  const { app, c } = panel({ job: 'SGE', cap: 300, sync: true });
  const had = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const asked = [];
  let answer = false;
  globalThis.window = {
    confirm: text => {
      asked.push(text);
      return answer;
    },
  };
  try {
    c.requestReset();
    assert.equal(app.job, 'SGE');
    answer = true;
    c.requestReset();
    assert.equal(app.job, 'PLD', 'back to the default job, Paladin');
    assert.equal(app.cap, restoreOpen(null).cap);
  } finally {
    if (had) {
      Object.defineProperty(globalThis, 'window', had);
    } else {
      delete globalThis.window;
    }
  }
  assert.equal(asked.length, 2, 'asked on each request, before resetting');
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

test('job menu: closed at the start; a tile switches the job, closes the menu and focuses the Job box', () => {
  const sage = panel({ job: 'SGE' });
  sage.c.$nextTick = fn => fn();
  sage.c.$refs.jobButton = {
    focus() {
      sage.focused = 'job box';
    },
  };
  assert.equal(sage.c.jobMenuOpen, false);
  assert.equal(sage.c.jobIcon, panel({ job: 'SGE' }).c.jobIcon, 'the icon of the chosen job');
  sage.c.openJobMenu();
  assert.equal(sage.c.jobMenuOpen, true);
  sage.c.requestJob('WAR');
  assert.deepEqual([sage.app.job, sage.c.jobMenuOpen, sage.focused], ['WAR', false, 'job box']);
  assert.notEqual(sage.c.jobIcon, panel({ job: 'SGE' }).c.jobIcon);
});

test('job menu: the Job box opens it and closes it again, with the focus on the Job box', () => {
  const c = panel({ job: 'SGE' });
  c.c.$nextTick = fn => fn();
  c.c.$refs.jobButton = {
    focus() {
      c.focused = 'job box';
    },
  };
  c.c.toggleJobMenu();
  assert.deepEqual([c.c.jobMenuOpen, c.focused], [true, undefined]);
  c.c.toggleJobMenu();
  assert.deepEqual([c.c.jobMenuOpen, c.focused], [false, 'job box']);
});
