/* The screens the stress tool visits and how to reach and measure each. A screen is a list of views; a view is a place on
   the page (the sheet manager, a sheet's page, a set's page, the Gear browser, a dialog, an open menu) that the tool reaches
   with `reach`, measures with `measure`, and then opens each of its `menus`.

   A view is {id, label, fixture, reach(page, open), measure, menus, ...}:
   - fixture: which saved sheets the page opens on ('standard', 'extreme', 'empty', 'none' or 'failing', fixtures.mjs);
   - reach(page, open): puts the page on the view; `open` has the ids of the sheet and set the fixture names;
   - measure: what the probe measures (see measureView in probe.mjs), merged with the screen's `common`;
   - twin: another view that shows the same place with other content; the `stable` scopes must lay out the same in both;
   - stable: the scopes whose layout must not depend on content (names, jobs, numbers);
   - menus: [{id, open(page), selector, inPinnedHeader}], each opened, measured against the window, and shut again
     (`inPinnedHeader`: it opens inside the pinned header, so it may start under the header's bottom edge);
   - dialog: the selector of a dialog this view is (measured for fitting the window);
   - pinned: scroll to the pinned header before measuring (the set page);
   - focusWalk: Tab through the view and check each focus ring;
   - jobs: {open(page), pick(page, jobId), scope}: pick each of the 23 jobs and compare the scope (the Gear browser's strip).

   - states: [{id, apply(page)}], content the view is put through: the `stable` scopes must lay out as before, and a finding
     the base state did not have belongs to the state;
   - pinnedBar: the selector of a sticky bar that must stay at the top after scrolling;
   - widest: types the widest numbers into the page (run in the stress build);
   - mathBar: also measure the math bar (probe.mjs, math-rules.mjs).
   A screen may have `crossCheck(page)` (checks that span views, run on a page of its `crossFixture`) and `waiting` (a text:
   the screen is listed in the report and not visited, for a screen whose markup is being changed). The three math sub-tabs
   are screens of their own (math-piece, math-gcd, math-tiers). */

import { measureView } from './probe.mjs';
import { compareProbes } from './rules.mjs';
import { settle } from './session.mjs';

/* The controls every screen measures, the boxes that share rows, and the text that must fit. */
const CONTROLS = 'button, a[href], input:not([type="hidden"]), select, textarea, [role="button"][tabindex]';
const BOXES = ['input:not([type="checkbox"]):not([type="radio"]):not([type="hidden"])', 'select', '.multi-btn'];
const CLIPPED = 'td, th, button, label, .panel, .f, .callout, .chip, h2, h3, .startcard, .setpop';
const LABELS = [
  '.f > span:first-child:not(.toggle)',
  '.f-head > span:first-child',
  '.capline',
  '.tabs a',
  'button.primary',
  'button.chip',
  '.listhead h2',
  '.linkbtn',
];

/* The measure settings every view starts from; `scopes` and the rest of a view's own settings are added to it. */
const COMMON = { controls: CONTROLS, boxes: BOXES, clipped: CLIPPED, labels: LABELS };

/* The scope every view has: the title and the tab bar. */
const TOP = { top: '.pagetop' };

/* Waits for the page to have started and then for `selector`. */
async function ready(page, selector) {
  await page.waitForSelector('.wrap:not([x-cloak])', { timeout: 20000 });
  await page.waitForSelector(selector, { state: 'visible', timeout: 20000 });
}

/* Goes to the page's address `hash` the way a typed address does, and waits for `selector`. */
async function go(page, hash, selector) {
  await page.evaluate(address => {
    location.hash = address;
  }, hash);
  await ready(page, selector);
}

const sheetHash = open => `#/sheets/${open.sheetId}`;
const setHash = open => `#/sheets/${open.sheetId}/sets/${open.setId}`;

/* Clicks `button` until `menu` shows: a click can land while the page is still busy (Firefox under load), or on a menu that
   was closing, so one retry follows a click that opened nothing. */
async function clickUntilVisible(page, button, menu) {
  for (const timeout of [4000, 8000]) {
    await page.locator(button).first().scrollIntoViewIfNeeded();
    if (await page.locator(menu).first().isVisible()) {
      return;
    }
    await page.locator(button).first().click();
    const shown = await page
      .waitForSelector(menu, { state: 'visible', timeout })
      .then(() => true)
      .catch(() => false);
    if (shown) {
      return;
    }
  }
  throw new Error(`${menu} did not open after clicking ${button}`);
}

