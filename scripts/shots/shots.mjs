/* Screenshots of every view of the page, for comparing a change's before and after (docs/engineering/testing.md,
   "Run by hand").

Opens a built page from file:// in Chromium (Playwright) and takes a full-page PNG of each view in VIEWS at 1440 and
960 px wide, in light and dark: 24 views, 96 shots, named `<view>-<width>-<scheme>.png`. Each view starts from a fresh
browser context with its saved state already in localStorage, then clicks its way to what it shows.

The shots are deterministic: Google Fonts are blocked (the page's fallback fonts; no network needed) and the fonts are
awaited, CSS animations and transitions are off, the mouse is moved to the page's top-left corner and the tables'
hovered column cleared before each shot (a leftover hover once lit a table column; views that show a hover keep it).
In a few shots a few dozen antialiased edge pixels (round buttons, a menu's edge) can be 1/255 apart between runs,
which compare.mjs's default threshold allows.

Without --page, it builds the page from src/ itself into <dir>/page.html, as the live page looks (no DEV badge or
footer branch line, which would differ between branches: scripts/build/build.mjs, buildReleasePage), and leaves
dist/index.html alone. Run it on the base commit and on the change, into two folders, to compare them; page.html stays
in each folder. --page shoots a page built elsewhere instead; one with the DEV badge still works, and the script warns.

Run: npm run shots -- --out <dir> [--page <file.html>] [--only <regex on view names>] [--workers 4] [--web-fonts]
Then compare two folders: npm run shots:compare -- <dirA> <dirB> (scripts/shots/compare.mjs).
Exits 1 on a JavaScript error in the page or a sideways scroll at either width.
*/

import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { buildReleasePage } from '../build/build.mjs';
import { STORE_KEY } from '../../src/ui/state.js';
import { flag, numberOption, option } from '../perf/args.mjs';

const WIDTHS = [1440, 960];
const SCHEMES = ['light', 'dark'];
const VIEWPORT_HEIGHT = 900;
// time for Alpine to redraw after a click or a state change, before the next step
const SETTLE_MS = 450;
const FILL_TIMEOUT_MS = 60_000;

const outDir = option('out');
if (!outDir) {
  console.error('error: --out <dir> is required (see the header of scripts/shots/shots.mjs)');
  process.exit(1);
}
// the page shot: --page, or one built here as the live page looks (dist/ is left as it is)
let pagePath;
if (option('page')) {
  pagePath = resolve(option('page'));
} else {
  pagePath = resolve(outDir, 'page.html');
  await buildReleasePage(pagePath);
  console.log(`built ${pagePath}`);
}
const onlyPattern = option('only') ? new RegExp(option('only')) : null;
const workerCount = numberOption('workers', 4);
const webFonts = flag('web-fonts');

if (readFileSync(pagePath, 'utf8').includes('class="build-badge"'))
  console.warn('warning: the page carries the DEV badge; build it with GITHUB_REF_NAME=main to compare across branches');

/* Saved states the views start from (the shape of src/ui/state.js; restoreState fills in the rest). */
const SAGE = { job: 'SGE', cap: 123, sync: true, level: 100, tab: 'browse', mathTab: 'piece' };
const WARRIOR = { job: 'WAR', cap: 123, sync: true, level: 90, tab: 'browse', mathTab: 'piece' };
const BLUE_MAGE = { job: 'BLU', cap: 123, sync: true, level: 80, tab: 'browse', mathTab: 'piece' };

/* A saved Sage sheet (the shape src/ui/sheet-storage.js reads): level 100, synced to 123, one set of crafted item level
   115 pieces with the weapon, hands and feet rows empty and every other row pinned, and an empty second set. */
const SAGE_ROWS = [
  ['weapon'],
  ['offhand'],
  ['head', 10880],
  ['body', 10887],
  ['hands'],
  ['legs', 10908],
  ['feet'],
  ['ear', 11048],
  ['neck', 11036],
  ['wrist', 11042],
  ['ring', 11054],
  ['ring', 11054],
];
const SAGE_SHEET = {
  v: 1,
  id: 's_sage',
  name: 'Bahamut T13 Healer',
  description: 'Week 1',
  job: 'SGE',
  level: 100,
  sync: { on: true, cap: 123 },
  sets: [
    {
      id: 'g_mine',
      name: 'Mine',
      description: 'Crafted body',
      pieces: SAGE_ROWS.map(([slot, gameId]) => (gameId ? { slot, gameId, stones: [] } : { slot })),
      meal: null,
      pinned: { pieces: [2, 3, 5, 7, 8, 9, 10, 11], meal: false },
      fillSettings: null,
      createdAt: 0,
      updatedAt: 0,
    },
    {
      id: 'g_empty',
      name: 'Empty',
      description: '',
      pieces: SAGE_ROWS.map(([slot]) => ({ slot })),
      meal: null,
      pinned: { pieces: [], meal: false },
      fillSettings: null,
      createdAt: 0,
      updatedAt: 0,
    },
  ],
  gameData: { commit: 'd9582a6', date: '2026-09-30' },
  createdAt: 0,
  updatedAt: 0,
};
const SHEETS = { tab: 'sheets', sheets: [SAGE_SHEET] };

