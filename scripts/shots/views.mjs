/* The views of the page that the screenshot scripts shoot: scripts/shots/shots.mjs (before and after a change, by hand) and
   tests/visual/ (the baselines CI compares). Each view is a saved state to open the page with and the clicks that lead to
   what it shows. */

import { STORE_KEY } from '../../src/ui/store-key.ts';

// time for the page to redraw after a click or a state change, before the next step
export const SETTLE_MS = 450;
// longest wait, in milliseconds, for an Auto-fill to finish before a view's shot is taken
const FILL_TIMEOUT_MS = 60_000;
// longest wait, in milliseconds, for the note after an action to clear itself (the page's own clock, NOTE_MS in
// src/ui/elements/app/note-timer.ts, is 6000) and for the page to stop moving after the scroll to the top
const NOTE_TIMEOUT_MS = 15_000;
const LAYOUT_TIMEOUT_MS = 10_000;
// how many animation frames in a row the page and its open layers must keep their places to count as settled
const STILL_FRAMES = 3;

/* Saved states the views start from (the shape of src/ui/state.ts; restoreState fills in the rest). */
const SAGE = { job: 'SGE', cap: 123, sync: true, level: 100, tab: 'browse', mathTab: 'piece' };
const WARRIOR = { job: 'WAR', cap: 123, sync: true, level: 90, tab: 'browse', mathTab: 'piece' };
const BLUE_MAGE = { job: 'BLU', cap: 123, sync: true, level: 80, tab: 'browse', mathTab: 'piece' };

/* A saved Sage sheet (the shape src/ui/sheets/storage.ts reads): level 100, synced to 123, one set of crafted item level
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

// the set page's head row (the row's index in the table) and its first materia chip
const HEAD_CHIP = '[data-chip="2:0"]';

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
    state: { ...SAGE, browse: { q: 'robe', min: 100, max: 400, lvl: 80, expOff: ['ARR'] } },
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
      // the Haste choice is a <gsa-select>: open its list, take the third option
      await clickAndSettle(page, '#g-haste');
      await page.locator('#g-haste-list [role="option"]').nth(2).click();
      await settle(page);
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
  '27-sheets-new-dialog': { state: SHEETS, steps: page => clickAndSettle(page, '#sh-new') },
  '28-sheet-edit-dialog': {
    state: SHEETS,
    steps: async page => {
      await clickAndSettle(page, '#sh-list a.sname');
      await clickAndSettle(page, '#sh-edit');
    },
  },
  '29-sheets-delete-question': {
    state: SHEETS,
    steps: page => clickAndSettle(page, '#sh-list tbody tr:nth-of-type(1) .rowacts [data-action="delete"]'),
  },
  '30-set-edit-dialog': {
    state: SHEETS,
    steps: async page => {
      await openSet(page);
      await clickAndSettle(page, '#sh-set-edit');
    },
  },
  '31-set-settings-popover': {
    state: SHEETS,
    steps: async page => {
      await openSet(page);
      await clickAndSettle(page, '#sh-settings');
    },
  },
  '32-set-rank-note': {
    state: SHEETS,
    steps: async page => {
      await openSet(page);
      await clickAndSettle(page, '#sh-settings');
      await clickAndSettle(page, '#sh-settings-dialog .shelp');
    },
  },
  '33-set-materia-menu': {
    state: SHEETS,
    steps: async page => {
      await openSet(page);
      await clickAndSettle(page, HEAD_CHIP);
    },
  },
  '34-set-materia-draft': {
    state: SHEETS,
    steps: async page => {
      await openSet(page);
      await clickAndSettle(page, HEAD_CHIP);
      await clickAndSettle(page, '.matpop button[data-stone]:not([disabled])');
    },
  },
  '35-set-leave-question': {
    state: SHEETS,
    steps: async page => {
      await openSet(page);
      await clickAndSettle(page, HEAD_CHIP);
      await clickAndSettle(page, '.matpop button[data-stone]:not([disabled])');
      await clickAndSettle(page, '#sh-set .setcrumb a:nth-of-type(2)');
    },
  },
  '36-browse-job-menu': { state: SAGE, steps: page => clickAndSettle(page, '#job-menu-btn') },
  '37-browse-slot-menu': { state: SAGE, steps: page => clickAndSettle(page, '#b-slot') },
  '38-math-job-menu': { state: { ...SAGE, tab: 'math', mathTab: 'piece' }, steps: page => clickAndSettle(page, '#m-job-btn') },
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
    await context.addInitScript(seededRecords => {
      if (!sessionStorage.getItem('shots-seeded')) {
        for (const [key, value] of seededRecords) {
          localStorage.setItem(key, value);
        }
        sessionStorage.setItem('shots-seeded', '1');
      }
    }, records);
  }
}

/* Waits until the note after an action (the toast of the page, `#sh-toast`) has cleared itself: a timed note in a shot would
   make the shot depend on timing. Returns a promise; `page` is a Playwright page. */
