/* The piece menu drawn in steps (src/ui/views/limit-rows.js, piecePickerView's `limit`): the first rows are the first of
   the full list, nothing is dropped or reordered, the count and footer say the whole list, and the cached lines of a
   slot do not carry the set (a Unique ring taken by the other ring row, the piece shown) from one call to the next.
   Real Sage rings and heads; the expected lists come from independent filters over the item data. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JOBS } from '../../../../src/core/constants.ts';
import { categoryOf, jobGear } from '../../../../src/core/items.js';
import { makeJobContext } from '../../../../src/core/job-context.js';
import { FIRST_ROWS, limitRows } from '../../../../src/ui/views/limit-rows.js';
import { piecePickerView } from '../../../../src/ui/views/piece-menu.js';
import { sageSet } from '../../helpers/sheet-fixtures.js';

const SGE = makeJobContext('SGE');
const GEAR = jobGear(SGE);
const RING_1 = 10;
const HEAD = 2;
const keys = view => view.groups.flatMap(g => g.items.map(x => x.key));

test('limitRows keeps the first rows in order, drops empty groups, and does not change the groups it is given', () => {
  const groups = [
    { label: 'A', items: [1, 2, 3] },
    { label: 'B', items: [4, 5] },
    { label: 'C', items: [6] },
  ];
  assert.deepEqual(limitRows(groups, 2), [{ label: 'A', items: [1, 2] }]);
  assert.deepEqual(limitRows(groups, 4), [
    { label: 'A', items: [1, 2, 3] },
    { label: 'B', items: [4] },
  ]);
  assert.deepEqual(
    limitRows(groups, 3).map(g => g.label),
    ['A'],
    'a group that ends the limit exactly leaves none empty',
  );
  assert.deepEqual(limitRows(groups, Infinity), groups);
  assert.deepEqual(limitRows(groups, 0), []);
  assert.equal(groups[0].items.length, 3, 'the input is not cut');
});

test('a limited head menu is the start of the full one; the count and the footer name the whole list', () => {
  const set = sageSet();
  const full = piecePickerView(SGE, GEAR, set, HEAD, '');
  const part = { ...full, groups: limitRows(full.groups, FIRST_ROWS) };
  const heads = GEAR.filter(item => item.type === 'head');
  assert.equal(keys(full).length, heads.length, 'the full menu lists every head piece of the job');
  assert.ok(heads.length > 3 * FIRST_ROWS, 'a long list, so the limit cuts something');
  assert.deepEqual(keys(part), keys(full).slice(0, FIRST_ROWS));
  assert.equal(part.count, heads.length);
  assert.equal(part.footText, full.footText);
  assert.equal(part.footText, `${heads.length} pieces`);
  assert.deepEqual(part.groups[0].items[0], full.groups[0].items[0]);
});

test('a search finds a piece that is past the drawn rows, and the count is of the search', () => {
  const full = piecePickerView(SGE, GEAR, sageSet(), HEAD, '');
  const last = keys(full).at(-1);
  const lastName = GEAR.find(item => item.gameId === last).name;
  const whole = piecePickerView(SGE, GEAR, sageSet(), HEAD, lastName);
  const found = { ...whole, groups: limitRows(whole.groups, FIRST_ROWS) };
  assert.ok(keys(found).includes(last));
  assert.equal(found.count, keys(piecePickerView(SGE, GEAR, sageSet(), HEAD, lastName)).length);
});

test('what depends on the set is read at each call, not kept with the cached lines of the slot', () => {
  const AGATE = 49579; // Bygone Brass Ring of Healing (item level 780), a Unique ring
  const unique = GEAR.find(item => item.gameId === AGATE);
  const wornTwice = sageSet();
  wornTwice.pieces[RING_1] = { slot: 'ring', gameId: AGATE, stones: [] };
  wornTwice.pieces[RING_1 + 1] = { slot: 'ring', gameId: AGATE, stones: [] };
  const taken = piecePickerView(SGE, GEAR, wornTwice, RING_1, '')
    .groups.flatMap(g => g.items)
    .find(x => x.key === AGATE);
  assert.equal(unique.copies, 1);
  assert.equal(taken.unique, true);
  assert.equal(taken.taken, true, 'the other ring row holds it');
  assert.equal(taken.on, true, 'and this row shows it');
  const alone = sageSet();
  const free = piecePickerView(SGE, GEAR, alone, RING_1, '')
    .groups.flatMap(g => g.items)
    .find(x => x.key === AGATE);
  assert.equal(free.taken, false, 'taken from the call before is not kept');
  const otherRow = piecePickerView(SGE, GEAR, alone, HEAD, '');
  assert.equal(otherRow.groups.flatMap(g => g.items).filter(x => x.on).length, 1, 'only the head shown is marked');
});

test('what the template shows is in the view: the row class, the category pill, the Unique note', () => {
  const AGATE = 49579; // a Unique ring (item level 780)
  const held = sageSet();
  held.pieces[RING_1] = { slot: 'ring', gameId: AGATE, stones: [] };
  held.pieces[RING_1 + 1] = { slot: 'ring', gameId: AGATE, stones: [] };
  const items = piecePickerView(SGE, GEAR, held, RING_1, '').groups.flatMap(g => g.items);
  const agate = items.find(x => x.key === AGATE);
  assert.equal(agate.onClass, 'on');
  assert.ok(agate.uniqueText.trim().length > 0, 'a Unique ring held in the other row says so');
  assert.equal(agate.pillClass, `pill cat-${categoryOf(GEAR.find(item => item.gameId === AGATE)).key}`);
  assert.equal(agate.pillLabel, categoryOf(GEAR.find(item => item.gameId === AGATE)).label);
  // a ring that is not Unique, and a ring that is Unique and free
  const plain = items.find(x => !x.unique);
  assert.deepEqual([plain.onClass, plain.uniqueText], ['', '']);
  const free = piecePickerView(SGE, GEAR, sageSet(), RING_1, '')
    .groups.flatMap(g => g.items)
    .find(x => x.key === AGATE);
  assert.ok(free.uniqueText.trim().length > 0 && free.uniqueText !== agate.uniqueText, 'a free Unique ring says Unique only');
  assert.equal(free.onClass, '');
});

test('every piece a picker lists has a category, since the template draws its pill for every row', () => {
  for (const id of Object.keys(JOBS)) {
    const job = makeJobContext(id);
    const gear = jobGear(job);
    assert.ok(gear.length > 0, id);
    assert.deepEqual(
      gear.filter(item => !categoryOf(item)).map(item => item.gameId),
      [],
      `${id}: pieces without a category`,
    );
  }
});
