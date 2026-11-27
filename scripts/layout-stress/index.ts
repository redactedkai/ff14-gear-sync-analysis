/* Layout stress tool: `npm run stress:layout -- [options]` (options.ts, or --help). Builds the page into private copies
   (build.ts), opens it in each browser, window and text setup, measures the layout (probe.ts), judges it by the rules
   (rules.ts), and writes an HTML report (report.ts). Not part of `npm run check`: run it before a merge to `main`.
   Exit code 1 when a finding of severity `fail` is not a known failure, or a known failure stopped happening. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium, firefox, webkit } from 'playwright';
import { STRESS_ITEM_LEVEL, STRESS_LEVEL, STRESS_PATCHES, buildPrivate } from './build.ts';
import { checkScreenInWindow } from './checks.ts';
import {
  emptyFixture,
  extremeFixture,
  longestPieces,
  noSheetsFixture,
  readJobIds,
  readTestSheets,
  standardFixture,
  withStressNumbers,
} from './fixtures.ts';
import { applyKnownFailures, KNOWN_FAILURES } from './known-failures.ts';
import {
  QUICK_SWEEP_HEIGHTS,
  QUICK_WINDOWS,
  SWEEP_HEIGHTS,
  SWEEP_STEP,
  buildMatrix,
  chooseSetups,
  parseWindow,
  windowsForSetup,
} from './matrix.ts';
import { USAGE, parseArgs } from './options.ts';
import { groupFindings, renderReport, shortList } from './report.ts';
import { rulesMarkdown } from './rules.ts';
import { pageFontsLoaded } from './session.ts';
import { sweepView } from './sweep.ts';
import { SCREENS } from './targets.ts';

/* How many grouped findings the run prints to the console (the report and its .json have them all). */
const MAX_PRINTED_FINDINGS = 40;

/* The coarse step of a quick run's sweep. */
const QUICK_SWEEP_STEP = 80;

/* The stress build's setup: the page's own fonts on the build with level 888 and item level 8888. It is visited in the
   matrix's windows only. */
const STRESS_SETUP = Object.freeze({
  id: 'stress',
  label: `Level ${STRESS_LEVEL}, item level ${STRESS_ITEM_LEVEL}`,
  blockFonts: false,
  css: '',
  build: 'stress',
});

/* Runs `jobs` (async functions) with at most `limit` at a time; returns their results in order. */
async function runPool(jobs, limit, onDone) {
  const results = new Array(jobs.length);
  let next = 0;
  let done = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const at = next++;
      results[at] = await jobs[at]();
      onDone?.(++done, jobs.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, jobs.length) }, worker));
  return results;
}

/* The fixtures of a build: {name: {fixture, failWrites}}. The stress build's have the widest level and item level. */
async function makeFixtures(stress) {
  const testSheets = readTestSheets();
  const jobIds = await readJobIds();
  const longest = await longestPieces();
  const fixtures = {
    standard: standardFixture(testSheets),
    extreme: extremeFixture(testSheets, jobIds, longest),
    empty: emptyFixture(testSheets),
    none: noSheetsFixture(),
  };
  const withFailing = { ...fixtures, failing: standardFixture(testSheets) };
  const entries = Object.entries(withFailing).map(([name, fixture]) => [
    name,
    { fixture: stress ? withStressNumbers(fixture, STRESS_LEVEL, STRESS_ITEM_LEVEL) : fixture, failWrites: name === 'failing' },
  ]);
  return { fixtures: Object.fromEntries(entries), jobIds };
}

/* The Playwright browser types by name. */
const BROWSER_TYPES = { chromium, firefox, webkit };

/* Launches `name` (a Playwright browser), or returns null with the reason when it cannot start. */
async function launch(name) {
  try {
    return { browser: await BROWSER_TYPES[name].launch() };
  } catch (error) {
    return { error: error.message.split('\n')[0] };
  }
}