/* Opens the menu with button `button`, and waits for `menu` to show. */
const opener = (button, menu) => page => clickUntilVisible(page, button, menu);

/* The Sheets screen: the sheet manager, a sheet's page and the two dialogs. */
const sheets = {
  id: 'sheets',
  label: 'Sheets',
  views: [
    {
      id: 'manager',
      label: 'Sheet manager',
      fixture: 'standard',
      reach: page => go(page, '#/sheets', '#sh-list'),
      measure: { scopes: { ...TOP, head: '#sh-manager .listhead', list: '#sh-list' } },
      stable: ['top', 'head'],
      focusWalk: true,
      sweep: true,
    },
    {
      id: 'manager-extreme',
      label: 'Sheet manager, 29 sheets and the longest names',
      fixture: 'extreme',
      reach: page => go(page, '#/sheets', '#sh-list'),
      measure: { scopes: { ...TOP, head: '#sh-manager .listhead', list: '#sh-list' } },
      twin: 'manager',
      stable: ['top', 'head'],
    },
    {
      id: 'manager-empty',
      label: 'Sheet manager, no sheets',
      fixture: 'none',
      reach: page => go(page, '#/sheets', '#sh-empty'),
      measure: { scopes: { ...TOP, head: '#sh-manager .listhead', card: '#sh-empty' } },
      twin: 'manager',
      stable: ['top'],
    },
    {
      id: 'sheet',
      label: "A sheet's page",
      fixture: 'standard',
      reach: (page, open) => go(page, sheetHash(open), '#sh-sheet .sheetfields'),
      measure: {
        scopes: {
          ...TOP,
          crumb: '#sh-sheet .setline',
          banner: '#sh-sheet .sheettop',
          fields: '#sh-sheet .sheetfields',
          head: '#sh-sheet > .listhead',
          list: '#sh-sets',
        },
      },
      menus: [{ id: 'sheet switch', open: opener('#sh-sheet-switch', '#sh-sheet-menu'), selector: '#sh-sheet-menu' }],
      stable: ['top', 'fields', 'head'],
      focusWalk: true,
      sweep: true,
    },
    {
      id: 'sheet-extreme',
      label: "A sheet's page, 40 gear sets and the longest names",
      fixture: 'extreme',
      reach: (page, open) => go(page, sheetHash(open), '#sh-sheet .sheetfields'),
      measure: {
        scopes: {
          ...TOP,
          crumb: '#sh-sheet .setline',
          banner: '#sh-sheet .sheettop',
          fields: '#sh-sheet .sheetfields',
          head: '#sh-sheet > .listhead',
          list: '#sh-sets',
        },
      },
      menus: [{ id: 'sheet switch', open: opener('#sh-sheet-switch', '#sh-sheet-menu'), selector: '#sh-sheet-menu' }],
      twin: 'sheet',
      stable: ['top', 'fields', 'head'],
    },
    {
      id: 'sheet-empty',
      label: "A sheet's page, no gear sets and sync off",
      fixture: 'empty',
      reach: (page, open) => go(page, `#/sheets/${open.emptySheetId}`, '#sh-no-sets'),
      measure: {
        scopes: {
          ...TOP,
          crumb: '#sh-sheet .setline',
          banner: '#sh-sheet .sheettop',
          fields: '#sh-sheet .sheetfields',
          card: '#sh-no-sets',
        },
      },
      twin: 'sheet',
      stable: ['top', 'fields'],
    },
    {
      id: 'sheet-error',
      label: "A sheet's page, storage refuses to save",
      fixture: 'failing',
      reach: async (page, open) => {
        await go(page, sheetHash(open), '#sh-sheet .sheetfields');
        await page.fill('#sh-level', '51');
        await page.locator('#sh-level').blur();
        await page.waitForSelector('#sh-save-error', { state: 'visible', timeout: 5000 });
      },
      measure: { scopes: { ...TOP, banner: '#sh-save-error', fields: '#sh-sheet .sheetfields', head: '#sh-sheet > .listhead' } },
      twin: 'sheet',
      stable: ['top', 'fields', 'head'],
    },
    {
      id: 'dialog-new',
      label: 'New sheet dialog',
      fixture: 'standard',
      reach: async page => {
        await go(page, '#/sheets', '#sh-new');
        await page.click('#sh-new');
        await page.waitForSelector('#sh-dialog', { state: 'visible', timeout: 5000 });
      },
      measure: { scopes: { dialog: '#sh-dialog', fields: '#sh-dialog .dlgrow', buttons: '#sh-dialog .dlgbtns' } },
      dialog: '#sh-dialog',
      sweep: true,
    },
    {
      id: 'dialog-copy',
      label: 'Copy sheet dialog',
      fixture: 'standard',
      reach: async (page, open) => {
        await go(page, sheetHash(open), '#sh-copy');
        await page.click('#sh-copy');
        await page.waitForSelector('#sh-dialog', { state: 'visible', timeout: 5000 });
      },
      measure: { scopes: { dialog: '#sh-dialog', fields: '#sh-dialog .dlgrow', buttons: '#sh-dialog .dlgbtns' } },
      dialog: '#sh-dialog',
      sweep: true,
    },
  ],
};

