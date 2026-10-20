/* The optimizer view's empty rows (src/ui/views/optimizer.js through core/set.js): a slot another piece covers names
   the piece the table shows. Found while moving the view onto evaluateSet (2026-10-19): White Mage at cap 123, Mind >
   Critical Hit > Determination with melds and tier ranking, the search picked Phantom Cane Eclipticum, the Weapon row
   showed Zelkova Cane (an easier weapon with the same result, core/same-result.js), and the Off-hand row still said
   "covered by Phantom Cane Eclipticum". */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { optimizerView } from '../../src/ui/views/optimizer.js';
import { makeApp } from './helpers/views.js';

test('optimizer view: the Off-hand row is covered by the weapon the Weapon row shows', () => {
  const app = makeApp('WHM', { sync: true, cap: 123, level: 100 });
  Object.assign(app.opt, { target: 'main', tb: 'crit', tb2: 'det', melds: true, byTier: true, food: false });
  const v = optimizerView(app);
  assert.equal(v.kind, 'ok');
  const weapon = v.rows.find(r => r.label === 'Weapon');
  const offhand = v.rows.find(r => r.label === 'Off-hand');
  assert.equal(offhand.item, null);
  assert.equal(offhand.blockedBy, weapon.item.name);
  assert.equal(offhand.emptyText, `covered by ${weapon.item.name}`);
});
