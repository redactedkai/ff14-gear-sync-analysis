/* The optimizer against a reference that tries every combination, on small pools. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeJobContext, ilWeight } from '../../src/core/job-context.js';
import { mkItem } from '../../src/core/items.js';
import { optimize, effStats } from '../../src/core/optimizer/index.js';

const sge = makeJobContext('SGE');
const NO_SYNC = { cap: 999, sync: false };

/* Best [target, tiebreak1, tiebreak2] totals over every legal loadout, or null if none meets the constraints.
   One item per slot that has items; two rings (the same item twice only if it has 2 copies, a single ring
   only when no pair exists), matching the optimizer's rules. */
function exhaustive(job, pool, sync, { target, tiebreak = [], minAvgIlvl = 0, mins = {} }) {
  const keys = [target, ...tiebreak.filter(Boolean)];
  const slots = job.activeSlotTypes.filter(t => pool.some(i => i.type === t));
  const choices = slots.map(t => {
    const items = pool.filter(i => i.type === t);
    if (t !== 'ring') return items.map(i => [i]);
    const pairs = [];
    items.forEach((a, x) => {
      items.forEach((b, y) => {
        if (y < x || (x === y && (a.copies || 1) < 2)) return;
        pairs.push([a, b]);
      });
    });
    return pairs.length ? pairs : items.map(i => [i]);
  });
  const denom = slots.reduce((a, t) => a + ilWeight(job, t) * (t === 'ring' ? 2 : 1), 0);
  let best = null;
  const rec = (k, picked) => {
    if (k === choices.length) {
      const tot = {};
      let ilw = 0;
      picked.forEach(i => {
        const e = effStats(job, i, sync);
        job.stats.forEach(s => {
          tot[s] = (tot[s] || 0) + (e[s] || 0);
        });
        ilw += i.ilvl * ilWeight(job, i.type);
      });
      if (minAvgIlvl && ilw < minAvgIlvl * denom) return;
      if (Object.entries(mins).some(([s, m]) => (tot[s] || 0) < m)) return;
      const v = keys.map(s => tot[s] || 0);
      if (!best || lexGreater(v, best)) best = v;
      return;
    }
    choices[k].forEach(c => {
      rec(k + 1, picked.concat(c));
    });
  };
  rec(0, []);
  return best;
}

function lexGreater(a, b) {
  const i = a.findIndex((x, k) => x !== b[k]);
  return i >= 0 && a[i] > b[i];
}

function rng(seed) {
  return () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
}

const ring = (name, spd, copies) => mkItem(name, 'ring', 100, { spd }, { copies });

test('F1 regression: the second-best Unique ring is kept for the pair', () => {
  const pool = [ring('A', 10, 1), ring('B', 9, 1), ring('C', 5, 1)];
  const r = optimize(sge, pool, NO_SYNC, { target: 'spd' });
  assert.equal(r.totals.spd, 19);
  assert.deepEqual(r.picks.map(p => p.item.name).sort(), ['A', 'B']);
});

test('F1 regression: two identical Unique rings are both worn', () => {
  assert.equal(optimize(sge, [ring('A', 10, 1), ring('A2', 10, 1)], NO_SYNC, { target: 'spd' }).totals.spd, 20);
});

test('a ring with 2 copies still beats two worse Unique rings', () => {
  assert.equal(optimize(sge, [ring('A', 10, 2), ring('B', 9, 1), ring('C', 8, 1)], NO_SYNC, { target: 'spd' }).totals.spd, 20);
});

