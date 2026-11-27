/* Stress test 5 (docs/engineering/optimizer.md, section 8): how large can a search get, and how long does a search that hits the node limit
   take?
   Part 1, hunt: random hostile pools (near-ties, cloaks, two-handed weapons, shields, Unique ring storms), then a hill
   climb that mutates the worst pool found to push the node count up. Pools are "game clones": real database pieces
   (so their slot code, blocks and materia slots are real) with random stats.
   Part 2, forced stall: a speed minimum (engine only; the page has no control for it) on a synthetic pool built so the
   search runs into the page's 700k node limit; timed cold (first in the process) and warm.
   Exits 1 when a part 1 run is truncated; part 2 is meant to truncate.
   node scripts/perf/adversarial.ts [--pools 2000] [--climb 400] [--seed 1] */
import { performance } from 'node:perf_hooks';
import { mkItem } from '../../src/core/items.ts';
import { optimize } from '../../src/core/optimizer/index.ts';
import { NODE_LIMIT } from '../../src/core/recipe.ts';
import type { JobContext, PoolItem, StatKey, StatMap } from '../../src/core/types.ts';
import { numberOption } from './args.ts';
import { fullPool, job as ctx, rng } from './workloads.ts';
import type { Objective } from './workloads.ts';

const nPools = numberOption('pools', 2000);
const nClimb = numberOption('climb', 400);
const r = rng(numberOption('seed', 1));
const int = (lo: number, hi: number): number => lo + Math.floor(r() * (hi - lo + 1));
const pick = <Item>(xs: readonly Item[]): Item => xs[Math.floor(r() * xs.length)] as Item;

/* A forced stall's run: the pool size, the time, and what the search did. */
type StallRun = { jobId: string; pool: number; ms: number; nodes: number; truncated: boolean; ok: boolean };

/* A pool of one of the hunt's jobs, by slot type: the real pieces the hostile pools are cloned from. */
type Hostile = { job: JobContext; byType: Record<string, PoolItem[]> };

/* The worst pool found so far: its job, the pool, the objective, whether melds are on, and the run's result. */
type Worst = { J: Hostile; pool: PoolItem[]; o: Objective; melds: boolean; res: { nodes: number; truncated: boolean; ms: number } };

// part 2 first: it is the one the cold time matters for, so it must run before anything else has warmed the code.
// Real full pools never reach the limit, even with a speed range (at most ~11k nodes on Sage's), so this pool is
// synthetic: in every slot each piece trades Critical Hit for speed (a knapsack), none beats another, and the speed
// minimum sits halfway, so the score bound stays loose and the search has to weigh every mix.
function forcedStall(jobId: string, seed: number): StallRun {
  const job = ctx(jobId);
  const g = rng(seed);
  const pool: PoolItem[] = [];
  for (const type of job.activeSlotTypes) {
    for (let k = 0; k < 30; k++) {
      const spd = 10 + Math.floor(g() * 90);
      pool.push(
        mkItem(
          `${type} ${k}`,
          type,
          100,
          { [job.mainKey]: 100, vit: 100, [job.speedKey]: spd, crit: 110 - spd + Math.floor(g() * 6) },
          { copies: 1 },
        ),
      );
    }
  }
  const sync = { cap: null, sync: false, level: 100 };
  const baseline = optimize(job, pool, sync, { target: job.speedKey, nodeLimit: NODE_LIMIT });
  if (!baseline.ok) {
    throw new Error('the forced stall pool has no loadout');
  }
  const top = baseline.totals[job.speedKey] ?? 0;
  const t0 = performance.now();
  const res = optimize(job, pool, sync, { target: 'crit', tiebreak: ['det'], spdMin: Math.round(top * 0.6), nodeLimit: NODE_LIMIT });
  return { jobId, pool: pool.length, ms: performance.now() - t0, nodes: res.nodes, truncated: res.truncated, ok: res.ok };
}
const stall: { first: StallRun; second: StallRun }[] = [];
for (const id of ['PLD', 'SGE']) {
  stall.push({ first: forcedStall(id, 3), second: forcedStall(id, 3) });
}

// part 1: hostile pools
const JOBS: Hostile[] = ['PLD', 'SGE', 'WAR', 'BLM', 'DNC'].map(id => {
  const job = ctx(id);
  const pool = fullPool(job);
  const byType: Record<string, PoolItem[]> = {};
  pool.forEach(it => {
    const list = byType[it.type] ?? [];
    byType[it.type] = list;
    list.push(it);
  });
  return { job, byType };
});

/* A clone of real piece `it` with stats near a shared level, so pieces are hard to tell apart. */
function clone(job: JobContext, it: PoolItem, spread: number, unique: boolean): PoolItem {
  const stats: StatMap = {};
  job.stats.forEach(s => {
    stats[s] = Math.max(0, 100 + int(-spread, spread));
  });
  if (r() < 0.3) {
    stats[pick(job.substats)] = 0; // some pieces lack a substat
  }
  const copies = it.type === 'ring' && !unique ? 2 : 1;
  return mkItem(it.name, it.type, it.ilvl, stats, { src: 'game', copies });
}

