/* Piece lab substat ranks: a substat holds at most one rank (docs/audit-2.md A9). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeJobContext } from '../../src/core/job-context.js';
import { withSub } from '../../src/ui/views/piece.js';

const healer = makeJobContext('WHM').substats; // crit, det, dh, spd, spec

test('choosing an unused substat just sets that rank', () => {
  assert.deepEqual(withSub(['spd', 'spec', 'dh'], 1, 'crit', healer), ['spd', 'crit', 'dh']);
});

test('choosing a substat used in another rank swaps the two', () => {
  assert.deepEqual(withSub(['spd', 'spec', 'dh'], 1, 'spd', healer), ['spec', 'spd', 'dh']);
  assert.deepEqual(withSub(['spd', 'spec', 'dh'], 0, 'dh', healer), ['dh', 'spec', 'spd']);
});

test('the third rank can be cleared, and a swap never empties rank 1 or 2', () => {
  assert.deepEqual(withSub(['spd', 'spec', 'dh'], 2, '', healer), ['spd', 'spec', null]);
  // rank 3 is empty; moving rank 1's substat there would leave rank 1 empty, so rank 1 takes the first free one
  assert.deepEqual(withSub(['spd', 'spec', null], 2, 'spd', healer), ['crit', 'spec', 'spd']);
});

test('no substat ever appears twice', () => {
  const opts = ['', ...healer];
  for (const a of healer)
    for (const b of healer) {
      if (a === b) continue;
      for (const c of [null, ...healer]) {
        if (c === a || c === b) continue;
        for (let i = 0; i < 3; i++)
          for (const v of opts) {
            if (i < 2 && v === '') continue; // ranks 1 and 2 offer no "none"
            const out = withSub([a, b, c], i, v, healer).filter(Boolean);
            assert.equal(new Set(out).size, out.length, JSON.stringify([[a, b, c], i, v]));
          }
      }
    }
});
