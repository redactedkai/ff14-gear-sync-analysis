/* Minimums on any stat (the engine side of tier ranking, roadmap A7) against the exhaustive reference
   (helpers/exhaustive.js), on small real pools: the reference enumerates every legal loadout and, with melds, every
   stone placement itself, so it shares no code with the meld versions, pruning, limit tables or memo. Each minimum is
   set between the stat's total in the free result (the best set with no minimum) and the most the pool can reach, so
   it changes the answer; one past that most checks that nothing is found. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeJobContext } from '../../src/core/job-context.js';
import { optimize, prepare, seedStart, solve } from '../../src/core/optimizer/index.js';
import { dropShortfalls, improveStart } from '../../src/core/optimizer/search.js';
import { frontSearch } from '../../src/core/optimizer/front.js';
import { slotInfo } from '../../src/core/items.js';
import { pruneForLimits } from '../../src/core/optimizer/candidates.js';
import { gcdTierAt } from '../../src/core/speed.js';
import { exhaustive, smallPool } from './helpers/exhaustive.js';
import { rng } from './helpers/common.js';

const NO_SYNC = { cap: null, sync: false, level: 100 };

/* A minimum on `stat` for a run: between its total in the free result and the most any loadout has (that one past it
   one time in six: nothing reaches it). */
function minimumFor(job, pool, sync, melds, stat, free, int) {
  const most = optimize(job, pool, sync, { target: stat, melds }).totals[stat];
  if (int(6) === 0) return most + 1;
  return free.totals[stat] + int(most - free.totals[stat] + 1);
}

test('minimums on one or two stats match exhaustive search, with and without melds', () => {
  const rand = rng(20261017),
    int = n => Math.floor(rand() * n);
  let runs = 0,
    changed = 0,
    infeasible = 0;
  for (let t = 0; t < 40; t++) {
    const job = makeJobContext(['SGE', 'WAR', 'BLM', 'SAM', 'PLD', 'WHM'][int(6)]);
    const pool = smallPool(job, rand, ['head', 'body', 'neck', 'ring'], 2);
    if (!pool.length) continue;
    const ilvls = pool.map(i => i.ilvl).sort((a, b) => a - b);
    const sync = rand() < 0.5 ? NO_SYNC : { cap: ilvls[int(ilvls.length)], sync: true, level: 100 };
    const melds = rand() < 0.7;
    // the target: a substat, or the main stat now and then (it melds nothing)
    const subs = job.substats;
    const target = rand() < 0.2 ? 'main' : subs[int(subs.length)];
    const others = subs.filter(s => s !== target);
    const tiebreak = rand() < 0.5 ? [others[int(others.length)]] : [];
    const free = optimize(job, pool, sync, { target, tiebreak, melds });
    // one or two limited stats, other than the target (speed among them now and then)
    const limited = [...others].sort(() => rand() - 0.5).slice(0, 1 + int(2));
    const mins = {};
    for (const s of limited) mins[s] = minimumFor(job, pool, sync, melds, s, free, int);
    const opts = { target, tiebreak, melds, mins };
    const want = exhaustive(job, pool, sync, opts);
    const r = optimize(job, pool, sync, opts);
    const label = `${job.jobId} pool #${t} ${JSON.stringify(opts)} ${JSON.stringify(sync)}`;
    runs++;
    if (!want) {
      infeasible++;
      assert.equal(r.ok, false, label);
      continue;
    }
    assert.ok(r.ok && !r.truncated, label);
    assert.deepEqual(
      [target, ...tiebreak].map(s => r.totals[s]),
      want,
      label,
    );
    for (const s of limited) assert.ok(r.totals[s] >= mins[s], `${label}: ${s}`);
    if (limited.some(s => mins[s] > free.totals[s])) changed++;
    // the plain search (no tables, groups or memo) on the same candidates agrees
    const prep = prepare(job, pool, sync, { target, tiebreak, melds, minStats: limited });
    const plain = solve(prep, { mins, plain: true });
    assert.deepEqual(
      [target, ...tiebreak].map(s => plain.totals[s]),
      want,
      `${label} plain`,
    );
  }
  assert.ok(runs >= 35, `${runs} runs`);
  assert.ok(changed >= 15, `${changed} runs where a minimum changes the answer`);
  assert.ok(infeasible >= 3 && infeasible < runs / 2, `${infeasible} infeasible`);
});

