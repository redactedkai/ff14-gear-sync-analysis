/* Partial fill for a saved gear set (src/ui/sheets/fill.js): the pins, the button's label and count, putting a solve's
   result back on the rows, the bad-pin messages, and the pins reaching solveView through the solver's request.
   Real Sage items at the page's default recipe; the pinned solve itself is tested in core/recipe.pins.test.js. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allMeals } from '../../../../src/core/food.ts';
import { jobGear } from '../../../../src/core/items.ts';
import { makeJobContext } from '../../../../src/core/job-context.ts';
import { runRecipe } from '../../../../src/core/recipe.js';
import { makeSession } from '../../../../src/core/session.js';
import { makeSolverHandler, solverRequest } from '../../../../src/ui/solver.js';
import { PINS_CONFLICT_TEXT, applyFill, badPinMessages, dropBadPins, fillPlan, unpinnedText } from '../../../../src/ui/sheets/fill.js';
import { MEAL_ROW_LABEL } from '../../../../src/ui/sheets/saved-set.js';
import { solveView } from '../../../../src/ui/solve.js';
import { appState, hasNumber, piece } from '../../helpers/common.js';

const sge = makeJobContext('SGE');
const SYNC = { cap: 999, sync: false, level: 100 };
const recipe = (patch = {}) => ({ ...appState({ job: 'SGE' }).recipe, target: 'crit', tb: 'det', melds: true, food: false, ...patch });

const SPD_XII = { stat: 'sps', grade: 12 }; // Spell Speed materia XII
const shirt = piece(sge, 'Augmented Bygone Brass Shirt of Healing'); // body, item level 790
const ring = piece(sge, 'Augmented Bygone Brass Ring of Healing'); // item level 790, Unique

/* The saved set's 12 rows, in order: the off-hand row (empty for a two-handed job) and the two ring rows included. */
const ROW = { weapon: 0, offhand: 1, head: 2, body: 3, hands: 4, legs: 5, feet: 6, ear: 7, neck: 8, wrist: 9, ring1: 10, ring2: 11 };
const SLOT_OF_ROW = ['weapon', 'offhand', 'head', 'body', 'hands', 'legs', 'feet', 'ear', 'neck', 'wrist', 'ring', 'ring'];

/* The 12 rows of a solve's set (pieces per slot type the job uses), the off-hand row empty. */
function rowsOf(set) {
  const queue = [...set.pieces];
  return SLOT_OF_ROW.map(slot => {
    const index = queue.findIndex(p => p.slot === slot);
    if (index < 0) {
      return { slot };
    }
    const { gameId, stones } = queue.splice(index, 1)[0];
    return gameId == null ? { slot } : { slot, gameId, stones };
  });
}
const SOLVED = runRecipe(sge, SYNC, 100, recipe(), makeSession());
const FILLED = rowsOf(SOLVED.set);
const GEAR_SET = { pieces: FILLED, meal: null, pinned: { pieces: [], meal: false } };
const withPins = (pieces, meal = false, extra = {}) => ({ ...GEAR_SET, ...extra, pinned: { pieces, meal } });
/* `rows` of the filled set with the given rows replaced. */
const replaced = changes => FILLED.map((p, i) => changes[i] ?? p);
const ALL_ROWS = [...FILLED.keys()].filter(i => i !== ROW.offhand);

test('nothing pinned: every slot the job uses is open, and the pins are null', () => {
  const plan = fillPlan(sge, GEAR_SET);
  assert.equal(GEAR_SET.pieces.length, 12);
  assert.equal(plan.pins, null);
  // Sage has no off-hand: 11 rows count, the two ring rows one each, and the meal is a twelfth slot
  assert.equal(plan.count, 12);
  assert.equal(plan.mealOpen, true);
  assert.ok(hasNumber(plan.label, 12), plan.label);
  assert.equal(plan.disabled, false);
  assert.ok(!plan.openRows.includes(ROW.offhand));
});

