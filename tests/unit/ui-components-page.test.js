/* The page root and the job and sync settings panel (src/ui/components/page.js), bound to a plain store as Alpine binds
   them: the job picker's rows, the cap field's error and the note after the page lowers the cap, and Reset to
   defaults asking first. Whether a cap is lowered (limitCapToLevel) is checked in ui-state.test.js. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JOBS, JOB_ROWS } from '../../src/core/constants.js';
import { dataSourceLabel, MAX_REAL } from '../../src/core/tables.js';
import { page, settings } from '../../src/ui/components/page.js';
import { jobLineText, restoreState } from '../../src/ui/state.js';
import { createAppStore } from '../../src/ui/store.js';

/* The settings panel bound to a store of `saved` (on the Gear browser unless it says otherwise), with a stand-in for the cap field (its flash class). */
function panel(saved) {
  const app = createAppStore(restoreState({ tab: 'browse', ...saved }));
  const classes = new Set();
  const cap = { classList: { add: c => classes.add(c), remove: c => classes.delete(c) }, offsetWidth: 0 };
  const c = Object.assign(settings(), { $store: { app }, $refs: { cap } });
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
  app.sync = true;
  assert.equal(c.capError, 'Enter a sync cap');
  c.onCapInput('12.5');
  assert.equal(c.capError, `Enter a whole item level from 1 to ${MAX_REAL}`);
  c.onCapInput('0');
  assert.equal(c.capTypedBad, true);
  // a whole number above the highest real item level is a cap too (the page lowers it)
  c.onCapInput(`${MAX_REAL + 100}`);
  assert.equal(c.capTypedBad, false);
  app.cap = 300;
  c.onCapInput('');
  assert.equal(app.cap, null, 'an empty field is no cap');
});

test('cap lowered by the page: the field flashes and the note names the cap and why; none once the cap fits', () => {
  const { app, c, classes } = panel({ job: 'SGE', sync: true, cap: 123, level: 50 });
  app.cap = 600;
  c.lowerCap();
  assert.deepEqual(c.capLowered, { from: 600, to: app.cap, level: 50 });
  assert.ok(app.cap < 600);
  assert.equal(c.capLoweredNote, `Lowered to ${app.cap}, the highest for level 50.`);
  assert.ok(classes.has('flash'));
  // with no level sync, the highest real item level
  c.capLowered = { from: 900, to: MAX_REAL, level: null };
  assert.equal(c.capLoweredNote, `Lowered to ${MAX_REAL}, the highest item level.`);
  // an error under the field takes the note's place
  c.capTypedBad = true;
  assert.equal(c.capLoweredNote, '');
  c.capTypedBad = false;
  app.cap = 123;
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
    assert.equal(app.job, null);
    assert.equal(app.cap, restoreState(null).cap);
  } finally {
    if (had) Object.defineProperty(globalThis, 'window', had);
    else delete globalThis.window;
  }
  assert.deepEqual(asked, ["Reset this tab's settings to their defaults?", "Reset this tab's settings to their defaults?"]);
});

/* A tab button (goTab): leaving the Sheets tab asks the set page first (sheet-store.js askLeave); the answer opens the
   tab. Other tabs switch at once. */
test('goTab: leaving the Sheets tab with something to settle asks first; the answer opens the tab', () => {
  const app = createAppStore(restoreState({ tab: 'sheets' }));
  let pending = null;
  let settle = true;
  const sheets = {
    askLeave: move => {
      if (!settle) return false;
      pending = move;
      return true;
    },
  };
  const c = Object.assign(page(), { $store: { app, sheets } });
  c.goTab('browse');
  assert.equal(app.tab, 'sheets', 'the question is open: the tab stays');
  pending();
  assert.equal(app.tab, 'browse', 'the answer opens the tab');
  // nothing to settle: at once
  app.showTab('sheets');
  settle = false;
  c.goTab('math');
  assert.equal(app.tab, 'math');
  // from another tab nothing is asked
  settle = true;
  pending = null;
  c.goTab('browse');
  assert.deepEqual([app.tab, pending], ['browse', null]);
});

test('job strip: the text after the job name follows the level and the sync, as B17 words it', () => {
  assert.equal(jobLineText(100, false, 795), 'Level 100 · Item level sync: off');
  assert.equal(jobLineText(100, true, 275), 'Level 100 · Item level sync: 275');
  assert.equal(jobLineText(50, true, null), 'Level 50 · Item level sync: on');
});

test('job strip: closed at the start, with a job or without one; Change and Close swap it with the panel', () => {
  const none = panel({});
  none.c.$watch = () => {};
  none.c.init();
  assert.equal(none.c.open, false, 'no job chosen: still the strip');
  const sage = panel({ job: 'SGE' });
  const watchers = {};
  sage.c.$watch = (path, fn) => {
    watchers[path] = fn;
  };
  sage.c.init();
  assert.equal(sage.c.open, false);
  assert.equal(sage.c.lineText, 'Level 100 · Item level sync: off');
  sage.c.$nextTick = fn => fn();
  sage.c.$refs.closeButton = {
    focus() {
      sage.focused = 'close';
    },
  };
  sage.c.$refs.changeButton = {
    focus() {
      sage.focused = 'change';
    },
  };
  sage.c.toggleOpen();
  assert.deepEqual([sage.c.open, sage.focused], [true, 'close']);
  sage.c.toggleOpen();
  assert.deepEqual([sage.c.open, sage.focused], [false, 'change']);
  // Escape in the open panel closes it, with the focus on Change; on the strip it does nothing
  sage.c.toggleOpen();
  sage.focused = null;
  sage.c.closeOnEscape();
  assert.deepEqual([sage.c.open, sage.focused], [false, 'change']);
  sage.focused = null;
  sage.c.closeOnEscape();
  assert.deepEqual([sage.c.open, sage.focused], [false, null]);
  // arriving on a tab with no job does not open the panel
  sage.app.job = null;
  assert.equal(watchers['$store.app.tab'], undefined);
  assert.equal(sage.c.open, false);
});
