/* Pinned pieces in the optimizer (fixedCandidate, buildCandidates' `fixed`, solve): a search with pins equals a brute-force
   search over the same restricted loadouts (helpers/exhaustive.ts, whose `fixed` option is written independently), on
   hand-made pools, real pools with pieces that cover other slots and with melds, a Target GCD and stat minimums, and
   rank by tier. Also the cases the random pools cannot name: a pinned Unique ring, every slot pinned, and the picks'
   shape. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { present } from '../../../../src/core/guards.ts';
import { makeJobContext } from '../../../../src/core/job-context.ts';
import { mkItem, slotInfo, meldInfo } from '../../../../src/core/items.ts';
import { fixedCandidate, optimize, prepare, solve } from '../../../../src/core/optimizer/index.ts';
import { exhaustive, gamePool, loadoutCount, smallPool } from '../../helpers/exhaustive.ts';
import { pickPins, pinsCoexist, pinsOf } from '../../helpers/pins.ts';
import { checkPinned } from '../../helpers/tier-reference.ts';
import type { PoolItem, SlotType, StatKey, StatMap, Stone, Sync, Totals } from '../../../../src/core/types.ts';
import { mustFind, mustSolve, rng } from '../../helpers/common.ts';

/* The goal and limits of a run, in the form both optimize() and the reference take. */
type Goal = {
  target: StatKey;
  tiebreak: (StatKey | '')[];
  spdMin?: number | null;
  spdMax?: number | null;
  mins?: Totals;
  melds?: boolean;
};

const sge = makeJobContext('SGE');
const pld = makeJobContext('PLD');
const NO_SYNC: Sync = { cap: 999, sync: false };

const ring = (name: string, sps: number, copies = 1, extra: StatMap = {}): PoolItem => mkItem(name, 'ring', 100, { sps, ...extra }, { copies });

test('pinned search equals the brute-force reference on 300 random hand-made pools', () => {
  const rand = rng(20261109),
    int = (n: number): number => Math.floor(rand() * n);
  const types: SlotType[] = ['weapon', 'head', 'body', 'ring', 'neck'];
  let pinnedRings = 0,
    infeasible = 0;
  for (let t = 0; t < 300; t++) {
    const pool: PoolItem[] = [];
    for (const ty of types) {
      const n = ty === 'ring' ? 1 + int(5) : int(4);
      for (let i = 0; i < n; i++) {
        const copies = ty === 'ring' && rand() < 0.4 ? 2 : 1;
        pool.push(mkItem(`${ty}${i}`, ty, 90 + int(60), { sps: int(30), crit: int(30), det: int(30), mind: int(5) }, { copies }));
      }
    }
    if (!pool.length) {
      continue;
    }
    const sync: Sync = rand() < 0.5 ? NO_SYNC : { cap: 110, sync: true };
    const wear = pickPins(sge, pool, sync, rand, 1 + int(4), false);
    pinnedRings += wear.filter(([w]) => w.type === 'ring').length;
    const { fixed, oracle } = pinsOf(sge, sync, wear);
    const opts: Goal = {
      target: (['sps', 'crit', 'det'] as const)[int(3)],
      tiebreak: [rand() < 0.6 ? 'mind' : '', rand() < 0.5 ? 'crit' : ''],
      spdMin: rand() < 0.25 ? 20 + int(60) : null,
      spdMax: rand() < 0.25 ? 60 + int(120) : null,
      mins: rand() < 0.25 ? { det: 10 + int(60) } : {},
    };
    const want = exhaustive(sge, pool, sync, { ...opts, fixed: oracle });
    const got = optimize(sge, pool, sync, { ...opts, fixed });
    const label = `pool #${t} pins ${wear.map(([w]) => w.name)} ${JSON.stringify(opts)}`;
    if (!want) {
      infeasible++;
      assert.equal(got.ok, false, label);
      continue;
    }
    assert.ok(got.ok && !got.truncated, label);
    const keys = [opts.target, ...present(opts.tiebreak)];
    assert.deepEqual(
      keys.map(s => got.totals[s]),
      want,
      label,
    );
    // the pinned pieces are in the picks, marked, and the totals are the picks' sum
    assert.deepEqual(
      got.picks
        .flatMap(p => (p.pinned && p.item ? [p.item] : []))
        .sort((a, b) => a.id.localeCompare(b.id)),
      wear.map(([w]) => w).sort((a, b) => a.id.localeCompare(b.id)),
      label,
    );
    for (const stat of sge.stats) {
      assert.equal(
        got.totals[stat],
        got.picks.reduce((n, p) => n + (p.item ? p.eff[stat] : 0), 0),
        `${label} ${stat}`,
      );
    }
  }
  assert.ok(
    pinnedRings > 100 && infeasible < 150,
    `${pinnedRings} pinned rings, ${infeasible} infeasible: the cases should exercise rings and mostly be feasible`,
  );
});

