/* Screenshots of every view of the page, for comparing a change's before and after (docs/engineering/testing.md,
   "Run by hand").

Opens a built page from file:// in Chromium (Playwright) and takes a full-page PNG of each view in VIEWS at 1440 and
960 px wide, in light and dark: 26 views, 104 shots, named `<view>-<width>-<scheme>.png`. Each view starts from a fresh
browser context with its saved state already in localStorage, then clicks its way to what it shows.

The shots are deterministic: Google Fonts are blocked (the page's fallback fonts; no network needed) and the fonts are
awaited, CSS animations and transitions are off, the mouse is moved to the page's top-left corner and the tables'
hovered column cleared before each shot (a leftover hover once lit a table column; views that show a hover keep it),
and the optimizer's solve time is replaced by a fixed text. Two runs of the same page gave the same bytes for 94 of the
104 shots (2026-10-19); in the other 10, a few dozen antialiased edge pixels (round buttons, a menu's edge) were 1/255
apart, which compare.mjs's default threshold allows.

Build the page without the DEV badge and the footer's branch line first, or they differ between branches: the build
leaves them out on `main` (scripts/build/build.mjs, buildMarks), so set GITHUB_REF_NAME=main for one build:
  bash:        GITHUB_REF_NAME=main npm run build
  PowerShell:  $env:GITHUB_REF_NAME = 'main'; npm run build; Remove-Item Env:GITHUB_REF_NAME
Copy dist/index.html elsewhere to keep a "before" page. A page with the badge still works; the script warns.

Run: npm run shots -- --out <dir> [--page dist/index.html] [--only <regex on view names>] [--workers 4] [--web-fonts]
Then compare two folders: npm run shots:compare -- <dirA> <dirB> (scripts/shots/compare.mjs).
Exits 1 on a JavaScript error in the page or a sideways scroll at either width.
*/

import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { STORE_KEY } from '../../src/ui/state.js';
import { flag, numberOption, option } from '../perf/args.mjs';

const WIDTHS = [1440, 960];
const SCHEMES = ['light', 'dark'];
const VIEWPORT_HEIGHT = 900;
// time for Alpine to redraw after a click or a state change, before the next step
const SETTLE_MS = 450;
const OPTIMIZE_TIMEOUT_MS = 60_000;

const pagePath = resolve(option('page', 'dist/index.html'));
const outDir = option('out');
if (!outDir) {
  console.error('error: --out <dir> is required (see the header of scripts/shots/shots.mjs)');
  process.exit(1);
}
const onlyPattern = option('only') ? new RegExp(option('only')) : null;
const workerCount = numberOption('workers', 4);
const webFonts = flag('web-fonts');

if (readFileSync(pagePath, 'utf8').includes('class="build-badge"'))
  console.warn('warning: the page carries the DEV badge; build it with GITHUB_REF_NAME=main to compare across branches');

/* Saved states the views start from (the shape of src/ui/state.js; restoreState fills in the rest). */
const SAGE = { job: 'SGE', cap: 123, sync: true, level: 100, tab: 'opt', mathTab: 'piece' };
const WARRIOR = { job: 'WAR', cap: 123, sync: true, level: 90, tab: 'opt', mathTab: 'piece' };
const BLUE_MAGE = { job: 'BLU', cap: 123, sync: true, level: 80, tab: 'opt', mathTab: 'piece' };

const settle = page => page.waitForTimeout(SETTLE_MS);

/* Press Optimize and wait for the result. */
async function optimize(page) {
  await page.click('#o-run');
  await page.waitForSelector('#o-out .panel', { timeout: OPTIMIZE_TIMEOUT_MS });
  await page.waitForSelector('#o-busy', { state: 'hidden', timeout: OPTIMIZE_TIMEOUT_MS });
  await settle(page);
}

/* Click `selector`, then let the page redraw. */
async function clickAndSettle(page, selector) {
  await page.click(selector);
  await settle(page);
}

const noSteps = async () => {};

/* Each view: the saved state it opens with (null: nothing saved, no job) and the steps that lead to it. `keepHover`:
   the steps end on a hover the shot shows, so the mouse stays where it is. */
