/* The math tab's component (src/ui/components/sync-explainer.js), bound to a plain store as Alpine binds them: the Job menu edits the open sub-tab's own job, the
   Level box and the IL Sync switch keep the stored cap at level sync's item level while IL Sync is off, the Sync chip
   says the current settings, and the settings the two elements of the tab are given. Item levels are the game's ParamGrow.ItemLevelSync: level
   85 gives 536, level 80 gives 530. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { syncExplainer } from '../../../../src/ui/components/sync-explainer.js';
import { SYNC_CHIP_TEXT, syncChipView } from '../../../../src/ui/views/sync-explainer.js';
import { LEVEL_TEXT, rangeOnly } from '../../../../src/ui/level-cap.js';
import { overlays } from '../../../../src/ui/overlays.js';
import { restoreOpen } from '../../helpers/common.js';
import { createAppFacade } from '../../helpers/stores.js';

/* The component bound to the store of `saved` (the math tab open), with stand-ins for the DOM it touches. */
function bound(saved = {}) {
  overlays.closeAll(); // the page's manager is shared: no layer of an earlier test stays open
  const app = createAppFacade(restoreOpen({ tab: 'math', piece: { job: 'SGE', cap: 123, sync: true, level: 85 }, ...saved }));
  const focused = [];
  const refs = {};
  for (const name of ['level', 'cap', 'syncChip', 'pieceChip', 'pieceFirst']) {
    refs[name] = { focus: () => focused.push(name), value: '' };
  }
  const watchers = {};
  const c = Object.assign(syncExplainer(), {
    $store: { app },
    $refs: refs,
    $nextTick: fn => fn(),
    $watch: (path, fn) => {
      watchers[path] = [...(watchers[path] ?? []), fn];
    },
  });
  c.init();
  return { app, c, focused, watchers };
}

test("Job menu: a pick edits the open sub-tab's own job: Stat Allocation's on its sub-tab, Substat tiers' on its", () => {
  const { app, c } = bound({ tiers: { job: 'WAR' } });
  assert.equal(c.mathJob, 'SGE');
  c.setMathJob('BLM');
  assert.deepEqual([app.job, app.panel('math').job, app.tiers.job], ['BLM', 'BLM', 'WAR']);
  app.showSub('tiers');
  assert.equal(c.mathJob, 'WAR');
  c.setMathJob('NIN');
  assert.deepEqual([app.tiers.job, app.job], ['NIN', 'BLM'], "Stat Allocation's job is untouched");
});

test("Sync chip: it says the store's settings", () => {
  const { app, c } = bound();
  const expected = syncChipView(app.jobCtx, { cap: 123, sync: true, level: 85 }, app.piece.slot, { switchOn: true });
  assert.deepEqual(c.syncChip, expected);
  assert.equal(c.syncText, SYNC_CHIP_TEXT);
  // IL Sync on with no item level: the missing-item-level text
  app.editPanel({ cap: null });
  assert.equal(c.syncChip.parts.at(-1).text, SYNC_CHIP_TEXT.needCap);
});

test('IL Sync switch: off stores the item level level sync gives (536 at level 85); on keeps the stored cap', () => {
  const { app, c } = bound();
  app.editPanel({ sync: false });
  c.onSyncSwitch(false);
  assert.equal(app.cap, 536);
  app.editPanel({ sync: true });
  c.onSyncSwitch(true);
  assert.equal(app.cap, 536, 'switching on copies nothing');
  app.editPanel({ cap: 270 });
  app.editPanel({ level: 100 });
  app.editPanel({ sync: false });
  c.onSyncSwitch(false);
  assert.equal(app.cap, null, 'at the level cap there is no level sync');
  // bad text left in the box is dropped with the switch
  c.capTypedBad = true;
  c.onSyncSwitch(true);
  assert.equal(c.capTypedBad, false);
});