test('pinned search equals the reference on real Paladin pools with pieces that cover slots, melds and limits', () => {
  const rand = rng(77),
    int = (n: number): number => Math.floor(rand() * n);
  const all = gamePool(pld, { ilvlMin: 60, ilvlMax: 75, lvlMax: 100 });
  const covering = all.filter(i => slotInfo(pld, i).blocks.length);
  assert.ok(covering.some(i => i.type === 'body') && covering.some(i => i.type === 'legs'), 'the window has covering pieces');
  let coveringPinned = 0,
    runs = 0;
  for (let t = 0; t < 60; t++) {
    // a few pieces per slot type, with a covering body and legs in every pool
    const pool: PoolItem[] = [];
    const poolTypes: SlotType[] = ['weapon', 'offhand', 'head', 'body', 'legs', 'feet', 'ring'];
    for (const type of poolTypes) {
      const of = all.filter(i => i.type === type);
      const count = Math.min(of.length, type === 'ring' ? 2 + int(3) : 1 + int(3));
      for (let k = 0; k < count; k++) {
        pool.push(of.splice(int(of.length), 1)[0]);
      }
    }
    for (const type of ['body', 'legs'] as const) {
      const cover = covering.filter(i => i.type === type);
      if (!pool.some(i => cover.includes(i))) {
        pool.push(cover[int(cover.length)]);
      }
    }
    if (loadoutCount(pld, pool) > 60000) {
      continue;
    }
    const melds = rand() < 0.6;
    const sync: Sync = rand() < 0.3 ? { cap: 70, sync: true, level: 100 } : NO_SYNC;
    const wear = pickPins(pld, pool, sync, rand, 1 + int(3), true);
    if (!pinsCoexist(pld, wear)) {
      continue;
    }
    coveringPinned += wear.filter(([w]) => slotInfo(pld, w).blocks.length).length;
    const { fixed, oracle } = pinsOf(pld, sync, wear);
    const goal: Goal = { target: (['str', 'crit', 'det'] as const)[int(3)], tiebreak: [rand() < 0.5 ? 'dh' : ''] };
    const limits: Partial<Goal> = rand() < 0.4 ? { spdMin: 10 + int(150), spdMax: rand() < 0.5 ? 200 + int(200) : null } : {};
    const want = exhaustive(pld, pool, sync, { ...goal, ...limits, melds, fixed: oracle });
    const got = optimize(pld, pool, sync, { ...goal, ...limits, melds, fixed });
    const label = `pool #${t} pins ${wear.map(([w, s]) => `${w.name} ${s.length}`)} ${JSON.stringify({ goal, limits, melds, sync })}`;
    runs++;
    if (!want) {
      assert.equal(got.ok, false, label);
      continue;
    }
    assert.ok(got.ok && !got.truncated, label);
    assert.deepEqual(
      [goal.target, goal.tiebreak[0]].filter(Boolean).map(s => got.totals[s]),
      want.slice(0, goal.tiebreak[0] ? 2 : 1),
      label,
    );
  }
  assert.ok(runs >= 30 && coveringPinned >= 5, `${runs} cases, ${coveringPinned} covering pieces pinned`);
});

