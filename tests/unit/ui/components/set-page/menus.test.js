/* The piece picker's one click handler on a set page (src/ui/components/set-page/menus.js pickClick): the rows carry
   their data (data-game-id) and the handler reads which row was clicked. The rows are stand-ins for
   the buttons of the page. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { menusPart } from '../../../../../src/ui/components/set-page/menus.js';

/* A click on `clicked` (or on nothing in the list: clicked null), as the list's @click handler gets it. */
const clickOn = clicked => ({ target: { closest: selector => (selector === '.same-item' ? clicked : null) } });
/* A row stand-in: its attributes as the page gives them, `disabled` when the button is. */
const row = ({ gameId, disabled = false }) => ({
  disabled,
  dataset: gameId === undefined ? {} : { gameId: String(gameId) },
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

test('piece picker click: a disabled row (a Unique ring in the other ring row) and a click off any row do nothing', () => {
  const { click, picks } = handler();
  click(clickOn(row({ gameId: 49579, disabled: true })), 10);
  click(clickOn(null), 10);
  click(clickOn(row({})), 10); // a row with no gameId
  assert.deepEqual(picks, []);
});

/* keepMenuInView: the page scrolls to show an opened table menu and keeps its button below the pinned header and the stuck
   column names. Stand-ins for the window (innerHeight, scrollBy) and the page's boxes, in px of the window. */
const HEADER_BOTTOM = 124;
const NAMES_BOTTOM = 160;
const WINDOW_HEIGHT = 720;
const BUTTON_HEIGHT = 30;
const MENU_GAP = 4; // the menu opens this far under its button's box
const BUTTON_MARGIN = 8; // the button is kept this far under the column names

/* A set page's boxes with the button box at `buttonTop` and a menu `menuHeight` tall hanging under it; the scrolls the
   page is asked for are in `scrolls` (a scroll moves the boxes, as the page does). `list.maxHeight` is what the menu's list
   was cut to ('' when not). */
function pageWith({ buttonTop, menuHeight }) {
  let shift = 0; // how far the page has scrolled down
  const scrolls = [];
  const list = { style: { maxHeight: '' }, getBoundingClientRect: () => ({ height: menuHeight - 60 }) };
  const box = (top, height) => ({ top: top - shift, bottom: top - shift + height, height });
  const button = { getBoundingClientRect: () => box(buttonTop, BUTTON_HEIGHT) };
  const menu = {
    offsetParent: button,
    closest: () => null,
    querySelector: selector => (selector === '.menu-list' ? list : null),
    style: {},
    getBoundingClientRect: () =>
      box(
        buttonTop + BUTTON_HEIGHT + MENU_GAP,
        Math.min(menuHeight, list.style.maxHeight ? 60 + parseFloat(list.style.maxHeight) : menuHeight),
      ),
  };
  const part = menusPart(value => value);
  const owner = {
    $refs: {
      head: { getBoundingClientRect: () => ({ bottom: HEADER_BOTTOM }) },
      table: { querySelector: () => ({ getBoundingClientRect: () => ({ bottom: NAMES_BOTTOM }) }) },
    },
    menuRoom: part.menuRoom,
  };
  const saved = { innerHeight: globalThis.innerHeight, scrollBy: globalThis.scrollBy };
  globalThis.innerHeight = WINDOW_HEIGHT;
  globalThis.scrollBy = ({ top }) => {
    scrolls.push(top);
    shift += top;
  };
  const run = () => {
    try {
      part.keepMenuInView.call(owner, menu);
    } finally {
      Object.assign(globalThis, saved);
    }
    return { scrolls, maxHeight: list.style.maxHeight, buttonTop: button.getBoundingClientRect().top };
  };
  return { run };
}

test('keepMenuInView: a menu whose button is under the column names scrolls the page up until the button is below them', () => {
  const { scrolls, buttonTop } = pageWith({ buttonTop: 120, menuHeight: 300 }).run();
  assert.deepEqual(scrolls, [120 - NAMES_BOTTOM - BUTTON_MARGIN]);
  assert.equal(buttonTop, NAMES_BOTTOM + BUTTON_MARGIN);
});

test('keepMenuInView: a menu too tall for the room scrolls the page to put its button under the names and cuts its list to fit', () => {
  const { scrolls, maxHeight, buttonTop } = pageWith({ buttonTop: 300, menuHeight: 600 }).run();
  assert.equal(buttonTop, NAMES_BOTTOM + BUTTON_MARGIN, 'the button is the line, not the menu top');
  assert.deepEqual(scrolls, [300 - NAMES_BOTTOM - BUTTON_MARGIN]);
  // from under the button to the window's bottom (12 px margin), less the search box and footer (60 px)
  const menuTop = NAMES_BOTTOM + BUTTON_MARGIN + BUTTON_HEIGHT + MENU_GAP;
  assert.equal(maxHeight, `${WINDOW_HEIGHT - 12 - menuTop - 60}px`);
});

test('keepMenuInView: a menu that fits where it opened does not move the page', () => {
  const { scrolls } = pageWith({ buttonTop: 300, menuHeight: 300 }).run();
  assert.deepEqual(scrolls, []);
});
