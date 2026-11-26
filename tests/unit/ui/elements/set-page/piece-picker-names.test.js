/* The piece picker's click rule (src/ui/elements/set-page/piece-picker-names.ts pieceKeyOfClick): the rows carry their gameId
   (data-game-id) and one handler on the list reads which row was clicked. The rows here are stand-ins for the buttons the element
   draws. The set page's wiring of the picker's events is checked by the smoke step checkPickMenu. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pieceKeyOfClick } from '../../../../../src/ui/elements/set-page/piece-picker-names.ts';

/* A click on `clicked` (or on nothing in a row: clicked null), as the target the list's handler gets. */
const clickOn = clicked => ({ closest: selector => (selector === '.same-item' ? clicked : null) });
/* A row stand-in: its attributes as the element gives them, `disabled` when the button is. */
const row = ({ gameId, disabled = false }) => ({
  disabled,
  dataset: gameId === undefined ? {} : { gameId: String(gameId) },
});

test('piece picker click: a piece row picks its gameId (a number)', () => {
  assert.equal(pieceKeyOfClick(clickOn(row({ gameId: 49579 }))), 49579);
});

test('piece picker click: a disabled row (a Unique ring in the other ring row), a click off any row and a row with no gameId pick nothing', () => {
  assert.equal(pieceKeyOfClick(clickOn(row({ gameId: 49579, disabled: true }))), undefined);
  assert.equal(pieceKeyOfClick(clickOn(null)), undefined);
  assert.equal(pieceKeyOfClick(clickOn(row({}))), undefined);
});
