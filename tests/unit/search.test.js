/* The search's building blocks (src/core/optimizer/search.js) on their own, on small synthetic lists checked by brute
   force: the limit tables, their smallest over several limits, the Lagrangian bound and reduced-cost fixing, the slot
   order, and the memo's dominance front. The whole search is checked against the exhaustive reference elsewhere
   (optimizer-exhaustive, stat-minimums, target-gcd-exhaustive). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  combinedLimitBound,
  fixByReducedCost,
  lagrangeBound,
  limitTables,
  makeMemo,
  shortListsFirst,
} from '../../src/core/optimizer/search.js';
import { rng } from './helpers/common.js';

let nextId = 0;
/* A synthetic candidate: its score, stats and the slot types it blocks. */
function cand(score, eff, blocks = []) {
  return { item: { id: `c${nextId++}` }, eff, score, blocks, copies: 1 };
}

/* Three slots of random candidates with speed and Determination, none blocking: every loadout fills each slot once. */
function randomLists(rand, size = 4) {
  const int = n => Math.floor(rand() * n);
  return Array.from({ length: 3 }, () =>
    Array.from({ length: size }, () => cand(int(100), { spd: int(30), det: int(30) })).sort((x, y) => y.score - x.score),
  );
}

/* Every way to pick one candidate per list from position `pos` on: [{score, spd, det, picks}]. */
function completions(posList, pos = 0) {
  if (pos === posList.length) return [{ score: 0, spd: 0, det: 0, picks: [] }];
  return posList[pos].flatMap(c =>
    completions(posList, pos + 1).map(rest => ({
      score: rest.score + c.score,
      spd: rest.spd + c.eff.spd,
      det: rest.det + c.eff.det,
      picks: [c, ...rest.picks],
    })),
  );
}

const SLOTS = ['head', 'body', 'neck'];

test('limitTables: a minimum, and a band, give the brute-force best of the slots left at every total so far', () => {
  const rand = rng(8);
  for (let t = 0; t < 20; t++) {
    const posList = randomLists(rand);
    const min = 20 + Math.floor(rand() * 40);
    const max = min + Math.floor(rand() * 20);
    for (const [label, table, fits] of [
      ['minimum', limitTables(SLOTS, posList, c => c.eff.spd, min, null), total => total >= min],
      ['band', limitTables(SLOTS, posList, c => c.eff.spd, min, max), total => total >= min && total <= max],
    ]) {
      for (let pos = 0; pos <= SLOTS.length; pos++) {
        const rest = completions(posList, pos);
        // every total the slots before pos can have
        const before = new Set(completions(posList.slice(0, pos)).map(c => c.spd));
        for (const soFar of before) {
          const scores = rest.filter(c => fits(soFar + c.spd)).map(c => c.score);
          assert.equal(table(pos, soFar), scores.length ? Math.max(...scores) : -Infinity, `${label} #${t} pos ${pos} at ${soFar}`);
        }
        assert.equal(table.top(pos), Math.max(...rest.filter(c => !(label === 'band' && c.spd > max)).map(c => c.score)), `${label} top`);
      }
    }
  }
  // neither a minimum above 0 nor a maximum: no table
  assert.equal(
    limitTables(SLOTS, randomLists(rand), c => c.eff.spd, 0, null),
    null,
  );
});

test('combinedLimitBound: the smallest of each limit table, with two and three bands', () => {
  const rand = rng(9);
  const stats = ['spd', 'det', 'crit'];
  for (let t = 0; t < 10; t++) {
    const int = n => Math.floor(rand() * n);
    const posList = randomLists(rand).map(list => list.map(c => ({ ...c, eff: { ...c.eff, crit: int(30) } })));
    for (const count of [2, 3]) {
      const limits = stats.slice(0, count).map(stat => {
        const min = 10 + int(40);
        return { stat, min, max: min + int(20) };
      });
      const totals = new Float64Array(count).map(() => int(15));
      const bound = combinedLimitBound(SLOTS, posList, limits, totals, null);
      const tables = limits.map(l => limitTables(SLOTS, posList, c => c.eff[l.stat], l.min, l.max));
      const add = limits.map(() => int(5));
      for (let pos = 0; pos <= SLOTS.length; pos++) {
        assert.equal(bound.top(pos), Math.min(...tables.map(table => table.top(pos))), `${count} bands top ${pos}`);
        const least = withAdd => Math.min(...tables.map((table, k) => table(pos, totals[k] + (withAdd ? add[k] : 0))));
        assert.equal(bound.at(pos, null), least(false), `${count} bands at ${pos}`);
        assert.equal(bound.at(pos, add), least(true), `${count} bands at ${pos} with add`);
      }
    }
  }
});

