/* The page's menu placement (src/ui/elements/set-page/menus.ts): where the window's line for menus is. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { MenuBox } from '../../../../../src/ui/elements/set-page/menus.ts';
import type { HostElement } from '../../../../../src/ui/elements/set-page/session-types.ts';
import { bind } from '../../../helpers/set-page-bind.ts';
import { domRect, stubGlobal } from '../../../helpers/dom-fakes.ts';

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
function pageWith({ buttonTop, menuHeight }: { buttonTop: number; menuHeight: number }) {
  let shift = 0; // how far the page has scrolled down
  const scrolls: (number | undefined)[] = [];
  const list = { style: { maxHeight: '' }, getBoundingClientRect: () => domRect(0, menuHeight - 60) };
  const box = (top: number, height: number) => domRect(top - shift, height);
  const button = { getBoundingClientRect: () => box(buttonTop, BUTTON_HEIGHT) };
  const menu: MenuBox = {
    offsetParent: button,
    querySelector: () => list,
    style: { maxHeight: '' },
    getBoundingClientRect: () =>
      box(
        buttonTop + BUTTON_HEIGHT + MENU_GAP,
        Math.min(menuHeight, list.style.maxHeight ? 60 + parseFloat(list.style.maxHeight) : menuHeight),
      ),
  };
  // the page's own boxes, found by selector as the element's `query` does
  const boxes: Record<string, HostElement> = {
    '.shead': pageBox(HEADER_BOTTOM),
    '.settable thead th': pageBox(NAMES_BOTTOM),
  };
  const { session, host } = bind();
  host.query = selector => boxes[selector] ?? null;
  const restoreHeight = stubGlobal('innerHeight', WINDOW_HEIGHT);
  const restoreScroll = stubGlobal('scrollBy', ({ top }: ScrollToOptions) => {
    scrolls.push(top);
    shift += top ?? 0;
  });
  const run = () => {
    try {
      session.menus.keepMenuInView(menu);
    } finally {
      restoreHeight();
      restoreScroll();
    }
    return { scrolls, maxHeight: list.style.maxHeight, buttonTop: button.getBoundingClientRect().top };
  };
  return { run };
}

/* A box of the page whose bottom edge is `bottom` px under the window's top. */
function pageBox(bottom: number): HostElement {
  return { focus() {}, scrollIntoView() {}, getBoundingClientRect: () => domRect(bottom, 0) };
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
