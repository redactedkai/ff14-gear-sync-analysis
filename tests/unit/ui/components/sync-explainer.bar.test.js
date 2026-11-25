/* The math tab's component (src/ui/components/sync-explainer.js), bound to a plain store as Alpine binds them: the Job menu edits the open sub-tab's own job, the
   IL Sync switch keeps the stored cap at level sync's item level while it is off, and the settings the two elements of the tab are
   given. Item levels are the game's ParamGrow.ItemLevelSync: level 85 gives 536, level 80 gives 530. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { syncExplainer } from '../../../../src/ui/components/sync-explainer.js';
import { overlays } from '../../../../src/ui/overlays.js';
import { restoreOpen } from '../../helpers/common.js';
import { createAppFacade } from '../../helpers/stores.js';

/* The component bound to the store of `saved` (the math tab open). */
function bound(saved = {}) {
  overlays.closeAll(); // the page's manager is shared: no layer of an earlier test stays open
  const app = createAppFacade(restoreOpen({ tab: 'math', piece: { job: 'SGE', cap: 123, sync: true, level: 85 }, ...saved }));
  const c = Object.assign(syncExplainer(), { $store: { app } });
  return { app, c };
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

test('IL Sync switch: off stores the item level level sync gives (536 at level 85); on keeps the stored cap', () => {
  const { app, c } = bound();
  c.setMathSync(false);
  assert.deepEqual([app.sync, app.cap], [false, 536]);
  c.setMathSync(true);
  assert.deepEqual([app.sync, app.cap], [true, 536], 'switching on copies nothing');
  app.editPanel({ cap: 270 });
  app.editPanel({ level: 100 });
  c.setMathSync(false);
  assert.equal(app.cap, null, 'at the level cap there is no level sync');
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
