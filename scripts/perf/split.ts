/* Where one optimize() run spends its time: a replica of buildCandidates (src/core/optimizer/candidates.ts) with a timer
   per phase, then the real search. A drift guard checks the replica's candidate lists equal the real ones on every run,
   so a change to candidates.ts that the replica misses fails loudly instead of timing the wrong code.
   node scripts/perf/split.ts [--job SGE] [--sync "cap 660"] [--target <the job's speed key> --tb crit,det] [--melds] [--repeats 20] */
import { performance } from 'node:perf_hooks';
import { SLOT_TYPES } from '../../src/core/constants.ts';
import { WD_KEY, weaponDamage } from '../../src/core/damage-defense.ts';
import { slotInfo } from '../../src/core/items.ts';
import { bestMeld } from '../../src/core/meld.ts';
import { buildCandidates, makeScorer, pruneDominated, rankedKeys, vectorDims } from '../../src/core/optimizer/candidates.ts';
import { effStats, itemSyncIlvl } from '../../src/core/piece.ts';
import { branchAndBound } from '../../src/core/optimizer/search.ts';
import { checkedKeys } from '../../src/core/guards.ts';
import { NODE_LIMIT } from '../../src/core/recipe.ts';
import type { Candidate, Eff, Meld, PoolItem, SlotType, StatKey } from '../../src/core/types.ts';
import { flag, listOption, numberOption, option } from './args.ts';
import { fullPool, job as ctx, SYNCS } from './workloads.ts';
import type { LabeledSync } from './workloads.ts';

const job = ctx(option('job', 'SGE') ?? 'SGE');
const syncFound = SYNCS.find(s => s.label === option('sync', 'off'));
if (!syncFound) {
  throw new Error(`unknown sync; one of: ${SYNCS.map(s => s.label).join(', ')}`);
}
const sync: LabeledSync = syncFound;
const targetText = option('target', job.speedKey) ?? job.speedKey;
const targetFound = job.stats.find(key => key === targetText);
if (!targetFound) {
  throw new Error(`unknown target ${targetText}; one of: ${job.stats.join(', ')}`);
}
const target: StatKey = targetFound;
const tiebreak = checkedKeys(listOption('tb', []), job.stats, 'the --tb stats');
const melds = flag('melds');
const repeats = numberOption('repeats', 20);

const pool = fullPool(job);
const t: Record<string, number> = {};
const lap = (name: string, t0: number): number => {
  const now = performance.now();
  t[name] = (t[name] || 0) + now - t0;
  return now;
};

function replica(): { slotList: SlotType[]; posList: Candidate[][]; nodes: number } {
  let t0 = performance.now();
  const dims = vectorDims(job);
  const keys = melds ? [target, ...tiebreak].slice(0, 3) : null;
  const all: Partial<Record<SlotType, Candidate[]>> = {};
  // effStats and bestMeld timed apart: the replica of itemCandidate
  const eff = new Map<PoolItem, Eff>(),
    meld = new Map<PoolItem, Meld | null>();
  pool.forEach(it => {
    eff.set(it, effStats(job, it, sync));
  });
  t0 = lap('effStats', t0);
  pool.forEach(it => {
    meld.set(it, keys && itemSyncIlvl(it, sync) == null ? bestMeld(job, it, keys) : null);
  });
  t0 = lap('bestMeld', t0);
  SLOT_TYPES.forEach(ty => {
    all[ty] = pool
      .filter(i => i.type === ty)
      .map((it): Candidate => {
        const e = eff.get(it) ?? {},
          m = meld.get(it) ?? null,
          v: Eff = {};
        job.stats.forEach(s => {
          v[s] = (e[s] || 0) + (m?.gain[s] || 0);
        });
        if (job.damageKey) {
          v[WD_KEY] = weaponDamage(job, it, itemSyncIlvl(it, sync));
        }
        return { item: it, eff: v, copies: it.copies || 1, blocks: slotInfo(job, it).blocks, meld: m, score: 0, sum: 0 };
      });
  });
  t0 = lap('vectors', t0);
  const candidatesOf = (ty: SlotType): Candidate[] => all[ty] ?? [];
  const blockable = new Set(SLOT_TYPES.flatMap(ty => candidatesOf(ty).flatMap(a => a.blocks)));
  const order = [...SLOT_TYPES.filter(ty => !blockable.has(ty)), ...SLOT_TYPES.filter(ty => blockable.has(ty))];
  const slotList: SlotType[] = [];
  order.forEach(ty => {
    if (!candidatesOf(ty).length) {
      return;
    }
    slotList.push(ty);
    if (ty === 'ring') {
      slotList.push('ring');
    }
  });
  const score = makeScorer(
    rankedKeys(job, target, tiebreak),
    slotList.map(ty => candidatesOf(ty).map(a => a.eff)),
  );
  t0 = lap('scorer', t0);
  const cand: Partial<Record<SlotType, Candidate[]>> = {};
  const sorted: Partial<Record<SlotType, Candidate[]>> = {};
  slotList.forEach(ty => {
    if (sorted[ty]) {
      return;
    }
    const arr = candidatesOf(ty);
    arr.forEach(a => {
      a.score = score(a.eff);
      a.sum = dims.reduce((x, d) => x + (a.eff[d] ?? 0), 0);
    });
    arr.sort((a, b) => b.score - a.score || b.sum - a.sum);
    sorted[ty] = arr;
  });
  t0 = lap('score+sort', t0);
  slotList.forEach(ty => {
    if (cand[ty]) {
      return;
    }
    cand[ty] = pruneDominated(sorted[ty] ?? [], dims, slotList.filter(x => x === ty).length, true);
  });
  t0 = lap('prune', t0);
  const posList = slotList.map(ty => cand[ty] ?? []);
  const r = branchAndBound({ slotList, posList, dims, nodeLimit: NODE_LIMIT });
  lap('search', t0);
  return { slotList, posList, nodes: r.nodes };
}

// drift guard: same slots, same candidates (item and vector) in the same order
const real = buildCandidates(job, pool, sync, { target, tiebreak }, { melds });
const mine = replica();
const sig = (c: { posList: Candidate[][] }): string =>
  c.posList.map(l => l.map(a => `${a.item.id}:${Object.values(a.eff).join(',')}`).join(';')).join('|');
if (real.slotList.join() !== mine.slotList.join() || sig(real) !== sig(mine)) {
  console.error('DRIFT: the replica no longer matches buildCandidates; update split.ts');
  process.exit(1);
}

for (const k of Object.keys(t)) {
  delete t[k];
}
let nodes = 0;
for (let i = 0; i < repeats; i++) {
  nodes = replica().nodes;
}
const total = Object.values(t).reduce((a, b) => a + b, 0);
console.log(
  `${job.jobId} pool ${pool.length}, ${sync.label}, ${[target, ...tiebreak].join('>')}, melds ${melds}: ${(total / repeats).toFixed(2)} ms per run, ${nodes} nodes`,
);
console.log(`candidates kept: ${mine.posList.map((l, i) => `${mine.slotList[i]} ${l.length}`).join(', ')}`);
for (const [k, v] of Object.entries(t)) {
  console.log(`  ${k.padEnd(11)} ${(v / repeats).toFixed(2).padStart(7)} ms  ${((100 * v) / total).toFixed(0).padStart(3)}%`);
}
