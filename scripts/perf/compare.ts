/* Results must not change when the optimizer is made faster: runs the same workloads through a baseline copy of src/
   and the working tree, with the same item objects, and requires identical results (optimizer.md, section 8).
   node scripts/perf/compare.ts --baseline <dir> [--quick] [--nodes-may-differ]
   <dir> holds a fresh copy of src/ from the old commit, as <dir>/src (outside the repo, or under the gitignored
   scripts/perf/out/baseline/<label>); the item data must be the same. No other file is read. */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { optimize } from '../../src/core/optimizer/index.ts';
import type { PoolItem, SolveResult } from '../../src/core/types.ts';
import { NODE_LIMIT } from '../../src/core/recipe.ts';
import { buildCandidates, pruneDominated, vectorDims } from '../../src/core/optimizer/candidates.ts';
import { flag, option } from './args.ts';
import { fullPool, JOB_IDS, job as ctx, objectivesLite, SYNCS } from './workloads.ts';

const base = option('baseline');
if (!base) {
  throw new Error('--baseline <dir> is required');
}
const sha = (p: string): string => createHash('sha256').update(readFileSync(p)).digest('hex');
if (sha(`${base}/src/data/items.json`) !== sha('src/data/items.json')) {
  throw new Error('the baseline item data differs; compare against a baseline of the same data');
}

const imp = (p: string): string => pathToFileURL(resolve(base, 'src', p)).href;
const baselineOptimizer: typeof import('../../src/core/optimizer/index.ts') = await import(imp('core/optimizer/index.ts'));
const baselineContext: typeof import('../../src/core/job-context.ts') = await import(imp('core/job-context.ts'));
const B = {
  optimize: baselineOptimizer.optimize,
  ctx: baselineContext.makeJobContext,
};
const nodesMayDiffer = flag('nodes-may-differ');
const jobIds = flag('quick') ? ['SGE', 'WAR', 'PLD', 'BLM'] : JOB_IDS;

// the parts of a result that must be equal; items by pool key, so both module copies' objects compare
const key = (i: PoolItem | undefined | null): string | null => (i ? `${i.name}|${i.type}|${i.ilvl}` : null);
const shape = (r: SolveResult) => ({
  ok: r.ok,
  truncated: r.truncated,
  totals: r.ok ? r.totals : undefined,
  noMeldData: r.noMeldData,
  picks: r.ok
    ? r.picks.map(p => [p.type, key(p.item), key(p.item ? undefined : p.blockedBy), p.meld?.stones ?? null, p.meld?.free ?? null])
    : undefined,
});

let runs = 0,
  diffs = 0,
  nodeDiffs = 0,
  pruneChecks = 0;
for (const id of jobIds) {
  const job = ctx(id),
    bjob = B.ctx(id);
  const pool = fullPool(job);
  for (const melds of [false, true]) {
    for (const sync of SYNCS) {
      for (const o of objectivesLite(job)) {
        const opts = { target: o.target, tiebreak: o.tiebreak, nodeLimit: NODE_LIMIT, melds };
        const a = optimize(job, pool, sync, opts);
        const b = B.optimize(bjob, pool, sync, opts);
        runs++;
        if (JSON.stringify(shape(a)) !== JSON.stringify(shape(b))) {
          diffs++;
          if (diffs <= 5) {
            console.log(`DIFF ${id} ${sync.label} ${[o.target, ...o.tiebreak].join('>')} melds ${melds}`);
          }
        }
        if (a.nodes !== b.nodes) {
          nodeDiffs++;
        }
      }
      // sorted (kept-only) pruning equals the plain pairwise pruning, on every slot list of one objective per sync
      const o = { target: job.substats[0], tiebreak: [job.substats[1]] };
      const c = buildCandidates(job, pool, sync, o, { prune: false, melds });
      const dims = vectorDims(job);
      new Set(c.slotList).forEach(t => {
        const list = c.posList[c.slotList.indexOf(t)];
        const n = c.slotList.filter(x => x === t).length;
        const fast = pruneDominated(list, dims, n, true);
        const slow = pruneDominated(list, dims, n, false);
        pruneChecks++;
        if (fast.length !== slow.length || fast.some((x, i) => x !== slow[i])) {
          diffs++;
          console.log(`PRUNE DIFF ${id} ${sync.label} ${t} melds ${melds}: ${fast.length} vs ${slow.length}`);
        }
      });
    }
  }
  console.log(`${id}: ${runs} runs so far, ${diffs} differences`);
}
console.log(`\n${runs} runs, ${pruneChecks} pruning checks: ${diffs} differences; nodes differ in ${nodeDiffs} runs`);
if (diffs || (!nodesMayDiffer && nodeDiffs)) {
  process.exit(1);
}
