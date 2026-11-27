/* The guards of src/core/guards.ts: what each returns and when it throws. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { last, messageOf, must, mustHave, present } from '../../../src/core/guards.ts';

test('mustHave: a value comes back, 0 and the empty text too; null and undefined throw naming what is missing', () => {
  assert.equal(mustHave(0, 'zero'), 0);
  assert.equal(mustHave('', 'text'), '');
  assert.throws(() => mustHave(null, 'the food'), /Missing the food/);
  assert.throws(() => mustHave(undefined, 'the food'), /Missing the food/);
});

test('must: the value of a key; a missing key throws, a stored 0 does not', () => {
  const map = new Map([
    ['a', 0],
    ['b', 2],
  ]);
  assert.equal(must(map, 'a', 'bound'), 0);
  assert.equal(must(map, 'b', 'bound'), 2);
  assert.throws(() => must(map, 'c', 'bound'), /Missing bound/);
});

test('last: the final element; an empty list throws', () => {
  assert.equal(last([1, 2, 3], 'tiers'), 3);
  assert.throws(() => last([], 'tiers'), /Empty tiers/);
});

test('present: drops the empty text, null, undefined and false, and keeps 0', () => {
  const kept: string[] = present(['crit', '', 'det', null, undefined, false]);
  assert.deepEqual(kept, ['crit', 'det']);
  assert.deepEqual(present([0, 1, null]), [0, 1]);
});

test('messageOf: an Error gives its message, anything else its text', () => {
  assert.equal(messageOf(new Error('boom')), 'boom');
  assert.equal(messageOf('plain'), 'plain');
  assert.equal(messageOf(42), '42');
});
