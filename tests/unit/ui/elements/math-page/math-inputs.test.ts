/* The math screen's inputs and edits (src/ui/elements/math-page/math-inputs.ts) over the page's real store: the Job menu edits the open
   sub-tab's own job, the IL Sync switch keeps the stored cap at level sync's item level while it is off, the settings the children are
   given, and which store parts the screen follows. Item levels are the game's ParamGrow.ItemLevelSync: level 85 gives 536, level 80
   gives 530. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { barInput, mathSelection, pieceInput, setMathJob, setMathSync } from '../../../../../src/ui/elements/math-page/math-inputs.ts';
import type { AppFacade } from '../../../../../src/ui/store/app-facade.ts';
import { shallowEq } from '../../../../../src/ui/store/select.ts';
import { overlays } from '../../../../../src/ui/overlays.ts';
import { restoreOpen } from '../../../helpers/common.ts';
import { createStores } from '../../../helpers/stores.ts';

/* The page's store of `saved` (the math tab open). */
function opened(saved: Record<string, unknown> = {}) {
  overlays.closeAll(); // the page's manager is shared: no layer of an earlier test stays open
  return createStores(restoreOpen({ tab: 'math', piece: { job: 'SGE', cap: 123, sync: true, level: 85 }, ...saved }));
}

test("Job menu: a pick edits the open sub-tab's own job: Stat Allocation's on its sub-tab, Substat tiers' on its", () => {
  const { app } = opened({ tiers: { job: 'WAR' } });
  assert.equal(barInput(app).jobId, 'SGE');
  setMathJob(app, 'BLM');
  assert.deepEqual([app.job, app.panel('math').job, app.tiers.job], ['BLM', 'BLM', 'WAR']);
  app.showSub('tiers');
  assert.equal(barInput(app).jobId, 'WAR');
  setMathJob(app, 'NIN');
  assert.deepEqual([app.tiers.job, app.job], ['NIN', 'BLM'], "Stat Allocation's job is untouched");
});

test('IL Sync switch: off stores the item level level sync gives (536 at level 85); on keeps the stored cap', () => {
  const { app } = opened();
  setMathSync(app, false);
  assert.deepEqual([app.sync, app.cap], [false, 536]);
  setMathSync(app, true);
  assert.deepEqual([app.sync, app.cap], [true, 536], 'switching on copies nothing');
  app.editPanel({ cap: 270 });
  app.editPanel({ level: 100 });
  setMathSync(app, false);
  assert.equal(app.cap, null, 'at the level cap there is no level sync');
});

test("the children's inputs: the Job menu shows the open sub-tab's job, the controls Stat Allocation's piece and sync, as new objects", () => {
  const { app } = opened({ tiers: { job: 'WAR' } });
  const bar = barInput(app);
  assert.deepEqual([bar.tab, bar.jobId, bar.pieceJob], ['piece', 'SGE', 'SGE']);
  assert.deepEqual(bar.sync, { cap: 123, sync: true, level: 85 });
  assert.deepEqual(bar.piece, { ilvl: app.piece.ilvl, slot: app.piece.slot, subs: [...app.piece.subs], slots: app.piece.slots });
  assert.notEqual(bar.piece, pieceInput(app).piece, 'each element is given its own copy, so a change shows as a new object');
  assert.deepEqual(pieceInput(app), { job: 'SGE', sync: bar.sync, piece: bar.piece, switchOn: true });
  app.showSub('tiers');
  assert.deepEqual(
    [barInput(app).tab, barInput(app).jobId, barInput(app).pieceJob, barInput(app).tiers.job],
    ['tiers', 'WAR', 'SGE', 'WAR'],
  );
});

/* The edits a user can make on the math tab and elsewhere, each as a function of the store's facade. */
const EDITS: Record<string, (app: AppFacade) => void> = {
  'the example piece slot': app => app.editPiece({ slot: app.piece.slot === 'head' ? 'body' : 'head' }),
  'the example piece item level': app => app.editPiece({ ilvl: 200 }),
  'the example piece substats': app => app.editPiece({ subs: ['crit', 'det'] }),
  'the example piece materia slots': app => app.editPiece({ slots: 2 }),
  "Stat Allocation's level": app => app.editPanel({ level: 80 }),
  "Stat Allocation's cap": app => app.editPanel({ cap: 200 }),
  "Stat Allocation's IL Sync": app => app.editPanel({ sync: false }),
  "Stat Allocation's job": app => app.setJob('BLM', 'math'),
  "Substat tiers' job": app => app.setTiersJob('WAR'),
  "Substat tiers' typed level": app => app.setTiersLevel(60),
  "GCD's speed": app => app.editGcd({ speed: 1000 }),
  "GCD's level": app => app.editGcd({ level: 70 }),
  'the open sub-tab': app => app.showSub('gcd'),
  'the open tab': app => app.showTab('browse'),
};

test('the screen follows every part its inputs read: an edit that changes an input changes the selection; the Gear browser does not', () => {
  for (const [name, edit] of Object.entries(EDITS)) {
    const { app, store } = opened();
    const inputsBefore = JSON.stringify([barInput(app), pieceInput(app)]);
    const selectionBefore = { ...mathSelection(store.state) };
    edit(app);
    assert.notEqual(JSON.stringify([barInput(app), pieceInput(app)]), inputsBefore, `${name}: the edit changes no input (fix the edit)`);
    assert.ok(!shallowEq(mathSelection(store.state), selectionBefore), `${name} is not in the selection: the screen would show it stale`);
  }
  const { app, store } = opened();
  const selectionBefore = { ...mathSelection(store.state) };
  app.editBrowse({ min: 100 });
  assert.ok(shallowEq(mathSelection(store.state), selectionBefore), "the Gear browser's filters are not the screen's business");
});
