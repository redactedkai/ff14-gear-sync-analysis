/* Gear groups for Copy sheet (src/core/gear-groups.ts): the generated table, the group's role name, and the
   pieces a job cannot wear (by the job mask). Expected values are the groups measured on the item data (owner's table in
   a4-sheet's data model: tanks, healers, melee A, B and C, physical ranged, casters, Blue Mage and Beastmaster alone). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import ITEM_FORMAT from '../../../src/core/item-format.json' with { type: 'json' };
import { GEAR_GROUPS, gearGroupName, piecesJobCannotWear } from '../../../src/core/gear-groups.ts';
import { JOB_LEVEL_CAPS } from '../../../src/core/constants.ts';
import { makeJobContext } from '../../../src/core/job-context.ts';
import { itemRow } from '../helpers/common.js';
import { ROW } from '../../../src/core/constants.ts';

test('the groups are the nine measured ones and hold every job once', () => {
  assert.deepEqual(
    GEAR_GROUPS.map(g => [...g]),
    [
      ['PLD', 'WAR', 'DRK', 'GNB'],
      ['WHM', 'SCH', 'AST', 'SGE'],
      ['MNK', 'SAM'],
      ['DRG', 'RPR'],
      ['NIN', 'VPR'],
      ['BRD', 'MCH', 'DNC'],
      ['BLM', 'SMN', 'RDM', 'PCT'],
      ['BLU'],
      ['BST'],
    ],
  );
  assert.deepEqual(GEAR_GROUPS.flat().sort(), [...ITEM_FORMAT.jobs].sort());
});

test('a group never mixes level caps', () => {
  for (const group of GEAR_GROUPS) {
    assert.equal(new Set(group.map(id => JOB_LEVEL_CAPS[id] ?? null)).size, 1);
  }
});

const shield = itemRow("Grand Champion's Kite Shield"); // off-hand, item level 795, Paladin only
const shirt = itemRow('Augmented Bygone Brass Shirt of Healing'); // body, item level 790, WHM SCH AST SGE
const pieceOf = (row, slot) => ({ slot, gameId: row[ROW.gameId], stones: [] });

test('piecesJobCannotWear lists the Paladin shield for a Warrior and the healing shirt for a Paladin, by slot and name', () => {
  const pieces = [pieceOf(shirt, 'body'), pieceOf(shield, 'offhand')];
  assert.deepEqual(piecesJobCannotWear(makeJobContext('WAR'), pieces), [
    { index: 0, slot: 'body', gameId: shirt[ROW.gameId], name: 'Augmented Bygone Brass Shirt of Healing' },
    { index: 1, slot: 'offhand', gameId: shield[ROW.gameId], name: "Grand Champion's Kite Shield" },
  ]);
  assert.deepEqual(
    piecesJobCannotWear(makeJobContext('PLD'), pieces).map(p => p.index),
    [0],
  );
  assert.deepEqual(
    piecesJobCannotWear(makeJobContext('SCH'), pieces).map(p => p.index),
    [1],
  );
});

test('piecesJobCannotWear skips empty slots, custom pieces and unknown game ids', () => {
  const pieces = [{ slot: 'head' }, { slot: 'body', custom: {}, stones: [] }, { slot: 'feet', gameId: -1, stones: [] }];
  assert.deepEqual(piecesJobCannotWear(makeJobContext('WAR'), pieces), []);
});

test('gearGroupName: the picker row name when the whole group is in one row, else none', () => {
  assert.equal(gearGroupName('SGE'), 'Healers');
  assert.equal(gearGroupName('WAR'), 'Tanks');
  assert.equal(gearGroupName('BRD'), 'Physical ranged');
  assert.equal(gearGroupName('MNK'), 'Melee'); // Monk and Samurai
  assert.equal(gearGroupName('NIN'), 'Melee'); // Ninja and Viper
  assert.equal(gearGroupName('BLM'), 'Magical ranged');
  assert.equal(gearGroupName('BLU'), null); // alone in its group
  assert.equal(gearGroupName('BST'), null);
  assert.equal(gearGroupName('XXX'), null);
});
