/* The members the components share for the "Gear categories" and Expansion filters (src/ui/components/filter-menus.js), bound to a
   plain store as Alpine binds them, the Gear categories menu's tabs, tab counts and tab keys, and where a floating menu opens
   (placeBelowOrAbove, placeMenu). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACTIVITIES, EXPANSIONS } from '../../../../src/core/constants.js';
import { CURRENT_TOMES, MAX_LEVEL } from '../../../../src/core/tables.js';
import {
  GEAR_FROM_SECTIONS,
  expansionToggles,
  fromTabAfterKey,
  gearFromCountText,
  gearFromCountWords,
  gearFromHint,
  gearFromSummary,
  gearFromToggles,
  placeBelowOrAbove,
  placeKeepingScroll,
} from '../../../../src/ui/components/filter-menus.js';
import { DEFAULT_EXCLUDE } from '../../../../src/ui/job-sync-panel.js';
import { hasNumber, hasParts } from '../../helpers/common.js';

test('Gear categories button text: All, None, All but N up to five left out, then N of M; the market board only when off', () => {
  const keys = ACTIVITIES.map(a => a.key);
  const total = keys.length;
  assert.equal(gearFromSummary([]), 'All');
  assert.equal(gearFromSummary(keys), 'None');
  for (let n = 1; n <= 5; n++) assert.equal(gearFromSummary(keys.slice(0, n)), `All but ${n}`);
  assert.equal(gearFromSummary(keys.slice(0, 6)), `${total - 6} of ${total}`);
  assert.equal(gearFromSummary(DEFAULT_EXCLUDE), `${total - DEFAULT_EXCLUDE.length} of ${total}`);
  assert.equal(gearFromSummary([]), 'All');
  assert.equal(gearFromSummary(keys), 'None');
});

test('Gear categories menu: every box once, in its tab; each hint filled in', () => {
  const laidOut = GEAR_FROM_SECTIONS.flatMap(tab => tab.boxes);
  assert.deepEqual(laidOut.map(box => box.key).sort(), ACTIVITIES.map(a => a.key).sort());
  assert.ok(Object.isFrozen(GEAR_FROM_SECTIONS));
  // the placeholders: the current tomestones from the data, the level cap's patch series (7.x at level 100)
  for (const a of ACTIVITIES) assert.doesNotMatch(gearFromHint(a), /[{}]/, a.key);
  const byKey = key => gearFromHint(ACTIVITIES.find(a => a.key === key));
  assert.ok(hasParts(byKey('tomes_current'), ...CURRENT_TOMES), byKey('tomes_current')); // the tomestones from the data
  assert.ok(byKey('savage_current').includes(`${EXPANSIONS.findIndex(e => e.levelCap === MAX_LEVEL) + 2}.x`), byKey('savage_current')); // the patch series
});

/* A component built from gearFromToggles or expansionToggles, bound to a store with both parts, as Alpine binds it. */
function component(members, store) {
  return Object.assign(members, { $store: { app: store } });
}
const twoParts = () => ({
  opt: { exclude: [...DEFAULT_EXCLUDE], market: true, expOff: [] },
  browse: { exclude: [], market: false, expOff: ['ARR'] },
});

test("Gear categories boxes: a box on or off, All, None and Default, on the component's own part only", () => {
  const store = twoParts();
  const opt = component(gearFromToggles('opt'), store);
  const keys = ACTIVITIES.map(a => a.key);
  assert.equal(opt.fromOn('pvp'), false);
  assert.equal(opt.fromOn('crafted'), true);
  // a box on: out of the list; a box off: into it, the list kept in ACTIVITIES order
  opt.setFromOn('pvp', true);
  assert.ok(!store.opt.exclude.includes('pvp'));
  opt.setFromOn('crafted', false);
  assert.deepEqual(
    store.opt.exclude,
    keys.filter(k => k === 'crafted' || (DEFAULT_EXCLUDE.includes(k) && k !== 'pvp')),
  );
  opt.setFromAll('none');
  assert.deepEqual(store.opt.exclude, keys);
  assert.equal(opt.fromSummary(), 'None');
  opt.setFromAll('all');
  assert.deepEqual(store.opt.exclude, []);
  opt.setFromAll('default');
  assert.deepEqual(store.opt.exclude, DEFAULT_EXCLUDE);
  assert.notEqual(store.opt.exclude, DEFAULT_EXCLUDE, 'a copy, so a later box does not change the default');
  // the browser's part is left alone, and its summary is its own
  assert.deepEqual(store.browse.exclude, []);
  const browse = component(gearFromToggles('browse'), store);
  assert.equal(browse.fromSummary(), 'All');
  // the market board switch is not in the text: its own flag and words drive the glyph (gold included, red and slashed excluded)
  assert.equal(browse.fromMarketOff(), true);
  assert.equal(opt.fromMarketOff(), false);
  const includedWords = opt.fromMarketWords();
  opt.setMarket(false);
  assert.equal(opt.fromMarketOff(), true);
  assert.ok(opt.fromMarketWords().length > 0 && opt.fromMarketWords() !== includedWords, 'on and off are worded differently');
  assert.equal(opt.fromSummary(), `${ACTIVITIES.length - DEFAULT_EXCLUDE.length} of ${ACTIVITIES.length}`);
});

