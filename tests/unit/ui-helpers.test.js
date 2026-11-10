/* The page's presentation helpers (src/ui/helpers.js): the number boxes (numberField, the $num magic: what a box commits
   on Enter or leaving it, for each of its options, and after typing stops), counts in en-US
   numbers (fmtInt), and the members the components share for the "Gear from" and Expansion filters, bound to a plain
   store as Alpine binds them. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACTIVITIES, EXPANSIONS } from '../../src/core/constants.js';
import { CURRENT_TOMES, MAX_LEVEL } from '../../src/core/tables.js';
import {
  GEAR_FROM_COLUMNS,
  TYPING_DEBOUNCE_MS,
  expansionToggles,
  fmtInt,
  gearFromHint,
  gearFromSummary,
  gearFromToggles,
  numberField,
  oneOrMany,
  storeNumberField,
  viewCache,
  deepFreeze,
} from '../../src/ui/helpers.js';
import { DEFAULT_EXCLUDE, TARGET_GCD_RANGE } from '../../src/ui/settings.js';

/* A box bound to one value: {field, value(), leave(text)}; leave types `text` and leaves the box. */
function box(start, lo, hi, options) {
  let value = start;
  const field = numberField(
    () => value,
    v => {
      value = v;
    },
    lo,
    hi,
    options,
  );
  /* types `text` and leaves the box; returns what the box shows afterwards */
  const leave = text => {
    const input = { value: text };
    field['@change']({ target: input });
    return input.value;
  };
  /* types `text` (a typed edit: an InputEvent with an inputType) */
  const type = text => field['@input']({ target: { value: text }, inputType: 'insertText' });
  /* steps the box to `text` with the mouse wheel or an arrow key (an input event with no inputType) */
  const step = text => field['@input']({ target: { value: text } });
  return { value: () => value, leave, type, step };
}

/* Owner, 2026-10-19: scrolling through the Synced item level did not move the Target GCD range until it stopped. */
test('number box: a step (wheel, arrow keys) commits at once; typed digits wait for typing to stop', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const b = box(300, 1, 795);
  b.step('301');
  assert.equal(b.value(), 301);
  b.type('3');
  assert.equal(b.value(), 301);
  t.mock.timers.tick(300);
  assert.equal(b.value(), 3);
});

test('number box: whole values; empty commits nothing', () => {
  const b = box(50, 1, 100);
  b.leave('80.4');
  assert.equal(b.value(), 80);
  b.leave('');
  assert.equal(b.value(), 80);
});

/* Owner, 2026-10-19: a negative filter value was ignored while the box kept showing it, so the box and the search
   disagreed. Leaving the box now moves the value to the nearest bound and shows it. */
test('number box: leaving it with a value out of range moves it to the nearest bound, shown in the box', () => {
  const b = box(50, 1, 100);
  assert.equal(b.leave('101'), 100);
  assert.equal(b.value(), 100);
  assert.equal(b.leave('-5'), 1);
  assert.equal(b.value(), 1);
  const filter = box('', 1, Infinity, { empty: '' });
  assert.equal(filter.leave('-5'), 1);
  assert.equal(filter.value(), 1);
  const gcd = box('', 0.5, Infinity, { decimals: 2, empty: '' });
  assert.equal(gcd.leave('0.1'), 0.5);
  assert.equal(gcd.value(), 0.5);
});

test('number box: while typing, a value out of range commits nothing ("9" on the way to "90")', () => {
  const b = box(50, 10, 100, { live: true });
  b.type('9');
  assert.equal(b.value(), 50);
  b.type('90');
  assert.equal(b.value(), 90);
});

test('number box: snap false keeps an out-of-range value out on leaving too (the sync cap explains it)', () => {
  const cap = box(123, 1, Infinity, { snap: false });
  assert.equal(cap.leave('0'), '0');
  assert.equal(cap.value(), 123);
});

test('number box: a bound may be read at each input (the job level cap)', () => {
  let cap = 80;
  const b = box(50, 1, () => cap);
  b.leave('90');
  assert.equal(b.value(), 80);
  cap = 100;
  b.leave('90');
  assert.equal(b.value(), 90);
});

/* Audit 02, finding 10: the gear filters and the Target GCD were plain x-model boxes. Through $num they keep what they
   took: an emptied filter is no limit (''), and the GCD keeps hundredths. */
test("number box options: empty commits a filter's '' and decimals keeps the GCD's hundredths", () => {
  const filter = box(150, 1, Infinity, { empty: '' });
  filter.leave('9999');
  assert.equal(filter.value(), 9999);
  filter.leave('');
  assert.equal(filter.value(), '');
  const gcd = box('', 0.5, Infinity, { decimals: 2, empty: '' });
  gcd.leave('2.40');
  assert.equal(gcd.value(), 2.4);
  gcd.leave('2.475');
  assert.equal(gcd.value(), 2.48);
});

