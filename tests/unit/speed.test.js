import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gcdFor, gcdTiers } from '../../src/core/speed.js';

test('level 50 GCD tier thresholds', () => {
  const tiers = gcdTiers(50, 2500)
    .filter(x => [150, 202, 307, 349].includes(x.spd))
    .map(x => [x.spd, x.gcd]);
  assert.deepEqual(tiers, [
    [150, 2.35],
    [202, 2.3],
    [307, 2.2],
    [349, 2.16],
  ]);
});

test('AkhMorning level 100 examples', () => {
  assert.deepEqual([gcdFor(22, 100), gcdFor(80, 100)], [2.49, 2.49]);
});
