import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeJobContext } from '../../src/core/job-context.js';
import { browseItems, poolItemFromRow } from '../../src/core/items.js';
import { optimize } from '../../src/core/optimizer/index.js';
import { exhaustive, gamePool, loadoutCount } from './helpers/exhaustive.js';

const war = makeJobContext('WAR');
const sge = makeJobContext('SGE');
const NOSYNC = { cap: 123, sync: false };

/* Warrior real gear: every item a Warrior can equip at item level 130-135, equip level 50 or below. Six weapons
   (two at 135), two pieces per armor slot and four per accessory slot, all item level 130; four rings, two of
   them Unique. About 98,000 loadouts, so exhaustive() checks every answer. */
const pool = gamePool(war, { ilvlMin: 130, ilvlMax: 135, lvlMax: 50 });
const brute = (target, constraints) => exhaustive(war, pool, NOSYNC, { target, ...constraints });

test('pool sanity: Warrior item level 130-135 gear', () => {
  const of = t => pool.filter(i => i.type === t);
  assert.ok(of('weapon').length >= 2);
  assert.equal(Math.max(...of('weapon').map(i => i.ilvl)), 135);
  for (const t of ['head', 'body', 'hands', 'legs', 'feet', 'ear', 'neck', 'wrist', 'ring']) {
    assert.ok(of(t).length >= 2, t);
    assert.ok(
      of(t).every(i => i.ilvl === 130),
      t,
    );
  }
  assert.ok(of('ring').some(i => i.copies === 1) && of('ring').some(i => i.copies === 2));
  assert.ok(loadoutCount(war, pool) <= 200000);
});

test('unconstrained result matches brute force', () => {
  const r = optimize(war, pool, NOSYNC, { target: 'spd' });
  assert.ok(r.ok);
  assert.deepEqual([r.totals.spd], brute('spd'));
});

test('mins are honoured and change the answer when binding', () => {
  const free = optimize(war, pool, NOSYNC, { target: 'spec' });
  const need = free.totals.det + 10;
  const r = optimize(war, pool, NOSYNC, { target: 'spec', mins: { det: need } });
  assert.ok(r.ok);
  assert.ok(r.totals.det >= need);
  assert.deepEqual([r.totals.spec], brute('spec', { mins: { det: need } }));
  assert.ok(r.totals.spec < free.totals.spec);
});

test('infeasible mins -> ok:false', () => {
  assert.equal(brute('spd', { mins: { spec: 500 } }), null);
  const r = optimize(war, pool, NOSYNC, { target: 'spd', mins: { spec: 500 } });
  assert.equal(r.ok, false);
  assert.equal(r.truncated, false);
});

test('maxs are honoured', () => {
  const free = optimize(war, pool, NOSYNC, { target: 'spec' });
  const cap = free.totals.dh - 1;
  const r = optimize(war, pool, NOSYNC, { target: 'spec', maxs: { dh: cap } });
  assert.ok(r.ok);
  assert.ok(r.totals.dh <= cap);
  assert.deepEqual([r.totals.spec], brute('spec', { maxs: { dh: cap } }));
  assert.ok(r.totals.spec < free.totals.spec);
});

test('infeasible maxs -> ok:false', () => {
  // every piece carries Vitality, so no loadout stays under 400
  assert.equal(brute('spd', { maxs: { vit: 400 } }), null);
  assert.equal(optimize(war, pool, NOSYNC, { target: 'spd', maxs: { vit: 400 } }).ok, false);
});

test('average item level requirement: met at 130, infeasible at 131', () => {
  // best is a 135 weapon (counts twice) and ten other pieces at 130: (2*135 + 10*130) / 12 = 130.83
  const ok = optimize(war, pool, NOSYNC, { target: 'spd', minAvgIlvl: 130 });
  assert.ok(ok.ok);
  assert.equal(ok.denom, 12);
  assert.ok(Math.abs(ok.avgIlvl - 1570 / 12) < 1e-9);
  assert.deepEqual([ok.totals.spd], brute('spd', { minAvgIlvl: 130 }));
  assert.equal(brute('spd', { minAvgIlvl: 131 }), null);
  assert.equal(optimize(war, pool, NOSYNC, { target: 'spd', minAvgIlvl: 131 }).ok, false);
});

test('nodeLimit: a large pool with a tiny limit reports truncation', () => {
  const big = browseItems(sge, {}).map(r => poolItemFromRow(sge, r));
  assert.ok(big.length > 1000);
  const r = optimize(sge, big, NOSYNC, { target: 'spd', nodeLimit: 5 });
  assert.equal(r.truncated, true);
  assert.ok(r.nodes <= 10);
  const full = optimize(sge, big, NOSYNC, { target: 'spd' });
  assert.equal(full.truncated, false);
  assert.ok(full.ok);
});

test('empty pool: no picks, zero totals, no error', () => {
  const r = optimize(sge, [], { cap: 123, sync: true }, { target: 'spd' });
  assert.equal(r.ok, true);
  assert.deepEqual(r.picks, []);
  assert.equal(r.totals.spd, 0);
  assert.equal(r.avgIlvl, 0);
  assert.equal(r.truncated, false);
});