test('number box options: onEmpty runs when an empty box is left, with the box', () => {
  const seen = [];
  const b = box(70, 1, 100, { live: true, onEmpty: input => seen.push(input.value) });
  b.leave('60');
  b.leave('');
  assert.equal(b.value(), 60);
  assert.deepEqual(seen, ['']);
});

/* Audit 13, finding 6: counts followed the browser's locale ("1.234" in German reads like a decimal next to "2.48s").
   The default locale of this process cannot be changed, so the test watches which locale fmtInt asks for. */
test('fmtInt: thousands separators in en-US whatever the browser locale', () => {
  const plain = Number.prototype.toLocaleString;
  const asked = [];
  Number.prototype.toLocaleString = function (locale, options) {
    asked.push(locale);
    return plain.call(this, locale, options);
  };
  try {
    assert.equal(fmtInt(1234567), '1,234,567');
  } finally {
    Number.prototype.toLocaleString = plain;
  }
  assert.deepEqual(asked, ['en-US']);
});

/* Typing waits for the keys to stop: a box commits TYPING_DEBOUNCE_MS after the last keystroke, once, with the last
   value; a live box (the synced level) commits each valid value at once. */
test('number box typing: one commit after the keys stop, of the last value; a live box commits each value at once', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const commits = [];
  const field = numberField(
    () => commits.at(-1) ?? 50,
    v => commits.push(v),
    1,
    999,
  );
  const type = text => field['@input']({ target: { value: text }, inputType: 'insertText' });
  type('1');
  type('12');
  t.mock.timers.tick(TYPING_DEBOUNCE_MS - 1);
  type('123');
  t.mock.timers.tick(TYPING_DEBOUNCE_MS - 1);
  assert.deepEqual(commits, []);
  t.mock.timers.tick(1);
  assert.deepEqual(commits, [123]);
  // Enter or leaving the box before the wait ends commits at once, and the waiting commit is dropped
  type('130');
  field['@change']({ target: { value: '130' } });
  t.mock.timers.tick(TYPING_DEBOUNCE_MS);
  assert.deepEqual(commits, [123, 130]);

  const live = [];
  const level = numberField(
    () => live.at(-1) ?? 100,
    v => live.push(v),
    1,
    100,
    { live: true },
  );
  for (const text of ['9', '90', '900']) level['@input']({ target: { value: text } });
  assert.deepEqual(live, [9, 90]); // 900 is out of range
});

/* Audit 2, finding 01-4: the markup's min and max and $num's bounds were written twice and disagreed: a typed Target GCD
   of 3.00 was kept while the browser marked the box invalid, and a reload made it "Any". */
test('number box: its min and max attributes come from its own bounds; Infinity sets none', () => {
  let cap = 100;
  const field = numberField(
    () => 1,
    () => {},
    1,
    () => cap,
  );
  assert.deepEqual([field[':min'](), field[':max']()], [1, 100]);
  cap = 80; // a bound given as a function is read again (the job's level cap)
  assert.equal(field[':max'](), 80);
  const filter = numberField(
    () => '',
    () => {},
    1,
    Infinity,
    { empty: '' },
  );
  assert.equal(filter[':min'](), 1);
  assert.ok(!(':max' in filter), 'a filter keeps the max its markup gives it, for the arrow keys only');
});

test('Target GCD box: 0.50 to 2.50 seconds; a higher value moves to 2.50 when the box is left', () => {
  const store = { opt: { gcd: '' } };
  const gcd = storeNumberField(store, 'opt.gcd', ...TARGET_GCD_RANGE, { decimals: 2, empty: '' });
  assert.deepEqual([gcd[':min'](), gcd[':max']()], [0.5, 2.5]);
  const input = { value: '3.00' };
  gcd['@change']({ target: input });
  assert.deepEqual([store.opt.gcd, input.value], [2.5, 2.5]);
  gcd['@change']({ target: { value: '0.2' } });
  assert.equal(store.opt.gcd, 0.5);
});

test('store number box: reads and writes the setting at its dotted path, an out-of-range value moved to the nearest bound', () => {
  const store = { piece: { ilvl: 130 }, opt: { gcd: '' } };
  const ilvl = storeNumberField(store, 'piece.ilvl', 1, 795);
  ilvl['@change']({ target: { value: '560' } });
  assert.equal(store.piece.ilvl, 560);
  ilvl['@change']({ target: { value: '9999' } });
  assert.equal(store.piece.ilvl, 795);
  const gcd = storeNumberField(store, 'opt.gcd', 0, Infinity, { decimals: 2, empty: '' });
  gcd['@change']({ target: { value: '2.416' } });
  assert.equal(store.opt.gcd, 2.42);
  // the path is followed at each commit, so a replaced object is written, not the old one
  store.piece = { ilvl: 1 };
  ilvl['@change']({ target: { value: '300' } });
  assert.equal(store.piece.ilvl, 300);
});

