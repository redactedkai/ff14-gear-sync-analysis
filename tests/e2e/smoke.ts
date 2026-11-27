/* Browser smoke test (Playwright) for dist/index.html, loaded from file://.

Fails (exit 1) on JS errors, console errors, wrong numbers in the page, stray undefined/NaN/null text,
or horizontal page scroll at 960 px (NARROW). Prints 'no errors' on success.

Expected values come from outside the code under test where possible:
  - sync caps at item level 123 (head/hands/feet 29, body/legs 47, accessories 23, 2H weapon 48;
    main stat 30/48/24/50) (the Wiki's item level 475 caps are checked in tests/unit/core/formulas.model-accuracy.test.ts);
  - a set page's Auto-fill over every piece a healer can wear: the set it suggests, synced to 123, has the Spell Speed src/core
    computes for the same settings in Node (the core is checked against a brute force over every loadout in
    tests/unit);
  - a 130 head piece (Spell Speed / Piety) reproducing the ranked stats of a real item level 130 healer head piece
    (Mind 33, Vitality 32, substats 31/22; its fixed Direct Hit 6 is not a rank; tests/unit/ui/views/piece.test.js finds it in
    the item database);
  - level sync (synced level 90, item level sync off): level 100 healer head pieces capped at the item level 660
    head values (Mind 248; tests/unit/core/sync-target.test.js derives them from the ItemLevel row), in the gear browser and
    in Piece stats (item level 660: ParamGrow.ItemLevelSync for level 90).

Layout: this file is the runner. lib/ holds the helpers (expect, navigation, the shared setup, saved sheets, the worker
thread that computes numbers from src/core, the init scripts). checks/<folder>/ holds the checks: the
folder is named for the step's domain (tests/domains.mjs; the app's are settings, saved-state, tabs and startup). groups.ts lists GROUPS, the
steps in the order they run.

The steps run in groups, in parallel: each group gets a fresh browser context (so its own saved state) and page, set to
the shared setup (SHARED_SETUP: Sage, sync to 123, level 50), and runs its steps one after the other (see GROUPS).
Before each step that uses the shared setup, the runner checks it and names the step before if that one left it
changed. The numbers from src/core are computed in a worker thread (lib/core-worker.ts), so the pages are never kept
waiting. Failures are printed in step order.

Setup once: npm install && npx playwright install chromium
Run: npm run build && npm run test:smoke
Options: --domain <name,name> (or SMOKE_DOMAIN) runs only the groups with a step of those domains (tests/domains.mjs); a run
with a filter that leaves out groups ends with 'no errors (partial: N of M groups)', never the bare 'no errors' of the full run.
Environment: SMOKE_PAGE (page to test, default dist/index.html), SMOKE_OUT (screenshots, default tests/e2e/out),
SMOKE_WORKERS (groups at once, default half the cores up to 6),
SMOKE_FRAME_DELAY_MS (opt-in: every animation frame of the page this many ms late, to reproduce a slow runner; 40 shows what GitHub's Linux runner showed),
SMOKE_TIMEOUT (ms for any single wait, default 10000; page loads wait 30000 or this, if more), SMOKE_TRACE=1 (time of each step on stderr), SMOKE_ONLY
(a pattern on step names: run only the groups with a matching step; it combines with --domain: a group must pass both).
*/

import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { UNLOAD_GUARD_OFF_KEY } from '../../src/ui/router/unload-guard.ts';
import { parseDomains } from '../domains.mjs';
import { GROUPS } from './groups.ts';
import { OUT, PAGE, PAGE_PATH, WORKERS, shot } from './lib/constants.ts';
import { coreWorker, startCore } from './lib/core.ts';
import { stepRecord } from './lib/expect.ts';
import { NO_UNLOAD_GUARD } from './lib/init-scripts.ts';
import { frameDelayFromEnv, lateFramesScript } from './lib/late-frames.ts';
import { newPage, waitReady } from './lib/nav.ts';
import { setUpShared, sharedSetupChanges } from './lib/setup.ts';