/* Tier ranking with a Target GCD holds a speed band and minimums on other stats at once; the tables for blocked slots
   are built from the first node (lazyTables 0), and 2H weapons with shields and hooded bodies are in the pools. */
test('a speed band with minimums on other stats, and blocked slots, match exhaustive search', () => {
  const rand = rng(515),
    int = n => Math.floor(rand() * n);
  let runs = 0;
  for (let t = 0; t < 24; t++) {
    const job = makeJobContext(['PLD', 'SGE', 'NIN'][t % 3]);
    const pool = smallPool(job, rand, ['weapon', 'offhand', 'head', 'body', 'ring'], 2, 1);
    if (!pool.length) continue;
    const subs = job.substats.filter(s => s !== 'spd');
    const target = subs[int(subs.length)];
    const other = subs.filter(s => s !== target)[int(subs.length - 1)];
    const free = optimize(job, pool, NO_SYNC, { target, melds: true });
    const tier = gcdTierAt(free.totals.spd, 100);
    const spdMax = tier.next != null && rand() < 0.5 ? tier.next - 1 : null;
    const mins = { [other]: minimumFor(job, pool, NO_SYNC, true, other, free, int) };
    const opts = { target, melds: true, spdMin: tier.start || null, spdMax, mins };
    const want = exhaustive(job, pool, NO_SYNC, opts);
    const prep = prepare(job, pool, NO_SYNC, { target, melds: true, speed: 'exact', minStats: [other] });
    const r = solve(prep, { ...opts, lazyTables: 0 });
    const label = `${job.jobId} #${t} ${JSON.stringify(opts)}`;
    runs++;
    if (!want) assert.equal(r.ok, false, label);
    else assert.deepEqual([r.totals[target]], want, label);
  }
  assert.ok(runs >= 20, `${runs} runs`);
});

test('a minimum needs candidates prepared for it; a speed minimum in mins is spdMin', () => {
  const job = makeJobContext('SGE');
  const pool = smallPool(job, rng(3), ['head', 'body', 'ring'], 2, 1, { ilvlMin: 690, ilvlMax: 730 });
  const prep = prepare(job, pool, NO_SYNC, { target: 'crit', melds: true });
  assert.throws(() => solve(prep, { mins: { det: 100 } }), /without a minimum on det/);
  assert.ok(solve(prep, { mins: { det: 0 } }).ok); // 0 is no minimum
  // 'spd' in minStats prepares a speed rule of 'min'; mins.spd then searches like spdMin
  const withSpd = prepare(job, pool, NO_SYNC, { target: 'crit', melds: true, minStats: ['spd'] });
  assert.equal(withSpd.speed, 'min');
  const spd = optimize(job, pool, NO_SYNC, { target: 'spd', melds: true }).totals.spd;
  const a = solve(withSpd, { mins: { spd } }),
    b = solve(withSpd, { spdMin: spd });
  assert.deepEqual(a.totals, b.totals);
  assert.ok(a.totals.spd >= spd);
});

/* The swap argument (optimizer.md, section 4): a candidate with less score survives when it has more of a limited stat,
   and goes when no stat is limited or a rival has at least as much of every limited one. */
