/* The page's presentation helpers (src/ui/helpers.js): the number boxes (numberField, the $num magic: what a box commits
   on Enter or leaving it, for each of its options, and after typing stops), the debounced effect, counts in en-US
   numbers (fmtInt), and the members the components share for the "Gear from" and Expansion filters, bound to a plain
   store as Alpine binds them. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACTIVITIES, EXPANSIONS } from '../../src/core/constants.js';
import { CURRENT_TOMES, MAX_LEVEL } from '../../src/core/tables.js';
import {
  GEAR_FROM_COLUMNS,
  TYPING_DEBOUNCE_MS,
  debouncedEffect,
  expansionToggles,
  fmtInt,
  gearFromHint,
  gearFromSummary,
  gearFromToggles,
  numberField,
  storeNumberField,
} from '../../src/ui/helpers.js';
import { DEFAULT_EXCLUDE } from '../../src/ui/state.js';

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
  /* types `text` into a live box (commits as typed, no wait) */
  const type = text => field['@input']({ target: { value: text } });
  return { value: () => value, leave, type };
}

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
  const type = text => field['@input']({ target: { value: text } });
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

test('debouncedEffect: the inputs are read at once, the expensive part runs once the effect rests', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  // a stand-in for Alpine.effect: runs the function now, and again whenever the test says an input changed
  let rerun = null;
  const Alpine = {
    effect: fn => {
      rerun = fn;
      fn();
    },
  };
  let reads = 0;
  const runs = [];
  debouncedEffect(
    Alpine,
    () => {
      const seen = ++reads;
      return () => runs.push(seen);
    },
    120,
  );
  assert.equal(reads, 1);
  t.mock.timers.tick(100);
  rerun();
  rerun();
  assert.equal(reads, 3);
  t.mock.timers.tick(119);
  assert.deepEqual(runs, []);
  t.mock.timers.tick(1);
  assert.deepEqual(runs, [3]);
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
  assert.equal(byKey('savage_current'), `${EXPANSIONS.findIndex(e => e[2] === MAX_LEVEL) + 2}.x Savage`);
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
  assert.deepEqual(
    opt.expansions,
    EXPANSIONS.map(([short, name]) => [short, name]),
  );
  assert.equal(opt.expSummary(), 'All expansions');
  opt.setExpShown('SB', false);
  opt.setExpShown('ARR', false);
  assert.deepEqual(store.opt.expOff, ['ARR', 'SB']);
  assert.equal(opt.expShown('SB'), false);
  assert.equal(opt.expSummary(), `${EXPANSIONS.length - 2} expansions`);
  for (const [short] of EXPANSIONS) if (short !== 'DT') opt.setExpShown(short, false);
  assert.equal(opt.expSummary(), 'Dawntrail');
  opt.setExpShown('DT', false);
  assert.equal(opt.expSummary(), 'None');
  opt.setExpShown('HW', true);
  assert.deepEqual(
    store.opt.expOff,
    EXPANSIONS.map(e => e[0]).filter(k => k !== 'HW'),
  );
  assert.deepEqual(store.browse.expOff, ['ARR']);
});