async function waitForNoNote(page) {
  await page.waitForFunction(
    () => {
      const note = document.querySelector('#sh-toast');
      return !note || note.textContent.trim() === '';
    },
    null,
    { timeout: NOTE_TIMEOUT_MS },
  );
}

/* Scrolls the window to the top and waits until the page has stopped moving: the scroll is at 0 and, for STILL_FRAMES
   animation frames in a row, the page's height and every open layer (a Zag popover or menu, an open dialog) keep their
   places. A full-page shot of a window left scrolled by a click (the click that opens a menu or a steps summary scrolls
   its target into view) draws the sticky parts (the table header, the sub-tab and controls bar) at the scroll offset, so
   the page looks torn; and Zag shows a popover a frame before it places it. Returns a promise; `page` is a Playwright
   page. */
async function scrollToTopAndSettle(page) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForFunction(
    stillFrames => {
      window.__shotLayout = window.__shotLayout ?? { key: '', still: 0 };
      const state = window.__shotLayout;
      const layers = document.querySelectorAll('[data-part="positioner"], [popover]:popover-open, dialog[open]');
      const key = JSON.stringify([
        window.scrollY,
        document.documentElement.scrollHeight,
        ...[...layers].map(layer => {
          const box = layer.getBoundingClientRect();
          return [layer.id, box.x, box.y, box.width, box.height];
        }),
      ]);
      state.still = key === state.key ? state.still + 1 : 0;
      state.key = key;
      return window.scrollY === 0 && state.still >= stillFrames;
    },
    STILL_FRAMES,
    { polling: 'raf', timeout: LAYOUT_TIMEOUT_MS },
  );
}

/* Takes the sticky parts of the page (the set page's header and table header, the math bar, the ladder header, a menu's
   group heading) out of the compositor's hands: each gets `position: relative` and no offsets (a `top` would move a relative
   box), which puts it where `sticky` already has it, since the window is at the top and every sticky part sits at its own
   place there. A sticky box at a fractional offset (the set page's header is at y 111.90625) is sometimes drawn into its own
   layer and sometimes into the page's, and the text in it then lands on a slightly different subpixel: a few hundred pixels
   of antialiasing differed between two runs of one commit (the set page's header and column names, most often with a dialog
   open and four workers busy). A box with no sticky position has one way to be drawn. Call it with the window at the top,
   after the last step. Returns a promise; `page` is a Playwright page. */
async function leaveStickyPartsInPlace(page) {
  await page.evaluate(() => {
    for (const element of document.querySelectorAll('*')) {
      if (getComputedStyle(element).position === 'sticky') {
        element.style.position = 'relative';
        element.style.inset = 'auto';
      }
    }
  });
}

/* On a page that has just loaded: waits for the fonts, runs the view's steps, waits out any timed note, scrolls to the
   top, and leaves the pointer off everything, so the page is ready for its shot. */
export async function openView(page, view) {
  await page.evaluate(() => document.fonts.ready);
  await settle(page);
  await view.steps(page);
  await waitForNoNote(page);
  await scrollToTopAndSettle(page);

  // the pointer off everything: a result drawn (or scrolled) under the pointer after Auto-fill can leave a table's
  // hovered column set (the table's data-col) with no later mouse event to clear it
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
  await leaveStickyPartsInPlace(page);
  await page.evaluate(() => document.fonts.ready);
  await settle(page);
}

/* The address a view opens at: the page's file URL plus the hash of its tab (src/ui/router/routes.ts; a bare address
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