test('pruneForLimits keeps a candidate only if no rival has its score and every limited value', () => {
  const item = (id, copies = 1) => ({ id, copies });
  const cand = (id, score, eff) => ({ item: item(id), eff, copies: 1, blocks: [], score });
  const a = cand(1, 10, { crit: 5, det: 9, spd: 0 }),
    b = cand(2, 9, { crit: 8, det: 9, spd: 0 }),
    c = cand(3, 8, { crit: 5, det: 4, spd: 0 });
  assert.deepEqual(pruneForLimits([a, b, c], 1, []), [a]);
  assert.deepEqual(pruneForLimits([a, b, c], 1, ['crit']), [a, b]);
  assert.deepEqual(pruneForLimits([a, b, c], 1, ['crit', 'det']), [a, b]);
  // with a speed maximum only equal speeds compare: a slower candidate is kept
  const d = cand(4, 7, { crit: 5, det: 9, spd: -1 });
  assert.deepEqual(pruneForLimits([a, b, d], 1, ['spd'], true), [a, d]);
});

/* A seed (an earlier result meeting every limit) changes where the search starts, not what it finds: the same target
   and tiebreak totals as without one, and the seed itself when nothing beats it. */
test('a seed gives the same totals; a seed that is already the best comes back', () => {
  const rand = rng(99),
    int = n => Math.floor(rand() * n);
  let runs = 0;
  for (let t = 0; t < 20; t++) {
    const job = makeJobContext(['SGE', 'WAR', 'NIN'][t % 3]);
    const pool = smallPool(job, rand, ['weapon', 'offhand', 'head', 'body', 'neck', 'ring'], 2, 1);
    if (!pool.length) continue;
    const subs = job.substats.filter(s => s !== 'spd');
    const [target, other] = [...subs].sort(() => rand() - 0.5);
    const free = optimize(job, pool, NO_SYNC, { target, melds: true });
    const mins = { [other]: minimumFor(job, pool, NO_SYNC, true, other, free, int) };
    const prep = prepare(job, pool, NO_SYNC, { target, tiebreak: [other], melds: true, minStats: [other] });
    const plain = solve(prep, { mins });
    if (!plain.ok) continue;
    // a seed: the best set for `other` alone, which meets its minimum (that minimum is at most its most)
    const seed = optimize(job, pool, NO_SYNC, { target: other, melds: true }).picks;
    const seeded = solve(prep, { mins, seed });
    const label = `${job.jobId} #${t} ${target} > ${other} ${JSON.stringify(mins)}`;
    assert.deepEqual([seeded.totals[target], seeded.totals[other]], [plain.totals[target], plain.totals[other]], label);
    // the optimum as its own seed comes back unchanged
    const again = solve(prep, { mins, seed: plain.picks });
    assert.deepEqual(again.totals, plain.totals, `${label} again`);
    runs++;
  }
  assert.ok(runs >= 12, `${runs} runs`);
});

/* The filters before the search (shortfalls, the Lagrangian bound against a seed) and the Pareto fronts, on tight
   cases: bigger pools, a minimum within 5 points of the most the pool reaches and a narrow speed band, against the
   plain search (none of them) on the same candidates. The run also checks that they did something: pieces dropped,
   and some searches settled by fronts. */
