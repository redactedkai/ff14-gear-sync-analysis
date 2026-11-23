/* The width sweep's bisection (scripts/layout-stress/breakpoints.mjs) against a made-up layout with known breakpoints. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findChangePoints } from '../../../../scripts/layout-stress/breakpoints.mjs';

/* A layout that is "stacked" below 1100 px, "side by side" from 1100 px, and has a third state from 1299 px. */
const layoutAt = width => (width < 1100 ? 'stacked' : width < 1299 ? 'side' : 'wide');
const run = (extra = {}) => {
  const asked = [];
  return {
    asked,
    promise: findChangePoints({
      from: 960,
      to: 2560,
      step: 40,
      measure: async width => {
        asked.push(width);
        return { layout: layoutAt(width) };
      },
      keyOf: result => result.layout,
      describe: (before, after) => [`${before.layout} -> ${after.layout}`],
      ...extra,
    }),
  };
};

test('each change is found to the pixel: the first width of the new layout', async () => {
  const { promise } = run();
  const { changes } = await promise;
  assert.deepEqual(
    changes.map(change => [change.at, change.changes]),
    [
      [1100, ['stacked -> side']],
      [1299, ['side -> wide']],
    ],
  );
});

test('a layout that never changes has no change points, and each width is measured once', async () => {
  const { promise, asked } = run({ measure: async () => ({ layout: 'same' }) });
  const result = await promise;
  assert.deepEqual(result.changes, []);
  assert.equal(new Set(asked).size, asked.length);
  assert.equal(result.measured, 41); // 960 to 2560 every 40 px
  assert.equal(result.series.at(0).width, 960);
  assert.equal(result.series.at(-1).width, 2560);
});

test('the search measures far fewer widths than every pixel, in order', async () => {
  const { promise } = run();
  const result = await promise;
  assert.ok(result.measured < 80, `measured ${result.measured}`);
  const widths = result.series.map(item => item.width);
  assert.deepEqual(
    widths,
    [...widths].sort((a, b) => a - b),
  );
});

test('a change point on a coarse width itself is found', async () => {
  const { promise } = run({ measure: async width => ({ layout: width >= 1000 ? 'b' : 'a' }), describe: () => ['x'] });
  assert.deepEqual(
    (await promise).changes.map(change => change.at),
    [1000],
  );
});