test('optimizer matches exhaustive search on 400 random small pools', () => {
  const rand = rng(20261011),
    int = n => Math.floor(rand() * n);
  const types = ['weapon', 'head', 'body', 'ring', 'neck'];
  for (let t = 0; t < 400; t++) {
    const pool = [];
    for (const ty of types) {
      const n = ty === 'ring' ? 1 + int(5) : int(4); // sometimes a slot has no items
      for (let i = 0; i < n; i++) {
        pool.push(
          mkItem(
            `${ty}${i}`,
            ty,
            90 + int(60),
            { spd: int(30), crit: int(30), det: int(30), main: int(5) },
            { copies: ty === 'ring' && rand() < 0.4 ? 2 : 1 },
          ),
        );
      }
    }
    const sync = rand() < 0.5 ? NO_SYNC : { cap: 110, sync: true };
    const opts = {
      target: ['spd', 'crit', 'det'][int(3)],
      tiebreak: [rand() < 0.6 ? 'main' : '', rand() < 0.5 ? 'crit' : ''],
      minAvgIlvl: rand() < 0.3 ? 100 + int(40) : 0,
      mins: rand() < 0.2 ? { det: 20 + int(40) } : {},
    };
    const want = exhaustive(sge, pool, sync, opts);
    const r = optimize(sge, pool, sync, opts);
    const label = `pool #${t} ${JSON.stringify(opts)}`;
    if (!want) {
      assert.equal(r.ok, false, label);
      continue;
    }
    assert.ok(r.ok && !r.truncated, label);
    const keys = [opts.target, ...opts.tiebreak.filter(Boolean)];
    assert.deepEqual(
      keys.map(s => r.totals[s]),
      want,
      label,
    );
  }
});

test('maximum constraints are respected and still find the best loadout', () => {
  const pool = [ring('A', 10, 1), ring('B', 9, 1), ring('C', 5, 1)];
  pool.push(mkItem('H1', 'head', 100, { spd: 20, crit: 30 }), mkItem('H2', 'head', 100, { spd: 15, crit: 5 }));
  const r = optimize(sge, pool, NO_SYNC, { target: 'spd', maxs: { crit: 10 } });
  assert.equal(r.totals.spd, 34); // H2 (crit 5) + A + B; H1 dominates H2 but breaks the crit maximum
});

test('F3 regression: a tiebreak total of 10,000 or more never outranks a higher key', () => {
  const head = (name, stats) => mkItem(name, 'head', 100, stats);
  // the old fixed weights (1e8 / 1e4 / 1) scored B and D higher
  let r = optimize(sge, [head('A', { spd: 2 }), head('B', { spd: 1, main: 20000 })], NO_SYNC, { target: 'spd', tiebreak: ['main'] });
  assert.equal(r.picks[0].item.name, 'A');
  r = optimize(sge, [head('C', { spd: 1, main: 1 }), head('D', { spd: 1, vit: 20000 })], NO_SYNC, {
    target: 'spd',
    tiebreak: ['main', 'vit'],
  });
  assert.equal(r.picks[0].item.name, 'C');
});

test('optimizer matches exhaustive search on random pools with huge tiebreak stats', () => {
  const rand = rng(310),
    int = n => Math.floor(rand() * n);
  const types = ['weapon', 'head', 'body', 'ring', 'neck'];
  for (let t = 0; t < 200; t++) {
    const pool = [];
    for (const ty of types) {
      const n = ty === 'ring' ? 1 + int(4) : 1 + int(3);
      for (let i = 0; i < n; i++) {
        pool.push(
          mkItem(
            `${ty}${i}`,
            ty,
            100,
            { spd: int(4), main: int(3) * 40000, vit: int(50000) },
            { copies: ty === 'ring' && rand() < 0.4 ? 2 : 1 },
          ),
        );
      }
    }
    const opts = { target: 'spd', tiebreak: ['main', 'vit'] };
    const want = exhaustive(sge, pool, NO_SYNC, opts);
    const r = optimize(sge, pool, NO_SYNC, opts);
    assert.deepEqual(
      ['spd', 'main', 'vit'].map(s => r.totals[s]),
      want,
      `pool #${t}`,
    );
  }
});

test('a pool too large to score exactly throws instead of ranking wrongly', () => {
  const pool = [mkItem('H', 'head', 100, { spd: 1e6, main: 1e6, vit: 1e6 })];
  assert.throws(() => optimize(sge, pool, NO_SYNC, { target: 'spd', tiebreak: ['main', 'vit'] }), /too large/);
});