test('tight minimums with a seed: the filters and fronts give the plain search totals', () => {
  const rand = rng(5),
    int = n => Math.floor(rand() * n);
  let runs = 0,
    byFronts = 0,
    before = 0,
    after = 0;
  for (let t = 0; t < 120; t++) {
    const job = makeJobContext(['SGE', 'WAR', 'PLD', 'NIN'][t % 4]);
    const pool = smallPool(job, rand, ['weapon', 'offhand', 'head', 'body', 'hands', 'legs', 'feet', 'neck', 'ring'], 4, 2);
    if (!pool.length) continue;
    const subs = job.substats.filter(s => s !== 'spd');
    const [target, other] = [...subs].sort(() => rand() - 0.5);
    const free = optimize(job, pool, NO_SYNC, { target, melds: true });
    const most = optimize(job, pool, NO_SYNC, { target: other, melds: true }).totals[other];
    const mins = { [other]: most - int(6) };
    const spdMin = Math.max(0, free.totals.spd - int(60));
    const limits = { spdMin, spdMax: spdMin + 10 + int(30), mins };
    const prep = prepare(job, pool, NO_SYNC, { target, tiebreak: [other], melds: true, speed: 'exact', minStats: [other] });
    const plain = solve(prep, { ...limits, plain: true });
    if (!plain.ok) continue;
    // the seed: a set meeting every limit, usually worse than the best (the best with `other` at its most), so the
    // filters must keep what beats it; the best set itself when that one does not exist
    const atMost = solve(prep, { ...limits, mins: { [other]: most }, plain: true });
    const seed = atMost.ok ? atMost.picks : plain.picks;
    const full = solve(prep, { ...limits, seed });
    const label = `${job.jobId} #${t} ${target} > ${other} ${JSON.stringify(limits)}`;
    assert.deepEqual([full.totals[target], full.totals[other]], [plain.totals[target], plain.totals[other]], label);
    runs++;
    if (full.method === 'fronts') byFronts++;
    before += prep.posList.reduce((n, l) => n + l.length, 0);
    after += full.kept;
  }
  assert.ok(runs >= 60, `${runs} runs`);
  assert.ok(byFronts >= 20, `${byFronts} runs settled by fronts`);
  assert.ok(after < before * 0.8, `kept ${after} of ${before} candidates`);
});

test('a seed that breaks a limit is ignored', () => {
  const job = makeJobContext('SGE');
  const pool = smallPool(job, rng(4), ['head', 'body', 'neck', 'ring'], 3, 1, { ilvlMin: 690, ilvlMax: 730 });
  const prep = prepare(job, pool, NO_SYNC, { target: 'crit', melds: true, minStats: ['det'] });
  const det = optimize(job, pool, NO_SYNC, { target: 'det', melds: true }).totals.det;
  // the best Critical Hit set has less Determination than the most: as a seed for a minimum at the most, it breaks it
  const bestCrit = optimize(job, pool, NO_SYNC, { target: 'crit', melds: true });
  assert.ok(bestCrit.totals.det < det);
  const r = solve(prep, { mins: { det }, seed: bestCrit.picks });
  assert.ok(r.ok && r.totals.det >= det);
});

/* improveStart (search.js) makes the seed better one swap at a time before the search. Its set must stay a legal
   loadout meeting every limit (each slot a candidate of its list or the seed's own piece, copies kept, a slot empty
   exactly when a chosen piece blocks it) with a score no lower than the seed's; and the search from it must still give
   the plain search's totals. Seeds are the best sets for another stat, usually far from this objective's best (as in
   the White Mage case it was made for: Determination 188 seeded where 710 was the best); pools with two-handed weapons,
   shields and Unique rings. */
