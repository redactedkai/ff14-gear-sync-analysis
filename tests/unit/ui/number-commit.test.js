/* The number-box rule (src/ui/number-commit.js), as a table written from docs/engineering/architecture.md "Number
   inputs": what typed text commits and what the box shows, for each kind of box. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { commit, formatNumber, roundTo } from '../../../src/ui/number-commit.js';

/* [box, options, text, expected]: expected is null (nothing committed) or [value, shown, clamped]. */
const TABLE = [
  // whole-number box with a range: typing holds an out-of-range value back, leaving moves it to the bound
  ['filter, in range', { min: 1, max: 100 }, '80', [80, '80', false]],
  ['filter, fraction rounds', { min: 1, max: 100 }, '80.4', [80, '80', false]],
  ['filter, typing "9" of "90" (final: false) with min 10', { min: 10, max: 100 }, '9', null],
  ['filter, leaving above the range', { min: 1, max: 100, final: true }, '101', [100, '100', true]],
  ['filter, leaving below the range', { min: 1, max: 100, final: true }, '-5', [1, '1', true]],
  ['filter, typing above the range', { min: 1, max: 100 }, '101', null],
  ['filter, text that is no number', { min: 1, max: 100, final: true }, 'abc', null],
  ['filter, empty commits nothing', { min: 1, max: 100, final: true }, '', null],
  // a filter that takes any number: an emptied box commits '' (no limit); no bound with Infinity
  ['any-number filter, empty', { min: 1, max: Infinity, empty: '' }, '', ['', '', false]],
  ['any-number filter, huge', { min: 1, max: Infinity, final: true }, '99999', [99999, '99999', false]],
  ['any-number filter, below', { min: 1, max: Infinity, final: true }, '-5', [1, '1', true]],
  // Target GCD: hundredths, up to the slowest base GCD
  ['Target GCD, hundredths', { min: 0.5, max: 2.5, decimals: 2 }, '2.4', [2.4, '2.4', false]],
  ['Target GCD, third digit rounds', { min: 0.5, max: 2.5, decimals: 2 }, '2.456', [2.46, '2.46', false]],
  ['Target GCD, leaving above', { min: 0.5, max: 2.5, decimals: 2, final: true }, '3', [2.5, '2.5', true]],
  // sync cap: no snapping, extra digits kept out
  ['cap, in range', { min: 1, max: 795, snap: false, exact: true }, '123', [123, '123', false]],
  ['cap, out of range even on leaving', { min: 1, max: 795, snap: false, exact: true, final: true }, '9999', null],
  ['cap, 1.5 is not rounded to 2', { min: 1, max: 795, snap: false, exact: true }, '1.5', null],
  // GCD level: whole numbers only, held to the range, also while typing (final)
  ['GCD level, held to 100', { min: 1, max: 100, exact: true, final: true }, '150', [100, '100', true]],
  ['GCD level, 7.5 refused', { min: 1, max: 100, exact: true, final: true }, '7.5', null],
  // GCD speed and substat boxes: rounded, no bound or the tier bounds
  ['speed, rounds', { final: true }, '1234.6', [1235, '1235', false]],
  ['substat, held to its base', { min: 420, max: 3000, final: true }, '5', [420, '420', true]],
  ['substat, 1e9 held to the most', { min: 420, max: 3000, final: true }, '1e9', [3000, '3000', true]],
  ['no number: Infinity text', { final: true }, 'Infinity', null],
];

for (const [name, options, text, expected] of TABLE) {
  test(`commit: ${name}`, () => {
    const got = commit(text, options);
    assert.deepEqual(got && [got.value, got.shown, got.clamped], expected);
  });
}

test('commit: an emptied box commits `empty` when the box has one', () => {
  assert.deepEqual(commit('', { empty: null }), { value: null, shown: '', clamped: false });
  assert.equal(commit('', {}), null);
});

test('formatNumber and roundTo: digits kept after the point, no trailing zeros', () => {
  assert.equal(formatNumber(2.5, 2), '2.5');
  assert.equal(formatNumber(2.456, 2), '2.46');
  assert.equal(formatNumber(7.5), '8');
  assert.equal(roundTo(1.005 * 1000, 0), 1005);
});
