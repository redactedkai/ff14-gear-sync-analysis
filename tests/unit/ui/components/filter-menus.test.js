/* Where the Spare points note opens (src/ui/components/filter-menus.js: placeMenu, placeKeepingScroll, isOwnScroll). The Expansion and Gear
   categories menus are Lit elements now and have their own tests (tests/unit/ui/elements/gear-browser/). TODO: goes with the file when R29
   moves the note to a Zag popover. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { menuFloat, placeKeepingScroll } from '../../../../src/ui/components/filter-menus.js';

/* The globals placeMenu reads, a window of 1000 x 600 px, put back when the test ends. */
function windowOf1000x600(t) {
  for (const [name, value] of [
    ['window', { innerHeight: 600 }],
    ['document', { documentElement: { clientWidth: 1000 } }],
  ]) {
    const had = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
    t.after(() => (had ? Object.defineProperty(globalThis, name, had) : delete globalThis[name]));
  }
}

/* A menu and its button as placeMenu reads them: boxes in px, in a window of 1000 x 600. `contentRight`: the right edge of the page's
   content column (.wrap), which on a wide window is well inside the window's. */
function menuAt({ inPopover, menuWidth, menuHeight = 200, button, popover = false, popoverRight = 1000, contentRight = 1000 }) {
  const classes = new Set();
  const menu = {
    style: {},
    classList: { add: name => classes.add(name), remove: name => classes.delete(name), contains: name => popover && name === 'popover' },
    closest: selector => {
      if (inPopover && selector === '.setpop') {
        return { getBoundingClientRect: () => ({ right: popoverRight }) };
      }
      if (selector === '.wrap') {
        return { getBoundingClientRect: () => ({ right: contentRight }) };
      }
      return null;
    },
    getBoundingClientRect: () => ({
      width: menuWidth,
      height: menuHeight,
      right: (Number.parseFloat(menu.style.left) || button.left) + menuWidth,
    }),
  };
  const anchor = { getBoundingClientRect: () => ({ ...button, right: button.left + button.width, bottom: button.top + button.height }) };
  return { menu, anchor, classes };
}

test('placeMenu in the Auto-fill settings: under its button, cut to the window bottom, leftwards past the right edge', t => {
  windowOf1000x600(t);
  const { placeMenu } = menuFloat;
  // room on the right: its left edge on the button's; the height is what is left under the button, minus 12
  let { menu, anchor } = menuAt({ inPopover: true, menuWidth: 300, button: { left: 100, top: 200, width: 150, height: 40 } });
  placeMenu(menu, anchor);
  assert.deepEqual([menu.style.top, menu.style.left, menu.style.maxHeight, menu.style.minWidth], ['244px', '100px', '344px', '150px']);
  // no room on the right: its right edge on the button's
  ({ menu, anchor } = menuAt({ inPopover: true, menuWidth: 360, button: { left: 800, top: 200, width: 150, height: 40 } }));
  placeMenu(menu, anchor);
  assert.equal(menu.style.left, '590px');
  // room in the window but not in the popover (it ends at 900): its right edge on the button's, so it hangs inside the popover
  ({ menu, anchor } = menuAt({
    inPopover: true,
    menuWidth: 300,
    button: { left: 700, top: 200, width: 150, height: 40 },
    popoverRight: 900,
  }));
  placeMenu(menu, anchor);
  assert.equal(menu.style.left, '550px');
  // a menu that does not fit below the button (window 600 high) opens over it, its own height, ending 4 px over the button
  ({ menu, anchor } = menuAt({
    inPopover: true,
    menuWidth: 300,
    menuHeight: 300,
    button: { left: 100, top: 400, width: 150, height: 40 },
  }));
  placeMenu(menu, anchor);
  assert.deepEqual([menu.style.top, menu.style.maxHeight], ['96px', '300px']);
  // with a control to keep clear (its label row, at y 370, holds the (i) button): it ends 4 px over that row instead (370 - 4 - 300)
  placeMenu(menu, anchor, { getBoundingClientRect: () => ({ top: 370 }) });
  assert.deepEqual([menu.style.top, menu.style.maxHeight], ['66px', '300px']);
  // a menu taller than the room on both sides, with more room below: under the button, cut to the room, 160 px at least
  ({ menu, anchor } = menuAt({ inPopover: true, menuWidth: 300, menuHeight: 900, button: { left: 100, top: 2, width: 150, height: 588 } }));
  placeMenu(menu, anchor);
  assert.deepEqual([menu.style.top, menu.style.maxHeight], ['594px', '160px']);
});