test('lagrangeBound and fixByReducedCost: the bound is at least the best set meeting the limits, whose pieces stay', () => {
  const rand = rng(10);
  let fixed = 0;
  for (let t = 0; t < 30; t++) {
    const posList = randomLists(rand, 6);
    const sets = completions(posList);
    const limits = [
      { stat: 'spd', min: 20 + Math.floor(rand() * 20), max: 60 + Math.floor(rand() * 20) },
      { stat: 'det', min: 20 + Math.floor(rand() * 30), max: null },
    ];
    const meets = s => s.spd >= limits[0].min && s.spd <= limits[0].max && s.det >= limits[1].min;
    const feasible = sets.filter(meets).sort((x, y) => y.score - x.score);
    if (feasible.length < 2) continue;
    const best = feasible[0];
    const known = feasible.find(s => s.score < best.score)?.score ?? best.score; // the next best set in hand
    const lagr = lagrangeBound(posList, limits, known);
    const root = lagr.slotAug.reduce((sum, most) => sum + most, 0) - lagr.terms.reduce((sum, term) => sum + term.coef * term.rhs, 0);
    const separable = posList.reduce((sum, list) => sum + Math.max(0, ...list.map(c => c.score)), 0);
    assert.ok(root >= best.score - 1e-6, `#${t}: bound ${root} below the best ${best.score}`);
    assert.ok(root <= separable + 1e-6, `#${t}: bound ${root} above the separable ${separable}`);
    posList.forEach((list, pos) => {
      const kept = fixByReducedCost(list, lagr, pos, known);
      if (best.score > known) assert.ok(kept.includes(best.picks[pos]), `#${t}: the best set's piece in slot ${pos} fixed`);
      fixed += list.length - kept.length;
      // nothing beats a known score at the bound itself
      assert.equal(fixByReducedCost(list, lagr, pos, root + 10).length, 0);
    });
  }
  assert.ok(fixed > 0, 'fixing never dropped a candidate');
});

test('shortListsFirst: free slots by list size (rings count twice), blockable slots last; null when unchanged', () => {
  const many = n => Array.from({ length: n }, () => cand(1, {}));
  const cloak = cand(1, {}, ['head']);
  const slotList = ['body', 'ring', 'ring', 'neck', 'head'];
  const rings = many(2);
  const posList = [[cloak, ...many(4)], rings, rings, many(3), many(1)];
  // neck 3, ring 2 x 2 = 4, body 5; head (blockable) last
  assert.deepEqual(shortListsFirst(slotList, posList), [3, 1, 2, 0, 4]);
  assert.equal(shortListsFirst(['neck', 'body', 'head'], [many(1), [cloak, ...many(2)], many(5)]), null);
});

test('makeMemo: equal states and dominated states are cut; a full key drops its oldest state', () => {
  const slotList = ['head', 'body', 'neck'];
  const limits = [
    { stat: 'det', min: 10, max: null },
    { stat: 'crit', min: 10, max: null },
  ];
  const at = (det, crit) => ({ chosen: [null, null, null], blockedMask: 0, limitTotals: Float64Array.of(det, crit) });
  const run = memoFront => {
    const memo = makeMemo(slotList, limits, memoFront);
    const cuts = [
      memo.cut(at(5, 1), 1, 10),
      memo.cut(at(1, 5), 1, 9),
      memo.cut(at(3, 3), 1, 8),
      // beaten only by the first state, which a key of two has dropped
      memo.cut(at(4, 0), 1, 7),
    ];
    return { memo, cuts };
  };
  assert.deepEqual(run(32).cuts, [false, false, false, true]);
  assert.deepEqual(run(2).cuts, [false, false, false, false]);

  // an equal state with no more score is cut, with more it is not; totals past a minimum count as the minimum
  const { memo } = run(32);
  assert.equal(memo.cut(at(5, 1), 1, 10), true);
  assert.equal(memo.cut(at(5, 1), 1, 11), false);
  assert.equal(memo.cut(at(12, 1), 2, 3), false);
  assert.equal(memo.cut(at(15, 1), 2, 3), true);
  // other blocked slots are another key
  assert.equal(memo.cut({ ...at(5, 1), blockedMask: 4 }, 1, 1), false);
  memo.clear();
  assert.equal(memo.cut(at(5, 1), 1, 10), false);
});
