/* A set page's Auto-fill settings popover (src/ui/components/set-page/auto-fill-settings.js) bound to a real sheet store, as Alpine binds it:
   edits refused while a result waits, the Gear to search line (with a failing or late solver) and the goal menus. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { overlays } from '../../../../../src/ui/overlays.js';
import { inProcessSolver } from '../../../../../src/ui/solver.js';
import { fillRecipe } from '../../../../../src/ui/sheets/fill-settings.js';
import { evaluateInSheet } from '../../../../../src/ui/views/set-totals.js';
import { makeSession } from '../../../../../src/core/session.js';
import { gearToSearchView } from '../../../../../src/ui/solve.js';
import { makeJobContext } from '../../../../../src/core/job-context.js';
import { bind, lateSolver, refusingSolver, tick, twoToFill } from '../../../helpers/set-page-bind.js';
import { sageSet } from '../../../helpers/sheet-fixtures.js';

const SGE = makeJobContext('SGE');

test('the Auto-fill settings cannot be edited while a result waits: the result stays and the settings do not change', async () => {
  const { c, sheets } = bind(twoToFill());
  await c.fill();
  assert.ok(c.suggestion);
  const before = JSON.stringify(sheets.currentSet.fillSettings ?? null);
  const goalLine = c.view.goalLine;
  c.setGoal(1, 'det');
  c.setGoalField('gcd', '2.40');
  assert.ok(c.suggestion, 'the result is kept');
  assert.equal(sheets.note, '', 'no note');
  assert.equal(JSON.stringify(sheets.currentSet.fillSettings ?? null), before, 'the settings are as they were');
  assert.equal(c.view.goalLine, goalLine);
  // after Discard the same edit is taken
  c.discardSuggestion();
  c.setGoal(1, 'det');
  assert.equal(sheets.currentSet.fillSettings.goal.tb, 'det');
  assert.equal(c.view.goalLine, 'MND › DET');
});

// the first number of "searching 1,939 of 1,999 pieces"
const searchedIn = countText => Number(countText.match(/^searching ([\d,]+)/)[1].replace(/,/g, ''));

test('Gear to search line: a failing request shows in the line, and the next good one replaces it', async () => {
  const solver = refusingSolver(['gearToSearch']);
  const { c } = bind(sageSet(), solver);
  await tick();
  assert.equal(c.countText, 'count failed: worker crashed');
  solver.request = refusingSolver([]).request;
  c.refreshCount();
  await tick();
  assert.match(c.countText, /pieces?$/);
});

test('Gear to search: the line follows a change of the Auto-fill settings, with the pieces the filters leave', async () => {
  const session = makeSession();
  const { c } = bind(sageSet(), inProcessSolver(session));
  await tick();
  const start = [c.countText, searchedIn(c.countText)];
  assert.match(start[0], /^searching [\d,]+ of [\d,]+ pieces$/);

  c.editFill(s => {
    s.searchCriteria.min = 600;
  });
  await tick();
  const { sync, level } = evaluateInSheet(c.sheet, c.saved);
  const expected = gearToSearchView(SGE, sync, level, fillRecipe(c.fillSettings), session);
  assert.equal(c.countText, expected.countText);
  assert.ok(searchedIn(c.countText) < start[1], 'fewer pieces at item level 600 and up');
  assert.equal(c.countText.split(' of ')[1], start[0].split(' of ')[1], 'out of the same number of pieces');
});

test('Gear to search: when two requests are out, the older reply never replaces the newest line', async () => {
  const solver = lateSolver(['gearToSearch']);
  const { c } = bind(sageSet(), solver);
  c.editFill(s => {
    s.searchCriteria.min = 600;
  });
  assert.equal(solver.held.length, 2, 'the line was asked for at init and again after the change');
  assert.notEqual(solver.held[0].request.recipe.min, solver.held[1].request.recipe.min, 'the two requests differ');
  await solver.held[1].answer();
  await tick();
  const newest = c.countText;
  await solver.held[0].answer();
  await tick();
  assert.equal(c.countText, newest);
});

test('Gear categories piece counts: none before the first count lands, replaced when the filters change, kept while a box is ticked', async () => {
  const session = makeSession();
  const solver = lateSolver(['gearToSearch']);
  const { c } = bind(sageSet(), solver);
  const countsFor = () => {
    const { sync, level } = evaluateInSheet(c.sheet, c.saved);
    return gearToSearchView(SGE, sync, level, fillRecipe(c.fillSettings), session).fromCounts;
  };
  // the request is out: no number yet (not 0)
  assert.equal(c.fromCounts, null);
  assert.equal(c.fromCount('crafted'), null);
  await solver.held[0].answer();
  await tick();
  const first = countsFor();
  assert.deepEqual(c.fromCounts, first);
  assert.ok(first.crafted > 0 && first.gold_saucer === 0);
  assert.equal(c.fromCountText('crafted'), first.crafted.toLocaleString('en-US'));
  // a filter changes: the old numbers are for other settings, so none show until the new ones land
  c.editFill(s => {
    s.searchCriteria.min = 700;
  });
  assert.equal(c.fromCounts, null);
  await solver.held[1].answer();
  await tick();
  assert.deepEqual(c.fromCounts, countsFor());
  assert.ok(c.fromCounts.crafted < first.crafted, 'fewer pieces at item level 700 and up');
  // a box ticked or the market board switched: the numbers do not change, so they stay while the new answer is out
  const landed = c.fromCounts;
  c.setFromOn('crafted', false);
  c.setMarket(false);
  assert.equal(c.fromCounts, landed);
  // a late answer of an older request does not put its numbers back
  c.editFill(s => {
    s.searchCriteria.min = 600;
  });
  c.editFill(s => {
    s.searchCriteria.min = 700;
  });
  await solver.held.at(-1).answer();
  await tick();
  const newest = c.fromCounts;
  await solver.held.at(-2).answer();
  await tick();
  assert.equal(c.fromCounts, newest);
});

test("the goal menus list the job's stats; picking a stat another rank holds swaps the two", () => {
  const { c } = bind(sageSet());
  // Sage's stats as the game names them
  assert.deepEqual(
    c.statOptions.map(o => o[1]),
    ['Mind', 'Vitality', 'Critical Hit', 'Determination', 'Direct Hit', 'Spell Speed', 'Piety'],
  );
  const goal = () => [c.fillSettings.goal.target, c.fillSettings.goal.tb, c.fillSettings.goal.tb2];

  c.setGoal(1, 'crit');
  c.setGoal(2, 'det');
  assert.deepEqual(goal(), ['mind', 'crit', 'det']);
  // a tiebreak's menu holds a stat once: "none" first, then not the ones above it
  assert.deepEqual(c.tiebreakOptions(2)[0], ['', 'none']);
  assert.ok(!c.tiebreakOptions(2).some(o => o[0] === 'crit' || o[0] === 'mind'));
  assert.ok(
    c.tiebreakOptions(2).some(o => o[0] === 'det'),
    'its own pick stays',
  );
  assert.ok(!c.tiebreakOptions(1).some(o => o[0] === 'mind'));

  // Critical Hit picked to Maximize: Mind (the old Maximize) takes the Tiebreak 1 place Critical Hit leaves
  c.setGoal(0, 'crit');
  assert.deepEqual(goal(), ['crit', 'mind', 'det']);
  // a tiebreak cleared
  c.setGoal(2, '');
  assert.deepEqual(goal(), ['crit', 'mind', '']);
});

test('a goal pick that moves another rank shows the swap note; any other edit clears it', () => {
  const { c } = bind(twoToFill());
  c.setGoal(1, 'crit');
  assert.equal(c.rankNote, '');
  c.setGoal(0, 'crit');
  assert.ok(c.rankNote.includes('Mind'), c.rankNote); // the stat that moved
  c.setGoalField('melds', false);
  assert.equal(c.rankNote, '');
});

test('the settings popover: the gear button opens and closes it, a close puts the focus on the gear unless a click outside closed it', () => {
  const { c, calls } = bind(sageSet());
  assert.equal(c.settingsOpen, false);
  c.toggleSettings();
  assert.equal(c.settingsOpen, true);
  c.toggleSettings();
  assert.equal(c.settingsOpen, false);
  assert.deepEqual(
    calls.filter(call => call[0] === 'gear').map(call => call[1]),
    ['focus'],
  );

  // a click outside: closed, and the focus is not pulled back to the gear
  c.openSettings();
  c.rankHelp = true;
  calls.length = 0;
  c.closeSettings(false);
  assert.equal(c.settingsOpen, false);
  assert.equal(c.rankHelp, false);
  assert.equal(calls.filter(call => call[0] === 'gear').length, 0);
});

test('the settings popover: Escape closes it (after the note), and a draft or a result closes it', () => {
  overlays.closeAll();
  const { c, watches } = bind(sageSet());
  c.openSettings();
  c.toggleRankHelp();
  overlays.pressEscape({});
  assert.deepEqual([c.rankHelp, c.settingsOpen], [false, true], 'the first Escape closes the note only');
  overlays.pressEscape({});
  assert.equal(c.settingsOpen, false);

  // the bar loses the gear with a draft, a result or a running Auto-fill: its watcher closes the popover
  c.openSettings();
  const away = watches.find(w => w.getter.toString().includes('mode'));
  away.callback(true);
  assert.equal(c.settingsOpen, false);
});

test('the settings popover is not modal: Tab on its last box is left alone', () => {
  const { c } = bind(sageSet());
  c.openSettings();
  let prevented = false;
  c.pageKey({ key: 'Tab', shiftKey: false, target: {}, preventDefault: () => (prevented = true) });
  assert.equal(prevented, false);
});

test('Gear to search boxes: Equip level is held to the job level cap, the Item level boxes to the highest real item level', () => {
  const { c } = bind(sageSet());
  c.$store.app = { maxReal: 795 };
  assert.equal(c.fillField('lvl')[':max'](), 100);
  assert.equal(c.fillField('min')[':max'](), 795);
  assert.equal(c.fillField('max')[':max'](), 795);
});