const settle = page => page.waitForTimeout(SETTLE_MS);

/* Click `selector`, then let the page redraw. */
async function clickAndSettle(page, selector) {
  await page.click(selector);
  await settle(page);
}

/* Open the seeded sheet's set named `set` from the sheet manager. */
async function openSet(page, set = 'Mine') {
  await clickAndSettle(page, '#sh-list a.sname');
  await page.locator('#sh-sets a.sname', { hasText: set }).click();
  await page.waitForSelector('#sh-gear');
  await settle(page);
}

/* On a set page: press Fill and wait for its result. */
async function fill(page) {
  await page.click('#sh-fill');
  await page.waitForSelector('#sh-discard', { timeout: FILL_TIMEOUT_MS });
  await settle(page);
}

const noSteps = async () => {};

/* Each view: the saved state it opens with (null: nothing saved; `sheets` lists sheet records to save beside it) and
   the steps that lead to it. `keepHover`: the steps end on a hover the shot shows, so the mouse stays where it is. */
const VIEWS = {
  '01-sheets-empty': { state: null, steps: noSteps },
  '02-sheets-manager': { state: SHEETS, steps: noSteps },
  '03-sheet-page': { state: SHEETS, steps: page => clickAndSettle(page, '#sh-list a.sname') },
  '04-set-page': { state: SHEETS, steps: page => openSet(page) },
  '05-set-fill-result': {
    state: SHEETS,
    steps: async page => {
      await openSet(page);
      await fill(page);
    },
  },
  '06-set-food-menu': {
    state: SHEETS,
    steps: async page => {
      await openSet(page);
      await clickAndSettle(page, '#sh-meal-btn');
    },
  },
  '07-set-pick-menu': {
    state: SHEETS,
    steps: async page => {
      await openSet(page);
      await clickAndSettle(page, '#sh-gear tr[data-row="4"] [data-pick]');
    },
  },
  '08-set-filled-empty': {
    state: SHEETS,
    steps: async page => {
      await openSet(page, 'Empty');
      await fill(page);
      await clickAndSettle(page, '#sh-apply');
    },
  },
  '09-browse': { state: SAGE, steps: noSteps },
  '10-browse-filtered': {
    state: { ...SAGE, browse: { q: 'ward', min: 100, max: 400, lvl: 80, expOff: ['ARR'] } },
    steps: noSteps,
  },
  '11-browse-from-menu': {
    state: SAGE,
    keepHover: true,
    steps: async page => {
      await page.click('#b-from');
      await page.hover('[data-activity]');
      await settle(page);
    },
  },
  '12-browse-exp-menu': { state: SAGE, steps: page => clickAndSettle(page, '#b-exp') },
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
  '21-pld-browse': { state: { ...SAGE, job: 'PLD', browse: { type: 'offhand' } }, steps: noSteps },
  '22-browse-nojob': { state: { tab: 'browse' }, steps: noSteps },
  '24-browse-sorted': { state: SAGE, steps: page => clickAndSettle(page, '[data-sort="ilvl"]') },
  '26-blu-browse': { state: BLUE_MAGE, steps: noSteps },
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
  if (view.state) {
    const { sheets = [], ...settings } = view.state;
    const records = [
      [STORE_KEY, JSON.stringify(settings)],
      ...sheets.map(sheet => [`${STORE_KEY}:sheet:${sheet.id}`, JSON.stringify(sheet)]),
      ...(sheets.length ? [[`${STORE_KEY}:sheets`, JSON.stringify({ v: 1, order: sheets.map(sheet => sheet.id) })]] : []),
    ];
    await context.addInitScript(records => {
      if (!sessionStorage.getItem('shots-seeded')) {
        for (const [key, value] of records) localStorage.setItem(key, value);
        sessionStorage.setItem('shots-seeded', '1');
      }
    }, records);
  }
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

  // the pointer off everything: a result drawn (or scrolled) under the pointer after Fill can leave a table's
  // hovered column set (the table's data-col, src/partials/gear-page.html) with no later mouse event to clear it
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
