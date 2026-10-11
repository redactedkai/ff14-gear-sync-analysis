/* The optimizer against a reference that tries every combination, on small pools. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeJobContext } from '../../src/core/job-context.js';
import { mkItem } from '../../src/core/items.js';
import { optimize } from '../../src/core/optimizer/index.js';
import { exhaustive } from './helpers/exhaustive.js';

const sge = makeJobContext('SGE');
const NO_SYNC = { cap: 999, sync: false };

function rng(seed) {
  return () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
}

const ring = (name, spd, copies) => mkItem(name, 'ring', 100, { spd }, { copies });

/* The two policies the brute-force reference copies from the engine (helpers/exhaustive.js). Stated directly on
   hand-made pools, so changing one is a deliberate decision, not a side effect of editing the reference. */
test('policy: a single ring is worn only when no pair exists, even if a pair breaks a maximum', () => {
  const pool = [ring('A', 10, 1), mkItem('B', 'ring', 100, { spd: 5, dh: 50 })];
  // the only pair (A, B) has Direct Hit 50 > 40; ring A alone would meet the maximum but is not a legal loadout
  assert.equal(optimize(sge, pool, NO_SYNC, { target: 'spd', maxs: { dh: 40 } }).ok, false);
  assert.equal(exhaustive(sge, pool, NO_SYNC, { target: 'spd', maxs: { dh: 40 } }), null);
  // with a single Unique ring there is no pair, so it is worn once and the second ring slot stays empty
  const one = optimize(sge, [ring('A', 10, 1)], NO_SYNC, { target: 'spd' });
  assert.equal(one.totals.spd, 10);
  assert.deepEqual(
    one.picks.filter(p => p.type === 'ring').map(p => p.item?.name ?? null),
    ['A', null],
  );
});

test('policy: a slot is never left empty to satisfy a maximum', () => {
  const pool = [mkItem('H', 'head', 100, { spd: 10, crit: 50 }), mkItem('E', 'ear', 100, { spd: 3 })];
  // leaving the head empty would give Critical Hit 0 <= 40 and Spell Speed 3, but that is not a legal loadout
  assert.equal(optimize(sge, pool, NO_SYNC, { target: 'spd', maxs: { crit: 40 } }).ok, false);
  assert.equal(exhaustive(sge, pool, NO_SYNC, { target: 'spd', maxs: { crit: 40 } }), null);
});

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
