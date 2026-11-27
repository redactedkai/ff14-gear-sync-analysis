/* A saved set's table (src/ui/views/set-rows.ts): the rows the job uses, the pieces' facts, materia chips, cap marks, rank
   badges, pin flags, the Food row and the empty states. Real items (see helpers/fixtures/sheet-fixtures.ts); the stats are
   compared with the raw item data and the materia values. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allMeals } from '../../../../src/core/food.ts';
import { poolItemById } from '../../../../src/core/items.ts';
import { makeJobContext } from '../../../../src/core/job-context.ts';
import { pieceName, rankBadges, setRowsView } from '../../../../src/ui/views/set-rows.ts';
import { evaluateInSheet } from '../../../../src/ui/views/set-totals.ts';
import { mustFind } from '../../helpers/fixtures/common.ts';
import type { SavedGearSet, SavedSheet } from '../../../../src/ui/sheets/saved-types.ts';
import { SAGE_IDS, piece, sageSet, sheetOf, warSet } from '../../helpers/fixtures/sheet-fixtures.ts';

const sage = makeJobContext('SGE');
const view = (sheet: SavedSheet, set: SavedGearSet, options: Parameters<typeof setRowsView>[2] = {}) =>
  setRowsView(evaluateInSheet(sheet, set), set, options);
type RowsView = ReturnType<typeof view>;
/* The row of `slot` in the view. */
const rowOf = (v: RowsView, slot: string) =>
  mustFind(
    v.rows.find(r => r.slot === slot),
    `the ${slot} row`,
  );
/* The row of `slot`, which must hold a piece (not empty), so its cells and chips are there. */
function wornRow(v: RowsView, slot: string) {
  const row = rowOf(v, slot);
  if (row.empty) {
    throw new Error(`the ${slot} row is empty`);
  }
  return row;
}
/* The `index`th of a list the view has at least that many of. */
const nth = <Item>(list: readonly Item[], index: number): Item => mustFind(list[index], `item ${index}`);

test('Sage: 11 rows (no off-hand for a two-handed job), labels with the rings numbered, the saved row numbers kept', () => {
  const v = view(sheetOf('SGE', []), sageSet());
  assert.deepEqual(
    v.rows.map(r => [r.index, r.label]),
    [
      [0, 'Weapon'],
      [2, 'Head'],
      [3, 'Body'],
      [4, 'Hands'],
      [5, 'Legs'],
      [6, 'Feet'],
      [7, 'Earring'],
      [8, 'Necklace'],
      [9, 'Bracelet'],
      [10, 'Ring 1'],
      [11, 'Ring 2'],
    ],
  );
  assert.deepEqual(
    v.headers.map(h => h.text),
    ['MND', 'VIT', 'CRT', 'DET', 'DHT', 'SpS', 'PIE'],
  );
  assert.deepEqual([v.consumablesLabel, v.food.label], ['Consumables', 'Food']);
});

test('a worn row: the name, the high-quality mark, item level, category, source and the stats of the item data', () => {
  const v = view(sheetOf('SGE', []), sageSet());
  const body = wornRow(v, 'body');
  const item = mustFind(poolItemById(sage, SAGE_IDS.body), 'the body piece');
  assert.deepEqual(
    [body.empty, body.name, body.hq, body.ilvl, body.target, body.ilvlText, body.gameId],
    [false, 'Rainbow Robe of Healing', true, 115, null, '115', SAGE_IDS.body],
  );
  assert.equal(mustFind(body.category, 'the body piece category').key, 'crafted');
  assert.match(mustFind(body.from, 'the body piece source'), / · lvl \d+$/);
  assert.deepEqual(
    body.cells.map(c => c.value),
    sage.stats.map(s => item.stats[s]),
  );
  assert.deepEqual(body.cells[0], { stat: 'mind', value: 44, text: '44', zero: false, atCap: false, beforeCap: null });
  // a stat the piece lacks is zero
  assert.equal(body.cells[2].zero, true);
});

test('materia chips: slot text, overmeld slots, the locked slot behind an empty one and stones that add nothing', () => {
  const v = view(sheetOf('SGE', []), sageSet());
  const head = wornRow(v, 'head');
  // five slots (3 + 2 with overmelding): three Critical Hit IV stones, then empty slots
  assert.deepEqual(
    head.chips.map(c => [c.index, c.text, c.empty, c.over, c.locked, c.fit, c.removed]),
    [
      [0, 'CRT IV', false, false, false, '', null],
      [1, 'CRT IV', false, false, false, '', null],
      [2, 'CRT IV', false, true, false, 'none', null],
      [3, 'empty', true, true, false, '', null],
      [4, 'empty', true, true, true, '', null],
    ],
  );
  // a piece without slots says so
  const old = view(sheetOf('SGE', []), { ...sageSet(), pieces: sageSet().pieces.map(p => (p.slot === 'ear' ? piece('ear', 8625) : p)) });
  const ear = wornRow(old, 'ear');
  assert.deepEqual(ear.chips, []);
  assert.ok(ear.noChipsText.length > 0, 'the row says why it has no stones');
});

