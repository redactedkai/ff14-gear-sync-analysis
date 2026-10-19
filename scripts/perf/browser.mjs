/* Browser timing of the gear optimizer (docs/engineering/optimizer.md, section 8).

Loads dist/index.html from file:// in Chromium (Playwright) and reads the page's User Timing measures:
'optimizer' (one optimizer run: src/ui/components/optimizer.js) and 'save' (serializing the saved state: src/main.js).

  1. seed: picks a job on the Gear optimizer tab, which searches every database piece the job can wear; then switches
     to the next job (a job switch). Keeps each saved state.
  2. cold: a fresh browser context per run, with the saved state already in localStorage, so the page opens straight
     on the optimizer: the first optimizer run is fully cold (no compiled code, no caches, the job's gear not built).
  3. warm: in that page, cycles the target stat and times each run, and the settle time (change -> result shown,
     minus the 120 ms debounce).
  4. memory: 100 target changes, JS heap before and after (with garbage collection).
Each at CPU throttle 1x (this machine), 4x and 6x (Chrome DevTools' slow-device emulation).

Run: npm run build && node scripts/perf/browser.mjs [--runs 5] [--jobs PLD,SGE] [--rates 1,4,6]
*/

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PAGE = pathToFileURL(resolve(ROOT, 'dist', 'index.html')).href;
const OUT = resolve(ROOT, 'scripts', 'perf', 'out');
const STORE_KEY = 'ilvl-stat-lab-v4'; // src/ui/state.js
const DEBOUNCE_MS = 120; // src/ui/components/optimizer.js
const TIMEOUT = 120_000;

// long tasks (main thread blocked over 50 ms), recorded from the first moment of every page
const LONGTASKS = `
window.__long = [];
try {
  new PerformanceObserver(l => { for (const e of l.getEntries()) window.__long.push(e.duration); })
    .observe({ type: 'longtask', buffered: true });
} catch (e) {}
`;

const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i < 0 ? dflt : process.argv[i + 1];
};
const median = xs => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const max = xs => Math.max(...(xs.length ? xs : [0]));

const measures = (pg, name) => pg.evaluate(`performance.getEntriesByName('${name}').map(e => e.duration)`);

async function throttle(pg, rate) {
  const cdp = await pg.context().newCDPSession(pg);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate });
  return cdp;
}

const waitMeasure = (pg, name, count) =>
  pg.waitForFunction(`performance.getEntriesByName('${name}').length >= ${count}`, undefined, { timeout: TIMEOUT });

async function setJob(pg, job) {
  await pg.click(`[data-job-id="${job}"]`);
  await pg.waitForSelector(`[data-job="${job}"]`);
}

/** The pieces the optimizer searches, from its count line ("· searching 1,939 of 2,400 pieces"). */
async function searched(pg) {
  return Number.parseInt(/searching ([\d,]+)/.exec(await pg.locator('#o-count').innerText())[1].replace(/,/g, ''), 10);
}

/** The saved state once the save debounce has written the job. */
async function savedState(pg, job) {
  await pg.waitForFunction(
    `(() => { try { const s = JSON.parse(localStorage.getItem('${STORE_KEY}')); return s.job === '${job}' && s.tab === 'opt'; } catch (e) { return false; } })()`,
    undefined,
    { timeout: TIMEOUT },
  );
  return await pg.evaluate(`localStorage.getItem('${STORE_KEY}')`);
}

/** Pick each job through the UI on the optimizer tab; the second job onward is a job switch. */
async function seed(browser, jobs, rate) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(LONGTASKS);
  const pg = await ctx.newPage();
  pg.setDefaultTimeout(TIMEOUT);
  await pg.goto(PAGE);
  await throttle(pg, rate);
  await pg.waitForSelector('[data-job-id]', { state: 'attached' });
  const states = {};
  const rows = [];
  for (const job of jobs) {
    const before = (await measures(pg, 'optimizer')).length;
    const tJob = await pg.evaluate('performance.now()');
    await setJob(pg, job); // the page opens on the optimizer tab, which runs as soon as a job is picked
    await waitMeasure(pg, 'optimizer', before + 1);
    await pg.locator('#o-out .panel').waitFor({ state: 'visible' });
    const total = (await pg.evaluate('performance.now()')) - tJob;
    const opt = (await measures(pg, 'optimizer')).at(-1);
    rows.push({ job, pieces: await searched(pg), optimizer_ms: opt, switch_total_ms: total });
    states[job] = await savedState(pg, job);
  }
  const save = max(await measures(pg, 'save'));
  const longMax = max(await pg.evaluate('window.__long'));
  await ctx.close();
  return { states, rows, save, longMax };
}

