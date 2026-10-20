/* Stress test 5 (docs/engineering/optimizer.md, section 8): how large can a search get, and how long does a search that hits the node limit
   take?
   Part 1, hunt: random hostile pools (near-ties, cloaks, two-handed weapons, shields, Unique ring storms), then a hill
   climb that mutates the worst pool found to push the node count up. Pools are "game clones": real database pieces
   (so their slot code, blocks and materia slots are real) with random stats.
   Part 2, forced stall: a speed minimum (engine only; the page has no control for it) on a synthetic pool built so the
   search runs into the page's 700k node limit; timed cold (first in the process) and warm.
   node scripts/perf/adversarial.mjs [--pools 2000] [--climb 400] [--seed 1] */
import { performance } from 'node:perf_hooks';
import { mkItem } from '../../src/core/items.js';
import { optimize } from '../../src/core/optimizer/index.js';
import { NODE_LIMIT } from '../../src/core/recipe.js';
import { numberOption } from './args.mjs';
import { fullPool, job as ctx, rng } from './workloads.mjs';

const nPools = numberOption('pools', 2000);
const nClimb = numberOption('climb', 400);
const r = rng(numberOption('seed', 1));
const int = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
const pick = xs => xs[Math.floor(r() * xs.length)];

// part 2 first: it is the one the cold time matters for, so it must run before anything else has warmed the code.
// Real full pools never reach the limit, even with a speed range (at most ~11k nodes on Sage's), so this pool is
// synthetic: in every slot each piece trades Critical Hit for speed (a knapsack), none beats another, and the speed
// minimum sits halfway, so the score bound stays loose and the search has to weigh every mix.
function forcedStall(jobId, seed) {
  const job = ctx(jobId);
  const g = rng(seed);
  const pool = [];
  for (const type of job.activeSlotTypes) {
    for (let k = 0; k < 30; k++) {
      const spd = 10 + Math.floor(g() * 90);
      pool.push(mkItem(`${type} ${k}`, type, 100, { main: 100, vit: 100, spd, crit: 110 - spd + Math.floor(g() * 6) }, { copies: 1 }));
    }
  }
  const sync = { cap: null, sync: false, level: 100 };
  const top = optimize(job, pool, sync, { target: 'spd', nodeLimit: NODE_LIMIT }).totals.spd;
  const t0 = performance.now();
  const res = optimize(job, pool, sync, { target: 'crit', tiebreak: ['det'], spdMin: Math.round(top * 0.6), nodeLimit: NODE_LIMIT });
  return { jobId, pool: pool.length, ms: performance.now() - t0, nodes: res.nodes, truncated: res.truncated, ok: res.ok };
}
const stall = [];
for (const id of ['PLD', 'SGE']) stall.push({ first: forcedStall(id, 3), second: forcedStall(id, 3) });

// part 1: hostile pools
const JOBS = ['PLD', 'SGE', 'WAR', 'BLM', 'DNC'].map(id => {
  const job = ctx(id);
  const pool = fullPool(job);
  const byType = {};
  pool.forEach(it => {
    if (!byType[it.type]) byType[it.type] = [];
    byType[it.type].push(it);
  });
  return { job, byType };
});

/* A clone of real piece `it` with stats near a shared level, so pieces are hard to tell apart. */
function clone(job, it, spread, unique) {
  const stats = {};
  job.stats.forEach(s => {
    stats[s] = Math.max(0, 100 + int(-spread, spread));
  });
  if (r() < 0.3) stats[pick(job.substats)] = 0; // some pieces lack a substat
  const copies = it.type === 'ring' && !unique ? 2 : 1;
  return mkItem(it.name, it.type, it.ilvl, stats, { src: 'game', copies });
}

function randomPool(J) {
  const spread = pick([0, 1, 2, 5, 20]);
  const ringsUnique = r() < 0.6;
  const pool = [];
  for (const [type, items] of Object.entries(J.byType)) {
    const n = type === 'ring' ? int(5, 200) : int(1, 40);
    // favour pieces that block slots (cloaks, two-handed weapons), where the search has the most choices to weigh
    const blockers = items.filter(it => it.name && /cloak|coat|robe/i.test(it.name));
    for (let k = 0; k < n; k++) pool.push(clone(J.job, blockers.length && r() < 0.3 ? pick(blockers) : pick(items), spread, ringsUnique));
  }
  return pool;
}

function randomObjective(job) {
  const a = pick(job.stats);
  return { target: a, tiebreak: [pick([null, ...job.stats]), pick([null, ...job.stats])].filter(Boolean) };
}

function run(J, pool, o, melds) {
  const t0 = performance.now();
  const res = optimize(J.job, pool, { cap: null, sync: false, level: 100 }, { ...o, melds, nodeLimit: NODE_LIMIT });
  return { nodes: res.nodes, truncated: res.truncated, ms: performance.now() - t0 };
}

let worst = null;
const all = [];
for (let i = 0; i < nPools; i++) {
  const J = pick(JOBS);
  const pool = randomPool(J);
  const o = randomObjective(J.job);
  const melds = r() < 0.5;
  const res = run(J, pool, o, melds);
  all.push(res.nodes);
  if (!worst || res.nodes > worst.res.nodes) worst = { J, pool, o, melds, res };
}

// hill climb: mutate the worst pool (re-roll some pieces' stats, add or drop pieces) and keep any change that grows it
for (let i = 0; i < nClimb; i++) {
  const { J, o, melds } = worst;
  const pool = worst.pool.slice();
  for (let k = int(1, 5); k > 0; k--) {
    const at = int(0, pool.length - 1);
    const roll = r();
    const src = pool[at];
    if (roll < 0.6) pool[at] = clone(J.job, src, pick([0, 1, 2, 5]), src.copies === 1);
    else if (roll < 0.8) pool.push(clone(J.job, src, pick([0, 1, 2]), src.copies === 1));
    else if (pool.length > 20) pool.splice(at, 1);
  }
  const res = run(J, pool, o, melds);
  if (res.nodes > worst.res.nodes) worst = { J, pool, o, melds, res };
}

all.sort((a, b) => a - b);
const q = p => all[Math.min(all.length - 1, Math.floor((p / 100) * all.length))];
console.log(
  `hunt: ${nPools} random hostile pools (melds on and off), node counts: median ${q(50)}, p99 ${q(99)}, max ${all[all.length - 1]}`,
);
console.log(
  `hill climb (${nClimb} steps): worst ${worst.res.nodes} nodes, ${worst.res.ms.toFixed(1)} ms, truncated ${worst.res.truncated}` +
    ` (${worst.J.job.jobId}, ${worst.pool.length} pieces, ${[worst.o.target, ...worst.o.tiebreak].join('>')}, melds ${worst.melds})`,
);
console.log('\nforced stall (speed minimum, engine only; synthetic Critical Hit vs speed pool, 30 pieces a slot):');
for (const { first, second } of stall) {
  console.log(
    `  ${first.jobId} pool ${first.pool}: ${first.nodes.toLocaleString()} nodes, truncated ${first.truncated}, ` +
      `cold ${first.ms.toFixed(0)} ms, warm ${second.ms.toFixed(0)} ms, result ${first.ok ? 'found' : 'none'}`,
  );
}