/* The windows to visit: the matrix's, or the quick subset. Returns [{key, width, height, setups}]. */
function windowsFor(quick) {
  const { windows } = buildMatrix();
  const keys = quick ? QUICK_WINDOWS : [...windows.keys()];
  return keys.map(key => ({ key, ...parseWindow(key), setups: windows.get(key) ?? [] }));
}

/* The windows one setup is visited in (matrix.ts windowsForSetup), from all the windows. */
function windowsOfSetup(windows, setup, quick) {
  const keys = windowsForSetup(
    windows.map(window => window.key),
    setup.id,
    quick,
  );
  return windows.filter(window => keys.includes(window.key));
}

/* Runs the stress tool with `argv`; returns the exit code. */
export async function main(argv) {
  if (argv.includes('--help')) {
    console.log(USAGE);
    return 0;
  }
  const options = parseArgs(argv);
  if (options.error) {
    console.error(`${options.error}\n${USAGE}`);
    return 2;
  }
  if (options.rules) {
    console.log(rulesMarkdown());
    return 0;
  }

  const started = Date.now();
  const screens = SCREENS.filter(screen => options.screens.includes(screen.id));
  const visited = screens.filter(screen => !screen.waiting);
  const waiting = screens.filter(screen => screen.waiting);
  const setups = [...chooseSetups(options.fonts), ...(options.stress ? [STRESS_SETUP] : [])];
  const windows = windowsFor(options.quick);
  const heights = options.quick ? QUICK_SWEEP_HEIGHTS : SWEEP_HEIGHTS;
  const step = options.quick ? QUICK_SWEEP_STEP : SWEEP_STEP;
  console.log(
    `screens ${visited.map(screen => screen.id).join(', ')}${waiting.length ? ` (waiting: ${waiting.map(screen => `${screen.id}, ${screen.waiting}`).join('; ')})` : ''}; browsers ${options.browsers.join(', ')}; setups ${setups.map(setup => setup.id).join(', ')}; ${windows.length} windows; sweep heights ${heights.join(', ')}`,
  );

  // the private builds
  console.log('building the page (a private copy, repo untouched)...');
  const real = buildPrivate();
  const stress = options.stress ? buildPrivate({ patches: STRESS_PATCHES }) : null;
  const builds = { real, stress };
  const fixtureSets = { real: await makeFixtures(false), stress: stress ? await makeFixtures(true) : null };

  const findings = [];
  const breakpoints = [];
  const windowResults = [];
  const browserNotes = [];
  try {
    for (const browserName of options.browsers) {
      const launched = await launch(browserName);
      if (launched.error) {
        console.error(`${browserName}: cannot start (${launched.error}); run "npx playwright install ${browserName}"`);
        browserNotes.push({ browser: browserName, error: launched.error });
        findings.push({
          rule: 'check-completed',
          severity: 'fail',
          detail: `${browserName} cannot start: ${launched.error}`,
          where: browserName,
          screen: '-',
          view: '-',
          setup: '-',
          browser: browserName,
        });
        continue;
      }
      const { browser } = launched;
      const tasks = [];

      // the matrix's windows, every setup
      for (const setup of setups) {
        const build = builds[setup.build ?? 'real'];
        const { fixtures, jobIds } = fixtureSets[setup.build ?? 'real'];
        for (const screen of visited) {
          for (const window of windowsOfSetup(windows, setup, options.quick)) {
            tasks.push(async () => {
              const result = await checkScreenInWindow({
                browser,
                file: build.page,
                screen,
                fixtures,
                jobIds,
                width: window.width,
                height: window.height,
                setup,
                walkFocus: setup.id === 'page' || setup.id === 'stress',
                widest: setup.build === 'stress',
              });
              windowResults.push({
                browser: browserName,
                setup: setup.id,
                screen: screen.id,
                window: window.key,
                setups: window.setups,
                fonts: result.fonts,
                findings: result.findings,
              });
              for (const item of result.findings) {
                findings.push({ ...item, screen: screen.id, setup: setup.id, browser: browserName, window: window.key });
              }
            });
          }
        }
      }

      // the width sweeps, the real build's setups
      for (const setup of setups.filter(item => !item.build)) {
        const { fixtures } = fixtureSets.real;
        for (const screen of visited) {
          for (const view of screen.views.filter(item => item.sweep)) {
            for (const height of setup.id === 'page' ? heights : heights.slice(-1)) {
              tasks.push(async () => {
                const result = await sweepView({ browser, file: real.page, view, fixtures, setup, height, step });
                breakpoints.push({
                  browser: browserName,
                  setup: setup.id,
                  screen: screen.id,
                  view: view.id,
                  height,
                  changes: result.changes,
                  measured: result.measured,
                });
                for (const item of result.findings) {
                  findings.push({
                    ...item,
                    screen: screen.id,
                    setup: setup.id,
                    browser: browserName,
                    window: item.widths ? `${item.widths[0]}-${item.widths[1]} px at ${height} px high` : `sweep at ${height} px high`,
                  });
                }
              });
            }
          }
        }
      }

      console.log(`${browserName}: ${tasks.length} tasks, ${options.workers} at a time`);
      await runPool(tasks, options.workers, (done, total) => process.stdout.write(`\r${browserName} ${done}/${total}`));
      process.stdout.write('\n');
      await browser.close();
    }
  } finally {
    if (!options.keep) {
      real.remove();
      stress?.remove();
    } else {
      console.log(`kept ${real.dir}${stress ? ` and ${stress.dir}` : ''}`);
    }
  }

  // known failures: only the ones for screens and browsers this run visited, and (stale ones) only on a full run
  const ranKnown = KNOWN_FAILURES.filter(
    entry => visited.some(screen => screen.id === entry.screen) && (!entry.browser || options.browsers.includes(entry.browser)),
  );
  const { fresh, knownLines, stale } = applyKnownFailures(findings, ranKnown);
  const staleLines = options.quick
    ? []
    : stale.map(
        entry =>
          `KNOWN FAILURE no longer happens (${entry.rule}, ${entry.screen}${entry.view ? `/${entry.view}` : ''}): remove it from known-failures.ts`,
      );

  const reportPath = resolve(options.report ?? join(tmpdir(), 'layout-stress', 'report.html'));
  mkdirSync(join(reportPath, '..'), { recursive: true });
  const seconds = Math.round((Date.now() - started) / 1000);
  writeFileSync(
    reportPath,
    renderReport({
      options,
      screens,
      waiting,
      setups,
      windows,
      heights,
      findings: fresh,
      knownLines,
      staleLines,
      breakpoints,
      windowResults,
      browserNotes,
      seconds,
      pageFonts: pageFontsLoaded(),
    }),
  );

  writeFileSync(
    reportPath.replace(/\.html$/, '') + '.json',
    JSON.stringify({ findings: fresh, breakpoints, knownLines, staleLines }, null, 1),
  );

  const fails = fresh.filter(item => item.severity === 'fail');
  const warns = fresh.filter(item => item.severity === 'warn');
  for (const group of groupFindings(fresh).slice(0, MAX_PRINTED_FINDINGS)) {
    console.log(
      `${group.severity.toUpperCase()} ${group.rule} [${group.browser} ${group.setup} ${group.screen}/${group.view}] ${group.where}: ${group.detail} (${shortList(group.windows, 3)})`,
    );
  }
  for (const line of knownLines) {
    console.log(line);
  }
  for (const line of staleLines) {
    console.log(line);
  }
  console.log(`${fails.length} fail finding(s), ${warns.length} warning(s), ${knownLines.length} known failure(s), in ${seconds} s`);
  console.log(`report: ${reportPath}`);
  return fails.length || staleLines.length ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.argv.slice(2));
}
