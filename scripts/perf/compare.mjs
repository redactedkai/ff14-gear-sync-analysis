/* Results must not change when the optimizer is made faster: runs the same workloads through a baseline copy of src/
   and the working tree, with the same item objects, and requires identical results (optimizer.md, section 8).
   node scripts/perf/compare.mjs --baseline <dir> [--quick] [--nodes-may-differ]
   <dir> holds a fresh copy of src/ from the old commit, as <dir>/src (outside the repo, or under the gitignored
   scripts/perf/out/baseline/<label>); the item data must be the same. No other file is read. */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { optimize } from '../../src/core/optimizer/index.js';
import { NODE_LIMIT } from '../../src/core/recipe.js';
import { buildCandidates, pruneDominated, vectorDims } from '../../src/core/optimizer/candidates.js';
import { flag, option } from './args.mjs';
import { fullPool, JOB_IDS, job as ctx, objectivesLite, SYNCS } from './workloads.mjs';

const base = option('baseline');
if (!base) throw new Error('--baseline <dir> is required');
const sha = p => createHash('sha256').update(readFileSync(p)).digest('hex');
if (sha(`${base}/src/data/items.json`) !== sha('src/data/items.json'))
  throw new Error('the baseline item data differs; compare against a baseline of the same data');

const imp = p => import(pathToFileURL(resolve(base, 'src', p)).href);
const B = {
  optimize: (await imp('core/optimizer/index.js')).optimize,
  ctx: (await imp('core/job-context.js')).makeJobContext,
};
const nodesMayDiffer = flag('nodes-may-differ');
const jobIds = flag('quick') ? ['SGE', 'WAR', 'PLD', 'BLM'] : JOB_IDS;

// the parts of a result that must be equal; items by pool key, so both module copies' objects compare
const key = i => (i ? `${i.name}|${i.type}|${i.ilvl}` : null);
const shape = r => ({
  ok: r.ok,
  truncated: r.truncated,
  totals: r.totals,
  noMeldData: r.noMeldData,
  picks: r.picks?.map(p => [p.type, key(p.item), key(p.blockedBy), p.meld?.stones ?? null, p.meld?.free ?? null]),
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
          if (diffs <= 5) console.log(`DIFF ${id} ${sync.label} ${[o.target, ...o.tiebreak].join('>')} melds ${melds}`);
        }
        if (a.nodes !== b.nodes) nodeDiffs++;
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
if (diffs || (!nodesMayDiffer && nodeDiffs)) process.exit(1);