async function coldAndWarm(browser, state, rate, targets, warm) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(LONGTASKS);
  await ctx.addInitScript(`try { localStorage.setItem(${JSON.stringify(STORE_KEY)}, ${JSON.stringify(state)}); } catch (e) {}`);
  const pg = await ctx.newPage();
  pg.setDefaultTimeout(TIMEOUT);
  const cdp = await throttle(pg, rate); // before navigation, so page start-up is throttled too
  await pg.goto(PAGE);
  await waitMeasure(pg, 'optimizer', 1);
  await pg.locator('#o-out .panel').waitFor({ state: 'visible' });
  const shown = await pg.evaluate('performance.now()'); // since navigation start
  const cold = (await measures(pg, 'optimizer'))[0];
  const out = { cold_ms: cold, load_to_result_ms: shown };
  if (warm) {
    const runs = [];
    const settles = [];
    for (const t of targets) {
      const before = (await measures(pg, 'optimizer')).length;
      const t0 = await pg.evaluate('performance.now()');
      await pg.selectOption('#o-target', t);
      await waitMeasure(pg, 'optimizer', before + 1);
      await pg.waitForFunction(`document.querySelector('#o-result')?.dataset.target === '${t}'`, undefined, { timeout: TIMEOUT });
      settles.push((await pg.evaluate('performance.now()')) - t0 - DEBOUNCE_MS);
      runs.push((await measures(pg, 'optimizer')).at(-1));
    }
    out.warm_ms = runs;
    out.settle_ms = settles;
    // memory: 100 more target changes, heap before and after garbage collection
    await cdp.send('HeapProfiler.enable');
    await cdp.send('HeapProfiler.collectGarbage');
    const h0 = await pg.evaluate('performance.memory.usedJSHeapSize');
    for (let i = 0; i < 100; i++) {
      const before = (await measures(pg, 'optimizer')).length;
      await pg.selectOption('#o-target', targets[i % targets.length]);
      await waitMeasure(pg, 'optimizer', before + 1);
    }
    await cdp.send('HeapProfiler.collectGarbage');
    const h1 = await pg.evaluate('performance.memory.usedJSHeapSize');
    out.heap_mb = [h0 / 2 ** 20, h1 / 2 ** 20];
  }
  out.longtask_max_ms = max(await pg.evaluate('window.__long'));
  await ctx.close();
  return out;
}

const fmt = xs => `median ${median(xs).toFixed(0)}, max ${Math.max(...xs).toFixed(0)}`;

async function main() {
  const runsN = Number(arg('runs', 5));
  const jobs = arg('jobs', 'PLD,SGE').split(',');
  const rates = arg('rates', '1,4,6').split(',').map(Number);
  mkdirSync(OUT, { recursive: true });
  const results = [];
  const browser = await chromium.launch();
  try {
    const { states } = await seed(browser, jobs, 1);
    for (const rate of rates) {
      console.log(`\nCPU ${rate}x${rate === 1 ? ' (this machine)' : ' slower'}`);
      const { rows, save, longMax } = await seed(browser, jobs, rate);
      for (const r of rows) {
        console.log(
          `  pick ${r.job} (${r.pieces.toLocaleString('en-US')} pieces searched): ` +
            `optimizer ${r.optimizer_ms.toFixed(0)} ms, click to result ${r.switch_total_ms.toFixed(0)} ms`,
        );
      }
      console.log(`  slowest save ${save.toFixed(0)} ms, longest blocked main thread ${longMax.toFixed(0)} ms`);
      for (const job of jobs) {
        const targets = ['crit', 'det', 'dh', 'spd', 'main'];
        const runs = [];
        for (let i = 0; i < runsN; i++) runs.push(await coldAndWarm(browser, states[job], rate, targets, i === 0));
        const w = runs[0];
        console.log(
          `  ${job}: cold optimizer run ${fmt(runs.map(r => r.cold_ms))} ms; page open to result ${fmt(runs.map(r => r.load_to_result_ms))} ms`,
        );
        console.log(
          `  ${job}: warm runs ${fmt(w.warm_ms)} ms; settle after a change ${fmt(w.settle_ms)} ms ` +
            `beyond the ${DEBOUNCE_MS} ms wait; heap ${w.heap_mb[0].toFixed(1)} -> ${w.heap_mb[1].toFixed(1)} MB after 100 changes; ` +
            `longest blocked main thread ${max(runs.map(r => r.longtask_max_ms)).toFixed(0)} ms`,
        );
        results.push({ rate, job, runs, switch: rows, save_ms: save });
      }
    }
  } finally {
    await browser.close();
  }
  writeFileSync(resolve(OUT, 'browser.json'), JSON.stringify(results, null, 1));
}

await main();
