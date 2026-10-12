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

test('a speed minimum is honoured and changes the answer when binding', () => {
  const free = optimize(war, pool, NOSYNC, { target: 'spec' });
  const spdMin = free.totals.spd + 10;
  const r = optimize(war, pool, NOSYNC, { target: 'spec', spdMin });
  assert.ok(r.ok);
  assert.ok(r.totals.spd >= spdMin);
  assert.deepEqual([r.totals.spec], brute('spec', { spdMin }));
  assert.ok(r.totals.spec < free.totals.spec);
});

test('an unreachable speed minimum -> ok:false', () => {
  const most = optimize(war, pool, NOSYNC, { target: 'spd' }).totals.spd;
  assert.equal(brute('spec', { spdMin: most + 1 }), null);
  const r = optimize(war, pool, NOSYNC, { target: 'spec', spdMin: most + 1 });
  assert.equal(r.ok, false);
  assert.equal(r.truncated, false);
});

test('a speed maximum is honoured', () => {
  const free = optimize(war, pool, NOSYNC, { target: 'spec' });
  const spdMax = free.totals.spd - 1;
  const r = optimize(war, pool, NOSYNC, { target: 'spec', spdMax });
  assert.ok(r.ok);
  assert.ok(r.totals.spd <= spdMax);
  assert.deepEqual([r.totals.spec], brute('spec', { spdMax }));
  assert.ok(r.totals.spec < free.totals.spec);
});

test('a speed range agrees with brute force', () => {
  const most = optimize(war, pool, NOSYNC, { target: 'spd' }).totals.spd;
  for (const [spdMin, spdMax] of [
    [most - 20, most - 10],
    [most - 40, most - 30],
    [most - 5, most],
  ]) {
    const want = brute('spec', { spdMin, spdMax });
    const r = optimize(war, pool, NOSYNC, { target: 'spec', spdMin, spdMax });
    if (!want) {
      assert.equal(r.ok, false);
      continue;
    }
    assert.ok(r.ok && r.totals.spd >= spdMin && r.totals.spd <= spdMax);
    assert.deepEqual([r.totals.spec], want);
  }
});

test('an impossible speed maximum -> ok:false', () => {
  // the lowest speed any loadout can have is above 0 only if every slot forces speed; -1 is always impossible
  assert.equal(brute('spec', { spdMax: -1 }), null);
  assert.equal(optimize(war, pool, NOSYNC, { target: 'spec', spdMax: -1 }).ok, false);
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
  assert.equal(r.truncated, false);
});
