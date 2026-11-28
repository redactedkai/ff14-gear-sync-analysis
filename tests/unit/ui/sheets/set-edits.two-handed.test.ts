/* A 2H weapon picked by hand on a job that can hold a shield (White Mage): the held Off-hand piece is taken off in the same
   change (placePiece), so Discard, which drops the draft, brings the shield and the old weapon back. Real items: Tidal
   Wave Wand (one-handed) and Buckler, Dreadwyrm Cane (two-handed, slot code that blocks the Off-hand). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeJobContext } from '../../../../src/core/job-context.ts';
import { draftView } from '../../../../src/ui/views/set-draft.ts';
import { editableCopy, placePiece, removedNote } from '../../../../src/ui/sheets/set-edits.ts';
import { hasParts } from '../../helpers/fixtures/common.ts';
import { sheetOf, sageSet, placedOk } from '../../helpers/fixtures/sheet-fixtures.ts';

const WHM = makeJobContext('WHM');
const SGE = makeJobContext('SGE');
const WEAPON = 0;
const OFFHAND = 1;
const TIDAL_WAVE_WAND = 7818;
const TIDAL_WAVE_BUCKLER = 7823;
const DREADWYRM_CANE = 9006;
const GRAND_CHAMPIONS_SYRINXI = 49676; // a Sage weapon (two-handed)

/* A White Mage set holding the wand and the buckler (the buckler pinned unless `pinShield` is false). */
function wandAndShield(pinShield = true) {
  const set = sageSet({ pinned: { pieces: pinShield ? [OFFHAND] : [], meal: false } });
  set.pieces[WEAPON] = { slot: 'weapon', gameId: TIDAL_WAVE_WAND, stones: [] };
  set.pieces[OFFHAND] = { slot: 'offhand', gameId: TIDAL_WAVE_BUCKLER, stones: [] };
  return set;
}

test('a 2H weapon picked over a held shield empties and unpins the Off-hand row and names the shield', () => {
  const set = wandAndShield();
  const placed = placedOk(placePiece(WHM, set, WEAPON, DREADWYRM_CANE));
  assert.equal(placed.ok, true);
  assert.equal(placed.gearSet.pieces[WEAPON].gameId, DREADWYRM_CANE);
  assert.deepEqual(placed.gearSet.pieces[OFFHAND], { slot: 'offhand' });
  assert.deepEqual(placed.gearSet.pinned?.pieces, [WEAPON], 'the cane is pinned, the pin of the removed shield is gone');
  assert.equal(placed.removedNote, removedNote(['Tidal Wave Buckler']));
  assert.ok(hasParts(placed.removedNote, 'Tidal Wave Buckler'), 'the note names the shield');
  assert.equal(set.pieces[OFFHAND].gameId, TIDAL_WAVE_BUCKLER, 'the set given is not changed (Discard drops the draft)');
});

test('the draft shows both rows as changes, and the saved set is what Discard returns to', () => {
  const saved = wandAndShield(false);
  const draft = placedOk(placePiece(WHM, editableCopy(saved), WEAPON, DREADWYRM_CANE)).gearSet;
  const changes = draftView(sheetOf('WHM', [saved]), saved, draft).changes;
  assert.deepEqual(
    changes.rows.map(row => [row.index, row.after]),
    [
      [WEAPON, 'Dreadwyrm Cane'],
      [OFFHAND, 'empty'],
    ],
  );
  assert.equal(saved.pieces[OFFHAND].gameId, TIDAL_WAVE_BUCKLER);
  assert.equal(saved.pieces[WEAPON].gameId, TIDAL_WAVE_WAND);
});

test('a job without an Off-hand row (Sage) keeps the hidden piece and says nothing', () => {
  const set = wandAndShield();
  const placed = placedOk(placePiece(SGE, set, WEAPON, GRAND_CHAMPIONS_SYRINXI));
  assert.equal(placed.removedNote, '');
  assert.equal(placed.gearSet.pieces[OFFHAND].gameId, TIDAL_WAVE_BUCKLER);
});

test('a shield picked while a two-handed weapon is held is refused and the set is unchanged', () => {
  const set = sageSet();
  set.pieces[WEAPON] = { slot: 'weapon', gameId: DREADWYRM_CANE, stones: [] };
  const placed = placePiece(WHM, set, OFFHAND, TIDAL_WAVE_BUCKLER);
  assert.equal(placed.ok, false);
  assert.deepEqual(placed, { ok: false }); // no note: the Off-hand control is covered and says why under it
  assert.equal(set.pieces[OFFHAND].gameId, undefined);
});
