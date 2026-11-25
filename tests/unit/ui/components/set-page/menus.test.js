/* The page's menu placement (src/ui/components/set-page/menus.js): where the window's line for menus is. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { menusPart } from '../../../../../src/ui/components/set-page/menus.js';

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
    viewTop: part.viewTop,
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
