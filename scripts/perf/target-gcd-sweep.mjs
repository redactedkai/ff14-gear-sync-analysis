/* Target GCD sweep (not part of `check`): the real engine (src/core/target-gcd.js) on every job x sync setting
   (workloads.mjs SYNCS) x goals (every substat but speed, plus the main stat as a stress case) with no, one or two
   tiebreaks x GCD targets spread from the job's no-speed GCD (with its haste) down to the fastest the gear reaches, so
   GCDs slower than the free result (the drift case) are in, x both modes x food off and "Best for the goal". The pool
   is every wearable piece minus the page's default exclusions (Savage, Ultimate, PvP); melds on; no node limit.
   Checks:
   - every 4th run (food off): the same candidates solved by the plain search (no speed tables, groups or memo), which
     must give the same score or also find nothing;
   - per task, small random pools against the exhaustive reference (tests/unit/helpers/exhaustive.js), which shares
     no code with meld versions, pruning or the search.
   node scripts/perf/target-gcd-sweep.mjs [workers=5] [jobs=all] [resume]
   resume keeps the rows already in the output and runs only the job x sync tasks missing from it (a task's rows are
   written together, so a task is either there whole or not at all).
   Writes scripts/perf/out/target-gcd-sweep.jsonl (one row per run) and prints progress and a summary. */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Worker, isMainThread, parentPort } from 'node:worker_threads';

const ROOT = new URL('../../', import.meta.url).href;

