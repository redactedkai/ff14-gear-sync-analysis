/* The page's number boxes (src/ui/helpers.js numberField, the $num magic): what a box commits on Enter or leaving it
   (change), for each of its options. Typing commits the same values after a short wait. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fmtInt, numberField } from '../../src/ui/helpers.js';

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