test('improveStart: the improved seed is a legal set meeting the limits, and the search still finds the best', () => {
  const rand = rng(77),
    int = n => Math.floor(rand() * n);
  let runs = 0,
    improved = 0;
  for (let t = 0; t < 80; t++) {
    const job = makeJobContext(['WHM', 'PLD', 'SGE', 'NIN', 'DRG'][t % 5]);
    const pool = smallPool(job, rand, ['weapon', 'offhand', 'head', 'body', 'hands', 'legs', 'feet', 'neck', 'ring'], 3, 1);
    if (!pool.length) continue;
    const subs = job.substats.filter(s => s !== 'spd');
    const [target, other, third] = [...subs].sort(() => rand() - 0.5);
    // the seed: the best set for `other`, then `third`; the limits hold around it, so it meets them
    const seed = optimize(job, pool, NO_SYNC, { target: other, tiebreak: [third], melds: true });
    if (!seed.ok) continue;
    const spdMin = Math.max(0, seed.totals.spd - int(60));
    const limits = { spdMin, spdMax: seed.totals.spd + int(60), mins: { [other]: seed.totals[other] - int(40) } };
    const prep = prepare(job, pool, NO_SYNC, { target, tiebreak: [other], melds: true, speed: 'exact', minStats: [other] });
    const label = `${job.jobId} #${t} ${target} > ${other} ${JSON.stringify(limits)}`;

    // the improved seed, on the lists the search sees (after the shortfall filter)
    const lim = [
      { stat: 'spd', min: limits.spdMin || null, max: limits.spdMax },
      { stat: other, min: limits.mins[other], max: null },
    ];
    const lists = dropShortfalls(prep.slotList, prep.posList, prep.dims, lim);
    const start = seedStart(prep, seed.picks);
    const better = improveStart(prep.slotList, lists, lim, start);
    const cands = better.best.map(s => s?.cand ?? null);
    assert.ok(better.score >= start.score, label);
    assert.equal(
      better.score,
      cands.reduce((x, a) => x + (a ? a.score : 0), 0),
      `${label} score`,
    );
    for (const l of lim) {
      const total = cands.reduce((x, a) => x + (a?.eff[l.stat] || 0), 0);
      assert.ok(!(l.min > 0 && total < l.min) && !(l.max != null && total > l.max), `${label} ${l.stat} ${total}`);
    }
    cands.forEach((a, i) => {
      if (a) {
        assert.ok(lists[i].includes(a) || a === start.best[i].cand, `${label} slot ${i} from its list`);
        const worn = cands.filter(b => b && b.item.id === a.item.id).length;
        assert.ok(worn <= (a.item.copies || 1), `${label} copies of ${a.item.name}`);
      }
      const blocked = cands.some(b => b && slotInfo(job, b.item).blocks.includes(prep.slotList[i]));
      if (blocked) assert.equal(a, null, `${label} slot ${i} blocked but filled`);
      else if (!a) assert.equal(start.best[i].cand, null, `${label} slot ${i} emptied`);
    });
    if (better !== start) improved++;

    // the search from the seed against the plain search
    const plain = solve(prep, { ...limits, plain: true });
    const full = solve(prep, { ...limits, seed: seed.picks });
    assert.deepEqual([full.totals[target], full.totals[other]], [plain.totals[target], plain.totals[other]], label);
    runs++;
  }
  assert.ok(runs >= 60, `${runs} runs`);
  assert.ok(improved >= 20, `${improved} seeds improved`);
});

/* Fronts that would grow too large give up (null; the search then runs) instead of throwing or running for minutes:
   2,000 ring candidates make 2 million pairs, which overflowed the stack (Scholar at level 100, a Target GCD, Direct
   Hit first); two slots of about 1,000 candidates trading score for Determination one for one stay under FRONT_TRIES
   but make a million entries in about 2,000 tied pairs, whose dominance filter alone would take seconds
   (FRONT_COMPARES). Synthetic candidates. */
test('frontSearch gives up on too many ring pairs or too much filtering, without throwing', () => {
  const cand = (id, score, det) => ({ item: { id }, eff: { det }, score, blocks: [], copies: 1 });
  const rings = Array.from({ length: 2000 }, (_, i) => cand(`r${i}`, i, 2000 - i));
  assert.equal(frontSearch(['ring', 'ring'], [rings, rings], [{ stat: 'det', min: 10, max: null }]), null);
  // a neck with room for the minimum, filled last, so the head and body totals stay below it and apart
  const lists = [999, 1000].map((n, s) => Array.from({ length: n }, (_, i) => cand(`${s}-${i}`, i, 1000 - i)));
  const t = performance.now();
  const limits = [{ stat: 'det', min: 2000, max: null }];
  assert.equal(frontSearch(['neck', 'head', 'body'], [[cand('n', 0, 2000)], ...lists], limits), null);
  assert.ok(performance.now() - t < 3000, `${Math.round(performance.now() - t)} ms`);
});