/* The set page's measure: the sticky header in parts, the gear table, the item names and the rows under the pinned header. */
const SET_MEASURE = {
  scopes: { ...TOP, crumb: '.shead .setline', actions: '.shead .setactions', bar: '.shead .tbar', table: '#sh-gear' },
  names: '#sh-gear .same-btn > span:first-child',
  pinned: { header: '.shead', columns: '#sh-gear thead th' },
  rows: { rows: '#sh-gear tbody tr[data-row]', marker: '[data-pick]' },
};

/* The set menus: the set switch, a piece's list, the Food list and the Auto-fill settings. */
const SET_MENUS = [
  { id: 'set switch', open: opener('#sh-set-switch', '#sh-set-menu'), selector: '#sh-set-menu', inPinnedHeader: true },
  { id: 'piece menu', open: opener('#sh-gear [data-pick]:not([aria-disabled="true"])', '.pick-menu'), selector: '.pick-menu' },
  { id: 'meal menu', open: opener('#sh-meal-btn', '#sh-meal-menu'), selector: '#sh-meal-menu' },
  { id: 'auto-fill settings', open: opener('#sh-settings', '#sh-settings-dialog'), selector: '#sh-settings-dialog', inPinnedHeader: true },
];

/* The set page screen: the page itself, with a suggestion, with the longest content, and empty. */
const set = {
  id: 'set',
  label: 'Set page',
  views: [
    {
      id: 'set',
      label: "A gear set's page",
      fixture: 'standard',
      reach: (page, open) => go(page, setHash(open), '#sh-gear'),
      measure: SET_MEASURE,
      menus: SET_MENUS,
      stable: ['top', 'actions'],
      pinned: true,
      focusWalk: true,
      sweep: true,
    },
    {
      id: 'set-suggestion',
      label: "A gear set's page with an Auto-fill suggestion",
      fixture: 'standard',
      reach: async (page, open) => {
        await go(page, `#/sheets/${open.sheetId}/sets/${open.fillSetId}`, '#sh-fill');
        await page.click('#sh-fill');
        await page.waitForSelector('.shead.sug', { timeout: 60000 });
      },
      measure: SET_MEASURE,
      pinned: true,
    },
    {
      id: 'set-extreme',
      label: "A gear set's page, the longest names",
      fixture: 'extreme',
      reach: (page, open) => go(page, setHash(open), '#sh-gear'),
      measure: SET_MEASURE,
      twin: 'set',
      stable: ['top', 'actions'],
      pinned: true,
    },
    {
      id: 'set-empty',
      label: "A gear set's page, no pieces",
      fixture: 'empty',
      reach: (page, open) => go(page, `#/sheets/${open.emptySetSheetId}/sets/${open.setId}`, '#sh-gear'),
      measure: SET_MEASURE,
      twin: 'set',
      stable: ['top', 'actions'],
      pinned: true,
    },
  ],
};

