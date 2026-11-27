/* Speed limits (a minimum, a maximum, a range) on real Warrior gear, every answer against the brute-force reference;
   infeasible limits, the node limit and an empty pool. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeJobContext } from '../../../../src/core/job-context.ts';
import { browseItems, poolItemFromRow } from '../../../../src/core/items.ts';
import { optimize } from '../../../../src/core/optimizer/index.ts';
import type { DimKey, SlotType, Sync } from '../../../../src/core/types.ts';
import { mustSolve } from '../../helpers/common.ts';
import { exhaustive, gamePool, loadoutCount } from '../../helpers/exhaustive.ts';

const war = makeJobContext('WAR');
const sge = makeJobContext('SGE');
const NOSYNC: Sync = { cap: 123, sync: false };

/* Warrior real gear: every item a Warrior can equip at item level 130-135, equip level 50 or below. Six weapons
   (two at 135), two pieces per armor slot and four per accessory slot, all item level 130; four rings, two of
   them Unique. About 98,000 loadouts, so exhaustive() checks every answer. */
const pool = gamePool(war, { ilvlMin: 130, ilvlMax: 135, lvlMax: 50 });
const brute = (target: DimKey, constraints: { spdMin?: number; spdMax?: number } = {}) =>
  exhaustive(war, pool, NOSYNC, { target, ...constraints });

test('the pool is what these tests need, and the unconstrained result matches brute force', () => {
  // a patch that changes the window fails here, not in a puzzling total below
  const of = (t: SlotType) => pool.filter(i => i.type === t);
  assert.ok(of('weapon').length >= 2);
  assert.equal(Math.max(...of('weapon').map(i => i.ilvl)), 135);
  const slotTypes: SlotType[] = ['head', 'body', 'hands', 'legs', 'feet', 'ear', 'neck', 'wrist', 'ring'];
  for (const t of slotTypes) {
    assert.ok(of(t).length >= 2, t);
    assert.ok(
      of(t).every(i => i.ilvl === 130),
      t,
    );
  }
  assert.ok(of('ring').some(i => i.copies === 1) && of('ring').some(i => i.copies === 2));
  assert.ok(loadoutCount(war, pool) <= 200000);
  const r = optimize(war, pool, NOSYNC, { target: 'sks' });
  assert.ok(r.ok);
  assert.deepEqual([r.totals.sks], brute('sks'));
});

test('a speed minimum is honoured and changes the answer when binding', () => {
  const free = mustSolve(optimize(war, pool, NOSYNC, { target: 'ten' }));
  const spdMin = free.totals.sks + 10;
  const r = optimize(war, pool, NOSYNC, { target: 'ten', spdMin });
  assert.ok(r.ok);
  assert.ok(r.totals.sks >= spdMin);
  assert.deepEqual([r.totals.ten], brute('ten', { spdMin }));
  assert.ok(r.totals.ten < free.totals.ten);
});

test('an unreachable speed minimum -> ok:false', () => {
  const most = mustSolve(optimize(war, pool, NOSYNC, { target: 'sks' })).totals.sks;
  assert.equal(brute('ten', { spdMin: most + 1 }), null);
  const r = optimize(war, pool, NOSYNC, { target: 'ten', spdMin: most + 1 });
  assert.equal(r.ok, false);
  assert.equal(r.truncated, false);
});

test('a speed maximum is honoured', () => {
  const free = mustSolve(optimize(war, pool, NOSYNC, { target: 'ten' }));
  const spdMax = free.totals.sks - 1;
  const r = optimize(war, pool, NOSYNC, { target: 'ten', spdMax });
  assert.ok(r.ok);
  assert.ok(r.totals.sks <= spdMax);
  assert.deepEqual([r.totals.ten], brute('ten', { spdMax }));
  assert.ok(r.totals.ten < free.totals.ten);
});

test('a speed range agrees with brute force', () => {
  const most = mustSolve(optimize(war, pool, NOSYNC, { target: 'sks' })).totals.sks;
  for (const [spdMin, spdMax] of [
    [most - 20, most - 10],
    [most - 40, most - 30],
    [most - 5, most],
  ]) {
    const want = brute('ten', { spdMin, spdMax });
    const r = optimize(war, pool, NOSYNC, { target: 'ten', spdMin, spdMax });
    if (!want) {
      assert.equal(r.ok, false);
      continue;
    }
    assert.ok(r.ok && r.totals.sks >= spdMin && r.totals.sks <= spdMax);
    assert.deepEqual([r.totals.ten], want);
  }
});

test('an impossible speed maximum -> ok:false', () => {
  // the lowest speed any loadout can have is above 0 only if every slot forces speed; -1 is always impossible
  assert.equal(brute('ten', { spdMax: -1 }), null);
  assert.equal(optimize(war, pool, NOSYNC, { target: 'ten', spdMax: -1 }).ok, false);
});

test('nodeLimit: a large pool with a tiny limit reports truncation', () => {
  const big = browseItems(sge, {}).map(row => poolItemFromRow(sge, row));
  assert.ok(big.length > 1000);
  const r = optimize(sge, big, NOSYNC, { target: 'sps', nodeLimit: 5 });
  assert.equal(r.truncated, true);
  assert.ok(r.nodes <= 10);
  const full = optimize(sge, big, NOSYNC, { target: 'sps' });
  assert.equal(full.truncated, false);
  assert.ok(full.ok);
});

test('empty pool: no picks, zero totals, no error', () => {
  const r = optimize(sge, [], { cap: 123, sync: true }, { target: 'sps' });
  assert.equal(r.ok, true);
  assert.deepEqual(r.picks, []);
  assert.equal(r.totals.sps, 0);
  assert.equal(r.truncated, false);
});
