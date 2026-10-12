/* Piece stats substat ranks: a substat holds at most one rank. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeJobContext } from '../../src/core/job-context.js';
import { withSub } from '../../src/ui/views/piece.js';

const healer = makeJobContext('WHM').substats; // crit, det, dh, spd, spec

test('choosing an unused substat just sets that rank', () => {
  assert.deepEqual(withSub(['spd', 'spec'], 1, 'crit', healer), ['spd', 'crit']);
});

test('choosing a substat used in another rank swaps the two', () => {
  assert.deepEqual(withSub(['spd', 'spec'], 1, 'spd', healer), ['spec', 'spd']);
  assert.deepEqual(withSub(['spd', 'spec'], 0, 'spec', healer), ['spec', 'spd']);
});

test('rank 2 can be cleared, and a swap never empties rank 1', () => {
  assert.deepEqual(withSub(['spd', 'spec'], 1, '', healer), ['spd', null]);
  // rank 2 is empty; moving rank 1's substat there would leave rank 1 empty, so rank 1 takes the first free one
  assert.deepEqual(withSub(['spd', null], 1, 'spd', healer), ['crit', 'spd']);
});

test('an older three-rank list is cut to two', () => {
  assert.deepEqual(withSub(['spd', 'spec', 'dh'], 1, 'crit', healer), ['spd', 'crit']);
});

test('no substat ever appears twice', () => {
  const opts = ['', ...healer];
  for (const a of healer)
    for (const b of [null, ...healer]) {
      if (a === b) continue;
      for (let i = 0; i < 2; i++)
        for (const v of opts) {
          if (i === 0 && v === '') continue; // rank 1 offers no "none"
          const out = withSub([a, b], i, v, healer).filter(Boolean);
          assert.equal(new Set(out).size, out.length, JSON.stringify([[a, b], i, v]));
        }
    }
});