test('viewCache: a view is built once per key; last() is the last one built, null before any', () => {
  const views = viewCache();
  let builds = 0;
  const build = value => () => {
    builds++;
    return { value };
  };
  assert.equal(views.last(), null);
  const a = views.get('a', build(1));
  assert.equal(views.get('a', build(2)), a);
  assert.equal(builds, 1);
  const b = views.get('b', build(3));
  assert.deepEqual([b.value, views.last()], [3, b]);
  assert.notEqual(views.get('a', build(4)), a, 'only the last key is kept');
  // a view of null counts as built
  const none = () => {
    builds++;
    return null;
  };
  views.get('none', none);
  views.get('none', none);
  assert.equal(builds, 4);
});

test('Gear from button text: All, None, All but N up to five left out, then N of M; the market board only when off', () => {
  const keys = ACTIVITIES.map(a => a.key);
  const total = keys.length;
  assert.equal(gearFromSummary([], true), 'All');
  assert.equal(gearFromSummary(keys, true), 'None');
  for (let n = 1; n <= 5; n++) assert.equal(gearFromSummary(keys.slice(0, n), true), `All but ${n}`);
  assert.equal(gearFromSummary(keys.slice(0, 6), true), `${total - 6} of ${total}`);
  assert.equal(gearFromSummary(DEFAULT_EXCLUDE, true), `${total - DEFAULT_EXCLUDE.length} of ${total}`);
  assert.equal(gearFromSummary([], false), 'All · no market board');
  assert.equal(gearFromSummary(keys, false), 'None · no market board');
});

test('Gear from menu: every box once, in its section, the sections in two columns; each hint filled in', () => {
  const laidOut = GEAR_FROM_COLUMNS.flatMap(c => c.sections.flatMap(s => s.boxes));
  assert.deepEqual(laidOut.map(a => a.key).sort(), ACTIVITIES.map(a => a.key).sort());
  assert.equal(GEAR_FROM_COLUMNS.length, 2);
  for (const column of GEAR_FROM_COLUMNS)
    for (const section of column.sections) {
      // a section holds its own boxes, in the ACTIVITIES order
      assert.ok(section.boxes.length, section.title);
      assert.deepEqual(
        section.boxes,
        ACTIVITIES.filter(a => a.section === section.title),
      );
    }
  assert.ok(Object.isFrozen(GEAR_FROM_COLUMNS));
  // the placeholders: the current tomestones from the data, the level cap's patch series (7.x at level 100)
  for (const a of ACTIVITIES) assert.doesNotMatch(gearFromHint(a), /[{}]/, a.key);
  const byKey = key => gearFromHint(ACTIVITIES.find(a => a.key === key));
  assert.equal(byKey('tomes_current'), `Bought with ${CURRENT_TOMES.join(' or ')}`);
  assert.equal(byKey('savage_current'), `${EXPANSIONS.findIndex(e => e.levelCap === MAX_LEVEL) + 2}.x Savage`);
});

/* A component built from gearFromToggles or expansionToggles, bound to a store with both parts, as Alpine binds it. */
function component(members, store) {
  return Object.assign(members, { $store: { app: store } });
}
const twoParts = () => ({
  opt: { exclude: [...DEFAULT_EXCLUDE], market: true, expOff: [] },
  browse: { exclude: [], market: false, expOff: ['ARR'] },
});

test("Gear from boxes: a box on or off, All, None and Default, on the component's own part only", () => {
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
  assert.equal(component(gearFromToggles('browse'), store).fromSummary(), 'All · no market board');
});

test('Gear from line under the menu: the box pointed at, the market board, a box with nothing for the filters, or nothing', () => {
  const menu = component(gearFromToggles('opt'), twoParts());
  assert.equal(menu.fromDescription(), null);
  menu.fromPointed = 'market';
  assert.equal(menu.fromDescription().label, 'Market board');
  menu.fromPointed = 'crafted';
  assert.deepEqual(menu.fromDescription(), { label: 'Crafted', text: 'Made via crafting.' });
  menu.emptyBoxes = ['crafted'];
  assert.equal(menu.fromEmpty('crafted'), true);
  assert.match(menu.fromDescription().text, /^Made via crafting\. Nothing from it matches/);
  menu.fromPointed = 'no-such-box';
  assert.equal(menu.fromDescription(), null);
});