test('placeMenu in the Auto-fill settings: a note (.popover) has its right edge on the button, with room on the right too', t => {
  windowOf1000x600(t);
  const { placeMenu } = menuFloat;
  const { menu, anchor } = menuAt({
    inPopover: true,
    popover: true,
    menuWidth: 290,
    button: { left: 560, top: 200, width: 20, height: 20 },
  });
  placeMenu(menu, anchor);
  assert.equal(menu.style.left, '290px', 'the button ends at 580, the note is 290 wide');
});

test('placeMenu on a page: no fixed placement, only leftwards near the right edge', t => {
  windowOf1000x600(t);
  const { placeMenu } = menuFloat;
  const { menu, anchor, classes } = menuAt({ inPopover: false, menuWidth: 300, button: { left: 800, top: 200, width: 150, height: 40 } });
  placeMenu(menu, anchor);
  assert.deepEqual([Object.keys(menu.style).length, [...classes]], [0, ['to-left']]);
});

test('placeMenu on a page: leftwards when it would pass the right edge of the content, not only the window', t => {
  // a wide window whose content column (.wrap, 1,280 px at most) ends at 700: the menu would end at 790, inside the window
  windowOf1000x600(t);
  const { placeMenu } = menuFloat;
  const passes = menuAt({ inPopover: false, menuWidth: 300, contentRight: 700, button: { left: 490, top: 200, width: 150, height: 40 } });
  placeMenu(passes.menu, passes.anchor);
  assert.deepEqual([...passes.classes], ['to-left']);
  const fits = menuAt({ inPopover: false, menuWidth: 300, contentRight: 700, button: { left: 390, top: 200, width: 150, height: 40 } });
  placeMenu(fits.menu, fits.anchor);
  assert.deepEqual([...fits.classes], [], 'a menu that ends at the content edge stays where its CSS puts it');
});

/* A scrolling box as the browser treats it: any change of its max-height clamps its scrollTop (here to 0, as when a box
   grows to its natural height and the scroll range vanishes for a moment). */
function scrollingBox(scrollTop) {
  const box = { scrollTop, style: {}, getBoundingClientRect: () => ({ height: 515 }) };
  let maxHeight = '';
  Object.defineProperty(box.style, 'maxHeight', {
    get: () => maxHeight,
    set: value => {
      maxHeight = value;
      box.scrollTop = 0;
    },
  });
  return box;
}

test('placeKeepingScroll: measures the natural height with the max-height lifted and keeps the scroll position', () => {
  const box = scrollingBox(80);
  let measured;
  placeKeepingScroll(box, height => {
    measured = [height, box.style.maxHeight];
    box.style.maxHeight = '371px';
  });
  assert.deepEqual(measured, [515, 'none']);
  assert.equal(box.style.maxHeight, '371px');
  assert.equal(box.scrollTop, 80, 'the box was scrolled to 80 px and placing it again must not send it back to the top');
});

test('isOwnScroll: true for a scroll inside one of the boxes, false for the page or a missing box', () => {
  const { isOwnScroll } = menuFloat;
  const inside = {};
  const box = { contains: node => node === inside };
  assert.equal(isOwnScroll({ target: inside }, undefined, box), true);
  assert.equal(isOwnScroll({ target: {} }, box), false);
  assert.equal(isOwnScroll({ target: {} }), false);
});
