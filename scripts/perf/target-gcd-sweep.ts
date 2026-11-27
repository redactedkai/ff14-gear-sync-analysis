/* Target GCD sweep (not part of `check`): the real engine (src/core/target-gcd.ts) on every job x sync setting
   (workloads.ts SYNCS) x goals (every substat but speed, plus the main stat as a stress case) with no, one or two
   tiebreaks x GCD targets spread from the job's no-speed GCD (with its haste) down to the fastest the gear reaches, so
   GCDs slower than the free result (the drift case) are in, x both modes x food off and "Best for the goal". The pool
   is every wearable piece minus the page's default exclusions (Savage, Ultimate, PvP); melds on; no node limit.
   Checks:
   - every 4th run (food off): the same candidates solved by the plain search (no speed tables, groups or memo), which
     must give the same score or also find nothing;
   - per task, small random pools against the exhaustive reference (tests/unit/helpers/exhaustive.ts), which shares
     no code with meld versions, pruning or the search.
   node scripts/perf/target-gcd-sweep.ts [--workers 5] [--jobs SGE,WAR] [--resume]
   --resume keeps the rows already in the output and runs only the job x sync tasks missing from it (a task's rows are
   written together, so a task is either there whole or not at all).
   Writes scripts/perf/out/target-gcd-sweep.jsonl (one row per run) and prints progress and a summary. */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Worker, isMainThread, parentPort } from 'node:worker_threads';
import type { Prepared } from '../../src/core/optimizer/index.ts';
import type { GcdFailure, GcdSuccess } from '../../src/core/target-gcd.ts';
import type { PoolItem, SolveResult, StatKey } from '../../src/core/types.ts';
import type { GcdMode } from '../../src/core/speed.ts';
import type { LabeledSync } from './workloads.ts';

const ROOT = new URL('../../', import.meta.url).href;

/* One job x sync setting, the unit of work a worker takes: the job id, the index into SYNCS, and the setting. */
type Task = { id: string; si: number; s: LabeledSync };

/* One run of the sweep, one line of the output file. */
type RunRow = {
  id: string;
  level: number;
  cap: number | null;
  sync: boolean;
  haste: number;
  target: string;
  tiebreak: string;
  stress: boolean;
  mode: GcdMode;
  gcd: number;
  food: boolean;
  ok: boolean;
  reason: string | null;
  got: number | null;
  faster: boolean | null;
  meal: string | null;
  searches: number;
  nodes: number;
  truncated: boolean;
  ms: number;
  first: boolean;
  plainNodes?: number;
  checked?: 'plain';
  mismatch?: boolean;
  small?: undefined;
};

/* A small-pool check against the exhaustive search, one line of the output file. */
type SmallRow = {
  id: string;
  level: number;
  cap: number | null;
  sync: boolean;
  haste: number;
  small: true;
  target: string;
  mode: GcdMode;
  gcd: number;
  ok: boolean;
  reason: string | null;
  checked: 'exhaustive';
  mismatch?: boolean;
};

/* A line of the output file. */
type Row = RunRow | SmallRow;

/* The time of a run (0 for a small-pool check, which is not timed). */
const msOf = (row: Row): number => (row.small ? 0 : row.ms);

/* What a worker sends: that it is ready, or the rows of a task it finished. */
type WorkerMessage = { ready: true } | { task: Task; rows: Row[] };