test("Expansion filter: the button's text, and a box on or off keeping the oldest-first order, on its own part only", () => {
  const store = twoParts();
  const opt = component(expansionToggles('opt'), store);
  assert.equal(opt.expansions, EXPANSIONS);
  assert.equal(opt.expSummary(), 'All expansions');
  opt.setExpShown('SB', false);
  opt.setExpShown('ARR', false);
  assert.deepEqual(store.opt.expOff, ['ARR', 'SB']);
  assert.equal(opt.expShown('SB'), false);
  assert.equal(opt.expSummary(), `${EXPANSIONS.length - 2} expansions`);
  for (const { short } of EXPANSIONS) if (short !== 'DT') opt.setExpShown(short, false);
  assert.equal(opt.expSummary(), 'Dawntrail');
  opt.setExpShown('DT', false);
  assert.equal(opt.expSummary(), 'None');
  opt.setExpShown('HW', true);
  assert.deepEqual(
    store.opt.expOff,
    EXPANSIONS.map(e => e.short).filter(k => k !== 'HW'),
  );
  assert.deepEqual(store.browse.expOff, ['ARR']);
});

test('deepFreeze: freezes every object and array inside, returns the same value, leaves others as they are', () => {
  const view = { rows: [{ cells: [{ value: 48 }] }], label: 'x', none: null };
  assert.equal(deepFreeze(view), view);
  assert.ok(Object.isFrozen(view) && Object.isFrozen(view.rows) && Object.isFrozen(view.rows[0].cells[0]));
  assert.throws(() => {
    view.rows[0].cells[0].value = 1;
  }, TypeError);
  assert.equal(deepFreeze(null), null);
  assert.equal(deepFreeze(7), 7);
});

test('oneOrMany: the first text for a count of 1, else the second (zero included)', () => {
  assert.equal(oneOrMany(1, 'it', 'them'), 'it');
  assert.equal(oneOrMany(2, 'it', 'them'), 'them');
  assert.equal(oneOrMany(0, 'it', 'them'), 'them');
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

/* A menu and its button as placeMenu reads them: boxes in px, in a window of 1000 x 600. */
function menuAt({ inDialog, menuWidth, button, popover = false }) {
  const classes = new Set();
  const menu = {
    style: {},
    classList: { add: name => classes.add(name), remove: name => classes.delete(name), contains: name => popover && name === 'popover' },
    closest: selector => (inDialog && selector === '.cfgdlg' ? {} : null),
    getBoundingClientRect: () => ({ width: menuWidth, right: (Number.parseFloat(menu.style.left) || button.left) + menuWidth }),
  };
  const anchor = { getBoundingClientRect: () => ({ ...button, right: button.left + button.width, bottom: button.top + button.height }) };
  return { menu, anchor, classes };
}

test('placeMenu in the Fill settings: under its button, cut to the window bottom, leftwards past the right edge', t => {
  windowOf1000x600(t);
  const { placeMenu } = expansionToggles('browse');
  // room on the right: its left edge on the button's; the height is what is left under the button, minus 12
  let { menu, anchor } = menuAt({ inDialog: true, menuWidth: 300, button: { left: 100, top: 200, width: 150, height: 40 } });
  placeMenu(menu, anchor);
  assert.deepEqual([menu.style.top, menu.style.left, menu.style.maxHeight, menu.style.minWidth], ['244px', '100px', '344px', '150px']);
  // no room on the right: its right edge on the button's
  ({ menu, anchor } = menuAt({ inDialog: true, menuWidth: 360, button: { left: 800, top: 200, width: 150, height: 40 } }));
  placeMenu(menu, anchor);
  assert.equal(menu.style.left, '590px');
  // a button near the window's bottom still leaves the menu 160 px
  ({ menu, anchor } = menuAt({ inDialog: true, menuWidth: 300, button: { left: 100, top: 560, width: 150, height: 40 } }));
  placeMenu(menu, anchor);
  assert.equal(menu.style.maxHeight, '160px');
});

test('placeMenu in the Fill settings: a note (.popover) has its right edge on the button, with room on the right too', t => {
  windowOf1000x600(t);
  const { placeMenu } = expansionToggles('browse');
  const { menu, anchor } = menuAt({
    inDialog: true,
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
  const { menu, anchor, classes } = menuAt({ inDialog: false, menuWidth: 300, button: { left: 800, top: 200, width: 150, height: 40 } });
  placeMenu(menu, anchor);
  assert.deepEqual([Object.keys(menu.style).length, [...classes]], [0, ['to-left']]);
});