function randomPool(J: Hostile): PoolItem[] {
  const spread = pick([0, 1, 2, 5, 20]);
  const ringsUnique = r() < 0.6;
  const pool: PoolItem[] = [];
  for (const [type, items] of Object.entries(J.byType)) {
    const n = type === 'ring' ? int(5, 200) : int(1, 40);
    // favour pieces that block slots (cloaks, two-handed weapons), where the search has the most choices to weigh
    const blockers = items.filter(it => it.name && /cloak|coat|robe/i.test(it.name));
    for (let k = 0; k < n; k++) {
      pool.push(clone(J.job, blockers.length && r() < 0.3 ? pick(blockers) : pick(items), spread, ringsUnique));
    }
  }
  return pool;
}

function randomObjective(job: JobContext): Objective {
  const a = pick(job.stats);
  const tiebreak = [pick([null, ...job.stats]), pick([null, ...job.stats])].filter((key): key is StatKey => key !== null);
  return { target: a, tiebreak };
}

function run(J: Hostile, pool: PoolItem[], o: Objective, melds: boolean): Worst['res'] {
  const t0 = performance.now();
  const res = optimize(J.job, pool, { cap: null, sync: false, level: 100 }, { ...o, melds, nodeLimit: NODE_LIMIT });
  return { nodes: res.nodes, truncated: res.truncated, ms: performance.now() - t0 };
}

let worst: Worst | null = null;
const all: number[] = [];
let huntTruncated = 0; // hunt and climb runs that stopped at the node limit: none expected (optimizer.md, section 8)
for (let i = 0; i < nPools; i++) {
  const J = pick(JOBS);
  const pool = randomPool(J);
  const o = randomObjective(J.job);
  const melds = r() < 0.5;
  const res = run(J, pool, o, melds);
  all.push(res.nodes);
  if (res.truncated) {
    huntTruncated++;
  }
  if (!worst || res.nodes > worst.res.nodes) {
    worst = { J, pool, o, melds, res };
  }
}

if (!worst) {
  throw new Error('--pools must be at least 1');
}

// hill climb: mutate the worst pool (re-roll some pieces' stats, add or drop pieces) and keep any change that grows it
let best: Worst = worst;
for (let i = 0; i < nClimb; i++) {
  const { J, o, melds } = best;
  const pool = best.pool.slice();
  for (let k = int(1, 5); k > 0; k--) {
    const at = int(0, pool.length - 1);
    const roll = r();
    const src = pool[at];
    if (roll < 0.6) {
      pool[at] = clone(J.job, src, pick([0, 1, 2, 5]), src.copies === 1);
    } else if (roll < 0.8) {
      pool.push(clone(J.job, src, pick([0, 1, 2]), src.copies === 1));
    } else if (pool.length > 20) {
      pool.splice(at, 1);
    }
  }
  const res = run(J, pool, o, melds);
  if (res.truncated) {
    huntTruncated++;
  }
  if (res.nodes > best.res.nodes) {
    best = { J, pool, o, melds, res };
  }
}

all.sort((a, b) => a - b);
const q = (p: number): number => all[Math.min(all.length - 1, Math.floor((p / 100) * all.length))];
console.log(
  `hunt: ${nPools} random hostile pools (melds on and off), node counts: median ${q(50)}, p99 ${q(99)}, max ${all[all.length - 1]}`,
);
console.log(
  `hill climb (${nClimb} steps): worst ${best.res.nodes} nodes, ${best.res.ms.toFixed(1)} ms, truncated ${best.res.truncated}` +
    ` (${best.J.job.jobId}, ${best.pool.length} pieces, ${[best.o.target, ...best.o.tiebreak].join('>')}, melds ${best.melds})`,
);
console.log('\nforced stall (speed minimum, engine only; synthetic Critical Hit vs speed pool, 30 pieces a slot):');
for (const { first, second } of stall) {
  console.log(
    `  ${first.jobId} pool ${first.pool}: ${first.nodes.toLocaleString()} nodes, truncated ${first.truncated}, ` +
      `cold ${first.ms.toFixed(0)} ms, warm ${second.ms.toFixed(0)} ms, result ${first.ok ? 'found' : 'none'}`,
  );
}

// The forced stall is built to truncate; if it no longer does, it no longer times a search that hits the limit,
// which is worth a note but is not a wrong result. A truncated hunt or climb run is: exit 1.
if (stall.some(({ first }) => !first.truncated)) {
  console.log('\nnote: a forced stall finished under the node limit, so it no longer measures a truncated search');
}
if (huntTruncated) {
  console.error(`\nFAILED: ${huntTruncated} hostile pool run(s) truncated at the node limit (none expected)`);
  process.exit(1);
}
console.log('\nno hostile pool run truncated');