if (isMainThread) {
  const { JOB_IDS, SYNCS } = await import('./workloads.mjs');
  const nWorkers = Number(process.argv[2] || 5);
  const jobs = process.argv[3] ? process.argv[3].split(',') : JOB_IDS;
  mkdirSync(new URL('./out/', import.meta.url), { recursive: true });
  const outFile = new URL('./out/target-gcd-sweep.jsonl', import.meta.url);
  const all = [];
  if (process.argv[4] === 'resume' && existsSync(outFile)) {
    for (const l of readFileSync(outFile, 'utf8').split('\n')) if (l) all.push(JSON.parse(l));
  } else writeFileSync(outFile, '');
  const taskKey = (id, s) => `${id}|${s.level}|${s.cap}|${s.sync}`;
  const have = new Set(all.map(r => taskKey(r.id, r)));
  // cap 795 is the highest real item level, so it syncs nothing: every run repeats sync off
  const tasks = jobs
    .flatMap(id => SYNCS.map((s, si) => ({ id, si, s })))
    .filter(t => t.s.label !== 'cap 795' && !have.has(taskKey(t.id, t.s)));
  const t0 = Date.now();
  let next = 0,
    done = 0,
    worst = all.reduce((m, r) => Math.max(m, r.ms || 0), 0);
  console.log(`${tasks.length} tasks (job x sync), ${nWorkers} workers`);
  await new Promise(resolve => {
    let alive = nWorkers;
    for (let w = 0; w < nWorkers; w++) {
      const worker = new Worker(fileURLToPath(import.meta.url));
      const feed = () => worker.postMessage(next < tasks.length ? tasks[next++] : null);
      worker.on('message', m => {
        if (m.rows) {
          appendFileSync(outFile, `${m.rows.map(r => JSON.stringify(r)).join('\n')}\n`);
          for (const r of m.rows) {
            all.push(r);
            worst = Math.max(worst, r.ms || 0);
          }
          done++;
          const el = (Date.now() - t0) / 1000;
          const bad = all.filter(r => r.mismatch).length;
          console.log(
            `[${done}/${tasks.length}] ${m.task.id} sync#${m.task.si}: ${m.rows.length} rows; worst ${worst.toFixed(0)} ms, mismatches ${bad}; ${el.toFixed(0)} s, eta ${((el / done) * (tasks.length - done)).toFixed(0)} s`,
          );
        }
        if (m.ready || m.rows) feed();
      });
      worker.on('error', e => console.log('worker error', e));
      worker.on('exit', () => --alive === 0 && resolve());
    }
  });
  summary(all, (Date.now() - t0) / 1000);
} else {
  const { performance } = await import('node:perf_hooks');
  const { fullPool, job: ctx, rng, SYNCS } = await import('./workloads.mjs');
  const { withActivities } = await import(`${ROOT}src/core/items.js`);
  const { DEFAULT_EXCLUDE } = await import(`${ROOT}src/ui/state.js`);
  const { optimize, solve } = await import(`${ROOT}src/core/optimizer/index.js`);
  const { gcdFor, hasteFor, speedForGcd } = await import(`${ROOT}src/core/speed.js`);
  const { optimizeGcd } = await import(`${ROOT}src/core/target-gcd.js`);
  const { exhaustive } = await import(`${ROOT}tests/unit/helpers/exhaustive.js`);
  const score = (r, keys) => (r?.ok ? keys.map(k => r.totals[k] || 0) : null);
  let k = 0;
  parentPort.on('message', task => {
    if (!task) return process.exit(0);
    const job = ctx(task.id);
    const s = SYNCS[task.si];
    const sync = { cap: s.cap, sync: s.sync, level: s.level };
    const level = s.level;
    const haste = hasteFor(job.jobId, level)?.pct ?? 0;
    const pool = withActivities(fullPool(job), DEFAULT_EXCLUDE, true);
    const rows = [];
    const base = { id: task.id, level, cap: s.cap, sync: s.sync, haste };
    const fastSpd = optimize(job, pool, sync, { target: 'spd', melds: true }).totals?.spd ?? 0;
    const top = gcdFor(0, level, 2500, haste),
      bottom = gcdFor(fastSpd, level, 2500, haste);
    // six GCDs spread from the no-speed GCD to the fastest reachable, both ends included
    const steps = Math.round((top - bottom) * 100);
    const gcds = [...new Set([0, 1, 2, 3, 4, 5].map(i => Math.round((top - Math.round((i * steps) / 5) / 100) * 100) / 100))];
    const subs = job.substats.filter(x => x !== 'spd');
    for (const target of [...subs, 'main']) {
      const tbs = subs.filter(x => x !== target);
      const objectives = [[], ...tbs.map(t => [t]), ...tbs.map((t, i) => [t, tbs[(i + 1) % tbs.length]]).filter(x => x[0] !== x[1])];
      for (const tiebreak of objectives) {
        const keys = [target, ...tiebreak];
        for (const mode of ['exact', 'min']) {
          let prep = null;
          for (const gcd of gcds) {
            for (const food of [null, 'best']) {
              const t = performance.now();
              const r = optimizeGcd(job, pool, sync, { target, tiebreak, melds: true, gcd, mode, food, nodeLimit: Infinity }, prep);
              const ms = performance.now() - t;
              prep = r.prep || prep;
              const row = {
                ...base,
                target,
                tiebreak: tiebreak.join('+'),
                stress: target === 'main',
                mode,
                gcd,
                food: !!food,
                ok: r.ok,
                reason: r.reason ?? null,
                got: r.gcd ?? null,
                faster: r.faster ?? null,
                meal: r.food?.name ?? null,
                searches: r.searches ?? 0,
                nodes: r.nodes ?? 0,
                truncated: !!r.truncated,
                ms: +ms.toFixed(1),
                first: rows.filter(x => x.target === target && x.tiebreak === tiebreak.join('+') && x.mode === mode).length === 0,
              };
              // the plain search on the same candidates and band
              if (!food && ++k % 4 === 0 && r.reason !== 'unreachable') {
                const band = speedForGcd(gcd, level, mode, haste);
                const p = solve(r.prep, { spdMin: band.min, spdMax: band.max, plain: true, nodeLimit: 1000000 });
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
    const int = n => Math.floor(rand() * n);
    for (let t = 0; t < 4; t++) {
      const small = [];
      for (const ty of ['head', 'body', 'neck', 'ring']) {
        const of = pool.filter(i => i.type === ty);
        for (let i = 0; i < (ty === 'ring' ? 2 : 1) && of.length; i++) small.push(of.splice(int(of.length), 1)[0]);
      }
      const target = subs[int(subs.length)];
      const free = gcdFor(optimize(job, small, sync, { target, melds: true }).totals.spd, level, 2500, haste);
      const gcd = Math.round((free + (int(5) - 2) / 100) * 100) / 100;
      const mode = rand() < 0.5 ? 'exact' : 'min';
      const band = speedForGcd(gcd, level, mode, haste);
      const r = optimizeGcd(job, small, sync, { target, melds: true, gcd, mode });
      const row = { ...base, small: true, target, mode, gcd, ok: r.ok, reason: r.reason ?? null, checked: 'exhaustive' };
      if (band) {
        const want = exhaustive(job, small, sync, { target, melds: true, spdMin: band.min || null, spdMax: band.max });
        row.mismatch = JSON.stringify(want) !== JSON.stringify(score(r, [target]));
      } else row.mismatch = r.reason !== 'unreachable';
      rows.push(row);
    }
    parentPort.postMessage({ task, rows });
  });
  parentPort.postMessage({ ready: true });
}

function summary(rows, seconds) {
  const runs = rows.filter(r => !r.small);
  const q = (xs, p) => {
    const a = xs.slice().sort((x, y) => x - y);
    return a.length ? a[Math.min(a.length - 1, Math.floor(p * a.length))] : 0;
  };
  console.log(`\ndone: ${runs.length} runs + ${rows.length - runs.length} small-pool checks in ${seconds.toFixed(0)} s`);
  for (const [label, sel] of [
    ['exact, no food', r => r.mode === 'exact' && !r.food],
    ['exact, best food', r => r.mode === 'exact' && r.food],
    ['or faster, no food', r => r.mode === 'min' && !r.food],
    ['or faster, best food', r => r.mode === 'min' && r.food],
  ]) {
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
  const small = rows.filter(r => r.small);
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