/* The Gear browser screen. */
const gear = {
  id: 'gear',
  label: 'Gear browser',
  views: [
    {
      id: 'gear',
      label: 'Gear browser',
      fixture: 'none',
      reach: page => go(page, '#/gear', '#gear-table tbody tr'),
      measure: {
        scopes: {
          ...TOP,
          strip: '.jobstrip',
          title: '#tab-browse .titleline',
          filters: '#tab-browse .browse-filters',
          pager: '#b-pages',
          columns: '#gear-table thead',
        },
        names: '#gear-table tbody td:nth-child(2) > *',
      },
      menus: [
        { id: 'job menu', open: opener('#job-menu-btn', '#job-menu'), selector: '#job-menu' },
        { id: 'slot menu', open: opener('#b-slot', '#b-slots'), selector: '#b-slots' },
        { id: 'expansion menu', open: opener('#b-exp', '#b-exp-menu'), selector: '#b-exp-menu' },
        { id: 'gear categories menu', open: opener('#b-from', '#b-from-menu'), selector: '#b-from-menu' },
      ],
      jobs: {
        scope: 'strip',
        open: async page => {
          if (!(await page.locator('#job-menu').isVisible())) {
            await page.click('#job-menu-btn');
          }
          await page.waitForSelector('#job-menu', { state: 'visible', timeout: 5000 });
        },
        pick: (page, jobId) => page.click(`#job-menu [data-job-id="${jobId}"]`),
      },
      widest: async page => {
        await page.check('#sync');
        await page.fill('#cap', '8888');
        await page.fill('#b-min', '8888');
        await page.fill('#b-max', '8888');
        await page.fill('#b-lvl', '888');
      },
      stable: ['top', 'strip', 'title', 'filters'],
      focusWalk: true,
      sweep: true,
    },
    {
      id: 'gear-empty',
      label: 'Gear browser, no match',
      fixture: 'none',
      reach: async page => {
        await go(page, '#/gear', '#gear-table tbody tr');
        await page.fill('#b-q', 'zzzzzzzz');
        await page.waitForSelector('#gear-table td.empty', { timeout: 10000 });
      },
      measure: {
        scopes: {
          ...TOP,
          strip: '.jobstrip',
          title: '#tab-browse .titleline',
          filters: '#tab-browse .browse-filters',
          empty: '#gear-table td.empty',
        },
      },
      twin: 'gear',
      stable: ['top', 'strip', 'filters'],
    },
  ],
};

/* The app's settings store, read through the page's read-only test hook (src/main.js, window.gsaDebug). */
const APP = 'window.gsaDebug.app';

/* A function that runs `code` (statements using `app`, the page's settings facade: its edit actions write) in the page. */
const setApp = code => page => page.evaluate(`(() => { const app = ${APP}; ${code} })()`);

/* The content states of Stat Allocation's bar: what its chips and boxes say must not change where its controls sit. */
const BAR_STATES = [
  { id: 'sync off, level 100', apply: setApp("app.setJob('PLD'); app.editPanel({ sync: false, level: 100, cap: null });") },
  { id: 'sync on, no cap', apply: setApp("app.setJob('PLD'); app.editPanel({ sync: true, level: 85, cap: null });") },
  {
    id: 'a weapon, five melds',
    apply: setApp("app.setJob('WHM'); app.editPanel({ sync: true, level: 85, cap: 270 }); app.editPiece({ slot: 'weapon', slots: 5 });"),
  },
  {
    id: 'Beastmaster ring, level 50',
    apply: setApp("app.setJob('BST'); app.editPanel({ sync: true, level: 50, cap: 130 }); app.editPiece({ slot: 'ring', slots: 0 });"),
  },
  {
    id: 'the widest numbers',
    apply: setApp("app.setJob('PLD'); app.editPanel({ sync: true, level: 100, cap: 795 }); app.editPiece({ slot: 'body', slots: 5 });"),
  },
];

/* The widest level and item level typed into Stat Allocation's bar (the stress build's limits). */
const MATH_PIECE_WIDEST = setApp("app.setJob('PLD'); app.editPanel({ sync: true, level: app.jobCtx.maxLevel, cap: 8888 });");

/* The widest level typed into a level box (the stress build's limit). */
const MATH_LEVEL_WIDEST = setApp('app.editPanel({ level: app.jobCtx.maxLevel });');

/* Opens the Job menu of the math bar if it is shut (picking a job may close it). */
const openMathJobMenu = page => clickUntilVisible(page, '#m-job-btn', '#m-job-menu');

/* Picks job `jobId` in the math bar's Job menu. */
const pickMathJob = (page, jobId) => page.click(`#m-job-menu [data-job-id="${jobId}"]`);

/* The scopes every math view measures: the title, the whole sticky bar, the sub-tab strip, the ? button and the controls row. */
const MATH_SCOPES = { ...TOP, mathbar: '#m-bar', subtabs: '#m-bar .subtabs', help: '#m-bar .helpwrap', bar: '.barrow' };

/* The measure settings every math view shares: the math bar's own rules, and the labels of its controls. */
const MATH_MEASURE = { mathBar: true, labels: [...LABELS, '#m-job-label', '#p-piece-label', '#p-sync-label', '.mctl-head'] };