test('Gear categories piece counts: a number per box, none before the count has landed, words for a screen reader', () => {
  const menu = component(gearFromToggles('opt'), twoParts());
  // before a count has landed (the component has none): no number, no sentence about one
  assert.deepEqual([menu.fromCount('crafted'), menu.fromCountText('crafted'), menu.fromCountWords('crafted')], [null, '', '']);
  menu.fromCounts = { crafted: 1380, pvp: 0, quests: 1 };
  assert.deepEqual([menu.fromCount('crafted'), menu.fromCount('pvp')], [1380, 0]);
  assert.equal(menu.fromCountText('crafted'), '1,380');
  assert.equal(menu.fromCountText('pvp'), '0');
  assert.equal(menu.fromCountText('quests'), '1');
  assert.equal(menu.fromCountText('hunts'), '', 'a box with no entry shows nothing');
  assert.equal(menu.fromCountWords('crafted'), '1,380 pieces in this category under the current filters.');
  assert.equal(menu.fromCountWords('quests'), '1 piece in this category under the current filters.');
  assert.equal(menu.fromCountWords('pvp'), 'No pieces in this category for this job and filters.');
  assert.equal(menu.fromCountWords('hunts'), '');
  assert.equal(menu.fromZero('pvp'), true);
  assert.deepEqual([menu.fromZero('crafted'), menu.fromZero('hunts')], [false, false], 'no number yet is not a zero');
});

test('Gear categories piece count text: thousands separators; the words say one piece in the singular', () => {
  assert.equal(gearFromCountText(88888), '88,888');
  assert.equal(gearFromCountText(0), '0');
  assert.equal(gearFromCountText(null), '');
  assert.equal(gearFromCountWords(2), '2 pieces in this category under the current filters.');
  assert.equal(gearFromCountWords(1), '1 piece in this category under the current filters.');
  assert.equal(gearFromCountWords(0), 'No pieces in this category for this job and filters.');
  assert.equal(gearFromCountWords(null), '');
});

test('Gear categories tabs: Everyday, Side content and Hard content, with the real boxes and hints (no Time-limited, no Market board tab)', () => {
  assert.deepEqual(
    GEAR_FROM_SECTIONS.map(tab => [tab.key, tab.title, tab.boxes.length, tab.rows, tab.byRow]),
    [
      ['everyday', 'Everyday', 8, 4, false],
      ['side-content', 'Side content', 7, 4, false],
      ['hard-content', 'Hard content', 5, 3, true],
    ],
  );
  // Events & promotions is the last box of Side content, after PvP
  assert.deepEqual(
    GEAR_FROM_SECTIONS[1].boxes.map(box => box.key),
    ['deep_dungeons', 'gold_saucer', 'relics', 'wondrous_tails', 'variant', 'pvp', 'events'],
  );
  // Everyday and Side content list their section's boxes in ACTIVITIES order, with their labels and filled-in hints
  for (const tab of GEAR_FROM_SECTIONS.filter(t => !t.byRow)) {
    const expected = ACTIVITIES.filter(a => a.section === tab.title).map(a => ({ key: a.key, label: a.label, hint: gearFromHint(a) }));
    assert.deepEqual(tab.boxes, expected, tab.title);
  }
  // Hard content reads row by row, two to a row: Extreme, Savage, Ultimate, Current on the left
  assert.deepEqual(
    GEAR_FROM_SECTIONS[2].boxes.map(box => box.label),
    ['Extreme (Current)', 'Extreme (Legacy)', 'Savage (Current)', 'Savage (Legacy)', 'Ultimate'],
  );
  const hardKeys = ACTIVITIES.filter(a => a.section === 'Hard content').map(a => a.key);
  assert.deepEqual(GEAR_FROM_SECTIONS[2].boxes.map(box => box.key).sort(), hardKeys.sort());
  for (const box of GEAR_FROM_SECTIONS.flatMap(tab => tab.boxes)) assert.ok(box.hint.length > 0 && !/[{}]/.test(box.hint), box.key);
  // the labels and hints come from ACTIVITIES (item-format.json), not from the menu
  assert.deepEqual(
    GEAR_FROM_SECTIONS[0].boxes.slice(0, 2).map(box => box.key),
    ACTIVITIES.filter(a => a.section === GEAR_FROM_SECTIONS[0].title)
      .slice(0, 2)
      .map(a => a.key),
  );
  const capPatch = `${EXPANSIONS.findIndex(e => e.levelCap === MAX_LEVEL) + 2}.x`;
  const extremeLegacy = GEAR_FROM_SECTIONS[2].boxes.find(box => box.key === 'extreme_legacy');
  assert.ok(extremeLegacy.hint.includes(capPatch), extremeLegacy.hint); // the cap's patch series
  assert.ok(Object.isFrozen(GEAR_FROM_SECTIONS[0]) && Object.isFrozen(GEAR_FROM_SECTIONS[0].boxes));
});

