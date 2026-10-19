/* Times optimize() over the workloads in workloads.mjs and checks the budgets (docs/engineering/optimizer.md, section 8).
   node scripts/perf/bench.mjs [--workload W1|X|OFULL] [--jobs SGE,WAR] [--quick] [--repeats N] [--strict]
   Writes one JSON row per run to scripts/perf/out/<workload>.jsonl and prints a summary.
   first: the first call of a run in this process (new pool objects per job, so caches keyed by item start cold);
   warm: the median of N more calls. */
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { withActivities } from '../../src/core/items.js';
import { meldCacheStats } from '../../src/core/meld.js';
import { optimize } from '../../src/core/optimizer/index.js';
import { excludeMasks, fullPool, JOB_IDS, job as ctx, objectivesFull, objectivesLite, SYNCS } from './workloads.mjs';

const NODE_LIMIT = 700000; // the page's
const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i < 0 ? dflt : process.argv[i + 1];
};
const flag = name => process.argv.includes(`--${name}`);
const workload = arg('workload', 'W1');
const repeats = Number(arg('repeats', 2));
const QUICK = ['SGE', 'WAR', 'PLD', 'BLM', 'DNC', 'SAM'];
const jobIds = arg('jobs') ? arg('jobs').split(',') : flag('quick') ? QUICK : JOB_IDS;

function median(xs) {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}
function pct(xs, p) {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)];
}

function timeRun(job, pool, sync, o, melds) {
  const opts = { target: o.target, tiebreak: o.tiebreak, nodeLimit: NODE_LIMIT, melds };
  let t0 = performance.now();
  const res = optimize(job, pool, sync, opts);
  const first = performance.now() - t0;
  const warm = [];
  for (let i = 0; i < repeats; i++) {
    t0 = performance.now();
    optimize(job, pool, sync, opts);
    warm.push(performance.now() - t0);
  }
  return { res, first, warm: repeats ? median(warm) : first };
}

const OUT = `scripts/perf/out/${workload}.jsonl`;
mkdirSync('scripts/perf/out', { recursive: true });
writeFileSync(OUT, '');
const rows = [];
const started = performance.now();
for (const id of jobIds) {
  const job = ctx(id);
  const full = fullPool(job);
  const t0 = performance.now();
  if (workload === 'X') {
    const syncs = SYNCS.filter(s => ['off', 'cap 123', 'cap 660'].includes(s.label));
    for (const ex of excludeMasks()) {
      const pool = withActivities(full, ex.off, ex.market);
      for (const sync of syncs) {
        for (const o of [{ target: job.substats[0], tiebreak: [job.substats[1]] }]) {
          const { res, first, warm } = timeRun(job, pool, sync, o, true);
          rows.push({
            job: id,
            pool: pool.length,
            exclude: ex.off.join('+') + (ex.market ? '' : ' (no market board)'),
            sync: sync.label,
            ...o,
            melds: true,
            first,
            warm,
            nodes: res.nodes,
            truncated: res.truncated,
            ok: res.ok,
          });
        }
      }
    }
  } else {
    const objs = workload === 'OFULL' ? objectivesFull(job) : objectivesLite(job);
    const syncs = workload === 'OFULL' ? SYNCS.filter(s => ['off', 'cap 123'].includes(s.label)) : SYNCS;
    for (const melds of [false, true]) {
      for (const sync of syncs) {
        for (const o of objs) {
          const { res, first, warm } = timeRun(job, full, sync, o, melds);
          rows.push({
            job: id,
            pool: full.length,
            sync: sync.label,
            ...o,
            melds,
            first,
            warm,
            nodes: res.nodes,
            truncated: res.truncated,
            ok: res.ok,
          });
        }
      }
    }
  }
  // each job's rows as soon as it finishes, so a long run can be read while it goes
  appendFileSync(
    OUT,
    rows
      .filter(r => r.job === id)
      .map(
        r => `${JSON.stringify(r)}
`,
      )
      .join(''),
  );
  console.log(`${id}: pool ${full.length}, ${((performance.now() - t0) / 1000).toFixed(1)} s, memo ${meldCacheStats().memo}`);
}

mkdirSync('scripts/perf/out', { recursive: true });
writeFileSync(`scripts/perf/out/${workload}.jsonl`, rows.map(r => JSON.stringify(r)).join('\n') + '\n');

const fmt = x => x.toFixed(1);
const summary = (label, rs) => {
  if (!rs.length) return null;
  const w = rs.map(r => r.warm),
    f = rs.map(r => r.first);
  const out = {
    label,
    runs: rs.length,
    p50: median(w),
    p95: pct(w, 95),
    max: Math.max(...w),
    firstMax: Math.max(...f),
    nodesMax: Math.max(...rs.map(r => r.nodes)),
    truncated: rs.filter(r => r.truncated).length,
  };
  console.log(
    `${label.padEnd(10)} runs ${String(out.runs).padStart(6)}  warm p50 ${fmt(out.p50)}  p95 ${fmt(out.p95)}  max ${fmt(out.max)} ms  first max ${fmt(out.firstMax)} ms  nodes max ${out.nodesMax}  truncated ${out.truncated}`,
  );
  return out;
};
console.log(
  `\n${workload}: ${rows.length} runs in ${((performance.now() - started) / 1000).toFixed(1)} s; memo ${meldCacheStats().memo} entries`,
);
const on = summary(
  'melds on',
  rows.filter(r => r.melds),
);
const off = summary(
  'melds off',
  rows.filter(r => !r.melds),
);

// worst runs, for follow-up with split.mjs
const worst = [...rows].sort((a, b) => b.warm - a.warm).slice(0, 5);
console.log('\nslowest (warm):');
worst.forEach(r => {
  console.log(
    `  ${fmt(r.warm)} ms (first ${fmt(r.first)})  ${r.job} ${r.sync} ${[r.target, ...r.tiebreak].join('>')} melds ${r.melds}${r.exclude ? ` exclude ${r.exclude}` : ''}  nodes ${r.nodes}`,
  );
});

// budgets (optimizer.md, section 8, "What the perf scripts measure"); "first" stands in for the cold budget
const fails = [];
const check = (ok, msg) => {
  if (!ok) fails.push(msg);
};
if (on) {
  check(on.p50 <= 35, `melds on p50 ${fmt(on.p50)} > 35 ms`);
  check(on.p95 <= 60, `melds on p95 ${fmt(on.p95)} > 60 ms`);
  check(on.max <= 80, `melds on max ${fmt(on.max)} > 80 ms`);
  check(on.firstMax <= 60, `melds on first-call max ${fmt(on.firstMax)} > 60 ms`);
}
if (off) check(off.p95 <= 30, `melds off p95 ${fmt(off.p95)} > 30 ms`);
check(Math.max(...rows.map(r => r.nodes)) <= 1000, 'a run took more than 1,000 nodes');
check(!rows.some(r => r.truncated), 'a run was truncated');
console.log(fails.length ? `\nBUDGET MISSES:\n  ${fails.join('\n  ')}` : '\nall budgets met');
if (flag('strict') && fails.length) process.exit(1);