/* The Job menu of the math bar. */
const MATH_JOB_MENU = { id: 'job menu', open: opener('#m-job-btn', '#m-job-menu'), selector: '#m-job-menu', inPinnedHeader: true };

/* The geometry of the parts the sub-tab switch must leave where they are: {job, help, tabs} as [left, top, width, height] or null. */
const subTabGeometry = page =>
  page.evaluate(() => {
    const box = selector => {
      const element = document.querySelector(selector);
      if (!element?.offsetWidth) {
        return null;
      }
      const rect = element.getBoundingClientRect();
      return [
        Math.round(rect.left * 10) / 10,
        Math.round(rect.top * 10) / 10,
        Math.round(rect.width * 10) / 10,
        Math.round(rect.height * 10) / 10,
      ];
    };
    return {
      job: box('#m-job-wrap'),
      help: box('#m-help'),
      tabs: [...document.querySelectorAll('[data-sub]')].map(element => box(`[data-sub="${element.dataset.sub}"]`)),
    };
  });

/* How far the page is scrolled before a sub-tab is clicked, in px. */
const SUB_TAB_SCROLLED_PX = 120;

/* The selector each sub-tab waits for. */
const SUB_TAB_READY = { piece: '#p-slot', tiers: '#t-level', gcd: '#g-level' };

/* The clicks of the sub-tab check, in order, for the sub-tab that is open when it starts: each is { sub, step } with the step's name
   ('warm-up' is not checked or measured; 'start' and 'end' measure the layout of Stat Allocation, 'tiers' and 'gcd' the geometry of
   their own). Every click goes to a sub-tab other than the open one, because clicking the open sub-tab keeps the scroll by design
   (nothing opens), so it would never start at the top: when Stat Allocation is open, a warm-up click on Substat tiers comes first. */
export function subTabVisits(openSub) {
  const visits = [
    { sub: 'piece', step: 'start' },
    { sub: 'tiers', step: 'tiers' },
    { sub: 'gcd', step: 'gcd' },
    { sub: 'piece', step: 'end' },
  ];
  return openSub === visits[0].sub ? [{ sub: 'tiers', step: 'warm-up' }, ...visits] : visits;
}

/* Goes Stat Allocation, Substat tiers, GCD Scaling and back, and reports what is wrong: a sub-tab opened by a click starts at the
   top of the page (the page was scrolled before the click), the sub-tabs stay put, the Job box is where it was on Substat tiers
   and absent on GCD Scaling (it has no job), and the way back gives the layout it started with. */
async function subTabsStartAtTop(page) {
  const found = [];
  const open = async (sub, checked) => {
    // scrolled a little before the click (a page too short to scroll stays at 0), so that a sub-tab that kept the depth shows
    await page.evaluate(scrolledPx => window.scrollTo(0, scrolledPx), SUB_TAB_SCROLLED_PX);
    await page.click(`[data-sub="${sub}"]`);
    await page.waitForSelector(SUB_TAB_READY[sub], { state: 'visible', timeout: 10000 });
    await settle(page);
    const top = await page.evaluate(() => window.scrollY);
    if (checked && top !== 0) {
      found.push({ rule: 'tabs-start-at-top', detail: `${sub} opens at ${top} px, not at the top`, where: 'math' });
    }
  };
  const config = probeConfig(MATH_VIEWS[0]);
  const openSub = await page.evaluate(() => document.querySelector('[data-sub][aria-current="page"]')?.dataset.sub ?? null);
  const geometry = {};
  let start;
  let end;
  for (const { sub, step } of subTabVisits(openSub)) {
    await open(sub, step !== 'warm-up');
    if (step === 'start') {
      geometry.piece = await subTabGeometry(page);
      start = await page.evaluate(measureView, config);
    } else if (step === 'tiers' || step === 'gcd') {
      geometry[step] = await subTabGeometry(page);
    } else if (step === 'end') {
      end = await page.evaluate(measureView, config);
    }
  }
  if (JSON.stringify(geometry.piece.job) !== JSON.stringify(geometry.tiers.job)) {
    found.push({
      rule: 'tabs-start-at-top',
      detail: `the Job box is at ${JSON.stringify(geometry.piece.job)} on Stat Allocation and ${JSON.stringify(geometry.tiers.job)} on Substat tiers`,
      where: 'math',
    });
  }
  if (geometry.gcd.job) {
    found.push({ rule: 'tabs-start-at-top', detail: 'the Job box shows on GCD Scaling', where: 'math' });
  }
  for (const sub of ['tiers', 'gcd']) {
    geometry[sub].tabs.forEach((box, index) => {
      const was = geometry.piece.tabs[index];
      if (Math.abs(was[0] - box[0]) > 0.6 || Math.abs(was[1] - box[1]) > 0.6) {
        found.push({
          rule: 'tabs-start-at-top',
          detail: `sub-tab ${index + 1} moves from ${was.slice(0, 2)} to ${box.slice(0, 2)} on ${sub}`,
          where: 'math',
        });
      }
    });
  }
  const moved = compareProbes(start, end, ['top', 'subtabs', 'bar']);
  if (moved.length) {
    found.push({ rule: 'tabs-start-at-top', detail: `a round trip changes the layout: ${moved.slice(0, 3).join('; ')}`, where: 'math' });
  }
  return found;
}

