/* The optimizer against a reference that tries every combination, on small pools. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeJobContext } from '../../src/core/job-context.js';
import { mkItem } from '../../src/core/items.js';
import { optimize } from '../../src/core/optimizer/index.js';
import { exhaustive, gamePool } from './helpers/exhaustive.js';
import { rng } from './helpers/common.js';

const sge = makeJobContext('SGE');
const NO_SYNC = { cap: 999, sync: false };

const ring = (name, spd, copies) => mkItem(name, 'ring', 100, { spd }, { copies });

/* The two policies the brute-force reference copies from the engine (helpers/exhaustive.js). Stated directly on
   hand-made pools, so changing one is a deliberate decision, not a side effect of editing the reference. */
test('policy: a single ring is worn only when no pair exists, even if a pair breaks a maximum', () => {
  const pool = [ring('A', 10, 1), ring('B', 5, 1)];
  // the only pair (A, B) has Spell Speed 15 > 12; ring A alone would meet the maximum but is not a legal loadout
  assert.equal(optimize(sge, pool, NO_SYNC, { target: 'crit', spdMax: 12 }).ok, false);
  assert.equal(exhaustive(sge, pool, NO_SYNC, { target: 'crit', spdMax: 12 }), null);
  // with a single Unique ring there is no pair, so it is worn once and the second ring slot stays empty
  const one = optimize(sge, [ring('A', 10, 1)], NO_SYNC, { target: 'spd' });
  assert.equal(one.totals.spd, 10);
  assert.deepEqual(
    one.picks.filter(p => p.type === 'ring').map(p => p.item?.name ?? null),
    ['A', null],
  );
});

test('policy: a slot is never left empty to satisfy a maximum', () => {
  const pool = [mkItem('H', 'head', 100, { spd: 50, crit: 10 }), mkItem('E', 'ear', 100, { spd: 3, crit: 3 })];
  // leaving the head empty would give Spell Speed 3 <= 40, but that is not a legal loadout
  assert.equal(optimize(sge, pool, NO_SYNC, { target: 'crit', spdMax: 40 }).ok, false);
  assert.equal(exhaustive(sge, pool, NO_SYNC, { target: 'crit', spdMax: 40 }), null);
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
      spdMin: rand() < 0.2 ? 20 + int(40) : null,
      spdMax: rand() < 0.2 ? 60 + int(80) : null,
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
  pool.push(mkItem('H1', 'head', 100, { spd: 20, crit: 30 }), mkItem('H2', 'head', 100, { spd: 15, crit: 25 }));
  const r = optimize(sge, pool, NO_SYNC, { target: 'crit', spdMax: 33 });
  // H1 dominates H2, but H1 with any ring pair has Spell Speed 34 or more; H2 with A + C or B + C stays under
  assert.equal(r.totals.crit, 25);
  assert.ok(r.totals.spd <= 33);
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

/* With melds: random small pools of real pieces (some meldable, some not, some synced), against the reference's own
   enumeration of every stone placement (meldVectors in helpers/exhaustive.js), not bestMeld. Item level windows where
   the stones differ: grade VI/V (290+), X/IX (560+), XII/XI (690+). */
test('with melds, the optimizer matches exhaustive search on random real pools', () => {
  const rand = rng(20261012),
    int = n => Math.floor(rand() * n);
  const windows = [
    { ilvlMin: 290, ilvlMax: 345 },
    { ilvlMin: 560, ilvlMax: 600 },
    { ilvlMin: 690, ilvlMax: 730 },
  ];
  const types = ['head', 'body', 'neck', 'ring'];
  let melded = 0;
  for (let t = 0; t < 40; t++) {
    const job = makeJobContext(['SGE', 'WAR', 'BLM'][int(3)]);
    const all = gamePool(job, windows[int(windows.length)]);
    const pool = [];
    for (const ty of types) {
      const of = all.filter(i => i.type === ty);
      const n = ty === 'ring' ? 1 + int(3) : int(3);
      // distinct pieces: the same object twice would be one Unique ring the reference could pair with itself
      for (let i = 0; i < n && of.length; i++) pool.push(of.splice(int(of.length), 1)[0]);
    }
    if (!pool.length) continue;
    const ilvls = pool.map(i => i.ilvl).sort((a, b) => a - b);
    const sync = rand() < 0.5 ? NO_SYNC : { cap: ilvls[int(ilvls.length)], sync: true, level: 100 };
    const subs = job.substats;
    const opts = { target: subs[int(subs.length)], tiebreak: [rand() < 0.6 ? subs[int(subs.length)] : ''], melds: true };
    const want = exhaustive(job, pool, sync, opts);
    const r = optimize(job, pool, sync, opts);
    const label = `${job.jobId} pool #${t} ${JSON.stringify(opts)} ${JSON.stringify(sync)}`;
    assert.ok(r.ok && !r.truncated, label);
    const keys = [opts.target, ...opts.tiebreak.filter(Boolean)];
    assert.deepEqual(
      keys.map(s => r.totals[s]),
      want,
      label,
    );
    if (r.picks.some(p => p.meld)) melded++;
  }
  assert.ok(melded >= 20, `${melded} runs used melds`); // the test exercises melds, not just plain pools
});