const VIEWS = {
  '01-nojob': { state: null, steps: noSteps },
  '02-opt-empty': { state: SAGE, steps: noSteps },
  '03-opt-result': { state: { ...SAGE, opt: { food: true } }, steps: optimize },
  '04-opt-food-menu': {
    state: { ...SAGE, opt: { food: true } },
    steps: async page => {
      await optimize(page);
      await clickAndSettle(page, '#o-meal-btn');
    },
  },
  '05-opt-same-menu': {
    state: { ...SAGE, opt: { food: true } },
    steps: async page => {
      await optimize(page);
      await clickAndSettle(page, '.same-btn:not(#o-meal-btn)');
    },
  },
  '06-opt-gcd-tb': {
    state: { ...WARRIOR, opt: { food: true, target: 'crit', tb: 'det', gcd: 2.47, gcdMode: 'min' } },
    steps: async page => {
      await optimize(page);
      await clickAndSettle(page, '#o-rank-help');
    },
  },
  '07-opt-from-menu': {
    state: SAGE,
    keepHover: true,
    steps: async page => {
      await page.click('#o-from');
      await page.hover('[data-activity]');
      await settle(page);
    },
  },
  '08-opt-exp-menu': { state: SAGE, steps: page => clickAndSettle(page, '#o-exp') },
  '09-browse': { state: { ...SAGE, tab: 'browse' }, steps: noSteps },
  '10-browse-filtered': {
    state: { ...SAGE, tab: 'browse', browse: { q: 'ward', min: 100, max: 400, lvl: 80, expOff: ['ARR'] } },
    steps: noSteps,
  },
  '11-browse-from-menu': { state: { ...SAGE, tab: 'browse' }, steps: page => clickAndSettle(page, '#b-from') },
  '12-browse-exp-menu': { state: { ...SAGE, tab: 'browse' }, steps: page => clickAndSettle(page, '#b-exp') },
  '13-math-piece': {
    state: { ...SAGE, tab: 'math', mathTab: 'piece', piece: { ilvl: 300, slot: 'body', subs: ['crit', 'spd'] } },
    steps: page => clickAndSettle(page, '#p-steps summary'),
  },
  '14-math-piece-help': { state: { ...SAGE, tab: 'math', mathTab: 'piece' }, steps: page => clickAndSettle(page, '#m-help') },
  '15-math-piece-off': { state: { ...SAGE, sync: false, tab: 'math', mathTab: 'piece' }, steps: noSteps },
  '16-math-piece-level': {
    state: { ...WARRIOR, sync: false, tab: 'math', mathTab: 'piece', piece: { ilvl: null, slot: 'weapon', subs: ['spec', 'det'] } },
    steps: page => clickAndSettle(page, '#p-steps summary'),
  },
  '17-math-gcd': { state: { ...SAGE, tab: 'math', mathTab: 'gcd' }, steps: noSteps },
  '18-math-gcd-haste': {
    state: { ...WARRIOR, tab: 'math', mathTab: 'gcd' },
    steps: async page => {
      await page.selectOption('#g-haste', { index: 2 });
      await page.fill('#g-speed', '1200');
      await page.press('#g-speed', 'Enter');
      await settle(page);
    },
  },
  '19-math-tiers': { state: { ...WARRIOR, tab: 'math', mathTab: 'tiers' }, steps: noSteps },
  '20-math-tiers-help': { state: { ...SAGE, tab: 'math', mathTab: 'tiers' }, steps: page => clickAndSettle(page, '[data-help="crit"]') },
  '21-pld-browse': { state: { ...SAGE, job: 'PLD', tab: 'browse', browse: { type: 'offhand' } }, steps: noSteps },
  // a piece picked from the first row's same-result menu in place of the optimizer's
  '22-opt-piece-picked': {
    state: { ...SAGE, opt: { food: true } },
    steps: async page => {
      await optimize(page);
      await clickAndSettle(page, '.same-btn:not(#o-meal-btn)');
      await clickAndSettle(page, '.same-menu:not(.meal-menu) .same-item:not(.on)');
    },
  },
  // a meal picked from the Food row's menu in place of the best one
  '23-opt-meal-picked': {
    state: { ...SAGE, opt: { food: true } },
    steps: async page => {
      await optimize(page);
      await clickAndSettle(page, '#o-meal-btn');
      await clickAndSettle(page, '#o-meal-menu .meal-item:not(.on)');
    },
  },
  '24-browse-sorted': { state: { ...SAGE, tab: 'browse' }, steps: page => clickAndSettle(page, '[data-sort="ilvl"]') },
  // a setting changed after a search: the result is dimmed with its note
  '25-opt-stale': {
    state: SAGE,
    steps: async page => {
      await optimize(page);
      await page.selectOption('#o-target', { index: 2 });
      await settle(page);
    },
  },
  '26-blu-opt': { state: BLUE_MAGE, steps: optimize },
};

