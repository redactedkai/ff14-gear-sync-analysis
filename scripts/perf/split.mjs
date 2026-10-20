/* Where one optimize() run spends its time: a replica of buildCandidates (src/core/optimizer/candidates.js) with a timer
   per phase, then the real search. A drift guard checks the replica's candidate lists equal the real ones on every run,
   so a change to candidates.js that the replica misses fails loudly instead of timing the wrong code.
   node scripts/perf/split.mjs [--job SGE] [--sync "cap 660"] [--target spd --tb crit,det] [--melds] [--repeats 20] */
import { performance } from 'node:perf_hooks';
import { SLOT_TYPES } from '../../src/core/constants.js';
import { WD_KEY, weaponDamage } from '../../src/core/damage-defense.js';
import { slotInfo } from '../../src/core/items.js';
import { bestMeld } from '../../src/core/meld.js';
import {
  buildCandidates,
  effStats,
  itemSyncIlvl,
  makeScorer,
  pruneDominated,
  rankedKeys,
  vectorDims,
} from '../../src/core/optimizer/candidates.js';
import { branchAndBound } from '../../src/core/optimizer/search.js';
import { NODE_LIMIT } from '../../src/ui/views/optimizer.js';
import { flag, listOption, numberOption, option } from './args.mjs';
import { fullPool, job as ctx, SYNCS } from './workloads.mjs';

const job = ctx(option('job', 'SGE'));
const sync = SYNCS.find(s => s.label === option('sync', 'off'));
const target = option('target', 'spd');
const tiebreak = listOption('tb', []);
const melds = flag('melds');
const repeats = numberOption('repeats', 20);
if (!sync) throw new Error(`unknown sync; one of: ${SYNCS.map(s => s.label).join(', ')}`);

const pool = fullPool(job);
const t = {};
const lap = (name, t0) => {
  const now = performance.now();
  t[name] = (t[name] || 0) + now - t0;
  return now;
};

function replica() {
  let t0 = performance.now();
  const dims = vectorDims(job);
  const keys = melds ? [target, ...tiebreak].slice(0, 3) : null;
  const all = {};
  // effStats and bestMeld timed apart: the replica of itemCandidate
  const eff = new Map(),
    meld = new Map();
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
      .map(it => {
        const e = eff.get(it),
          m = meld.get(it),
          v = {};
        job.stats.forEach(s => {
          v[s] = (e[s] || 0) + (m?.gain[s] || 0);
        });
        if (job.damageKey) v[WD_KEY] = weaponDamage(job, it, itemSyncIlvl(it, sync));
        return { item: it, eff: v, copies: it.copies || 1, blocks: slotInfo(job, it).blocks, meld: m };
      });
  });
  t0 = lap('vectors', t0);
  const blockable = new Set(SLOT_TYPES.flatMap(ty => all[ty].flatMap(a => a.blocks)));
  const order = [...SLOT_TYPES.filter(ty => !blockable.has(ty)), ...SLOT_TYPES.filter(ty => blockable.has(ty))];
  const slotList = [];
  order.forEach(ty => {
    if (!all[ty].length) return;
    slotList.push(ty);
    if (ty === 'ring') slotList.push('ring');
  });
  const score = makeScorer(
    rankedKeys(job, target, tiebreak),
    slotList.map(ty => all[ty].map(a => a.eff)),
  );
  t0 = lap('scorer', t0);
  const cand = {};
  const sorted = {};
  slotList.forEach(ty => {
    if (sorted[ty]) return;
    const arr = all[ty];
    arr.forEach(a => {
      a.score = score(a.eff);
      a.sum = dims.reduce((x, d) => x + a.eff[d], 0);
    });
    arr.sort((a, b) => b.score - a.score || b.sum - a.sum);
    sorted[ty] = arr;
  });
  t0 = lap('score+sort', t0);
  slotList.forEach(ty => {
    if (cand[ty]) return;
    cand[ty] = pruneDominated(sorted[ty], dims, slotList.filter(x => x === ty).length, true);
  });
  t0 = lap('prune', t0);
  const posList = slotList.map(ty => cand[ty]);
  const r = branchAndBound({ slotList, posList, dims, nodeLimit: NODE_LIMIT });
  lap('search', t0);
  return { slotList, posList, nodes: r.nodes };
}

// drift guard: same slots, same candidates (item and vector) in the same order
const real = buildCandidates(job, pool, sync, { target, tiebreak }, { melds });
const mine = replica();
const sig = c => c.posList.map(l => l.map(a => `${a.item.id}:${Object.values(a.eff).join(',')}`).join(';')).join('|');
if (real.slotList.join() !== mine.slotList.join() || sig(real) !== sig(mine)) {
  console.error('DRIFT: the replica no longer matches buildCandidates; update split.mjs');
  process.exit(1);
}

for (const k of Object.keys(t)) delete t[k];
let nodes = 0;
for (let i = 0; i < repeats; i++) nodes = replica().nodes;
const total = Object.values(t).reduce((a, b) => a + b, 0);
console.log(
  `${job.jobId} pool ${pool.length}, ${sync.label}, ${[target, ...tiebreak].join('>')}, melds ${melds}: ${(total / repeats).toFixed(2)} ms per run, ${nodes} nodes`,
);
console.log(`candidates kept: ${mine.posList.map((l, i) => `${mine.slotList[i]} ${l.length}`).join(', ')}`);
for (const [k, v] of Object.entries(t))
  console.log(`  ${k.padEnd(11)} ${(v / repeats).toFixed(2).padStart(7)} ms  ${((100 * v) / total).toFixed(0).padStart(3)}%`);