test('pinned search equals the reference on real Sage pools under sync, with melds and a speed band', () => {
  const rand = rng(4242),
    int = (n: number): number => Math.floor(rand() * n);
  let runs = 0;
  for (let t = 0; t < 40; t++) {
    const pool = smallPool(sge, rand, ['weapon', 'head', 'body', 'ring'], 2, 1);
    if (!pool.length || loadoutCount(sge, pool) > 40000) {
      continue;
    }
    const sync: Sync = t % 3 === 0 ? { cap: 123, sync: true, level: 100 } : { cap: 999, sync: false };
    const melds = t % 2 === 0;
    const wear = pickPins(sge, pool, sync, rand, 1 + int(3), true);
    if (!pinsCoexist(sge, wear)) {
      continue;
    }
    const { fixed, oracle } = pinsOf(sge, sync, wear);
    const free = exhaustive(sge, pool, sync, { target: 'sps', melds, fixed: oracle });
    if (!free) {
      continue;
    }
    const spdMin = free[0] - int(40);
    const opts: Goal = { target: 'crit', tiebreak: ['det'], spdMin, spdMax: t % 4 === 0 ? spdMin + int(30) : null, melds };
    const want = exhaustive(sge, pool, sync, { ...opts, fixed: oracle });
    const got = optimize(sge, pool, sync, { ...opts, fixed });
    const label = `pool #${t} pins ${wear.map(([w, s]) => `${w.name} ${s.length}`)} ${JSON.stringify(opts)}`;
    runs++;
    if (!want) {
      assert.equal(got.ok, false, label);
      continue;
    }
    assert.ok(got.ok && !got.truncated, label);
    assert.deepEqual([got.totals.crit, got.totals.det], want, label);
    assert.ok(got.totals.sps >= spdMin && (opts.spdMax == null || got.totals.sps <= opts.spdMax), label);
  }
  assert.ok(runs >= 25, `${runs} cases`);
});

test('rank by tier with pinned pieces equals the reference, with and without a Target GCD', () => {
  const { runs } = checkPinned(515, 24);
  assert.ok(runs >= 14, `${runs} cases`);
});

test('a pinned Unique ring is not worn twice; a pinned ring with 2 copies may be', () => {
  const a = ring('A', 10),
    b = ring('B', 9),
    c = ring('C', 5, 2);
  // pinned Unique A: the free ring is the best of the others, never A again
  let r = mustSolve(optimize(sge, [a, b, c], NO_SYNC, { target: 'sps', fixed: [fixedCandidate(sge, a, [], NO_SYNC)] }));
  assert.equal(r.totals.sps, 19);
  assert.deepEqual(
    r.picks.map(p => [p.item?.name, Boolean(p.pinned)]),
    [
      ['A', true],
      ['B', false],
    ],
  );
  // pinned C with 2 copies: the free ring may be C again if nothing is better; here B is better
  r = mustSolve(optimize(sge, [b, c], NO_SYNC, { target: 'sps', fixed: [fixedCandidate(sge, c, [], NO_SYNC)] }));
  assert.deepEqual(
    r.picks.map(p => p.item?.name),
    ['C', 'B'],
  );
  r = mustSolve(optimize(sge, [c], NO_SYNC, { target: 'sps', fixed: [fixedCandidate(sge, c, [], NO_SYNC)] }));
  assert.deepEqual(
    r.picks.map(p => [p.item?.name, Boolean(p.pinned)]),
    [
      ['C', true],
      ['C', false],
    ],
  );
  // both rings pinned: no ring is searched
  r = mustSolve(
    optimize(sge, [a, b, c], NO_SYNC, {
      target: 'sps',
      fixed: [fixedCandidate(sge, c, [], NO_SYNC), fixedCandidate(sge, c, [], NO_SYNC)],
    }),
  );
  assert.equal(r.totals.sps, 10);
  assert.deepEqual(
    r.picks.map(p => Boolean(p.pinned)),
    [true, true],
  );
  // a pinned Unique ring and a pool with only it: the free ring slot is empty
  r = mustSolve(optimize(sge, [a], NO_SYNC, { target: 'sps', fixed: [fixedCandidate(sge, a, [], NO_SYNC)] }));
  assert.deepEqual(
    r.picks.map(p => p.item?.name ?? null),
    ['A', null],
  );
});

