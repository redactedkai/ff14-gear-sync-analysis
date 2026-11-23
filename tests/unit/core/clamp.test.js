/* The shared clamp (src/core/clamp.js): inside the range, at and past each end, NaN, and a whole-number use. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clamp } from '../../../src/core/clamp.js';

test('clamp keeps a value inside the range and holds one outside to the nearer end', () => {
  assert.equal(clamp(50, 1, 100), 50);
  assert.equal(clamp(1, 1, 100), 1);
  assert.equal(clamp(100, 1, 100), 100);
  assert.equal(clamp(0, 1, 100), 1);
  assert.equal(clamp(101, 1, 100), 100);
  assert.equal(clamp(-Infinity, 0, 795), 0);
  assert.equal(clamp(Infinity, 0, 795), 795);
});

test('clamp passes NaN through, and a one-value range gives that value', () => {
  assert.ok(Number.isNaN(clamp(Number.NaN, 1, 100)));
  assert.equal(clamp(7, 5, 5), 5);
});
