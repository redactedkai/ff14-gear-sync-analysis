/* Browser timing of a set page's Auto-fill (docs/engineering/optimizer.md, section 8).

Loads dist/index.html from file:// in Chromium (Playwright) and reads the page's User Timing measures: 'fill' (one Auto-fill's
search, as the solver reports it: src/ui/elements/set-page/fill-run.ts) and 'save' (serializing the saved state: src/main.js).

Each job gets one sheet, written to localStorage before the page loads: level 100, no sync, five gear sets with every
row empty and unpinned, each set's Auto-fill settings with another goal (FILL_TARGETS), the other settings at their defaults.
  1. cold: a fresh browser context per run; the page opens, the first set's page is opened and Auto-fill pressed, which
     makes the first search fully cold (no compiled code, no caches, the job's gear not built in the worker).
  2. warm: in that page, each set in turn: Auto-fill, wait for its result, Discard; times each search and the time from the
     press to the result shown.
  3. memory: 100 more Fills over the sets, JS heap before and after (with garbage collection). The page's heap only:
     the solver's Web Worker (src/ui/solver.ts) has its own, not counted.
Long tasks (the main thread blocked over 50 ms) are reported over the whole page, opening it included, and from the
first Auto-fill to the memory step (the searches and drawing their results; the search itself runs in the worker).
Chrome's CPU throttle slows the page's main thread; the worker's search is slowed much less, so its times at 4x and 6x
are not a slow device's.
Each at CPU throttle 1x (this machine), 4x and 6x (Chrome DevTools' slow-device emulation).

Run: npm run build && node scripts/perf/browser.ts [--runs 5] [--jobs PLD,SGE] [--rates 1,4,6] [--page file.html]
--page times another build of the page (a copy of dist/index.html), for a before and after run back to back.
*/

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import type { Browser, CDPSession, Page } from 'playwright';
import { makeJobContext } from '../../src/core/job-context.ts';
import { DEFAULT_EXCLUDE } from '../../src/ui/job-sync-panel.ts';
import { SET_ROW_SLOTS } from '../../src/ui/sheets/storage.ts';
import type { SavedGearSet, SavedSheet } from '../../src/ui/sheets/saved-types.ts';
import { STORE_KEY } from '../../src/ui/store-key.ts';
import { listOption, numberOption, option } from './args.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PAGE = pathToFileURL(resolve(option('page') ?? resolve(ROOT, 'dist', 'index.html'))).href;
const OUT = resolve(ROOT, 'scripts', 'perf', 'out');
const TIMEOUT = 120_000;

// one gear set per goal, in this order; 'speed' and 'main' stand for the job's own speed and main stat
const FILL_TARGETS = ['crit', 'det', 'dh', 'speed', 'main'];

// long tasks (main thread blocked over 50 ms), recorded from the first moment of every page
const LONGTASKS = `
window.__long = [];
try {
  new PerformanceObserver(l => { for (const e of l.getEntries()) window.__long.push(e.duration); })
    .observe({ type: 'longtask', buffered: true });
} catch (e) {}
`;

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? (s[m] ?? 0) : ((s[m - 1] ?? 0) + (s[m] ?? 0)) / 2;
};
const max = (xs: number[]): number => Math.max(...(xs.length ? xs : [0]));

/* What one run measured; the warm fields only in the run that does the warm and memory steps. */
type RunResult = {
  cold_ms?: number;
  load_to_result_ms?: number;
  warm_ms?: number[];
  settle_ms?: number[];
  heap_mb?: [number, number];
  save_ms?: number;
  longtask_max_ms?: number;
  longtask_search_max_ms?: number;
};

const measures = (pg: Page, name: string): Promise<number[]> =>
  pg.evaluate<number[]>(`performance.getEntriesByName('${name}').map(e => e.duration)`);

async function throttle(pg: Page, rate: number): Promise<CDPSession> {
  const cdp = await pg.context().newCDPSession(pg);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate });
  return cdp;
}

