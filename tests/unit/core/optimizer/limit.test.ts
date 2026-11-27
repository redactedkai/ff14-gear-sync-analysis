import assert from 'node:assert/strict';
import { test } from 'node:test';
import { makeLimit } from '../../../../src/core/optimizer/limit.ts';

test('makeLimit: no minimum is 0, a maximum of 0 is kept, and a cut is marked', () => {
  assert.deepEqual(makeLimit('det', null, null), { stat: 'det', min: 0, max: null });
  assert.deepEqual(makeLimit('det', undefined, 0), { stat: 'det', min: 0, max: 0 });
  assert.deepEqual(makeLimit('det', -5, 10), { stat: 'det', min: 0, max: 10 });
  assert.deepEqual(makeLimit('crit', 120, null), { stat: 'crit', min: 120, max: null });
  assert.deepEqual(makeLimit('regain0', 0, 7, true), { stat: 'regain0', min: 0, max: 7, cut: true });
});
