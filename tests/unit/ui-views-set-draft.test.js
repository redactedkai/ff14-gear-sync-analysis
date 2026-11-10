/* A manual draft (src/ui/views/set-draft.js): the rows and meal that differ from the saved set, the Now and After figures
   with delta lines (and their colours as data), the Apply text and the notes. Real Sage pieces and stones. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allMeals } from '../../src/core/food.js';
import { makeJobContext } from '../../src/core/job-context.js';
import { changeText, draftChanges, draftNote, draftView } from '../../src/ui/views/set-draft.js';
import { evaluateInSheet, setFigures } from '../../src/ui/views/set-totals.js';
import { SAGE_IDS, piece, sageSet, sheetOf } from './helpers/sheet-fixtures.js';

const sage = makeJobContext('SGE');
const sheet = sheetOf('SGE', []);

/* `set` with the row at `index` replaced. */
const withRow = (set, index, row) => ({ ...set, pieces: set.pieces.map((p, i) => (i === index ? row : p)) });

test('no change: nothing differs, Apply is off and the second row says so', () => {
  const v = draftView(sheet, sageSet(), sageSet());
  assert.deepEqual([v.changes.count, v.changes.countText, v.changedRows, v.mealChanged], [0, '', [], false]);
  assert.deepEqual([v.applyText, v.applyDisabled, v.discardText], ['No changes', true, 'Discard']);
  assert.deepEqual(
    v.header.map(h => [h.label, h.after]),
    [
      ['Now · before your changes', false],
      ['After · no changes', true],
    ],
  );
  assert.ok(v.header[1].figures.every(f => f.change === null));
});

test('another piece in a row: the row is listed with both names, and the figures move with delta lines', () => {
  const saved = sageSet();
  // the Mythrite Bangle (Critical Hit 22, Speed 15) becomes the Ironworks Bracelet (Critical Hit 23, Determination 16)
  const draft = withRow(saved, 9, piece('wrist', 8624));
  const v = draftView(sheet, saved, draft);
  assert.deepEqual(v.changes.rows, [
    {
      index: 9,
      slot: 'wrist',
      label: 'Bracelet',
      before: 'Mythrite Bangle of Healing',
      after: 'Ironworks Bracelet of Healing',
      meldsOnly: false,
      beforeStones: 'none',
      afterStones: 'none',
    },
  ]);
  assert.deepEqual(
    [v.changes.countText, v.applyText, v.applyDisabled, v.leaveText],
    ['1 slot', 'Apply 1 change', false, 'You have 1 unapplied change.'],
  );
  assert.deepEqual(v.changedRows, [9]);
  const byKey = Object.fromEntries(v.header[1].figures.map(f => [f.key, f.change]));
  // Mind 22 -> 23 and Determination 0 -> 16 (from the item data); the 15 points of speed lost do not move the GCD
  assert.equal(byKey.det.up, true);
  assert.equal(byKey.det.good, true);
  assert.equal(byKey.gcd, null, 'the GCD stays 2.49s');
  assert.equal(byKey.main.text, '+1', 'main stat 22 -> 23');
  assert.equal(byKey.main.good, true);
  // the Now row never carries delta lines and shows the saved set's figures
  assert.ok(v.header[0].figures.every(f => f.change === null));
  assert.deepEqual(
    v.header[0].figures.map(f => f.text),
    setFigures(evaluateInSheet(sheet, saved)).map(f => f.text),
  );
});

test('the same piece with other stones is a melds-only change with both stone lists', () => {
  const saved = sageSet();
  const stones = [
    { stat: 'det', grade: 4 },
    { stat: 'det', grade: 4 },
    { stat: 'crit', grade: 3 },
  ];
  const draft = withRow(saved, 2, piece('head', SAGE_IDS.head, stones));
  const c = draftChanges(sage, saved, draft);
  assert.deepEqual(
    c.rows.map(r => [r.index, r.meldsOnly, r.beforeStones, r.afterStones]),
    [[2, true, 'CRT IV ×3', 'DET IV ×2, CRT III']],
  );
});

test('an emptied row and a new meal: "1 slot and the meal"; the meal is named before and after', () => {
  const saved = sageSet();
  const meal = allMeals(sage).at(-1);
  const draft = { ...withRow(saved, 3, { slot: 'body' }), meal: meal.key };
  const c = draftChanges(sage, saved, draft);
  assert.deepEqual(
    c.rows.map(r => [r.index, r.before, r.after]),
    [[3, 'Rainbow Robe of Healing', 'empty']],
  );
  assert.deepEqual(c.meal, { before: 'none', after: meal.name });
  assert.deepEqual([c.count, c.countText], [2, '1 slot and the meal']);
  const v = draftView(sheet, saved, draft);
  assert.deepEqual([v.mealChanged, v.applyText, v.header[1].label], [true, 'Apply 2 changes', 'After · 2 changes']);
  // the gloves' and shoes' 48 speed points are gone (no meal; the others add 15): the GCD goes from 2.49s to 2.50s, a higher figure and worse (red), and Mind falls
  const noMeal = draftView(sheet, saved, withRow(withRow(saved, 4, { slot: 'hands' }), 6, { slot: 'feet' }));
  const gcd = noMeal.header[1].figures.find(f => f.key === 'gcd');
  assert.deepEqual([noMeal.header[0].figures[1].text, gcd.text, gcd.change], ['2.49s', '2.50s', { text: '+0.01s', up: true, good: false }]);
  assert.equal(noMeal.header[1].figures[0].change.good, false);
  // the meal alone
  assert.equal(draftChanges(sage, saved, { ...saved, meal: meal.key }).countText, 'the meal');
});

test('a row the job does not use (the off-hand of a two-handed job) is not a change', () => {
  const saved = sageSet();
  const draft = withRow(saved, 1, piece('offhand', SAGE_IDS.head));
  assert.equal(draftChanges(sage, saved, draft).count, 0);
});

test('changeText and the notes after Apply or Discard', () => {
  assert.equal(changeText(2, false), '2 slots');
  assert.equal(changeText(0, true), 'the meal');
  const two = { count: 3, rows: [{}, {}], meal: { before: 'none', after: 'x' } };
  assert.equal(draftNote('Applied', two), 'Applied: 2 slots and the meal changed.');
  assert.equal(draftNote('Discarded', { count: 1, rows: [{}], meal: null }), 'Discarded: 1 slot changed, back as it was before.');
  assert.equal(draftNote('Applied', { count: 0, rows: [], meal: null }), 'Applied: no changes.');
});