test('every slot pinned: the pins alone are the loadout, and a limit they miss has no loadout', () => {
  const head = mkItem('H', 'head', 100, { sps: 12, crit: 7 });
  const prep = prepare(sge, [head], NO_SYNC, { target: 'crit', speed: 'exact', fixed: [fixedCandidate(sge, head, [], NO_SYNC)] });
  assert.deepEqual(prep.slotList, []);
  const r = mustSolve(solve(prep, {}));
  assert.deepEqual(
    r.picks.map(p => [p.type, p.item?.name, p.pinned]),
    [['head', 'H', true]],
  );
  assert.equal(r.totals.crit, 7);
  assert.ok(solve(prep, { spdMin: 12 }).ok);
  assert.equal(solve(prep, { spdMin: 13 }).ok, false);
  assert.equal(solve(prep, { spdMax: 11 }).ok, false);
});

test('a piece that covers a slot: a pinned cloak empties the head, a pinned head keeps cloaks out of the body', () => {
  const all = gamePool(pld, { ilvlMin: 60, ilvlMax: 75, lvlMax: 100 });
  const cloak = mustFind(
    all.find(i => i.type === 'body' && slotInfo(pld, i).blocks.includes('head')),
    'a body piece that covers the head',
  );
  const plain = mustFind(
    all.find(i => i.type === 'body' && !slotInfo(pld, i).blocks.length),
    'a body piece that covers nothing',
  );
  const head = mustFind(
    all.find(i => i.type === 'head'),
    'a head piece',
  );
  const pool = [head, cloak, plain];
  // pinned cloak: the head slot has a pick with no piece, blocked by the cloak
  let r = mustSolve(optimize(pld, pool, NO_SYNC, { target: 'str', fixed: [fixedCandidate(pld, cloak, [], NO_SYNC)] }));
  const headPick = mustFind(
    r.picks.find(p => p.type === 'head'),
    'the head pick',
  );
  assert.ok(headPick.item === null);
  assert.equal(headPick.blockedBy, cloak);
  // pinned head: the cloak cannot be the free body, so the plain body is
  r = mustSolve(optimize(pld, pool, NO_SYNC, { target: 'str', fixed: [fixedCandidate(pld, head, [], NO_SYNC)] }));
  assert.equal(r.picks.find(p => p.type === 'body')?.item, plain);
});

test('a pinned piece counts its stones, however the melds are set, and the weapon damage of a pinned weapon', () => {
  const all = gamePool(sge, { ilvlMin: 700, ilvlMax: 730, lvlMax: 100 });
  const body = mustFind(
    all.find(i => i.type === 'body' && (meldInfo(i)?.slots ?? 0) >= 2),
    'a body piece with two meld slots',
  );
  const weapon = mustFind(
    all.find(i => i.type === 'weapon'),
    'a weapon',
  );
  const stones: Stone[] = [
    { stat: 'det', grade: 12 },
    { stat: 'det', grade: 12 },
  ];
  const pool = all.filter(i => ['head', 'body', 'weapon'].includes(i.type));
  const withStones = fixedCandidate(sge, body, stones, NO_SYNC);
  const plain = fixedCandidate(sge, body, [], NO_SYNC);
  assert.ok(withStones.eff.det > plain.eff.det, 'the stones add Determination');
  // with melds off or on, the pinned body keeps exactly its stones
  for (const melds of [false, true]) {
    const r = mustSolve(optimize(sge, pool, NO_SYNC, { target: 'crit', melds, fixed: [withStones, fixedCandidate(sge, weapon, [], NO_SYNC)] }));
    const pickedBody = mustFind(
      r.picks.find(p => p.type === 'body'),
      'the body pick',
    );
    assert.equal(pickedBody.eff?.det, withStones.eff.det);
    assert.equal(r.picks.find(p => p.type === 'weapon')?.eff?.wd, fixedCandidate(sge, weapon, [], NO_SYNC).eff.wd);
  }
});

test('with no pinned pieces nothing changes: the same picks, totals and node counts as a search without `fixed`', () => {
  const rand = rng(99);
  for (let t = 0; t < 20; t++) {
    const pool = smallPool(sge, rand, ['weapon', 'head', 'body', 'ring', 'neck'], 3, 1);
    const opts: Goal = { target: 'crit', tiebreak: ['det'], spdMin: t % 2 ? 50 : null, melds: t % 3 === 0 };
    const plain = optimize(sge, pool, { cap: 123, sync: true, level: 100 }, opts);
    const none = optimize(sge, pool, { cap: 123, sync: true, level: 100 }, { ...opts, fixed: [] });
    assert.deepEqual(none, plain, `case ${t}`);
  }
});
