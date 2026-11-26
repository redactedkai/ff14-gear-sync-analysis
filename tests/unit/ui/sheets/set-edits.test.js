/* The edits a player makes by hand on a set page (src/ui/sheets/set-edits.js) on real items: a piece, a stone, the meal, a
   pin. Expected values come from the items' published facts (slots, Unique rings, materia grades), not from the code. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { piecePickerView } from '../../../../src/ui/views/piece-menu.js';
import { jobGear } from '../../../../src/core/items.ts';
import { makeJobContext } from '../../../../src/core/job-context.ts';
import { placePiece, withMeal, withPin, withStone, withoutStone } from '../../../../src/ui/sheets/set-edits.js';
import { rowLabel } from '../../../../src/ui/sheets/saved-set.js';
import { hasParts } from '../../helpers/common.js';
import { SAGE_IDS, THREE_CRIT_IV, sageSet } from '../../helpers/sheet-fixtures.js';

const SGE = makeJobContext('SGE');
const HEAD = 2;
const RING_1 = 10;
const RING_2 = 11;
/* Augmented Bygone Brass Ring of Healing (item level 790): a Unique ring. */
const UNIQUE_RING = 49656;

test('row names: the slot, and the two ring rows numbered', () => {
  const set = sageSet();
  assert.deepEqual([rowLabel(set, HEAD), rowLabel(set, RING_1), rowLabel(set, RING_2)], ['Head', 'Ring 1', 'Ring 2']);
});

test('a piece placed by hand: its materia slots empty, the row pinned; emptied rows unpinned', () => {
  const set = sageSet({ pinned: { pieces: [HEAD], meal: false } });
  // the Rainbow Cap of Healing again: 2 guaranteed slots and 3 overmeld ones, so 5 empty slots, the old stones gone
  const placed = placePiece(SGE, set, HEAD, SAGE_IDS.head);
  assert.equal(placed.ok, true);
  assert.deepEqual(placed.gearSet.pieces[HEAD].stones, [null, null, null, null, null]);
  assert.ok(hasParts(placed.note, 'Head', 'Rainbow Cap of Healing'), placed.note);
  const body = placePiece(SGE, set, 3, SAGE_IDS.body).gearSet;
  assert.deepEqual(body.pinned.pieces, [HEAD, 3]);
  assert.deepEqual(set.pinned.pieces, [HEAD], 'the set given is not changed');

  const emptied = placePiece(SGE, set, HEAD, null);
  assert.deepEqual([emptied.gearSet.pieces[HEAD], emptied.gearSet.pinned.pieces], [{ slot: 'head' }, []]);
  assert.ok(emptied.note.includes('Head'), emptied.note);
  assert.notEqual(emptied.note, placed.note);
});

test('a Unique ring goes in one ring row only; the Agate Ring (not Unique) in both', () => {
  const one = placePiece(SGE, sageSet(), RING_1, UNIQUE_RING).gearSet;
  const twice = placePiece(SGE, one, RING_2, UNIQUE_RING);
  assert.equal(twice.ok, false);
  assert.deepEqual(twice, { ok: false }); // refused, with no note: the picker never offers it
  assert.equal(placePiece(SGE, one, RING_1, UNIQUE_RING).ok, true, 'the same row may take it again');
  assert.equal(placePiece(SGE, sageSet(), RING_2, SAGE_IDS.ring).ok, true);

  const picker = piecePickerView(SGE, jobGear(SGE), one, RING_2, 'Augmented Bygone Brass');
  const item = picker.groups.flatMap(g => g.items).find(x => x.key === UNIQUE_RING);
  assert.deepEqual([item.unique, item.taken], [true, true]);
});

test('stones fill in order, and only the last one comes out', () => {
  const set = sageSet(); // the head holds Critical Hit IV in slots 1 to 3
  const added = withStone(SGE, set, HEAD, 4, { stat: 'det', grade: 4 });
  assert.deepEqual(added.pieces[HEAD].stones, [...THREE_CRIT_IV, { stat: 'det', grade: 4 }, null], 'slot 5 asked, slot 4 taken');
  assert.deepEqual(added.pinned.pieces, [HEAD]);
  const swapped = withStone(SGE, set, HEAD, 0, { stat: 'det', grade: 3 });
  assert.deepEqual(swapped.pieces[HEAD].stones[0], { stat: 'det', grade: 3 }, 'a held slot takes the new stone');

  assert.equal(withoutStone(SGE, set, HEAD, 0), set, 'slot 1 is not the last stone');
  assert.deepEqual(withoutStone(SGE, set, HEAD, 2).pieces[HEAD].stones, [...THREE_CRIT_IV.slice(0, 2), null, null, null]);
});

test('the meal: chosen by hand it is pinned; no food unpins it', () => {
  const fed = withMeal(sageSet(), 'f1');
  assert.deepEqual([fed.meal, fed.pinned.meal], ['f1', true]);
  assert.deepEqual([withMeal(fed, null).meal, withMeal(fed, null).pinned.meal], [null, false]);
  assert.deepEqual(withPin(withPin(sageSet(), 5, true), 5, false).pinned.pieces, []);
});