test('cap marks: Critical Hit 20 + 8 of 12 under a cap of 28 is at the cap with 32 before it; Piety, 28 of 28, is at its cap too; the main stat never is', () => {
  const v = view(sheetOf('SGE', []), sageSet());
  const head = wornRow(v, 'head');
  const crit = nth(head.cells, 2);
  assert.deepEqual([crit.value, crit.atCap, crit.beforeCap], [28, true, 32]);
  // Piety 28 equals its cap of 28 (no stone can add to it); the main stat equals its own cap on every piece and is never marked
  assert.deepEqual(
    head.cells.map(c => c.atCap),
    [false, false, true, false, false, false, true],
  );
  assert.equal(v.anyAtCap, true);
  // without the stones Critical Hit is 20 of 28 and unmarked; Piety still is at its cap
  const plain = view(sheetOf('SGE', []), { ...sageSet(), pieces: sageSet().pieces.map(p => ({ ...p, stones: [] })) });
  const bare = nth(wornRow(plain, 'head').cells, 2);
  assert.deepEqual([bare.value, bare.atCap, bare.beforeCap], [20, false, null]);
});

test('a synced piece: its target item level, stats cut to the cap, and its stones stored but not counted', () => {
  // Augmented Bygone Brass Pendulums (item level 790, two stone slots) with Determination XII twice, synced to 123
  const weapon = piece('weapon', 49599, [
    { stat: 'det', grade: 12 },
    { stat: 'det', grade: 12 },
  ]);
  const set = { ...sageSet(), pieces: sageSet().pieces.map(p => (p.slot === 'weapon' ? weapon : p)) };
  const synced = wornRow(view(sheetOf('SGE', []), set), 'weapon');
  const free = wornRow(view(sheetOf('SGE', [], { sync: { on: false, cap: 795 } }), set), 'weapon');
  assert.deepEqual([synced.ilvl, synced.target, synced.ilvlText], [790, 123, '790']);
  assert.deepEqual([free.target, free.ilvlText], [null, '790']);
  assert.deepEqual(
    synced.chips.map(c => [c.text, c.removed]),
    [
      ['DET XII', 'sync'],
      ['DET XII', 'sync'],
    ],
  );
  assert.ok(synced.cells[0].value < free.cells[0].value);
  // unsynced the stones count: Determination 310 + 2 x 54, cut at the piece's cap of 443 (a gain of 108 fits)
  assert.equal(free.cells[3].value, 310 + 108);
  assert.equal(free.chips[0].removed, null);
});

test('empty rows: "Choose a piece", a game id the data lacks, and a slot another piece covers', () => {
  const set = sageSet();
  set.pieces[0] = { slot: 'weapon' };
  set.pieces[3] = piece('body', 999999999);
  const v = view(sheetOf('SGE', []), set);
  const weapon = v.rows[0];
  assert.deepEqual([weapon.empty, weapon.missing], [true, null]);
  const body = rowOf(v, 'body');
  assert.equal(body.empty, true);
  const missing = mustFind(body.missing, 'the missing-item note');
  assert.ok(missing.includes('999999999'), missing); // the id the set holds
  assert.equal(body.emptyText, missing);
  assert.equal(pieceName(sage, set.pieces[3]), 'missing item 999999999');
  assert.equal(pieceName(sage, {}), null);
  assert.equal(pieceName(sage, set.pieces[2]), 'Rainbow Cap of Healing');
  // Woolen Cowl is a body piece that covers the head: the empty head row says so
  const cowl = {
    ...sageSet(),
    pieces: sageSet().pieces.map(p => {
      if (p.slot === 'body') {
        return piece('body', 3193);
      }
      return p.slot === 'head' ? { slot: 'head' as const } : p;
    }),
  };
  const covered = view(sheetOf('SGE', []), cowl);
  const head = rowOf(covered, 'head');
  assert.deepEqual(
    [head.empty, head.blockedBy, head.emptyText, head.coveredTitle],
    [true, 'Woolen Cowl', 'Unavailable', 'Covered by Woolen Cowl'],
  );
  assert.equal(rowOf(covered, 'body').label, 'Body + Head');
});

test('a row under a covering piece is marked covered (its control is off): the Head under a cowl, the Off-hand under a 2H weapon', () => {
  const cowl = sageSet();
  cowl.pieces[2] = { slot: 'head' };
  cowl.pieces[3] = piece('body', 3193); // Woolen Cowl, as in the test above
  const head = rowOf(view(sheetOf('SGE', []), cowl), 'head');
  assert.deepEqual([head.empty, head.covered, head.shieldNote], [true, true, null]);
  const cane = sageSet();
  cane.pieces[0] = piece('weapon', 9006);
  const offhand = rowOf(view(sheetOf('WHM', []), cane), 'offhand');
  assert.equal(offhand.covered, true);
  assert.equal(
    view(sheetOf('SGE', []), sageSet()).rows.some(r => r.covered),
    false,
  );
});