/* Turns off CSS animations and transitions and hides the text caret, from the first paint. */
const NO_MOTION_CSS =
  '*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }';

const errors = [];

/* One shot: a fresh context at `width` in `scheme`, the view's saved state, its steps, then the PNG. */
async function shoot(browser, { name, view, width, scheme }) {
  const context = await browser.newContext({ viewport: { width, height: VIEWPORT_HEIGHT }, colorScheme: scheme, reducedMotion: 'reduce' });
  if (!webFonts) await context.route(/fonts\.(googleapis|gstatic)\.com/, route => route.abort());
  await context.addInitScript(css => {
    document.addEventListener('DOMContentLoaded', () => {
      const style = document.createElement('style');
      style.textContent = css;
      document.head.append(style);
    });
  }, NO_MOTION_CSS);
  // seed the saved state once, so a reload inside the steps keeps what the page saved
  if (view.state)
    await context.addInitScript(
      ([key, saved]) => {
        if (!sessionStorage.getItem('shots-seeded')) {
          localStorage.setItem(key, saved);
          sessionStorage.setItem('shots-seeded', '1');
        }
      },
      [STORE_KEY, JSON.stringify(view.state)],
    );
  try {
    await shootInContext(context, { name, view, width, scheme });
  } finally {
    await context.close();
  }
}

/* The page part of shoot: open, wait for fonts, run the steps, then take the PNG. */
async function shootInContext(context, { name, view, width, scheme }) {
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(`${name} ${width} ${scheme}: ${error.message}`));
  await page.goto(pathToFileURL(pagePath).href);
  await page.evaluate(() => document.fonts.ready);
  await settle(page);
  await view.steps(page);

  // the solve time varies from run to run
  await page.evaluate(() => {
    const time = document.querySelector('#o-time');
    if (time) time.textContent = 'Solved in 0 ms.';
  });
  // the pointer off everything: a result drawn (or scrolled) under the pointer after Optimize can leave a table's
  // hovered column set (the table's data-col, src/index.html) with no later mouse event to clear it
  if (!view.keepHover) {
    await page.mouse.move(0, 0);
    await settle(page);
    await page.mouse.move(1, 1);
    await page.evaluate(() => {
      for (const table of document.querySelectorAll('table[data-col]')) table.dataset.col = '';
    });
  }
  await page.evaluate(() => document.fonts.ready);
  await settle(page);

  const sideways = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (sideways > 0) errors.push(`${name} ${width} ${scheme}: sideways scroll of ${sideways} px`);
  await page.screenshot({ path: resolve(outDir, `${name}-${width}-${scheme}.png`), fullPage: true, animations: 'disabled', caret: 'hide' });
}

// every view at every width and scheme, shot by a few workers in parallel
const shots = [];
for (const [name, view] of Object.entries(VIEWS)) {
  if (onlyPattern && !onlyPattern.test(name)) continue;
  for (const width of WIDTHS) for (const scheme of SCHEMES) shots.push({ name, view, width, scheme });
}
mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch();
let next = 0;
await Promise.all(
  Array.from({ length: workerCount }, async () => {
    while (next < shots.length) {
      const shot = shots[next++];
      // a step that fails (a selector gone after a change) costs that shot only
      await shoot(browser, shot).catch(error => errors.push(`${shot.name} ${shot.width} ${shot.scheme}: ${error.message.split('\n')[0]}`));
    }
  }),
);
await browser.close();

console.log(`${shots.length} shots in ${resolve(outDir)}`);
if (errors.length) {
  console.log(errors.join('\n'));
  process.exit(1);
}
