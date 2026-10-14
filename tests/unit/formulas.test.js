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

test('Beastmaster: Strength melee (Skill Speed, no special substat), one-handed weapon plus shield, level cap 50', () => {
  const bst = makeJobContext('BST');
  assert.equal(bst.jobId, 'BST');
  assert.equal(bst.jobName, 'Beastmaster');
  assert.equal(bst.jobIndex, 22); // appended: no other job's bit moved
  assert.equal(bst.profileId, 'melee');
  assert.deepEqual([bst.label.main, bst.label.spd, bst.label.spec], ['Strength', 'Skill Speed', '']);
  assert.deepEqual(bst.substats, ['crit', 'det', 'dh', 'spd']);
  assert.equal(bst.weaponMode, '1h+oh');
  assert.equal(bst.slotPct.weapon, 100);
  assert.equal(bst.activeSlotTypes.length, 11);
  assert.ok(bst.activeSlotTypes.includes('offhand'));
  assert.equal(bst.vitFactor, 1);
  assert.equal(bst.maxLevel, 50);
});

test('level caps: Blue Mage 80, Beastmaster 50 (Lodestone patch notes 6.45 and 7.56), every other job 100', () => {
  assert.equal(makeJobContext('BLU').maxLevel, 80);
  assert.equal(makeJobContext('BST').maxLevel, 50);
  for (const id of ['PLD', 'SGE', 'MNK', 'VPR', 'PCT']) assert.equal(makeJobContext(id).maxLevel, 100, id);
});
