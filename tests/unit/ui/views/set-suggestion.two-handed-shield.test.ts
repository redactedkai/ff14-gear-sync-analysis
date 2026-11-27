/* Q4: an Auto-fill suggestion taken partly used to save a two-handed weapon beside a shield (White Mage, Black Mage). Real
   items: Tidal Wave Wand (1H) + Tidal Wave Buckler are saved; the answer is Phantom Cane Eclipticum (2H, covers the
   Off-hand) with the Off-hand left empty. A covered Off-hand now follows the weapon's Take box (set-suggestion.ts). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeJobContext } from '../../../../src/core/job-context.ts';
import { poolItemById, slotInfo } from '../../../../src/core/items.ts';
import { appliedFields, suggestionOf, suggestionView } from '../../../../src/ui/views/set-suggestion.ts';
import { SET_ROW_SLOTS } from '../../../../src/ui/sheets/storage.ts';
import { piece, sheetOf } from '../../helpers/sheet-fixtures.ts';
import type { SavedGearSet, SavedRow } from '../../../../src/ui/sheets/saved-types.ts';

const WAND = 7818; // Tidal Wave Wand, White Mage, one-handed
const BUCKLER = 7823; // Tidal Wave Buckler, White Mage shield
const PHANTOM_CANE = 50983; // Phantom Cane Eclipticum, White Mage, two-handed

/* A saved gear set with the rows `pieces`, no meal and no pins. */
const gearSetOf = (pieces: SavedRow[]): SavedGearSet => ({
  id: 'g_1',
  name: 'Set 1',
  description: '',
  pieces,
  meal: null,
  pinned: { pieces: [], meal: false },
  fillSettings: null,
  createdAt: 0,
  updatedAt: 0,
});

test('Apply of a suggestion never saves a two-handed weapon with a shield (Off-hand Take declined)', () => {
  const whm = makeJobContext('WHM');
  const pieces: SavedRow[] = SET_ROW_SLOTS.map(slot => ({ slot }));
  pieces[0] = piece('weapon', WAND);
  pieces[1] = piece('offhand', BUCKLER);
  const saved = gearSetOf(pieces);
  const sheet = sheetOf('WHM', [saved]);

  // the answer of an Auto-fill: the cane, and no Off-hand piece (the cane covers it)
  const answer = { pieces: [piece('weapon', PHANTOM_CANE)], meal: null };
  const suggested = suggestionOf(sheet, saved, answer);
  assert.equal(suggested.pieces[0].gameId, PHANTOM_CANE);
  assert.equal(suggested.pieces[1].gameId ?? null, null);

  // the player takes the weapon and declines the Off-hand change (row 1)
  const { pieces: applied } = appliedFields(saved, suggested, { rows: [1], meal: false }, whm);
  const weapon = applied[0].gameId == null ? null : poolItemById(whm, applied[0].gameId);
  const coversOffhand = weapon !== null && slotInfo(whm, weapon).blocks.includes('offhand');
  assert.ok(
    !(coversOffhand && applied[1].gameId != null),
    `saved ${applied[0].gameId} (two-handed) with a shield ${applied[1].gameId} in the Off-hand`,
  );
});

test('a covered Off-hand follows the weapon: Take box shown taken, and the mirror case (saved cane, suggested shield)', () => {
  const whm = makeJobContext('WHM');
  const rowsOf = (weaponId: number, offhandId: number | null): SavedGearSet => {
    const pieces: SavedRow[] = SET_ROW_SLOTS.map(slot => ({ slot }));
    pieces[0] = piece('weapon', weaponId);
    if (offhandId) {
      pieces[1] = piece('offhand', offhandId);
    }
    return gearSetOf(pieces);
  };

  // saved wand + shield, cane suggested, Off-hand declined: the Off-hand box reads taken (the row empties with the cane)
  const saved = rowsOf(WAND, BUCKLER);
  const sheet = sheetOf('WHM', [saved]);
  const suggested = suggestionOf(sheet, saved, { pieces: [piece('weapon', PHANTOM_CANE)], meal: null });
  const view = suggestionView(sheet, saved, suggested, { rows: [1], meal: false });
  assert.equal(view.takes[1].taken, true);
  assert.equal(view.takes[1].locked, true, 'the Off-hand box follows the weapon');
  assert.equal(view.shown.pieces[1].gameId ?? null, null);

  // saved cane, wand + shield suggested, weapon declined and shield taken: the shield box reads declined
  const savedCane = rowsOf(PHANTOM_CANE, null);
  const sheetCane = sheetOf('WHM', [savedCane]);
  const suggestedPair = { pieces: rowsOf(WAND, BUCKLER).pieces, meal: null, bestMeals: null };
  const { pieces } = appliedFields(savedCane, suggestedPair, { rows: [0], meal: false }, whm);
  assert.equal(pieces[0].gameId, PHANTOM_CANE);
  assert.equal(pieces[1].gameId ?? null, null);
  const mirror = suggestionView(sheetCane, savedCane, suggestedPair, { rows: [0], meal: false }).takes[1];
  assert.deepEqual([mirror.taken, mirror.locked], [false, true]);

  // nothing covered: a one-handed weapon taken with the shield declined keeps the saved shield
  const savedWand = rowsOf(WAND, BUCKLER);
  const wandSuggested = { pieces: rowsOf(WAND, null).pieces, meal: null, bestMeals: null };
  assert.equal(appliedFields(savedWand, wandSuggested, { rows: [1], meal: false }, whm).pieces[1].gameId, BUCKLER);
  const free = suggestionView(sheetOf('WHM', [savedWand]), savedWand, wandSuggested, { rows: [], meal: false }).takes[1];
  assert.ok(!free.locked, 'a one-handed weapon leaves the Off-hand box free');
});
