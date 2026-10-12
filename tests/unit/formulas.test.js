import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeJobContext } from '../../src/core/job-context.js';
import { capsFor, buildPiece } from '../../src/core/formulas.js';

const sge = makeJobContext('SGE');

test('substat caps at sync 123 (head 29, body 47, accessory 23, 2H weapon 48)', () => {
  for (const [type, want] of [
    ['head', 29],
    ['body', 47],
    ['ear', 23],
    ['weapon', 48],
  ]) {
    assert.equal(capsFor(sge, type, 123).spd, want, type);
  }
});

test('main-stat caps at sync 123 (head 30, body 48, accessory 24, 2H weapon 50)', () => {
  for (const [type, want] of [
    ['head', 30],
    ['body', 48],
    ['ear', 24],
    ['weapon', 50],
  ]) {
    assert.equal(capsFor(sge, type, 123).main, want, type);
  }
});

test('item level 130 healer hood from the formula (its fixed Direct Hit 6 is a real-item line, not a rank)', () => {
  assert.deepEqual(buildPiece(sge, 130, 'head', ['spd', 'spec']), { main: 33, vit: 32, crit: 0, det: 0, dh: 0, spd: 31, spec: 22 });
});

test('Paladin uses a one-handed weapon plus off-hand', () => {
  assert.equal(makeJobContext('PLD').weaponMode, '1h+oh');
});