/* The math views, in the order of the sub-tabs. */
const MATH_VIEWS = [
  {
    id: 'math-piece',
    label: 'Stat Allocation',
    fixture: 'none',
    reach: page => go(page, '#/math/piece', '#p-slot'),
    measure: { ...MATH_MEASURE, scopes: MATH_SCOPES },
    menus: [
      MATH_JOB_MENU,
      { id: 'substats chip', open: opener('#p-piece-chip', '#p-piece-pop'), selector: '#p-piece-pop', inPinnedHeader: true },
      { id: 'sync chip', open: opener('#p-sync-chip', '#p-sync-pop'), selector: '#p-sync-pop', inPinnedHeader: true },
      { id: 'help', open: opener('#m-help', '#m-help-pop'), selector: '#m-help-pop', inPinnedHeader: true, popup: true },
    ],
    jobs: { scope: 'bar', open: openMathJobMenu, pick: pickMathJob },
    states: BAR_STATES,
    widest: MATH_PIECE_WIDEST,
    pinnedBar: '#m-bar',
    stable: ['top', 'subtabs', 'bar'],
    focusWalk: true,
    sweep: true,
  },
  {
    id: 'math-gcd',
    label: 'GCD Scaling',
    fixture: 'none',
    reach: page => go(page, '#/math/gcd', '#g-level'),
    measure: { ...MATH_MEASURE, scopes: MATH_SCOPES },
    widest: MATH_LEVEL_WIDEST,
    pinnedBar: '#m-bar',
    stable: ['top', 'subtabs', 'bar'],
    focusWalk: true,
    sweep: true,
  },
  {
    id: 'math-tiers',
    label: 'Substat tiers',
    fixture: 'none',
    reach: page => go(page, '#/math/tiers', '#t-level'),
    measure: { ...MATH_MEASURE, scopes: MATH_SCOPES },
    menus: [MATH_JOB_MENU],
    jobs: { scope: 'bar', open: openMathJobMenu, pick: pickMathJob },
    widest: MATH_LEVEL_WIDEST,
    pinnedBar: '#m-bar',
    stable: ['top', 'subtabs', 'bar'],
    focusWalk: true,
    sweep: true,
  },
];

/* A math screen: one sub-tab of How the math works. */
const mathScreen = (view, extra = {}) => ({ id: view.id, label: `How the math works, ${view.label}`, views: [view], ...extra });

/* Every screen, in the order of --screens. */
export const SCREENS = Object.freeze([
  sheets,
  set,
  gear,
  mathScreen(MATH_VIEWS[0], { crossCheck: subTabsStartAtTop, crossFixture: 'none' }),
  mathScreen(MATH_VIEWS[1]),
  mathScreen(MATH_VIEWS[2]),
]);

/* The screen ids a run visits when none is named: every screen that is not waiting. */
export function defaultScreenIds() {
  return SCREENS.filter(screen => !screen.waiting).map(screen => screen.id);
}

/* A view's whole measure settings: the common ones, then its own (its scopes added, its other fields over them). */
export function measureOf(view) {
  return { ...COMMON, ...view.measure };
}

/* The page-side config of a view (plain data: no functions). */
export function probeConfig(view) {
  const { scopes, controls, boxes, clipped, labels, names, pinned, rows, mathBar } = measureOf(view);
  return { scopes, controls, boxes, clipped, labels, names: names ?? null, pinned: pinned ?? null, rows: rows ?? null, mathBar: !!mathBar };
}