test('pins: the pinned pieces in row order with their stones, a pinned ring in either ring row, the meal apart', () => {
  const body = { slot: 'body', gameId: shirt.gameId, stones: [SPD_XII, SPD_XII] };
  const meal = allMeals(sge)[0].key;
  const saved = { ...withPins([ROW.ring2, ROW.body], true), pieces: replaced({ [ROW.body]: body }), meal };
  const plan = fillPlan(sge, saved);
  assert.deepEqual(plan.pins.pieces[0], body);
  assert.deepEqual(
    plan.pins.pieces.map(p => p.slot),
    ['body', 'ring'],
  );
  assert.equal(plan.pins.pieces[1].gameId, FILLED[ROW.ring2].gameId);
  assert.equal(plan.pins.meal, meal);
  assert.deepEqual(plan.pinnedRows, [ROW.body, ROW.ring2]);
  // 9 gear rows open; the meal is pinned, so it is not counted
  assert.equal(plan.count, 9);
  assert.equal(plan.mealOpen, false);
  assert.ok(hasNumber(plan.label, 9), plan.label);
  // the meal is a slot: pinning it alone gives pins and one slot less
  const mealOnly = fillPlan(sge, { ...withPins([], true), meal });
  assert.deepEqual(mealOnly.pins, { pieces: [], meal });
  assert.equal(mealOnly.count, 11);
  // a pinned meal with no meal chosen keeps nothing, and the empty meal slot is open
  const noMeal = fillPlan(sge, withPins([], true));
  assert.equal(noMeal.pins, null);
  assert.equal(noMeal.count, 12);
  // one slot left reads in the singular: the head with the meal pinned, or the meal with every piece pinned
  const headOpen = withPins(
    ALL_ROWS.filter(i => i !== ROW.head),
    true,
    { meal },
  );
  assert.ok(hasNumber(fillPlan(sge, headOpen).label, 1), 'one slot open');
  assert.ok(hasNumber(fillPlan(sge, withPins(ALL_ROWS)).label, 1), 'the meal alone');
});

test('a pin on an empty row or on a row the job does not use is ignored', () => {
  const saved = { ...withPins([ROW.head, ROW.offhand]), pieces: replaced({ [ROW.head]: { slot: 'head' } }) };
  const plan = fillPlan(sge, saved);
  assert.equal(plan.pins, null);
  assert.equal(plan.count, 12);
});

test('every slot and the meal pinned: nothing to fill, the label says 0 and the button is off', () => {
  const plan = fillPlan(sge, withPins(ALL_ROWS, true, { meal: allMeals(sge)[0].key }));
  assert.equal(plan.count, 0);
  assert.ok(hasNumber(plan.label, 0), plan.label);
  assert.equal(plan.disabled, true);
  assert.equal(plan.pins.pieces.length, 11);
});

test('every piece pinned and the meal open: Auto-fill is on and searches the meal alone', () => {
  const food = recipe({ food: true });
  const saved = withPins(ALL_ROWS);
  const plan = fillPlan(sge, saved);
  assert.equal(plan.disabled, false);
  assert.equal(plan.count, 1);
  assert.equal(plan.pins.meal, null);
  const run = runRecipe(sge, SYNC, 100, food, makeSession(), {}, plan.pins);
  assert.equal(run.status, 'ok');
  assert.ok(run.set.meal);
  const after = applyFill(sge, saved, run.set);
  assert.equal(after.meal, run.set.meal);
  // every piece row is as it was
  assert.deepEqual(after.pieces, FILLED);
});

test('round trip: pins to a solve to rows keeps the pinned rows unchanged and fills the others', () => {
  const body = { slot: 'body', gameId: shirt.gameId, stones: [SPD_XII, SPD_XII] };
  const pinnedRing = { slot: 'ring', gameId: ring.gameId, stones: [] };
  const meal = allMeals(sge)[0].key;
  const pieces = replaced({ [ROW.body]: body, [ROW.ring2]: pinnedRing });
  const saved = { ...withPins([ROW.body, ROW.ring2], true), pieces, meal };
  const plan = fillPlan(sge, saved);
  // a different goal than the pieces were made for, so the open rows can change
  const run = runRecipe(sge, SYNC, 100, recipe({ target: 'det', tb: 'crit', food: true }), makeSession(), {}, plan.pins);
  assert.equal(run.status, 'ok');
  const after = applyFill(sge, saved, run.set);
  assert.equal(after.pieces.length, 12);
  // the pinned rows are the very same rows, and so is the pinned meal
  assert.strictEqual(after.pieces[ROW.body], body);
  assert.strictEqual(after.pieces[ROW.ring2], pinnedRing);
  assert.equal(after.meal, meal);
  // the result lists the pinned ring first; the free ring goes to the other ring row
  const rings = run.set.pieces.filter(p => p.slot === 'ring');
  assert.equal(rings[0].gameId, ring.gameId);
  assert.equal(after.pieces[ROW.ring1].gameId, rings[1].gameId);
  assert.notEqual(after.pieces[ROW.ring1].gameId, ring.gameId, 'a Unique ring is not worn twice');
  // every other row has the result's piece of its type with its stones; the off-hand row is as it was
  for (const type of ['weapon', 'head', 'hands', 'legs', 'feet', 'ear', 'neck', 'wrist']) {
    const want = run.set.pieces.find(p => p.slot === type);
    const got = after.pieces[ROW[type]];
    assert.deepEqual([got.slot, got.gameId, got.stones], [type, want.gameId, want.stones], type);
  }
  assert.strictEqual(after.pieces[ROW.offhand], pieces[ROW.offhand]);
  // the saved set was not touched
  assert.strictEqual(saved.pieces, pieces);
});