if (isMainThread) {
  const { JOB_IDS, SYNCS } = await import('./workloads.ts');
  const { flag, listOption, numberOption } = await import('./args.ts');
  const nWorkers = numberOption('workers', 5);
  const jobs = listOption('jobs', JOB_IDS);
  mkdirSync(new URL('./out/', import.meta.url), { recursive: true });
  const outFile = new URL('./out/target-gcd-sweep.jsonl', import.meta.url);
  const all: Row[] = [];
  if (flag('resume') && existsSync(outFile)) {
    for (const l of readFileSync(outFile, 'utf8').split('\n')) {
      if (l) {
        all.push(JSON.parse(l));
      }
    }
  } else {
    writeFileSync(outFile, '');
  }
  const taskKey = (id: string, s: { level?: number | null; cap: number | null; sync: boolean }): string =>
    `${id}|${s.level}|${s.cap}|${s.sync}`;
  const have = new Set(all.map(r => taskKey(r.id, r)));
  // cap 795 is the highest real item level, so it syncs nothing: every run repeats sync off
  const tasks: Task[] = jobs
    .flatMap(id => SYNCS.map((s, si) => ({ id, si, s })))
    .filter(t => t.s.label !== 'cap 795' && !have.has(taskKey(t.id, t.s)));
  const t0 = Date.now();
  let next = 0,
    done = 0,
    worst = all.reduce((m, r) => Math.max(m, msOf(r)), 0);
  console.log(`${tasks.length} tasks (job x sync), ${nWorkers} workers`);
  await new Promise<void>(resolve => {
    let alive = nWorkers;
    for (let w = 0; w < nWorkers; w++) {
      const worker = new Worker(fileURLToPath(import.meta.url));
      const feed = (): void => worker.postMessage(next < tasks.length ? tasks[next++] : null);
      worker.on('message', (m: WorkerMessage) => {
        if ('rows' in m) {
          appendFileSync(outFile, `${m.rows.map(r => JSON.stringify(r)).join('\n')}\n`);
          for (const r of m.rows) {
            all.push(r);
            worst = Math.max(worst, msOf(r));
          }
          done++;
          const el = (Date.now() - t0) / 1000;
          const bad = all.filter(r => r.mismatch).length;
          console.log(
            `[${done}/${tasks.length}] ${m.task.id} sync#${m.task.si}: ${m.rows.length} rows; worst ${worst.toFixed(0)} ms, mismatches ${bad}; ${el.toFixed(0)} s, eta ${((el / done) * (tasks.length - done)).toFixed(0)} s`,
          );
        }
        feed();
      });
      worker.on('error', e => console.log('worker error', e));
      worker.on('exit', () => --alive === 0 && resolve());
    }
  });
  summary(all, (Date.now() - t0) / 1000);
} else {
  const { performance } = await import('node:perf_hooks');
  const { fullPool, job: ctx, rng, SYNCS } = await import('./workloads.ts');
  const { withActivities }: typeof import('../../src/core/items.ts') = await import(`${ROOT}src/core/items.ts`);
  const { DEFAULT_EXCLUDE }: typeof import('../../src/ui/job-sync-panel.ts') = await import(`${ROOT}src/ui/job-sync-panel.ts`);
  const { optimize, solve }: typeof import('../../src/core/optimizer/index.ts') = await import(`${ROOT}src/core/optimizer/index.ts`);
  const { gcdFor, hasteFor, speedForGcd }: typeof import('../../src/core/speed.ts') = await import(`${ROOT}src/core/speed.ts`);
  const { optimizeGcd }: typeof import('../../src/core/target-gcd.ts') = await import(`${ROOT}src/core/target-gcd.ts`);
  const { exhaustive }: typeof import('../../tests/unit/helpers/exhaustive.ts') = await import(`${ROOT}tests/unit/helpers/exhaustive.ts`);
  const score = (r: SolveResult | GcdSuccess | GcdFailure, keys: readonly StatKey[]): number[] | null =>
    r.ok ? keys.map(key => r.totals[key] || 0) : null;
  let k = 0;
  if (!parentPort) {
    throw new Error('this branch runs in a worker');
  }
  const port = parentPort;
  port.on('message', (task: Task | null) => {
    if (!task) {
      return process.exit(0);
    }
    const job = ctx(task.id);
    const s = SYNCS[task.si];
    if (!s) {
      throw new Error(`no sync setting ${task.si}`);
    }
    const sync = { cap: s.cap, sync: s.sync, level: s.level };
    if (s.level == null) {
      throw new Error(`sync setting ${s.label} has no level`);
    }
    const level = s.level;
    const haste = hasteFor(job.jobId, level)?.pct ?? 0;
    const pool = withActivities(fullPool(job), DEFAULT_EXCLUDE, true);
    const rows: Row[] = [];
    const base = { id: task.id, level, cap: s.cap, sync: s.sync, haste };
    const fastest = optimize(job, pool, sync, { target: job.speedKey, melds: true });
    const fastSpd = (fastest.ok ? fastest.totals[job.speedKey] : 0) ?? 0;
    const top = gcdFor(0, level, 2500, haste),
      bottom = gcdFor(fastSpd, level, 2500, haste);
    // six GCDs spread from the no-speed GCD to the fastest reachable, both ends included
    const steps = Math.round((top - bottom) * 100);
    const gcds = [...new Set([0, 1, 2, 3, 4, 5].map(i => Math.round((top - Math.round((i * steps) / 5) / 100) * 100) / 100))];
    const subs = job.substats.filter(x => x !== job.speedKey);
    for (const target of [...subs, job.mainKey]) {
      const tbs = subs.filter(x => x !== target);
      const objectives: StatKey[][] = [
        [],
        ...tbs.map(t => [t]),
        ...tbs.map((t, i): StatKey[] => [t, tbs[(i + 1) % tbs.length] ?? t]).filter(x => x[0] !== x[1]),
      ];
      for (const tiebreak of objectives) {
        const keys = [target, ...tiebreak];
        for (const mode of ['exact', 'min'] as const) {
          let prep: Prepared | null = null;
          for (const gcd of gcds) {
            for (const food of [null, 'best'] as const) {
              const t = performance.now();
              const r = optimizeGcd(job, pool, sync, { target, tiebreak, melds: true, gcd, mode, food, nodeLimit: Infinity }, prep);
              const ms = performance.now() - t;
              prep = r.prep || prep;
              const row: RunRow = {
                ...base,
                target,
                tiebreak: tiebreak.join('+'),
                stress: target === job.mainKey,
                mode,
                gcd,
                food: Boolean(food),
                ok: r.ok,
                reason: r.ok ? null : r.reason,
                got: r.ok ? r.gcd : null,
                faster: r.ok ? r.faster : null,
                meal: r.ok ? (r.food?.name ?? null) : null,
                searches: r.searches ?? 0,
                nodes: r.nodes ?? 0,
                truncated: Boolean(r.truncated),
                ms: Number(ms.toFixed(1)),
                first:
                  rows.filter(x => !x.small && x.target === target && x.tiebreak === tiebreak.join('+') && x.mode === mode).length === 0,
              };
              // the plain search on the same candidates and band
              if (!food && ++k % 4 === 0 && (r.ok || r.reason !== 'unreachable')) {
                const band = speedForGcd(gcd, level, mode, haste);
                if (!band) {
                  throw new Error('a reachable GCD has no speed band');
                }
                const searchPrep = r.prep ?? prep;
                if (!searchPrep) {
                  throw new Error('a search ran without candidates');
                }
                const p = solve(searchPrep, { spdMin: band.min, spdMax: band.max, plain: true, nodeLimit: 1000000 });
                row.plainNodes = p.nodes;
                if (!p.truncated) {
                  row.checked = 'plain';
                  row.mismatch = JSON.stringify(score(p, keys)) !== JSON.stringify(score(r, keys));
                }
              }
              rows.push(row);
            }
          }
        }
      }
    }
    // small pools against the exhaustive reference: a few pieces per slot, a random goal, GCD and mode, no food
    const rand = rng(1000 + task.si * 31 + task.id.charCodeAt(0) * 7 + task.id.charCodeAt(1));
    const int = (n: number): number => Math.floor(rand() * n);
    for (let t = 0; t < 4; t++) {
      const small: PoolItem[] = [];
      for (const ty of ['head', 'body', 'neck', 'ring'] as const) {
        const of = pool.filter(i => i.type === ty);
        for (let i = 0; i < (ty === 'ring' ? 2 : 1) && of.length; i++) {
          const [piece] = of.splice(int(of.length), 1);
          if (piece) {
            small.push(piece);
          }
        }
      }
      const target = subs[int(subs.length)];
      if (!target) {
        throw new Error('a job with no substat but speed');
      }
      const smallFastest = optimize(job, small, sync, { target, melds: true });
      const free = gcdFor(smallFastest.ok ? (smallFastest.totals[job.speedKey] ?? 0) : 0, level, 2500, haste);
      const gcd = Math.round((free + (int(5) - 2) / 100) * 100) / 100;
      const mode = rand() < 0.5 ? ('exact' as const) : ('min' as const);
      const band = speedForGcd(gcd, level, mode, haste);
      const r = optimizeGcd(job, small, sync, { target, melds: true, gcd, mode });
      const row: SmallRow = { ...base, small: true, target, mode, gcd, ok: r.ok, reason: r.ok ? null : r.reason, checked: 'exhaustive' };
      if (band) {
        const want = exhaustive(job, small, sync, { target, melds: true, spdMin: band.min || null, spdMax: band.max });
        row.mismatch = JSON.stringify(want) !== JSON.stringify(score(r, [target]));
      } else {
        row.mismatch = r.ok || r.reason !== 'unreachable';
      }
      rows.push(row);
    }
    port.postMessage({ task, rows });
  });
  port.postMessage({ ready: true });
}