const waitMeasure = (pg: Page, name: string, count: number) =>
  pg.waitForFunction(`performance.getEntriesByName('${name}').length >= ${count}`, undefined, { timeout: TIMEOUT });

/** `job`'s sheet as src/ui/sheets/storage.ts saves it: level 100, no sync, one empty set per FILL_TARGETS goal. */
function sheetFor(job: string): SavedSheet {
  const ctx = makeJobContext(job);
  const targetKey = (goal: string): string => {
    if (goal === 'main') {
      return ctx.mainKey;
    }
    return goal === 'speed' ? ctx.speedKey : goal;
  };
  const sets = FILL_TARGETS.map(targetKey).map(
    (target, i): SavedGearSet => ({
      id: `g_${target}`,
      name: `Goal ${target}`,
      description: '',
      pieces: SET_ROW_SLOTS.map(slot => ({ slot })),
      meal: null,
      pinned: { pieces: [], meal: false },
      fillSettings: {
        goal: { target, tb: '', tb2: '', gcd: '', gcdMode: 'exact', byTier: true, melds: true, food: false },
        searchCriteria: { expOff: [], exclude: [...DEFAULT_EXCLUDE], market: true, min: '', max: '', lvl: 100 },
      },
      createdAt: i,
      updatedAt: i,
    }),
  );
  return {
    v: 1,
    id: `s_${job}`,
    name: `${job} timing`,
    description: '',
    job,
    level: 100,
    sync: { on: false, cap: 123 },
    sets,
    gameData: { commit: 'perf', date: '2026-01-01' },
    createdAt: 0,
    updatedAt: 0,
  };
}

/** Open the set with `setId` of the only sheet, from wherever the Sheets tab is. */
async function openSet(pg: Page, sheet: SavedSheet, setId: string): Promise<void> {
  await pg.click('[data-tab=sheets]');
  if (await pg.locator('#sh-manager').isVisible()) {
    await pg.locator('#sh-list a.sname').first().click();
  } else if (await pg.locator('#sh-set').isVisible()) {
    await pg.locator('#sh-set .setcrumb a:nth-of-type(2)').click();
  }
  const name = sheet.sets.find(s => s.id === setId)?.name;
  if (name === undefined) {
    throw new Error(`the sheet has no set ${setId}`);
  }
  await pg.locator('#sh-sets a.sname', { hasText: name }).click();
  await pg.locator('#sh-fill').waitFor({ state: 'visible' });
}

/** Press Auto-fill and wait for its result; returns the time from the press to the result shown (ms). */
async function fill(pg: Page): Promise<number> {
  const before = (await measures(pg, 'fill')).length;
  const t0 = await pg.evaluate<number>('performance.now()');
  await pg.click('#sh-fill');
  await waitMeasure(pg, 'fill', before + 1);
  await pg.locator('#sh-discard').waitFor({ state: 'visible' });
  return (await pg.evaluate<number>('performance.now()')) - t0;
}

