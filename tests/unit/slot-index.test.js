/* Slot positions and blocked-slot masks (src/core/optimizer/slot-index.js), on the slot list a two-handed job with a
   cloak in its pool gets: blockable slots last, rings twice. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SLOT_TYPES } from '../../src/core/constants.js';
import { blockableTypes, positionMask, slotPositions, typeMask } from '../../src/core/optimizer/slot-index.js';

const SLOT_LIST = ['weapon', 'body', 'hands', 'ring', 'ring', 'head'];

test('slotPositions: each type at its position, a ring at its second', () => {
  const positions = slotPositions(SLOT_LIST);
  assert.equal(positions.get('weapon'), 0);
  assert.equal(positions.get('head'), 5);
  assert.equal(positions.get('ring'), 4);
  assert.equal(positions.has('offhand'), false);
});

test('positionMask: one bit per position; a slot the loadout lacks adds nothing', () => {
  const positions = slotPositions(SLOT_LIST);
  assert.equal(positionMask(['head'], positions), 1 << 5);
  assert.equal(positionMask(['head', 'hands'], positions), (1 << 5) | (1 << 2));
  // a two-handed weapon blocks the off-hand, which this loadout has no slot for
  assert.equal(positionMask(['offhand'], positions), 0);
  assert.equal(positionMask([], positions), 0);
});

test('blockableTypes: every type some candidate leaves empty, once', () => {
  const lists = [[{ blocks: ['offhand'] }, { blocks: [] }], [{ blocks: ['head'] }, { blocks: ['head'] }], []];
  assert.deepEqual([...blockableTypes(lists)].sort(), ['head', 'offhand']);
  assert.equal(blockableTypes([]).size, 0);
});

test('typeMask: bits by SLOT_TYPES, so a subset of blocked slots is a subset of bits', () => {
  assert.equal(typeMask([]), 0);
  assert.equal(typeMask(['head']), 1 << SLOT_TYPES.indexOf('head'));
  const cloak = typeMask(['head']),
    fullBody = typeMask(['hands', 'legs', 'feet']),
    legs = typeMask(['feet']);
  assert.equal(legs & fullBody, legs);
  assert.notEqual(cloak & fullBody, cloak);
});