test('a pinned ring in the first ring row: the free ring goes to the second', () => {
  const pinnedRing = { slot: 'ring', gameId: ring.gameId, stones: [] };
  const saved = { ...withPins([ROW.ring1]), pieces: replaced({ [ROW.ring1]: pinnedRing }) };
  const run = runRecipe(sge, SYNC, 100, recipe(), makeSession(), {}, fillPlan(sge, saved).pins);
  const after = applyFill(sge, saved, run.set);
  assert.strictEqual(after.pieces[ROW.ring1], pinnedRing);
  assert.equal(after.pieces[ROW.ring2].gameId, run.set.pieces.filter(p => p.slot === 'ring')[1].gameId);
});

test('no pin: the result fills every row and takes its meal; an open row the result leaves empty becomes empty', () => {
  const run = runRecipe(sge, SYNC, 100, recipe({ food: true }), makeSession());
  const after = applyFill(sge, GEAR_SET, run.set);
  assert.deepEqual(
    after.pieces.filter(p => p.gameId != null).map(p => [p.slot, p.gameId]),
    run.set.pieces.map(p => [p.slot, p.gameId]),
  );
  assert.ok(run.set.meal);
  assert.equal(after.meal, run.set.meal);
  // a hand-made result where the head is empty (covered by another piece) and one ring is missing
  const result = { pieces: [{ slot: 'head' }, { slot: 'ring', gameId: ring.gameId, stones: [] }], meal: null };
  const sparse = applyFill(sge, GEAR_SET, result);
  assert.deepEqual(sparse.pieces[ROW.head], { slot: 'head' });
  assert.equal(sparse.pieces[ROW.ring1].gameId, ring.gameId);
  assert.deepEqual(sparse.pieces[ROW.ring2], { slot: 'ring' });
  assert.equal(sparse.meal, null);
});