/** One group on a new page. Returns what it found: the page and console errors and the failed checks, in order. */
async function runGroup(browser, group) {
  const rec = { name: group.steps.map(s => s.name).join(', '), errors: [], failures: [], known: new Map(), steps: [] };
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 900 } });
  // every group starts with the reload and close guard off, so its reloads are not held (checkUnloadGuard turns it on)
  await ctx.addInitScript(NO_UNLOAD_GUARD, UNLOAD_GUARD_OFF_KEY);
  // SMOKE_FRAME_DELAY_MS=40 makes every animation frame of the page 40 ms late, as on a slow runner (off by default)
  const frameDelayMs = frameDelayFromEnv('SMOKE_FRAME_DELAY_MS');
  if (frameDelayMs > 0) {
    await ctx.addInitScript(lateFramesScript, frameDelayMs);
  }
  if (group.initScript) {
    await ctx.addInitScript(group.initScript);
  }
  try {
    await stepRecord.run(rec, async () => {
      const pg = await newPage(ctx);
      pg.on('pageerror', e => rec.errors.push(`page error: ${e.message ?? e}`));
      // ERR_* console errors are network failures (Google Fonts offline), not page bugs
      pg.on('console', m => {
        if (m.type() === 'error' && !m.text().includes('ERR_')) {
          rec.errors.push(`console error: ${m.text()}`);
        }
      });
      const fail = async (name, e) => {
        rec.failures.push(`${name}: ${String(e.message ?? e).split('\n')[0]}`);
        const file = `fail-${name.replaceAll(' ', '-')}`;
        await pg.screenshot({ path: shot(`${file}.png`), fullPage: true }).catch(() => {});
        // what the page held (address, saved keys with their sizes), for a failure that only shows on a loaded runner
        const held = await pg
          .evaluate(() => ({
            address: location.href,
            saved: Object.keys(localStorage).map(key => `${key} (${localStorage.getItem(key).length} characters)`),
          }))
          .catch(error => ({ unreadable: String(error.message ?? error) }));
        writeFileSync(shot(`${file}.json`), JSON.stringify(held, null, 2), 'utf-8');
      };
      try {
        await pg.goto(PAGE);
        await waitReady(pg);
        if (!group.fresh) {
          await setUpShared(pg);
        }
      } catch (e) {
        await fail(`${rec.name} (setup)`, e);
        return;
      }
      for (const [i, step] of group.steps.entries()) {
        // a step that starts from the shared setup gets it: one that left it changed is named here, not in the step
        // it would make fail, and the setup is made again
        if (i > 0 && !group.fresh && step.shared) {
          const changed = await sharedSetupChanges(pg);
          if (changed.length) {
            const before = group.steps[i - 1].name;
            await fail(before, `left the shared setup changed (${changed.join(', ')})`);
            try {
              await setUpShared(pg);
            } catch (e) {
              await fail(`${before} (setup again)`, e);
              return;
            }
          }
        }
        const t0 = Date.now();
        try {
          await step.run(pg);
        } catch (e) {
          await fail(step.name, e);
        }
        rec.steps.push([step.name, Date.now() - t0]);
      }
    });
  } finally {
    await ctx.close();
  }
  return rec;
}

export async function main() {
  if (!existsSync(PAGE_PATH)) {
    console.log(`${PAGE_PATH} not found; run \`npm run build\` first`);
    return 1;
  }
  mkdirSync(OUT, { recursive: true });
  // screenshots of failures from earlier runs would make a passing run look failed
  for (const file of readdirSync(OUT)) {
    if (/^fail-.*\.(png|json)$/.test(file)) {
      rmSync(resolve(OUT, file));
    }
  }
  writeFileSync(resolve(OUT, 'blank.html'), '<!doctype html><title>blank</title>', 'utf-8'); // for checkCorruptedStorage

  // SMOKE_ONLY: a pattern on step names; only the groups with a matching step run (for working on one step)
  const only = process.env.SMOKE_ONLY && new RegExp(process.env.SMOKE_ONLY);
  // --domain / SMOKE_DOMAIN: a list of domain names; only the groups with a step of one of them run (a group runs whole)
  let domains = null;
  try {
    const flagAt = process.argv.indexOf('--domain');
    if (flagAt >= 0) {
      domains = parseDomains(process.argv[flagAt + 1] ?? '');
    } else if (process.env.SMOKE_DOMAIN) {
      domains = parseDomains(process.env.SMOKE_DOMAIN);
    }
  } catch (e) {
    console.log(e.message);
    return 2;
  }
  const groups = GROUPS.filter(
    g => (!only || g.steps.some(st => only.test(st.name))) && (!domains || g.steps.some(st => domains.includes(st.domain))),
  );
  const t0 = Date.now();
  startCore();
  const browser = await chromium.launch();
  const records = [];
  try {
    // a pool of workers takes the steps in order; the output below is in step order whichever finishes first
    const queue = groups.map((_, i) => i).sort((a, b) => Number(Boolean(groups[b].slow)) - Number(Boolean(groups[a].slow))); // slow ones first
    const worker = async () => {
      for (let i = queue.shift(); i !== undefined; i = queue.shift()) {
        records[i] = await runGroup(browser, groups[i]);
      }
    };
    await Promise.all(Array.from({ length: Math.min(WORKERS, groups.length) }, worker));
  } finally {
    await browser.close();
    await coreWorker.terminate();
  }

  if (process.env.SMOKE_TRACE) {
    for (const r of records) {
      for (const [name, ms] of r.steps) {
        console.error(`${String(ms).padStart(6)} ms  ${name}`);
      }
    }
    console.error(`${String(Date.now() - t0).padStart(6)} ms  total`);
  }
  // known failures (KNOWN_LOW_CONTRAST, KNOWN_MENU_OVERFLOW): printed by name, never hidden, and they do not fail the run
  for (const r of records) {
    for (const line of r.known.values()) {
      console.log(line);
    }
  }
  const problems = records.flatMap(r => [...r.errors, ...r.failures]);
  // the bare 'no errors' means the whole smoke test passed (npm run check and the docs rely on it); a filtered run says so
  const partial = groups.length < GROUPS.length ? ` (partial: ${groups.length} of ${GROUPS.length} groups)` : '';
  console.log(problems.join('\n') || `no errors${partial}`);
  return problems.length ? 1 : 0;
}

process.exitCode = await main();
