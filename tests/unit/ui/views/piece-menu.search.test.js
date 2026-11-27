/* The search box of a set page's piece menu (src/ui/views/piece-menu.ts piecePickerView): every word must be in the piece's
   name or its gear category, in any order and case; groups the search empties are dropped; a search that leaves nothing
   says so. Real Sage ring rows. Replaces the old "Same-result menu search" test of the removed Gear tab. Expected
   pieces are real rings (item level, category as listed by the game data):
   16539 Alexandrian Ring of Healing (Savage, 270), 16463 Prototype Alexandrian Ring of Healing (Raid, 250),
   17516 Proto Ultima Ring of Healing (Alliance raid, 270), 24428 Alliance Ring of Healing (Dungeon, 375),
   18967 Imperial Jade Ring of Healing (Crafted, 290). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { categoryOf, jobGear } from '../../../../src/core/items.ts';
import { makeJobContext } from '../../../../src/core/job-context.ts';
import { piecePickerView } from '../../../../src/ui/views/piece-menu.ts';
import { sageSet } from '../../helpers/sheet-fixtures.ts';

const SGE = makeJobContext('SGE');
const RING_1 = 10;
const GEAR = jobGear(SGE);
const keysFor = query => piecePickerView(SGE, GEAR, sageSet(), RING_1, query).groups.flatMap(g => g.items.map(x => x.key));

test('every word of the search must be in the name or the category, in any order and case', () => {
  const ALEXANDRIAN = 16539;
  const PROTOTYPE_ALEXANDRIAN = 16463; // Raid, item level 250
  assert.deepEqual(keysFor('alexandrian'), [ALEXANDRIAN, PROTOTYPE_ALEXANDRIAN], 'newest first');
  assert.deepEqual(keysFor('HEALING  prototype   ALEXANDRIAN'), [PROTOTYPE_ALEXANDRIAN], 'case and extra spaces do not matter');
  assert.deepEqual(keysFor('alexandrian prototype'), [PROTOTYPE_ALEXANDRIAN], 'nor does the order');
  // name words and a category word together: the Savage rings of Healing
  const savage = keysFor('ring heal savage');
  assert.ok(savage.includes(ALEXANDRIAN));
  assert.ok(!savage.includes(18967), 'a Crafted ring of Healing has no "savage"');
  // the same answer from an independent filter over the item data
  const expected = GEAR.filter(
    i => i.type === 'ring' && /ring/i.test(i.name) && /heal/i.test(i.name) && categoryOf(i)?.label === 'Savage',
  ).map(i => i.gameId);
  assert.deepEqual(
    [...savage].sort((a, b) => a - b),
    expected.sort((a, b) => a - b),
  );
  assert.ok(expected.length > 1, 'a real range, not one lucky piece');
});

test('a word found only in the gear category matches; a word in neither leaves nothing', () => {
  // "Alliance Ring of Healing" (Dungeon, 375) has the word in its name, "Proto Ultima Ring of Healing" (Alliance raid, 270) in its category
  assert.deepEqual(keysFor('alliance'), [24428, 17516]);
  assert.deepEqual(keysFor('alliance raid'), [17516], 'every word, in the name or the category');
  assert.deepEqual(keysFor('alliance alexandrian'), [], 'every word, not any word');
  assert.deepEqual(keysFor('zzzz'), []);
});

test('groups the search empties are dropped; with no search every ring is listed', () => {
  const all = piecePickerView(SGE, GEAR, sageSet(), RING_1, '');
  assert.ok(all.groups.length > 1);
  assert.equal(
    all.groups.reduce((n, g) => n + g.items.length, 0),
    GEAR.filter(i => i.type === 'ring').length,
  );
  const one = piecePickerView(SGE, GEAR, sageSet(), RING_1, 'alexandrian');
  assert.equal(one.groups.length, 1);
  assert.ok(one.groups.every(g => g.items.length > 0));
  assert.equal(one.emptyText, '');
});

test('a search with no match names the search, trimmed', () => {
  const none = piecePickerView(SGE, GEAR, sageSet(), RING_1, '  zzzz ');
  assert.deepEqual(none.groups, []);
  assert.ok(none.emptyText.includes('zzzz'), none.emptyText); // the query
});
