/* A set page's Fill settings dialog (src/ui/components/set-page/settings.js) bound to a real sheet store, as Alpine binds it:
   a change dropping a waiting result, the Gear to search line (with a failing or late solver) and the goal menus. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SETTINGS_DROPPED_TEXT } from '../../src/ui/components/set-page.js';
import { inProcessSolver } from '../../src/ui/solver.js';
import { fillRecipe } from '../../src/ui/views/fill-settings.js';
import { evaluateInSheet } from '../../src/ui/views/set-totals.js';
import { makeSession } from '../../src/core/session.js';
import { gearToSearchView } from '../../src/ui/views/solve.js';
import { makeJobContext } from '../../src/core/job-context.js';
import { bind, lateSolver, refusingSolver, tick, twoToFill } from './helpers/set-page-bind.js';
import { sageSet } from './helpers/sheet-fixtures.js';

const SGE = makeJobContext('SGE');

test('a change to the Fill settings drops a waiting result', async () => {
  const { c, sheets } = bind(twoToFill());
  await c.fill();
  assert.ok(c.suggestion);
  c.setGoal(1, 'det');
  assert.equal(c.suggestion, null);
  assert.equal(sheets.note, SETTINGS_DROPPED_TEXT);
  assert.equal(sheets.currentSet.fillSettings.goal.tb, 'det');
  assert.equal(c.view.goalLine, 'MND › DET');
});

test('Gear to search line: a failing request shows in the line, and the next good one replaces it', async () => {
  const solver = refusingSolver(['gearToSearch']);
  const { c } = bind(sageSet(), solver);
  await tick();
  assert.equal(c.countText, 'count failed: worker crashed');
  assert.equal(c.searched, null);
  solver.request = refusingSolver([]).request;
  c.refreshCount();
  await tick();
  assert.match(c.countText, /pieces?$/);
  assert.ok(c.searched > 0);
});

test('Gear to search: the line follows a change of the Fill settings, with the pieces the filters leave', async () => {
  const session = makeSession();
  const { c } = bind(sageSet(), inProcessSolver(session));
  await tick();
  const start = [c.countText, c.searched];
  assert.match(start[0], /^searching [\d,]+ of [\d,]+ pieces$/);

  c.editFill(s => {
    s.searchCriteria.min = 600;
  });
  await tick();
  const { sync, level } = evaluateInSheet(c.sheet, c.saved);
  const expected = gearToSearchView(SGE, sync, level, fillRecipe(c.fillSettings), session);
  assert.deepEqual([c.countText, c.searched], [expected.countText, expected.searched]);
  assert.ok(c.searched < start[1], 'fewer pieces at item level 600 and up');
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
  const newest = [c.countText, c.searched];
  await solver.held[0].answer();
  await tick();
  assert.deepEqual([c.countText, c.searched], newest);
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
  assert.deepEqual(goal(), ['main', 'crit', 'det']);
  // a tiebreak's menu holds a stat once: "none" first, then not the ones above it
  assert.deepEqual(c.tiebreakOptions(2)[0], ['', 'none']);
  assert.ok(!c.tiebreakOptions(2).some(o => o[0] === 'crit' || o[0] === 'main'));
  assert.ok(
    c.tiebreakOptions(2).some(o => o[0] === 'det'),
    'its own pick stays',
  );
  assert.ok(!c.tiebreakOptions(1).some(o => o[0] === 'main'));

  // Critical Hit picked to Maximize: Mind (the old Maximize) takes the Tiebreak 1 place Critical Hit leaves
  c.setGoal(0, 'crit');
  assert.deepEqual(goal(), ['crit', 'main', 'det']);
  // a tiebreak cleared
  c.setGoal(2, '');
  assert.deepEqual(goal(), ['crit', 'main', '']);
});

test('a goal pick that moves another rank shows the swap note; any other edit clears it', () => {
  const { c } = bind(twoToFill());
  c.setGoal(1, 'crit');
  assert.equal(c.rankNote, '');
  c.setGoal(0, 'crit');
  assert.equal(c.rankNote, 'Tiebreak 1 changed to Mind (a stat holds one rank).');
  c.setGoalField('melds', false);
  assert.equal(c.rankNote, '');
});
