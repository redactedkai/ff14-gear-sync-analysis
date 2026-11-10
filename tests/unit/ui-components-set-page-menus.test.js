/* The piece picker's one click handler on a set page (src/ui/components/set-page/menus.js pickClick): the rows carry
   their data (data-game-id, data-empty-slot) and the handler reads which row was clicked. The rows are stand-ins for
   the buttons of the page. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { menusPart } from '../../src/ui/components/set-page/menus.js';

/* A click on `row` (or on nothing in the list: row null), as the list's @click handler gets it. */
const clickOn = row => ({ target: { closest: selector => (selector === '.same-item' ? row : null) } });
/* A row stand-in: its attributes as the page gives them, `disabled` when the button is. */
const row = ({ gameId, empty = false, disabled = false }) => ({
  disabled,
  dataset: gameId === undefined ? {} : { gameId: String(gameId) },
  hasAttribute: name => name === 'data-empty-slot' && empty,
});

/* The handler with a pick that records what it is given. */
function handler() {
  const picks = [];
  const part = menusPart(value => value);
  const owner = { pick: (index, gameId) => picks.push([index, gameId]) };
  return { click: (event, index) => part.pickClick.call(owner, event, index), picks };
}

test('piece picker click: a piece row picks its gameId (a number) for the menu row', () => {
  const { click, picks } = handler();
  click(clickOn(row({ gameId: 49579 })), 10);
  assert.deepEqual(picks, [[10, 49579]]);
});

test('piece picker click: the Empty this slot row picks null', () => {
  const { click, picks } = handler();
  click(clickOn(row({ empty: true })), 2);
  assert.deepEqual(picks, [[2, null]]);
});

test('piece picker click: a disabled row (a Unique ring in the other ring row) and a click off any row do nothing', () => {
  const { click, picks } = handler();
  click(clickOn(row({ gameId: 49579, disabled: true })), 10);
  click(clickOn(null), 10);
  click(clickOn(row({})), 10); // a row with neither a gameId nor the empty mark
  assert.deepEqual(picks, []);
});