test('bad pins: only the problems that name no row have a message; the rows to drop are found', () => {
  const view = pins => solveView(sge, SYNC, 100, recipe(), makeSession(), pins);
  const text = pins => view(pins).messages;
  const paladin = makeJobContext('PLD');
  const sageGear = new Set(jobGear(sge).map(i => i.gameId));
  const notSage = jobGear(paladin).find(i => i.type === 'head' && !sageGear.has(i.gameId));
  assert.ok(notSage);
  const head = gameId => ({ pieces: [{ slot: 'head', gameId, stones: [] }], meal: null });
  // a missing item, a piece of another slot, one the job cannot wear, a meal the job cannot eat and a relic name a row, which
  // the line under the header says (unpinnedText): the solver's messages are for the problems that name no row
  const pinnedRing = { slot: 'ring', gameId: ring.gameId, stones: [] };
  assert.deepEqual(text(head(1)), []);
  assert.deepEqual(text(head(shirt.gameId)), []);
  assert.deepEqual(text(head(notSage.gameId)), []);
  assert.deepEqual(text({ pieces: [], meal: 'no such meal' }), []);
  assert.deepEqual(badPinMessages([{ index: 0, reason: 'relic' }]), []);
  // three Unique rings, or one Unique ring on both ring rows, are a conflict: it names no row
  assert.deepEqual(text({ pieces: [pinnedRing, pinnedRing, pinnedRing], meal: null }), [PINS_CONFLICT_TEXT]);
  assert.deepEqual(text({ pieces: [pinnedRing, pinnedRing], meal: null }), [PINS_CONFLICT_TEXT]);
  const bad = view(head(1));
  assert.equal(bad.kind, 'badpin');
  assert.deepEqual(bad.badPins, [{ index: 0, reason: 'missing' }]);
  assert.deepEqual(Object.keys(bad).sort(), ['badPins', 'kind', 'messages']);
  // an unknown reason still reads plainly
  const odd = badPinMessages([{ index: null, reason: 'odd' }]);
  assert.ok(odd.length === 1 && odd[0].includes('odd'), odd.join(' | '));

  // dropping: pin 1 is the second pinned row in row order (the body); the others stay. A problem of the pins as a
  // whole drops nothing
  const saved = withPins([ROW.body, ROW.head, ROW.ring2]);
  assert.deepEqual(fillPlan(sge, saved).pinnedRows, [ROW.head, ROW.body, ROW.ring2]);
  assert.deepEqual(dropBadPins(sge, saved, [{ index: 1, reason: 'missing' }]), {
    pieces: [ROW.head, ROW.ring2],
    dropped: [ROW.body],
    relicRows: [],
    mealDropped: false,
  });
  assert.deepEqual(dropBadPins(sge, saved, [{ index: null, reason: 'conflict' }]), {
    pieces: [ROW.body, ROW.head, ROW.ring2],
    dropped: [],
    relicRows: [],
    mealDropped: false,
  });
  // a meal the job cannot eat is a problem of the meal, not of a row: the meal pin goes, the rows stay
  assert.deepEqual(dropBadPins(sge, saved, [{ index: null, reason: 'meal' }]), {
    pieces: [ROW.body, ROW.head, ROW.ring2],
    dropped: [],
    relicRows: [],
    mealDropped: true,
  });
  // a relic is dropped like any piece, and told apart for the line
  assert.deepEqual(dropBadPins(sge, saved, [{ index: 1, reason: 'relic' }]), {
    pieces: [ROW.head, ROW.ring2],
    dropped: [ROW.body],
    relicRows: [ROW.body],
    mealDropped: false,
  });
});

test('pins in the solver request: sent only when there are some, and the handler gives solveView with them', () => {
  const inputs = { job: sge, sync: SYNC, level: 100, recipe: recipe() };
  assert.ok(!('pins' in solverRequest('solve', inputs)));
  assert.ok(!('pins' in solverRequest('solve', inputs, { key: 'set-1', pins: null })));
  assert.equal(solverRequest('solve', inputs, { key: 'set-1' }).key, 'set-1');

  const body = { slot: 'body', gameId: shirt.gameId, stones: [SPD_XII] };
  const pins = fillPlan(sge, { ...withPins([ROW.body]), pieces: replaced({ [ROW.body]: body }) }).pins;
  const request = solverRequest('solve', inputs, { key: 'set-1', pins });
  assert.deepEqual(request.pins, pins);
  const session = makeSession();
  const handle = makeSolverHandler(session);
  const got = handle(structuredClone(request)).result;
  assert.deepEqual(got, solveView(sge, SYNC, 100, recipe(), session, pins));
  assert.equal(got.kind, 'ok');
  assert.equal(got.set.pieces.find(p => p.slot === 'body').gameId, shirt.gameId);
  // no pins: the same view as before pins existed
  const plain = handle(structuredClone(solverRequest('solve', inputs))).result;
  assert.deepEqual(plain, solveView(sge, SYNC, 100, recipe(), session));
  assert.deepEqual(plain, solveView(sge, SYNC, 100, recipe(), session, null));
});

test('unpinnedText: the rows named, a relic says why, nothing unpinned gives no line', () => {
  assert.equal(unpinnedText([], []), '');
  const one = unpinnedText(['Head'], []);
  const several = unpinnedText(['Head', MEAL_ROW_LABEL], []);
  assert.ok(one.includes('Head'), one);
  assert.ok(several.includes('Head') && several.includes(MEAL_ROW_LABEL), several);
  const relic = unpinnedText([], ['Weapon']);
  assert.ok(relic.includes('Weapon'), relic);
  assert.notEqual(relic, unpinnedText(['Weapon'], []), 'a relic gives its reason');
  // both kinds in one line: the plain rows, then the relic rows
  const both = unpinnedText(['Head'], ['Weapon']);
  assert.ok(both.includes(one) && both.includes(relic), both);
});