async function coldAndWarm(browser: Browser, job: string, rate: number, warm: boolean): Promise<RunResult> {
  const sheet = sheetFor(job);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(LONGTASKS);
  await ctx.addInitScript(
    `try { localStorage.setItem(${JSON.stringify(`${STORE_KEY}:sheet:${sheet.id}`)}, ${JSON.stringify(JSON.stringify(sheet))});
      localStorage.setItem(${JSON.stringify(`${STORE_KEY}:sheets`)}, ${JSON.stringify(JSON.stringify({ v: 1, order: [sheet.id] }))}); } catch (e) {}`,
  );
  const pg = await ctx.newPage();
  pg.setDefaultTimeout(TIMEOUT);
  const cdp = await throttle(pg, rate); // before navigation, so page start-up is throttled too
  await pg.goto(PAGE);
  await pg.waitForSelector('#sh-list a.sname');
  const firstSet = sheet.sets[0];
  if (!firstSet) {
    throw new Error('the sheet has no set');
  }
  await openSet(pg, sheet, firstSet.id);
  const openTasks = await pg.evaluate<number>('window.__long.length'); // long tasks before the first Auto-fill
  await fill(pg);
  const shown = await pg.evaluate<number>('performance.now()'); // since navigation start
  const out: RunResult = { cold_ms: (await measures(pg, 'fill'))[0], load_to_result_ms: shown };
  await pg.click('#sh-discard');
  let searchTasks = Infinity; // long tasks up to the memory step (its forced garbage collections block the thread too)
  if (warm) {
    const runs: number[] = [];
    const settles: number[] = [];
    for (const set of sheet.sets) {
      await openSet(pg, sheet, set.id);
      settles.push(await fill(pg));
      runs.push((await measures(pg, 'fill')).at(-1) ?? 0);
      await pg.click('#sh-discard');
    }
    out.warm_ms = runs;
    out.settle_ms = settles;
    // memory: 100 more Fills, heap before and after garbage collection
    searchTasks = await pg.evaluate<number>('window.__long.length');
    await cdp.send('HeapProfiler.enable');
    await cdp.send('HeapProfiler.collectGarbage');
    const h0 = await pg.evaluate<number>('performance.memory.usedJSHeapSize');
    for (let i = 0; i < 100; i++) {
      if (i % 20 === 0) {
        await openSet(pg, sheet, sheet.sets[(i / 20) % sheet.sets.length]?.id ?? firstSet.id);
      }
      await fill(pg);
      await pg.click('#sh-discard');
    }
    await cdp.send('HeapProfiler.collectGarbage');
    const h1 = await pg.evaluate<number>('performance.memory.usedJSHeapSize');
    out.heap_mb = [h0 / 2 ** 20, h1 / 2 ** 20];
    out.save_ms = max(await measures(pg, 'save'));
  }
  const long = await pg.evaluate<number[]>('window.__long');
  out.longtask_max_ms = max(long);
  out.longtask_search_max_ms = max(long.slice(openTasks, searchTasks));
  await ctx.close();
  return out;
}

const fmt = (xs: number[]): string => `median ${median(xs).toFixed(0)}, max ${Math.max(...xs).toFixed(0)}`;

async function main(): Promise<void> {
  const runsN = numberOption('runs', 5);
  const jobs = listOption('jobs', ['PLD', 'SGE']);
  const rates = listOption('rates', ['1', '4', '6']).map(Number);
  mkdirSync(OUT, { recursive: true });
  const results: { rate: number; job: string; runs: RunResult[] }[] = [];
  const browser = await chromium.launch();
  try {
    for (const rate of rates) {
      console.log(`\nCPU ${rate}x${rate === 1 ? ' (this machine)' : ' slower'}`);
      for (const job of jobs) {
        const runs: RunResult[] = [];
        for (let i = 0; i < runsN; i++) {
          runs.push(await coldAndWarm(browser, job, rate, i === 0));
        }
        const w = runs[0];
        if (!w?.warm_ms || !w.settle_ms || !w.heap_mb || w.save_ms === undefined) {
          throw new Error('the first run has no warm measures');
        }
        console.log(
          `  ${job}: cold Auto-fill ${fmt(runs.map(r => r.cold_ms ?? 0))} ms; page open to result ${fmt(runs.map(r => r.load_to_result_ms ?? 0))} ms`,
        );
        console.log(
          `  ${job}: warm Fills ${fmt(w.warm_ms)} ms; Auto-fill to result ${fmt(w.settle_ms)} ms; ` +
            `heap ${w.heap_mb[0].toFixed(1)} -> ${w.heap_mb[1].toFixed(1)} MB after 100 Fills; slowest save ${w.save_ms.toFixed(0)} ms; ` +
            `longest blocked main thread ${max(runs.map(r => r.longtask_max_ms ?? 0)).toFixed(0)} ms, ` +
            `${max(runs.map(r => r.longtask_search_max_ms ?? 0)).toFixed(0)} ms from the first Auto-fill on`,
        );
        results.push({ rate, job, runs });
      }
    }
  } finally {
    await browser.close();
  }
  writeFileSync(resolve(OUT, 'browser.json'), JSON.stringify(results, null, 1));
}

await main();
