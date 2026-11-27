/* The piece picker's click rule (src/ui/elements/set-page/piece-picker-names.ts pieceKeyOfRow, which pieceKeyOfClick calls with the row a click is in): the rows carry their gameId
   (data-game-id) and one handler on the list reads which row was clicked. The rows here are stand-ins for the buttons the element
   draws. The set page's wiring of the picker's events is checked by the smoke step checkPickMenu. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pieceKeyOfRow } from '../../../../../src/ui/elements/set-page/piece-picker-names.ts';
import type { PickerRow } from '../../../../../src/ui/elements/set-page/piece-picker-names.ts';

/* A row stand-in: its attributes as the element gives them, `disabled` when the button is. */
const row = ({ gameId, disabled = false }: { gameId?: number; disabled?: boolean }): PickerRow => ({
  disabled,
  dataset: gameId === undefined ? {} : { gameId: String(gameId) },
});

test('piece picker click: a piece row picks its gameId (a number)', () => {
  assert.equal(pieceKeyOfRow(row({ gameId: 49579 })), 49579);
});

test('piece picker click: a disabled row (a Unique ring in the other ring row), a click off any row and a row with no gameId pick nothing', () => {
  assert.equal(pieceKeyOfRow(row({ gameId: 49579, disabled: true })), undefined);
  assert.equal(pieceKeyOfRow(null), undefined);
  assert.equal(pieceKeyOfRow(row({})), undefined);
});
