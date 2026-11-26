/* A saved set's table (src/ui/views/set-rows.js): the rows the job uses, the pieces' facts, materia chips, cap marks, rank
   badges, pin flags, the Food row and the empty states. Real items (see helpers/sheet-fixtures.js); the stats are
   compared with the raw item data and the materia values. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allMeals } from '../../../../src/core/food.ts';
import { poolItemById } from '../../../../src/core/items.ts';
import { makeJobContext } from '../../../../src/core/job-context.ts';
import { pieceName, rankBadges, setRowsView } from '../../../../src/ui/views/set-rows.js';
import { evaluateInSheet } from '../../../../src/ui/views/set-totals.js';
import { SAGE_IDS, piece, sageSet, sheetOf, warSet } from '../../helpers/sheet-fixtures.js';

const sage = makeJobContext('SGE');
const view = (sheet, set, options) => setRowsView(evaluateInSheet(sheet, set), set, options);

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
  const body = v.rows.find(r => r.slot === 'body');
  const item = poolItemById(sage, SAGE_IDS.body);
  assert.deepEqual(
    [body.empty, body.name, body.hq, body.ilvl, body.target, body.ilvlText, body.gameId],
    [false, 'Rainbow Robe of Healing', true, 115, null, '115', SAGE_IDS.body],
  );
  assert.equal(body.category.key, 'crafted');
  assert.match(body.from, / · lvl \d+$/);
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
  const head = v.rows.find(r => r.slot === 'head');
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
  const ear = old.rows.find(r => r.slot === 'ear');
  assert.deepEqual(ear.chips, []);
  assert.ok(ear.noChipsText.length > 0, 'the row says why it has no stones');
});

test('cap marks: Critical Hit 20 + 8 of 12 under a cap of 28 is at the cap with 32 before it; Piety, 28 of 28, is at its cap too; the main stat never is', () => {
  const v = view(sheetOf('SGE', []), sageSet());
  const head = v.rows.find(r => r.slot === 'head');
  const crit = head.cells[2];
  assert.deepEqual([crit.value, crit.atCap, crit.beforeCap], [28, true, 32]);
  // Piety 28 equals its cap of 28 (no stone can add to it); the main stat equals its own cap on every piece and is never marked
  assert.deepEqual(
    head.cells.map(c => c.atCap),
    [false, false, true, false, false, false, true],
  );
  assert.equal(v.anyAtCap, true);
  // without the stones Critical Hit is 20 of 28 and unmarked; Piety still is at its cap
  const plain = view(sheetOf('SGE', []), { ...sageSet(), pieces: sageSet().pieces.map(p => ({ ...p, stones: [] })) });
  const bare = plain.rows.find(r => r.slot === 'head').cells[2];
  assert.deepEqual([bare.value, bare.atCap, bare.beforeCap], [20, false, null]);
});

test('a synced piece: its target item level, stats cut to the cap, and its stones stored but not counted', () => {
  // Augmented Bygone Brass Pendulums (item level 790, two stone slots) with Determination XII twice, synced to 123
  const weapon = piece('weapon', 49599, [
    { stat: 'det', grade: 12 },
    { stat: 'det', grade: 12 },
  ]);
  const set = { ...sageSet(), pieces: sageSet().pieces.map(p => (p.slot === 'weapon' ? weapon : p)) };
  const synced = view(sheetOf('SGE', []), set).rows.find(r => r.slot === 'weapon');
  const free = view(sheetOf('SGE', [], { sync: { on: false, cap: 795 } }), set).rows.find(r => r.slot === 'weapon');
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
  const body = v.rows.find(r => r.slot === 'body');
  assert.equal(body.empty, true);
  assert.ok(body.missing.includes('999999999'), body.missing); // the id the set holds
  assert.equal(body.emptyText, body.missing);
  assert.equal(pieceName(sage, set.pieces[3]), 'missing item 999999999');
  assert.equal(pieceName(sage, { slot: 'head' }), null);
  assert.equal(pieceName(sage, set.pieces[2]), 'Rainbow Cap of Healing');
  // Woolen Cowl is a body piece that covers the head: the empty head row says so
  const cowl = {
    ...sageSet(),
    pieces: sageSet().pieces.map(p => {
      if (p.slot === 'body') {
        return piece('body', 3193);
      }
      return p.slot === 'head' ? { slot: 'head' } : p;
    }),
  };
  const covered = view(sheetOf('SGE', []), cowl);
  const head = covered.rows.find(r => r.slot === 'head');
  assert.deepEqual(
    [head.empty, head.blockedBy, head.emptyText, head.coveredTitle],
    [true, 'Woolen Cowl', 'Unavailable', 'Covered by Woolen Cowl'],
  );
  assert.equal(covered.rows.find(r => r.slot === 'body').label, 'Body + Head');
});

test('a row under a covering piece is marked covered (its control is off): the Head under a cowl, the Off-hand under a 2H weapon', () => {
  const cowl = sageSet();
  cowl.pieces[2] = { slot: 'head' };
  cowl.pieces[3] = piece('body', 3193); // Woolen Cowl, as in the test above
  const head = view(sheetOf('SGE', []), cowl).rows.find(r => r.slot === 'head');
  assert.deepEqual([head.empty, head.covered, head.shieldNote], [true, true, null]);
  const cane = sageSet();
  cane.pieces[0] = piece('weapon', 9006);
  const offhand = view(sheetOf('WHM', []), cane).rows.find(r => r.slot === 'offhand');
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
  const offhand = v.rows.find(r => r.slot === 'offhand');
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
  const fed = view(sheetOf('SGE', []), sageSet({ pinned: { pieces: [], meal: true }, meal: allMeals(sage).at(-1).key }));
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
  const meal = allMeals(sage).at(-1);
  const v = view(sheetOf('SGE', []), sageSet({ meal: meal.key }));
  assert.deepEqual([v.food.empty, v.food.name, v.food.hq, v.food.ilvl, v.food.note], [false, meal.name, true, meal.ilvl, 'HQ']);
  const touched = v.food.cells.filter(Boolean).map(c => c.stat);
  assert.deepEqual(touched.sort(), [...meal.stats.map(s => s.stat), ...(meal.vit ? ['vit'] : [])].sort());
  assert.ok(v.food.cells.filter(Boolean).every(c => /^\+\d+$/.test(c.text)));
  const none = view(sheetOf('SGE', []), sageSet()).food;
  assert.deepEqual([none.empty, none.cells.every(c => c === null)], [true, true]);
  const gone = view(sheetOf('SGE', []), sageSet({ meal: 'A meal from an older patch' })).food;
  assert.ok(gone.emptyText.includes('A meal from an older patch'), gone.emptyText); // the meal the set holds
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
