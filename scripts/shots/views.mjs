/* The views of the page that the screenshot scripts shoot: scripts/shots/shots.mjs (before and after a change, by hand) and
   tests/visual/ (the baselines CI compares). Each view is a saved state to open the page with and the clicks that lead to
   what it shows. */

import { STORE_KEY } from '../../src/ui/store-key.js';

// time for the page to redraw after a click or a state change, before the next step
export const SETTLE_MS = 450;
// longest wait, in milliseconds, for an Auto-fill to finish before a view's shot is taken
const FILL_TIMEOUT_MS = 60_000;

/* Saved states the views start from (the shape of src/ui/state.js; restoreState fills in the rest). */
const SAGE = { job: 'SGE', cap: 123, sync: true, level: 100, tab: 'browse', mathTab: 'piece' };
const WARRIOR = { job: 'WAR', cap: 123, sync: true, level: 90, tab: 'browse', mathTab: 'piece' };
const BLUE_MAGE = { job: 'BLU', cap: 123, sync: true, level: 80, tab: 'browse', mathTab: 'piece' };

/* A saved Sage sheet (the shape src/ui/sheets/storage.js reads): level 100, synced to 123, one set of crafted item level
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

/* Waits SETTLE_MS for the page to redraw; returns a promise. `page` is a Playwright page. */
export const settle = page => page.waitForTimeout(SETTLE_MS);

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

/* On a set page: press Auto-fill and wait for its result. */
async function fill(page) {
  await page.click('#sh-fill');
  await page.waitForSelector('#sh-discard', { timeout: FILL_TIMEOUT_MS });
  await settle(page);
}

const noSteps = async () => {};

/* Each view: the saved state it opens with (null: nothing saved; `sheets` lists sheet records to save beside it) and
   the steps that lead to it. `keepHover`: the steps end on a hover the shot shows, so the mouse stays where it is. */
export const VIEWS = {
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
    state: { ...SAGE, tab: 'math', mathTab: 'piece', piece: { ilvl: 300, slot: 'body', subs: ['crit', 'sps'] } },
    steps: page => clickAndSettle(page, '#p-steps summary'),
  },
  '14-math-piece-help': { state: { ...SAGE, tab: 'math', mathTab: 'piece' }, steps: page => clickAndSettle(page, '#m-help') },
  '15-math-piece-off': { state: { ...SAGE, sync: false, tab: 'math', mathTab: 'piece' }, steps: noSteps },
  '16-math-piece-level': {
    state: { ...WARRIOR, sync: false, tab: 'math', mathTab: 'piece', piece: { ilvl: null, slot: 'weapon', subs: ['ten', 'det'] } },
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

/* The localStorage entries (pairs of key and JSON text) that make a page open in `state`, a view's saved state: the
   settings, then each sheet record and the sheet order. Empty for no saved state. */
function seedRecords(state) {
  if (!state) {
    return [];
  }
  const { sheets = [], ...settings } = state;
  return [
    [STORE_KEY, JSON.stringify(settings)],
    ...sheets.map(sheet => [`${STORE_KEY}:sheet:${sheet.id}`, JSON.stringify(sheet)]),
    ...(sheets.length ? [[`${STORE_KEY}:sheets`, JSON.stringify({ v: 1, order: sheets.map(sheet => sheet.id) })]] : []),
  ];
}

/* Before a page opens in `context`: turns off animations from the first paint and seeds the view's saved state (once, so
   a reload inside the steps keeps what the page saved). */
export async function prepareContext(context, view) {
  await context.addInitScript(css => {
    document.addEventListener('DOMContentLoaded', () => {
      const style = document.createElement('style');
      style.textContent = css;
      document.head.append(style);
    });
  }, NO_MOTION_CSS);
  const records = seedRecords(view.state);
  if (records.length) {
    await context.addInitScript(records => {
      if (!sessionStorage.getItem('shots-seeded')) {
        for (const [key, value] of records) {
          localStorage.setItem(key, value);
        }
        sessionStorage.setItem('shots-seeded', '1');
      }
    }, records);
  }
}

/* On a page that has just loaded: waits for the fonts, runs the view's steps, and leaves the pointer off everything, so
   the page is ready for its shot. */
export async function openView(page, view) {
  await page.evaluate(() => document.fonts.ready);
  await settle(page);
  await view.steps(page);

  // the pointer off everything: a result drawn (or scrolled) under the pointer after Auto-fill can leave a table's
  // hovered column set (the table's data-col, src/partials/gear-page.html) with no later mouse event to clear it
  if (!view.keepHover) {
    await page.mouse.move(0, 0);
    await settle(page);
    await page.mouse.move(1, 1);
    await page.evaluate(() => {
      for (const table of document.querySelectorAll('table[data-col]')) {
        table.dataset.col = '';
      }
    });
  }
  await page.evaluate(() => document.fonts.ready);
  await settle(page);
}

/* The address a view opens at: the page's file URL plus the hash of its tab (src/ui/router/routes.js; a bare address
   opens Sheets whatever tab the saved state names). */
export function viewUrl(pageUrl, view) {
  const { tab, mathTab = 'piece' } = view.state ?? {};
  if (tab === 'browse') {
    return `${pageUrl}#/gear`;
  }
  if (tab === 'math') {
    return `${pageUrl}#/math/${mathTab}`;
  }
  return pageUrl;
}