test('Level box: each valid level counts as typed; while IL Sync is off the cap follows it, with it on the cap stays', () => {
  const { app, c } = bound({ piece: { job: 'SGE', cap: 123, sync: false, level: 85 } });
  assert.equal(app.cap, 536, 'load');
  const type = value => c.levelBind['@input']({ target: { value }, inputType: 'insertText' });
  type('80');
  assert.deepEqual([app.level, app.cap], [80, 530]);
  type('100');
  assert.deepEqual([app.level, app.cap], [100, null]);
  type('101'); // above Sage's level cap: not taken
  assert.deepEqual([app.level, app.cap], [100, null]);
  const on = bound({ piece: { job: 'SGE', cap: 123, sync: true, level: 85 } });
  on.c.levelBind['@input']({ target: { value: '80' }, inputType: 'insertText' });
  assert.deepEqual([on.app.level, on.app.cap], [80, 123]);
});

test('Level box: text that is no level is flagged and not stored; the flag clears with a valid level, a job change, a tab change and closing the popover', () => {
  const { app, c, watchers } = bound({ piece: { job: 'PLD', cap: null, sync: false, level: 90 } });
  const max = app.jobCtx.maxLevel; // Paladin's 100
  const range = LEVEL_TEXT.range(max);
  const fire = fns => {
    for (const fn of fns) {
      fn();
    }
  };
  assert.deepEqual(c.levelFlag(range), { kind: '', short: '', full: '' });
  for (const text of ['0', '101', '-5', '12.5', '', 'abc']) {
    c.onLevelInput(text);
    assert.equal(c.levelError, LEVEL_TEXT.typedBad(max), `'${text}'`);
    assert.deepEqual(c.levelFlag(range), { kind: 'error', short: rangeOnly(range), full: LEVEL_TEXT.typedBad(max) }, `'${text}'`);
    assert.equal(app.level, 90, `a level of '${text}' is not stored`);
  }
  // a valid level is committed as it is typed and ends the error
  c.onLevelInput('85');
  c.levelBind['@input']({ target: { value: '85' }, inputType: 'insertText' });
  assert.equal(app.level, 85);
  // the watcher Alpine runs when the stored level changes
  fire(watchers['$store.app.level']);
  assert.equal(c.levelError, '');
  // the error also ends with a job change, a tab change and closing the popover; the box shows the stored level again
  for (const end of [() => fire(watchers['$store.app.job']), () => fire(watchers['$store.app.tab']), () => c.clearTypedErrors()]) {
    c.onLevelInput('0');
    c.$refs.level.value = '0';
    end();
    assert.equal(c.levelError, '');
    assert.equal(c.$refs.level.value, app.level);
  }
});

test('Level box: a bad level does not change the stored cap while IL Sync is off', () => {
  const { app, c } = bound({ piece: { job: 'PLD', cap: 530, sync: false, level: 80 } });
  c.onLevelInput('101');
  assert.equal(app.cap, 530);
  assert.equal(c.levelError !== '', true);
});

test("the elements' settings: the Job menu shows the open sub-tab's job, the controls Stat Allocation's piece and sync, each as new objects", () => {
  const { app, c } = bound({ tiers: { job: 'WAR' } });
  const first = c.barInput;
  assert.deepEqual([first.tab, first.jobId, first.pieceJob], ['piece', 'SGE', 'SGE']);
  assert.deepEqual(first.sync, { cap: 123, sync: true, level: 85 });
  assert.deepEqual(first.piece, { ilvl: app.piece.ilvl, slot: app.piece.slot, subs: [...app.piece.subs], slots: app.piece.slots });
  assert.notEqual(first.piece, c.pieceInput.piece, 'each element is given its own copy, so a change shows as a new object');
  assert.deepEqual(c.pieceInput, { job: 'SGE', sync: first.sync, piece: first.piece, switchOn: true });
  app.showSub('tiers');
  assert.deepEqual([c.barInput.tab, c.barInput.jobId, c.barInput.pieceJob, c.barInput.tiers.job], ['tiers', 'WAR', 'SGE', 'WAR']);
});
