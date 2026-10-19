/* The page's number boxes (src/ui/helpers.js numberField, the $num magic): what a box commits on Enter or leaving it
   (change), for each of its options. Typing commits the same values after a short wait. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { numberField } from '../../src/ui/helpers.js';

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
  const leave = text => field['@change']({ target: { value: text } });
  return { value: () => value, leave };
}

test('number box: whole values in range only; out of range and empty commit nothing', () => {
  const b = box(50, 1, 100);
  b.leave('80.4');
  assert.equal(b.value(), 80);
  b.leave('101');
  assert.equal(b.value(), 80);
  b.leave('0');
  assert.equal(b.value(), 80);
  b.leave('');
  assert.equal(b.value(), 80);
});

test('number box: a bound may be read at each input (the job level cap)', () => {
  let cap = 80;
  const b = box(50, 1, () => cap);
  b.leave('90');
  assert.equal(b.value(), 50);
  cap = 100;
  b.leave('90');
  assert.equal(b.value(), 90);
});

/* Audit 02, finding 10: the gear filters and the Target GCD were plain x-model boxes. Through $num they keep what they
   took: an emptied filter is no limit (''), and the GCD keeps hundredths. */
test("number box options: empty commits a filter's '' and decimals keeps the GCD's hundredths", () => {
  const filter = box(150, 0, Infinity, { empty: '' });
  filter.leave('9999');
  assert.equal(filter.value(), 9999);
  filter.leave('');
  assert.equal(filter.value(), '');
  const gcd = box('', 0, Infinity, { decimals: 2, empty: '' });
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