function summary(rows: Row[], seconds: number): void {
  const runs = rows.filter((r): r is RunRow => !r.small);
  const q = (xs: number[], p: number): number => {
    const a = xs.slice().sort((x, y) => x - y);
    return a.length ? a[Math.min(a.length - 1, Math.floor(p * a.length))] : 0;
  };
  console.log(`\ndone: ${runs.length} runs + ${rows.length - runs.length} small-pool checks in ${seconds.toFixed(0)} s`);
  const groups: [string, (r: RunRow) => boolean][] = [
    ['exact, no food', (r: RunRow) => r.mode === 'exact' && !r.food],
    ['exact, best food', (r: RunRow) => r.mode === 'exact' && r.food],
    ['or faster, no food', (r: RunRow) => r.mode === 'min' && !r.food],
    ['or faster, best food', (r: RunRow) => r.mode === 'min' && r.food],
  ];
  for (const [label, sel] of groups) {
    const g = runs.filter(sel);
    const first = g.filter(r => r.first).map(r => r.ms);
    const again = g.filter(r => !r.first).map(r => r.ms);
    console.log(
      `${label.padEnd(22)} runs ${g.length}  first-run p50 ${q(first, 0.5).toFixed(0)} p95 ${q(first, 0.95).toFixed(0)} max ${q(first, 1).toFixed(0)} ms` +
        `  new-GCD p50 ${q(again, 0.5).toFixed(0)} p95 ${q(again, 0.95).toFixed(0)} max ${q(again, 1).toFixed(0)} ms  nodes max ${g.reduce((m, r) => Math.max(m, r.nodes), 0)}` +
        `  ok ${g.filter(r => r.ok).length} none ${g.filter(r => r.reason === 'none').length} unreachable ${g.filter(r => r.reason === 'unreachable').length}`,
    );
  }
  const plain = runs.filter(r => r.checked === 'plain');
  const small = rows.filter((r): r is SmallRow => r.small === true);
  console.log(
    `plain-search checks ${plain.length}, mismatches ${plain.filter(r => r.mismatch).length}; unfinished ${runs.filter(r => r.plainNodes && !r.checked).length}`,
  );
  console.log(`exhaustive checks ${small.length}, mismatches ${small.filter(r => r.mismatch).length}`);
  console.log(
    `truncated ${runs.filter(r => r.truncated).length}; faster than asked (or faster mode, ok) ${runs.filter(r => r.mode === 'min' && r.faster).length}`,
  );
  for (const r of runs.sort((a, b) => b.ms - a.ms).slice(0, 5)) {
    console.log(
      `  slowest: ${r.ms} ms ${r.id} L${r.level} cap ${r.cap} ${r.target}${r.tiebreak ? `>${r.tiebreak}` : ''} ${r.mode} ${r.gcd}${r.food ? ' food' : ''} nodes ${r.nodes} searches ${r.searches}`,
    );
  }
}
