/* A set page's Auto-fill settings popover (src/ui/elements/set-page/fill-settings-edit.ts) bound to a real sheet store:
   edits refused while a result waits, the Gear to search line (with a failing or late solver) and the goal menus. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inProcessSolver } from '../../../../../src/ui/solver.js';
import { fillRecipe } from '../../../../../src/ui/sheets/fill-settings.js';
import { evaluateInSheet } from '../../../../../src/ui/views/set-totals.js';
import { makeSession } from '../../../../../src/core/session.ts';
import { gearToSearchView } from '../../../../../src/ui/solve.js';
import { makeJobContext } from '../../../../../src/core/job-context.ts';
import { bind, lateSolver, refusingSolver, tick, twoToFill } from '../../../helpers/set-page-bind.js';
import { sageSet } from '../../../helpers/sheet-fixtures.js';

const SGE = makeJobContext('SGE');

test('the Auto-fill settings cannot be edited while a result waits: the result stays and the settings do not change', async () => {
  const { session, sheets, view } = bind(twoToFill());
  await session.fill.fill();
  assert.ok(session.suggestion);
  const before = JSON.stringify(sheets.currentSet.fillSettings ?? null);
  const goalLine = view().goalLine;
  session.settings.setGoal(1, 'det');
  session.settings.setGoalField('gcd', '2.40');
  assert.ok(session.suggestion, 'the result is kept');
  assert.equal(sheets.note, '', 'no note');
  assert.equal(JSON.stringify(sheets.currentSet.fillSettings ?? null), before, 'the settings are as they were');
  assert.equal(view().goalLine, goalLine);
  // after Discard the same edit is taken
  session.fill.discardSuggestion();
  session.settings.setGoal(1, 'det');
  assert.equal(sheets.currentSet.fillSettings.goal.tb, 'det');
  assert.equal(view().goalLine, 'MND › DET');
});

// the first number of "searching 1,939 of 1,999 pieces"
const searchedIn = countText => Number(countText.match(/^searching ([\d,]+)/)[1].replace(/,/g, ''));

test('Gear to search line: a failing request shows in the line, and the next good one replaces it', async () => {
  const solver = refusingSolver(['gearToSearch']);
  const { session } = bind(sageSet(), solver);
  await tick();
  assert.equal(session.pageState.gearToSearch.countText, 'count failed: worker crashed');
  solver.request = refusingSolver([]).request;
  session.settings.refreshCount();
  await tick();
  assert.match(session.pageState.gearToSearch.countText, /pieces?$/);
});

test('Gear to search: the line follows a change of the Auto-fill settings, with the pieces the filters leave', async () => {
  const solverSession = makeSession();
  const { session } = bind(sageSet(), inProcessSolver(solverSession));
  await tick();
  const start = [session.pageState.gearToSearch.countText, searchedIn(session.pageState.gearToSearch.countText)];
  assert.match(start[0], /^searching [\d,]+ of [\d,]+ pieces$/);

  session.settings.editFill(s => {
    s.searchCriteria.min = 600;
  });
  await tick();
  const { sync, level } = evaluateInSheet(session.sheet, session.saved);
  const expected = gearToSearchView(SGE, sync, level, fillRecipe(session.fillSettings), solverSession);
  assert.equal(session.pageState.gearToSearch.countText, expected.countText);
  assert.ok(searchedIn(session.pageState.gearToSearch.countText) < start[1], 'fewer pieces at item level 600 and up');
  assert.equal(session.pageState.gearToSearch.countText.split(' of ')[1], start[0].split(' of ')[1], 'out of the same number of pieces');
});

test('Gear to search: when two requests are out, the older reply never replaces the newest line', async () => {
  const solver = lateSolver(['gearToSearch']);
  const { session } = bind(sageSet(), solver);
  session.settings.editFill(s => {
    s.searchCriteria.min = 600;
  });
  assert.equal(solver.held.length, 2, 'the line was asked for at init and again after the change');
  assert.notEqual(solver.held[0].request.recipe.min, solver.held[1].request.recipe.min, 'the two requests differ');
  await solver.held[1].answer();
  await tick();
  const newest = session.pageState.gearToSearch.countText;
  await solver.held[0].answer();
  await tick();
  assert.equal(session.pageState.gearToSearch.countText, newest);
});

test('Gear categories piece counts: none before the first count lands, replaced when the filters change, kept while a box is ticked', async () => {
  const solverSession = makeSession();
  const solver = lateSolver(['gearToSearch']);
  const { session } = bind(sageSet(), solver);
  const countsFor = () => {
    const { sync, level } = evaluateInSheet(session.sheet, session.saved);
    return gearToSearchView(SGE, sync, level, fillRecipe(session.fillSettings), solverSession).fromCounts;
  };
  // the request is out: no number yet (not 0)
  assert.equal(session.pageState.gearToSearch.fromCounts, null);
  await solver.held[0].answer();
  await tick();
  const first = countsFor();
  assert.deepEqual(session.pageState.gearToSearch.fromCounts, first);
  assert.ok(first.crafted > 0 && first.gold_saucer === 0);
  // a filter changes: the old numbers are for other settings, so none show until the new ones land
  session.settings.editFill(s => {
    s.searchCriteria.min = 700;
  });
  assert.equal(session.pageState.gearToSearch.fromCounts, null);
  await solver.held[1].answer();
  await tick();
  assert.deepEqual(session.pageState.gearToSearch.fromCounts, countsFor());
  assert.ok(session.pageState.gearToSearch.fromCounts.crafted < first.crafted, 'fewer pieces at item level 700 and up');
  // a box ticked or the market board switched: the numbers do not change, so they stay while the new answer is out
  const landed = session.pageState.gearToSearch.fromCounts;
  session.settings.setFilters({ exclude: [...session.settings.filters.exclude, 'crafted'], market: false });
  assert.equal(session.pageState.gearToSearch.fromCounts, landed);
  // a late answer of an older request does not put its numbers back
  session.settings.editFill(s => {
    s.searchCriteria.min = 600;
  });
  session.settings.editFill(s => {
    s.searchCriteria.min = 700;
  });
  await solver.held.at(-1).answer();
  await tick();
  const newest = session.pageState.gearToSearch.fromCounts;
  await solver.held.at(-2).answer();
  await tick();
  assert.equal(session.pageState.gearToSearch.fromCounts, newest);
});

test("the goal menus list the job's stats; picking a stat another rank holds swaps the two", () => {
  const { session } = bind(sageSet());
  // Sage's stats as the game names them
  assert.deepEqual(
    session.settings.statOptions.map(o => o.label),
    ['Mind', 'Vitality', 'Critical Hit', 'Determination', 'Direct Hit', 'Spell Speed', 'Piety'],
  );
  const goal = () => [session.fillSettings.goal.target, session.fillSettings.goal.tb, session.fillSettings.goal.tb2];

  session.settings.setGoal(1, 'crit');
  session.settings.setGoal(2, 'det');
  assert.deepEqual(goal(), ['mind', 'crit', 'det']);
  // a tiebreak's menu holds a stat once: "none" first, then not the ones above it
  assert.deepEqual(session.settings.tiebreakOptions(2)[0], { value: '', label: 'none' });
  assert.ok(!session.settings.tiebreakOptions(2).some(o => o.value === 'crit' || o.value === 'mind'));
  assert.ok(
    session.settings.tiebreakOptions(2).some(o => o.value === 'det'),
    'its own pick stays',
  );
  assert.ok(!session.settings.tiebreakOptions(1).some(o => o.value === 'mind'));

  // Critical Hit picked to Maximize: Mind (the old Maximize) takes the Tiebreak 1 place Critical Hit leaves
  session.settings.setGoal(0, 'crit');
  assert.deepEqual(goal(), ['crit', 'mind', 'det']);
  // a tiebreak cleared
  session.settings.setGoal(2, '');
  assert.deepEqual(goal(), ['crit', 'mind', '']);
});

test('a goal pick that moves another rank shows the swap note; any other edit clears it', () => {
  const { session } = bind(twoToFill());
  session.settings.setGoal(1, 'crit');
  assert.equal(session.settings.rankNote, '');
  session.settings.setGoal(0, 'crit');
  assert.ok(session.settings.rankNote.includes('Mind'), session.settings.rankNote); // the stat that moved
  session.settings.setGoalField('melds', false);
  assert.equal(session.settings.rankNote, '');
});

test('the settings popover opening counts the pieces again, and its closing drops the note about a moved rank', async () => {
  const solver = lateSolver(['gearToSearch']);
  const { session } = bind(sageSet(), solver);
  const asked = solver.held.length;
  session.settings.settingsToggled(true);
  assert.equal(solver.held.length, asked + 1, 'an opening asks for the count');
  session.settings.rankNote = 'Tiebreak 1 changed to Mind';
  session.settings.settingsToggled(false);
  assert.equal(session.settings.rankNote, '');
  assert.equal(solver.held.length, asked + 1, 'a closing asks for nothing');
});

test('Gear to search boxes: Equip level is held to the job level cap, the Item level boxes to the highest real item level', () => {
  const { session } = bind(sageSet());
  const { boxes } = session.settings;
  // a number typed past the bound and committed (Enter, leaving the box) moves to the nearest bound
  for (const [key, typed] of [
    ['lvl', '150'],
    ['min', '900'],
    ['max', '900'],
  ]) {
    boxes[key].onChange({ target: { value: typed } });
  }
  assert.deepEqual(
    ['lvl', 'min', 'max'].map(key => session.fillSettings.searchCriteria[key]),
    [100, 795, 795],
  );
});
