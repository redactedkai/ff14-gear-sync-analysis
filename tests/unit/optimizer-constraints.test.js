import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeJobContext } from '../../src/core/job-context.js';
import { browseItems, poolItemFromRow } from '../../src/core/items.js';
import { optimize } from '../../src/core/optimizer/index.js';

const war = makeJobContext('WAR');
const sge = makeJobContext('SGE');
const NOSYNC = { cap: 123, sync: false };

/* Warrior Dreadwyrm pool: one weapon and one piece per armor slot, but Fending/Slaying choices for each
   accessory slot. Both rings are distinct Unique items, so both are worn. 8 combinations in all. */
const dw = browseItems(war, { q: 'Dreadwyrm', lvlMax: 50 }).map(r => poolItemFromRow(war, r));

/* Independent check: enumerate every ear/neck/wrist combination. */
function bruteForce(target, mins = {}, maxs = {}) {
  const fixed = dw.filter(i => !['ear', 'neck', 'wrist'].includes(i.type));
  const of = t => dw.filter(i => i.type === t);
  let best = null;
  for (const e of of('ear'))
    for (const n of of('neck'))
      for (const w of of('wrist')) {
        const tot = {};
        for (const s of war.stats) tot[s] = [...fixed, e, n, w].reduce((a, i) => a + i.stats[s], 0);
        if (Object.entries(mins).some(([s, m]) => tot[s] < m)) continue;
        if (Object.entries(maxs).some(([s, m]) => tot[s] > m)) continue;
        if (!best || tot[target] > best[target]) best = tot;
      }
  return best;
}

test('pool sanity: 14 Warrior Dreadwyrm pieces (level 50)', () => {
  assert.equal(dw.length, 14);
});

test('unconstrained result matches brute force', () => {
  const r = optimize(war, dw, NOSYNC, { target: 'spd' });
  assert.ok(r.ok);
  assert.equal(r.totals.spd, bruteForce('spd').spd);
});

test('mins are honoured and change the answer when binding', () => {
  const free = optimize(war, dw, NOSYNC, { target: 'spd' });
  const need = free.totals.spec + 10;
  const r = optimize(war, dw, NOSYNC, { target: 'spd', mins: { spec: need } });
  assert.ok(r.ok);
  assert.ok(r.totals.spec >= need);
  assert.equal(r.totals.spd, bruteForce('spd', { spec: need }).spd);
  assert.ok(r.totals.spd < free.totals.spd);
});

test('infeasible mins -> ok:false', () => {
  const r = optimize(war, dw, NOSYNC, { target: 'spd', mins: { spec: 500 } });
  assert.equal(r.ok, false);
  assert.equal(r.truncated, false);
});

test('maxs are honoured', () => {
  const free = optimize(war, dw, NOSYNC, { target: 'spec' });
  const cap = free.totals.dh - 1;
  const r = optimize(war, dw, NOSYNC, { target: 'spec', maxs: { dh: cap } });
  assert.ok(r.ok);
  assert.ok(r.totals.dh <= cap);
  assert.equal(r.totals.spec, bruteForce('spec', {}, { dh: cap }).spec);
});

test('infeasible maxs -> ok:false', () => {
  assert.equal(optimize(war, dw, NOSYNC, { target: 'spd', maxs: { spec: 10 } }).ok, false);
});

test('average item level requirement: met at 130, infeasible at 131', () => {
  // weapon 135 counts twice, ten other pieces at 130: (2*135 + 10*130) / 12 = 130.83
  const ok = optimize(war, dw, NOSYNC, { target: 'spd', minAvgIlvl: 130 });
  assert.ok(ok.ok);
  assert.equal(ok.denom, 12);
  assert.ok(Math.abs(ok.avgIlvl - 1570 / 12) < 1e-9);
  assert.equal(optimize(war, dw, NOSYNC, { target: 'spd', minAvgIlvl: 131 }).ok, false);
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