test('Gear categories tab counts: the ticked boxes of the tab over its total, following the boxes and All, None and Default', () => {
  const menu = component(gearFromToggles('opt'), twoParts());
  const counts = () => GEAR_FROM_SECTIONS.map(tab => menu.fromTabCount(tab));
  // Default leaves out Miscellaneous (Everyday), five Side content boxes and three Hard content boxes
  assert.deepEqual(counts(), ['7/8', '2/7', '2/5']);
  menu.setFromOn('events', true);
  menu.setFromOn('crafted', false);
  assert.deepEqual(counts(), ['6/8', '3/7', '2/5']);
  menu.setFromAll('none');
  assert.deepEqual(counts(), ['0/8', '0/7', '0/5']);
  menu.setFromAll('all');
  assert.deepEqual(counts(), ['8/8', '7/7', '5/5']);
});

test('fromTabAfterKey: the arrows move and wrap, Home and End jump, other keys select nothing', () => {
  assert.equal(fromTabAfterKey('ArrowRight', 0, 5), 1);
  assert.equal(fromTabAfterKey('ArrowRight', 4, 5), 0);
  assert.equal(fromTabAfterKey('ArrowLeft', 2, 5), 1);
  assert.equal(fromTabAfterKey('ArrowLeft', 0, 5), 4);
  assert.equal(fromTabAfterKey('Home', 3, 5), 0);
  assert.equal(fromTabAfterKey('End', 1, 5), 4);
  for (const key of ['Tab', 'Enter', ' ', 'ArrowDown', 'a']) assert.equal(fromTabAfterKey(key, 2, 5), -1, key);
});

test('Gear categories tab row: a key selects and focuses the tab and keeps the key from the page; other keys are left alone', () => {
  const { fromTabKey } = gearFromToggles('opt');
  const buttons = GEAR_FROM_SECTIONS.map(focusable);
  const tablist = { querySelectorAll: selector => (selector === '[role="tab"]' ? buttons : []) };
  const state = { tab: 'everyday' };
  const right = { ...keyEvent(), key: 'ArrowRight' };
  fromTabKey(state, right, tablist);
  assert.deepEqual([state.tab, buttons[1].focused, right.prevented], ['side-content', 1, 1]);
  fromTabKey(state, { ...keyEvent(), key: 'End' }, tablist);
  assert.deepEqual([state.tab, buttons[2].focused], ['hard-content', 1]);
  fromTabKey(state, { ...keyEvent(), key: 'ArrowRight' }, tablist);
  assert.equal(state.tab, 'everyday', 'wraps to the first tab');
  fromTabKey(state, { ...keyEvent(), key: 'ArrowLeft' }, tablist);
  assert.equal(state.tab, 'hard-content', 'wraps to the last tab');
  const tab = { ...keyEvent(), key: 'Tab' };
  fromTabKey(state, tab, tablist);
  assert.deepEqual([state.tab, tab.prevented], ['hard-content', 0]);
});

/* An element that counts its focus calls, and a key event that counts how it was handled. */
const focusable = () => ({
  focused: 0,
  focus() {
    this.focused++;
  },
});
const keyEvent = () => ({
  prevented: 0,
  stopped: 0,
  preventDefault() {
    this.prevented++;
  },
  stopPropagation() {
    this.stopped++;
  },
  stopImmediatePropagation() {
    this.stopped++;
  },
});

