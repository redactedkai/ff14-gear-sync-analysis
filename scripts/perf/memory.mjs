/* Memory checks (docs/engineering/optimizer.md, section 8): a second identical sweep adds no meld memo entries and little heap; the memo size after
   the O-full sweep; a dropped pool is freed (the per-item cap cache is a WeakMap).
   node --expose-gc scripts/perf/memory.mjs [--jobs SGE,WAR] */
import { meldCacheStats } from '../../src/core/meld.js';
import { optimize } from '../../src/core/optimizer/index.js';
import { fullPool, JOB_IDS, job as ctx, objectivesFull, SYNCS } from './workloads.mjs';

if (!global.gc) throw new Error('run with node --expose-gc');
const i = process.argv.indexOf('--jobs');
const jobIds = i < 0 ? JOB_IDS : process.argv[i + 1].split(',');
const syncs = SYNCS.filter(s => ['off', 'cap 123', 'cap 660', 'lvl 90 cap 635'].includes(s.label));
const heap = () => {
  global.gc();
  return process.memoryUsage().heapUsed / 2 ** 20;
};

const pools = new Map(jobIds.map(id => [id, fullPool(ctx(id))]));
const sweep = () => {
  for (const id of jobIds) {
    const job = ctx(id);
    for (const sync of syncs) {
      for (const o of objectivesFull(job)) optimize(job, pools.get(id), sync, { ...o, melds: true });
    }
  }
};

const h0 = heap();
let t0 = Date.now();
sweep();
const m1 = meldCacheStats(),
  h1 = heap();
console.log(`sweep 1: ${((Date.now() - t0) / 1000).toFixed(0)} s, memo ${m1.memo} entries, heap ${h0.toFixed(1)} -> ${h1.toFixed(1)} MB`);
t0 = Date.now();
sweep();
const m2 = meldCacheStats(),
  h2 = heap();
console.log(`sweep 2: ${((Date.now() - t0) / 1000).toFixed(0)} s, memo +${m2.memo - m1.memo}, heap +${(h2 - h1).toFixed(2)} MB`);

// a dropped pool is freed: register its items, drop every reference, collect
let freed = 0,
  registered = 0;
const reg = new FinalizationRegistry(() => {
  freed++;
});
{
  const job = ctx(jobIds[0]);
  const p = fullPool(job);
  p.forEach(it => {
    reg.register(it, null);
    registered++;
  });
  optimize(job, p, syncs[0], { target: job.substats[0], melds: true });
}
for (let k = 0; k < 10 && freed < registered; k++) {
  global.gc();
  await new Promise(r => setTimeout(r, 20));
}
console.log(`dropped pool: ${freed} of ${registered} items freed`);

const fails = [];
if (m2.memo !== m1.memo) fails.push('second sweep added memo entries');
if (h2 - h1 > 1) fails.push('second sweep grew the heap by more than 1 MB');
if (m1.memo > 200000) fails.push('memo above 200k entries');
if (freed < registered) fails.push('a dropped pool was not freed');
console.log(fails.length ? `MISSES: ${fails.join('; ')}` : 'memory budgets met');
if (fails.length) process.exit(1);