test('an Off-hand row under a two-handed weapon carries the shield note; a covered Head row does not', () => {
  // White Mage: Dreadwyrm Cane (9006) takes both hands, so the Off-hand row is covered
  const set = sageSet();
  set.pieces[0] = piece('weapon', 9006);
  const v = view(sheetOf('WHM', []), set);
  const offhand = rowOf(v, 'offhand');
  assert.deepEqual(
    [offhand.empty, offhand.emptyText, offhand.shieldNote],
    [true, 'Unavailable', 'Only a one-handed weapon allows a shield.'],
  );
  assert.equal(
    view(sheetOf('SGE', []), sageSet()).rows.every(r => !r.shieldNote),
    true,
  );
});

test('pin flags come from the saved set: a pinned row that holds a piece; a pin on an empty row or an unused row is ignored', () => {
  const pinned = sageSet({ pinned: { pieces: [2, 5, 0, 1], meal: true } });
  const v = view(sheetOf('SGE', []), pinned);
  assert.deepEqual(
    v.rows.filter(r => r.pinned).map(r => r.index),
    [2, 5],
  );
  // no meal: a pinned meal flag counts for nothing
  assert.equal(v.food.pinned, false);
  const fed = view(
    sheetOf('SGE', []),
    sageSet({ pinned: { pieces: [], meal: true }, meal: mustFind(allMeals(sage).at(-1), 'a meal').key }),
  );
  assert.equal(fed.food.pinned, true);
});

test('rank badges: 1 for the goal stat, 2 and 3 for the tiebreaks; none without Auto-fill settings; keys the job lacks are dropped', () => {
  assert.deepEqual(rankBadges(sage, { target: 'crit', tb: 'det', tb2: 'dh' }), { crit: 1, det: 2, dh: 3 });
  assert.deepEqual(rankBadges(sage, null), {});
  assert.deepEqual(rankBadges(makeJobContext('BLM'), { target: 'crit', tb: 'piety', tb2: '' }), { crit: 1 });
  const goal = { target: 'sps', tb: 'crit', tb2: '' };
  const v = view(sheetOf('SGE', []), sageSet(), { goal });
  assert.deepEqual(
    v.headers.map(h => [h.stat, h.rank]),
    [
      ['mind', null],
      ['vit', null],
      ['crit', 2],
      ['det', null],
      ['dh', null],
      ['sps', 1],
      ['piety', null],
    ],
  );
});

test('the Food row: the meal, high quality, its item level and what it adds per stat; no meal and a missing meal', () => {
  const meal = mustFind(allMeals(sage).at(-1), 'a meal');
  const v = view(sheetOf('SGE', []), sageSet({ meal: meal.key }));
  assert.deepEqual([v.food.empty, v.food.name, v.food.hq, v.food.ilvl, v.food.note], [false, meal.name, true, meal.ilvl, 'HQ']);
  const touched = v.food.cells.flatMap(c => (c ? [c.stat] : []));
  assert.deepEqual(touched.sort(), [...meal.stats.map(s => s.stat), ...(meal.vit ? ['vit'] : [])].sort());
  assert.ok(v.food.cells.every(c => c === null || /^\+\d+$/.test(c.text)));
  const none = view(sheetOf('SGE', []), sageSet()).food;
  assert.deepEqual([none.empty, none.cells.every(c => c === null)], [true, true]);
  const gone = view(sheetOf('SGE', []), sageSet({ meal: 'A meal from an older patch' })).food;
  const goneText = mustFind(gone.emptyText, 'the missing-meal note');
  assert.ok(goneText.includes('A meal from an older patch'), goneText); // the meal the set holds
});

test('changed rows and meal are flagged for the draft highlight', () => {
  const v = view(sheetOf('SGE', []), sageSet(), { changedRows: [3, 10], mealChanged: true });
  assert.deepEqual(
    v.rows.filter(r => r.changed).map(r => r.index),
    [3, 10],
  );
  assert.equal(v.food.changed, true);
});

test('Warrior and Paladin: a two-handed job has 11 rows, a one-handed job with a shield 12', () => {
  const war = view(sheetOf('WAR', [], { sync: { on: false, cap: 795 } }), warSet());
  assert.equal(war.rows.length, 11);
  assert.deepEqual(
    war.headers.map(h => h.text),
    ['STR', 'VIT', 'CRT', 'DET', 'DHT', 'SkS', 'TNC'],
  );
  const pld = view(sheetOf('PLD', [], { sync: { on: false, cap: 795 } }), warSet());
  assert.equal(pld.rows.length, 12);
  assert.equal(pld.rows[1].label, 'Off-hand');
});
