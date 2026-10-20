/* A piece built from the formula (src/core/formulas.js), and the jobs' level caps. The caps at item level 123 are
   checked from the raw ItemLevel rows in core-formulas.caps-at-123.test.js. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeJobContext } from '../../src/core/job-context.js';
import { buildPiece } from '../../src/core/formulas.js';

test('item level 130 healer hood from the formula (its fixed Direct Hit 6 is a real-item line, not a rank)', () => {
  // the stats of a real item level 130 healer head piece (ui-views-piece.test.js finds it in the item database)
  assert.deepEqual(buildPiece(makeJobContext('SGE'), 130, 'head', ['spd', 'spec']), {
    main: 33,
    vit: 32,
    crit: 0,
    det: 0,
    dh: 0,
    spd: 31,
    spec: 22,
  });
});

test('level caps: Blue Mage 80, Beastmaster 50 (Lodestone patch notes 6.45 and 7.56), every other job 100', () => {
  assert.equal(makeJobContext('BLU').maxLevel, 80);
  assert.equal(makeJobContext('BST').maxLevel, 50);
  for (const id of ['PLD', 'SGE', 'MNK', 'VPR', 'PCT']) assert.equal(makeJobContext(id).maxLevel, 100, id);
});