test('placeBelowOrAbove, a tall menu (485 px, button 555 to 597): flips up where it does not fit below', () => {
  const button = { top: 555, bottom: 597 };
  const natural = 485;
  // below the button there are 287 px at 900 high (900 - 601 - 12), 107 at 720, 87 at 700, 155 at 768, 467 at 1080: too few;
  // above it 543 (555 - 4 - 8): the menu opens over the button, its own height, ending 4 px over the button's top (555 - 4 - 485 = 66)
  for (const windowHeight of [900, 720, 700, 768, 1080])
    assert.deepEqual(placeBelowOrAbove(button, natural, windowHeight), { top: 66, maxHeight: 485, flipped: true }, `${windowHeight}`);
  // at 1440 high it fits below: 827 px (1440 - 601 - 12)
  assert.deepEqual(placeBelowOrAbove(button, natural, 1440), { top: 601, maxHeight: 827, flipped: false });
  // exactly enough room below stays below (1098 - 601 - 12 = 485)
  assert.deepEqual(placeBelowOrAbove(button, natural, 1098), { top: 601, maxHeight: 485, flipped: false });
});

test('placeBelowOrAbove: the Expansion menu (214 px) flips at 720 high; a menu taller than both sides is cut; the floor only under the button', () => {
  assert.deepEqual(placeBelowOrAbove({ top: 555, bottom: 597 }, 214, 720), { top: 337, maxHeight: 214, flipped: true });
  // taller than the room above (543): flips, cut to it, from 8 px under the window's top
  assert.deepEqual(placeBelowOrAbove({ top: 555, bottom: 597 }, 700, 720), { top: 8, maxHeight: 543, flipped: true });
  // more room below than above, but not enough: stays below, cut to the room (window 700 high: 484 below, 150 above)
  assert.deepEqual(placeBelowOrAbove({ top: 162, bottom: 200 }, 600, 700), { top: 204, maxHeight: 484, flipped: false });
  // no room on either side: under the button, the least height of 160 px
  assert.deepEqual(placeBelowOrAbove({ top: 2, bottom: 590 }, 300, 600), { top: 594, maxHeight: 160, flipped: false });
});

test("Expansion filter: the button's text, and a box on or off keeping the oldest-first order, on its own part only", () => {
  const store = twoParts();
  const opt = component(expansionToggles('opt'), store);
  assert.equal(opt.expansions, EXPANSIONS);
  const allShown = opt.expSummary();
  assert.ok(allShown.length > 0);
  opt.setExpShown('SB', false);
  opt.setExpShown('ARR', false);
  assert.deepEqual(store.opt.expOff, ['ARR', 'SB']);
  assert.equal(opt.expShown('SB'), false);
  assert.ok(hasNumber(opt.expSummary(), EXPANSIONS.length - 2) && opt.expSummary() !== allShown, opt.expSummary());
  for (const { short } of EXPANSIONS) if (short !== 'DT') opt.setExpShown(short, false);
  assert.ok(opt.expSummary().includes('Dawntrail'), opt.expSummary()); // a single expansion is named
  opt.setExpShown('DT', false);
  assert.ok(opt.expSummary().length > 0 && opt.expSummary() !== allShown);
  opt.setExpShown('HW', true);
  assert.deepEqual(
    store.opt.expOff,
    EXPANSIONS.map(e => e.short).filter(k => k !== 'HW'),
  );
  assert.deepEqual(store.browse.expOff, ['ARR']);
});

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
      if (inPopover && selector === '.setpop') return { getBoundingClientRect: () => ({ right: popoverRight }) };
      if (selector === '.wrap') return { getBoundingClientRect: () => ({ right: contentRight }) };
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
  const { placeMenu } = expansionToggles('browse');
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
  const { placeMenu } = expansionToggles('browse');
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
  const { placeMenu } = gearFromToggles('browse');
  const { menu, anchor, classes } = menuAt({ inPopover: false, menuWidth: 300, button: { left: 800, top: 200, width: 150, height: 40 } });
  placeMenu(menu, anchor);
  assert.deepEqual([Object.keys(menu.style).length, [...classes]], [0, ['to-left']]);
});

test('placeMenu on a page: leftwards when it would pass the right edge of the content, not only the window', t => {
  // a wide window whose content column (.wrap, 1,280 px at most) ends at 700: the menu would end at 790, inside the window
  windowOf1000x600(t);
  const { placeMenu } = gearFromToggles('browse');
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
  const { isOwnScroll } = gearFromToggles('browse');
  const inside = {};
  const box = { contains: node => node === inside };
  assert.equal(isOwnScroll({ target: inside }, undefined, box), true);
  assert.equal(isOwnScroll({ target: {} }, box), false);
  assert.equal(isOwnScroll({ target: {} }), false);
});
