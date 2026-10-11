import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeJobContext } from '../../src/core/job-context.js';
import { capsFor, syncStats } from '../../src/core/formulas.js';

const sge = makeJobContext('SGE');
const blm = makeJobContext('BLM');
const pld = makeJobContext('PLD');

// Dreadwyrm Hood of Healing (item level 130), real stats from the game files
const hood = { main: 33, vit: 32, crit: 0, det: 0, dh: 6, spd: 31, spec: 22 };

test('an item exactly at the cap is untouched (and returned as a copy)', () => {
  const out = syncStats(sge, hood, 'head', 130, 130);
  assert.deepEqual(out, hood);
  assert.notEqual(out, hood);
});

test('an item below the cap is untouched even if its stats exceed the cap values', () => {
  const big = { main: 99, vit: 99, crit: 99, det: 99, dh: 99, spd: 99, spec: 99 };
  assert.deepEqual(syncStats(sge, big, 'head', 123, 100), big);
});

test('one item level above the cap clamps every stat (head at cap 123: substats 29, main 30)', () => {
  const out = syncStats(sge, hood, 'head', 123, 124);
  assert.equal(out.spd, 29);
  assert.equal(out.main, 30);
  assert.equal(out.spec, 22); // under the cap already
  assert.equal(out.dh, 6);
  const c = capsFor(sge, 'head', 123);
  for (const k of Object.keys(out)) assert.ok(out[k] <= c[k], k);
});

test('Dreadwyrm hood one item level below its own: capped at the 129 values', () => {
  const c = capsFor(sge, 'head', 129);
  const out = syncStats(sge, hood, 'head', 129, 130);
  for (const k of Object.keys(hood)) assert.equal(out[k], Math.min(hood[k], c[k]), k);
});

test('item level unknown (null) is treated as above the cap', () => {
  assert.equal(syncStats(sge, hood, 'head', 123, null).spd, 29);
  assert.equal(syncStats(sge, hood, 'head', 123).spd, 29);
});

test('a job without a spec stat has its spec capped to 0', () => {
  assert.equal(capsFor(blm, 'head', 123).spec, 0);
  assert.equal(syncStats(blm, { spec: 40, spd: 10 }, 'head', 123, 200).spec, 0);
  assert.ok(capsFor(sge, 'head', 123).spec > 0);
});

test('missing stat keys are treated as 0', () => {
  const out = syncStats(sge, { spd: 50 }, 'body', 123, 200);
  assert.deepEqual(out, { main: 0, vit: 0, crit: 0, det: 0, dh: 0, spd: 47, spec: 0 });
});

// FFXIV Wiki, Item Level Sync page: substat caps at item level 475
test('Paladin caps at item level 475 match the Wiki (1H weapon 131, shield 53)', () => {
  assert.equal(capsFor(pld, 'weapon', 475).crit, 131);
  assert.equal(capsFor(pld, 'offhand', 475).crit, 53);
  assert.equal(capsFor(pld, 'offhand', 475).spd, 53);
});
