/* The guards of src/core/guards.ts: what each returns and when it throws. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { entriesOf, fromKeys, isOneOf, last, messageOf, must, mustHave, present } from '../../../src/core/guards.ts';
import { makeJobContext } from '../../../src/core/job-context.ts';
import { statTable } from '../../../src/core/stat-keys.ts';

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

test('isOneOf: true only for a member, and the list then types the key', () => {
  const keys = ['crit', 'det'] as const;
  assert.equal(isOneOf(keys, 'det'), true);
  assert.equal(isOneOf(keys, 'wd'), false);
  assert.equal(isOneOf(keys, null), false);
  assert.equal(isOneOf(keys, undefined), false);
});

test('fromKeys and entriesOf: one entry per key in the list order, and the entries come back in it', () => {
  const table = fromKeys(['dh', 'crit', 'det'] as const, key => key.length);
  assert.deepEqual(Object.keys(table), ['dh', 'crit', 'det']);
  assert.deepEqual(table, { dh: 2, crit: 4, det: 3 });
  assert.deepEqual(entriesOf(table), [
    ['dh', 2],
    ['crit', 4],
    ['det', 3],
  ]);
  assert.deepEqual(
    fromKeys([] as const, () => 1),
    {},
  );
});

test('statTable: the keys of the job in its own order: a Paladin has Tenacity, a Bard has no special substat', () => {
  assert.deepEqual(Object.keys(statTable(makeJobContext('PLD'), () => 0)), [...makeJobContext('PLD').stats]);
  const bard = Object.keys(statTable(makeJobContext('BRD'), () => 0));
  assert.deepEqual(bard, [...makeJobContext('BRD').stats]);
  assert.equal(bard.includes('ten'), false);
});
