// Navigation helpers (each waits for a concrete condition, never a fixed sleep): the settings panel, tabs, Auto-fill,
// the saved state.

import type { BrowserContext, Locator, Page } from 'playwright';
import { allExpansions } from '../checks/gear-browser/filters.ts';
import { ACTIVITY_KEYS_BY_SECTION, ACTIVITY_LABEL, ACTIVITY_SECTION, NAV_TIMEOUT, STORE_KEY, TIMEOUT } from './constants.ts';
import { check, expect, placedByZag, poll, same } from './expect.ts';
import { afterTwoFramesAndATask } from './layer-wait.ts';
import { selectValue } from './select.ts';

/** A new page of `context` with the smoke test's timeouts: TIMEOUT for any wait, NAV_TIMEOUT for loads and reloads. */
export async function newPage(context: BrowserContext) {
  const page = await context.newPage();
  page.setDefaultTimeout(TIMEOUT);
  page.setDefaultNavigationTimeout(NAV_TIMEOUT);
  return page;
}

/** The selectors of the Job and sync fields on the Gear browser (the strip) and on Stat Allocation (the bar's Job menu and the
 * Sync settings popover). The Sheets tab has none. */
/** The selectors of the fields of a tab's Job and sync panel. */
interface PanelFields {
  level: string;
  cap: string;
  sync: string;
  jobButton: string;
  jobMenu: string;
}
const STRIP_FIELDS: PanelFields = { level: '#level', cap: '#cap', sync: '#sync', jobButton: '#job-menu-btn', jobMenu: '#job-menu' };
const MATH_FIELDS: PanelFields = { level: '#p-level', cap: '#p-cap', sync: '#p-sync', jobButton: '#m-job-btn', jobMenu: '#m-job-menu' };

/** The fields of the open tab. */
async function panelFields(pg: Page): Promise<PanelFields> {
  const tab = await pg.locator('[data-tab][aria-current="page"]').getAttribute('data-tab');
  return tab === 'math' ? MATH_FIELDS : STRIP_FIELDS;
}

/** Open math sub-tab `sub` ('piece', 'gcd' or 'tiers') if another one is open. */
async function openSub(pg: Page, sub: string) {
  if ((await pg.locator(`[data-sub=${sub}]`).getAttribute('aria-current')) === 'page') {
    return;
  }
  await pg.click(`[data-sub=${sub}]`);
  await expect(pg.locator(`#tab-${sub}`)).toBeVisible();
}

/** Make the open tab's Job box reachable: the Gear browser's strip, or the Job box of the open math sub-tab (Stat Allocation's, or
 * Substat tiers' own: GCD Scaling has none, so Stat Allocation is opened then). With `piece`, Stat Allocation's own panel is wanted
 * (its Job box and Sync settings), so that sub-tab is opened. Returns the tab's fields. The Sheets tab has none. */
async function openSettings(pg: Page, { piece = false } = {}): Promise<PanelFields> {
  if (await pg.locator('[data-tab=sheets][aria-current="page"]').count()) {
    return STRIP_FIELDS;
  }
  const fields = await panelFields(pg);
  if (fields === MATH_FIELDS) {
    if (piece || (await pg.locator('[data-sub=gcd]').getAttribute('aria-current')) === 'page') {
      await openSub(pg, 'piece');
    }
  }
  await expect(pg.locator(fields.jobButton)).toBeVisible();
  return fields;
}

/** The Level, Synced IL and IL Sync fields of the open tab, reachable: on Stat Allocation they sit in the Sync settings popover,
 * which is opened if it is shut. Returns the tab's fields. */
export async function openSync(pg: Page) {
  const fields = await openSettings(pg, { piece: true });
  if (fields === MATH_FIELDS && !(await pg.locator('#p-sync-pop').isVisible())) {
    await pg.click('#p-sync-chip');
    await expect(pg.locator('#p-sync-pop')).toBeVisible();
  }
  return fields;
}

/** Open Stat Allocation's Substats & materia popover (the 1st and 2nd substat and Materia slots menus are in it), if it is shut. */
export async function openPieceMenus(pg: Page) {
  if (!(await pg.locator('#p-piece-pop').isVisible())) {
    await pg.click('#p-piece-chip');
    await expect(pg.locator('#p-piece-pop')).toBeVisible();
  }
}

/** Open the open tab's job menu (if it is shut) and click a job tile. */
export async function pickJob(pg: Page, job: string) {
  const fields = await openSettings(pg);
  if (!(await pg.locator(fields.jobMenu).isVisible())) {
    await pg.click(fields.jobButton);
  }
  await pg.click(`${fields.jobMenu} [data-job-id="${job}"]`);
}

/** The page has rendered: the job picker has its buttons and the strip names the job. */
export async function waitReady(pg: Page) {
  await expect(pg.locator('[data-job-id]').first()).toBeAttached();
  await expect(pg.locator('#job-name')).not.toHaveText('');
  await openSettings(pg);
}

/** The job the picker shows as selected, '' when none is. */
export async function currentJob(pg: Page): Promise<string> {
  const sel = pg.locator(`${(await panelFields(pg)).jobMenu} [data-job-id][aria-checked="true"]`);
  return (await sel.count()) ? ((await sel.getAttribute('data-job-id')) ?? '') : '';
}

/** An input's value; '#job' means the job picker's selection, '#level' and '#cap' the open tab's own boxes (the Gear browser's strip,
 * or Stat Allocation's Sync settings popover: read where they are, shut or not). */
export async function fieldValue(pg: Page, sel: string) {
  if (sel === '#job') {
    return await currentJob(pg);
  }
  if (sel === '#level' || sel === '#cap') {
    const fields = await panelFields(pg);
    return await pg.inputValue(sel === '#level' ? fields.level : fields.cap);
  }
  if (sel === '#p-slot') {
    return await selectValue(pg, sel);
  }
  return await pg.inputValue(sel);
}

/** Switch the open tab's job (the page does not ask: nothing is lost but the job-specific choices). On How the math works it is the open
 * sub-tab's own job: Stat Allocation's, or Substat tiers'. */
export async function setJob(pg: Page, job: string) {
  await pickJob(pg, job);
  await poll(`the job to be ${job}`, async () => {
    const now = await currentJob(pg);
    return { ok: now === job, got: now };
  });
}

/** The open tab's Job and sync panel as the fields show it. */
export interface Panel {
  /* The job's id, '' for none. */
  job: string;
  sync: boolean;
  cap: string;
  level: string;
}

/** The open tab's Job and sync panel as the fields show it: {job ('' for none), sync, cap, level}. */
export async function readPanel(pg: Page): Promise<Panel> {
  const fields = await openSettings(pg, { piece: true });
  return {
    job: await currentJob(pg),
    sync: await pg.locator(fields.sync).isChecked(),
    cap: await pg.inputValue(fields.cap),
    level: await pg.inputValue(fields.level),
  };
}

/** Make the open tab's panel show `want` (readPanel's shape), through the fields. Each tab has its own panel; most
 * checks work with one setup on every tab, so showTab carries the panel over. A tab with no job is not left
 * (the picker cannot clear a job). */
async function applyPanel(pg: Page, want: Panel) {
  const now = await readPanel(pg);
  // a panel that starts as its strip (also with no job) is opened to change it
  if ((want.job && now.job !== want.job) || now.level !== want.level || now.sync !== want.sync || now.cap !== want.cap) {
    await openSettings(pg);
  }
  if (want.job && now.job !== want.job) {
    await setJob(pg, want.job);
  }
  if (now.level !== want.level) {
    await setNumber(pg, '#level', want.level);
  }
  if (now.sync !== want.sync || now.cap !== want.cap) {
    const fields = await openSync(pg);
    await pg.locator(fields.sync).setChecked(true);
    if (want.cap !== '') {
      await setNumber(pg, '#cap', want.cap);
    }
    await pg.locator(fields.sync).setChecked(want.sync);
  }
}

/** Open a tab. Its panel takes the settings of the tab left (applyPanel); `own` leaves the tab's own panel alone. */
export async function showTab(pg: Page, tab: string, own = false) {
  const left = await readPanel(pg);
  await pg.click(`[data-tab=${tab}]`);
  // the tab opens a few frames after the click (the loading layer's wait), and the panel to fill is the one on screen
  await expect(pg.locator(`#tab-${tab}`)).toBeVisible();
  if (!own) {
    await applyPanel(pg, left);
  }
}

export async function showMath(pg: Page, sub: string) {
  await showTab(pg, 'math');
  await pg.click(`[data-sub=${sub}]`);
  await expect(pg.locator(`#tab-${sub}`)).toBeVisible();
}

/** Press a set page's Auto-fill (`button`: the page's '#sh-fill') and wait until that
 * search has answered, whatever it answered (the 'fill' measure the set page records per answer). */
export async function startFill(pg: Page, button = '#sh-fill') {
  const runs = await pg.evaluate(() => performance.getEntriesByName('fill').length);
  await pg.click(button);
  await pg.waitForFunction((n: number) => performance.getEntriesByName('fill').length > n, runs, { timeout: TIMEOUT });
}

/** A set page's Auto-fill: press it and wait until that search has finished and its result waits for Apply. */
export async function runFill(pg: Page, button = '#sh-fill') {
  await startFill(pg, button);
  await expect(pg.locator('#sh-apply')).toBeVisible();
}

/** Resolve after the frames an Auto-fill on the page's thread waits for before it starts (two frames and a task), so a search
 * that was cancelled before them and still ran would have run by now. No fixed delay: the same events the Auto-fill waits for. */
export const afterFrames = (pg: Page) => pg.evaluate(afterTwoFramesAndATask);

/** Wait until the page's own state (the open tab and its Job and sync panel) is saved: a change is saved a moment later,
 * and a reload before that opens the page as it was. */
export async function waitStateSaved(pg: Page) {
  const tab = await pg.locator('[data-tab][aria-current="page"]').getAttribute('data-tab');
  if (tab === 'sheets') {
    return waitSaved(pg, "s => s.tab === 'sheets'");
  }
  const panel = await readPanel(pg);
  const cap = JSON.stringify(panel.cap);
  await waitSaved(
    pg,
    `s => s.tab === ${JSON.stringify(tab)} && s.job === ${JSON.stringify(panel.job)} && s.sync === ${panel.sync} && String(s.cap ?? '') === ${cap} && String(s.level) === ${JSON.stringify(panel.level)}`,
  );
}

/** Body rows of a table (CSS selector or Locator) as lists of the texts of its visible cells. Hidden cells are
 * skipped, so positions match what a user sees. */
export async function tableRows(pg: Page, selector: string | Locator) {
  const table = typeof selector === 'string' ? pg.locator(selector) : selector;
  return await table.locator('tbody tr').evaluateAll((rows: HTMLTableRowElement[]) =>
    rows.map(r =>
      Array.from(r.cells)
        .filter(c => getComputedStyle(c).display !== 'none')
        .map(c => c.innerText.trim()),
    ),
  );
}

/** Type `value` into the number box `sel` and commit it. '#level' and '#cap' mean the open tab's own boxes (the Gear browser's strip,
 * or Stat Allocation's Sync settings popover, opened first). */
export async function setNumber(pg: Page, sel: string, value: string) {
  let selector = sel;
  if (sel === '#level' || sel === '#cap') {
    const fields = await openSync(pg);
    selector = sel === '#level' ? fields.level : fields.cap;
  }
  await pg.fill(selector, value);
  await pg.locator(selector).dispatchEvent('change');
}

/** Turn item level sync on (the cap field is disabled while it is off) and set the cap. */
export async function setCap(pg: Page, value: string) {
  const fields = await openSync(pg);
  if (!(await pg.locator(fields.sync).isChecked())) {
    await pg.locator(fields.sync).check();
  }
  await setNumber(pg, '#cap', value);
}

/** Wait until the (debounced) saved state satisfies a JS predicate over it, s => ... The predicate sees the open tab's
 * Job and sync panel (job, cap, sync, level) at the top, as before each tab had its own, and `tab`, the open tab as the page
 * shows it (the page does not save the open tab: the address names it). */
export async function waitSaved(pg: Page, jsCondition: string) {
  await pg.waitForFunction(
    `(k => { const GROUP = { sheets: 'browse', browse: 'browse', math: 'piece' };
      const tab = document.querySelector('[data-tab][aria-current="page"]')?.dataset.tab;
      const withOpenPanel = s => ({ ...s, tab, ...(s[GROUP[tab]] && ['job', 'cap', 'sync', 'level'].reduce((o, f) => ({ ...o, [f]: s[GROUP[tab]][f] }), {})) });
      let s; try { s = JSON.parse(localStorage.getItem(k)); } catch { return false; }
      return !!s && (${jsCondition})(withOpenPanel(s)); })(${JSON.stringify(STORE_KEY)})`,
  );
}

/* The settings every group but the fresh one starts from, and its steps find (the checks use the item level 123
   caps). */

/** The ticked "Gear categories" boxes of the browser (pre 'b') or a set's Auto-fill settings ('s'), in ACTIVITIES order, read from the DOM
 * (the menu may be closed). */
export async function ticked(pg: Page, pre: string) {
  return pg
    .locator(`#${pre}-from-menu input[data-activity]`)
    .evaluateAll((boxes: HTMLInputElement[]) => boxes.filter(box => box.checked).map(box => box.dataset.activity ?? ''));
}

/** Open the "Gear categories" menu of `pre` if it is closed. */
export async function openFrom(pg: Page, pre: string) {
  if ((await pg.getAttribute(`#${pre}-from`, 'aria-expanded')) !== 'true') {
    await pg.click(`#${pre}-from`);
  }
  await expect(pg.locator(`#${pre}-from-menu`)).toBeVisible();
  await placedByZag(pg, `#${pre}-from-menu`); // Zag shows the menu a frame before it places it: a box read before that is above the window
}

/** Close the "Gear categories" menu of `pre` with Escape: the open menu takes the key, so in the Auto-fill settings popover only the
 * menu closes. */
export async function closeFrom(pg: Page, pre: string) {
  await pg.keyboard.press('Escape');
  await expect(pg.locator(`#${pre}-from-menu`)).toBeHidden();
}

/** The id of the "Gear categories" tab of `pre` for a section title ("Side content" -> "s-from-tab-side-content"). */
export const fromTabId = (pre: string, title: string) => `${pre}-from-tab-${title.toLowerCase().replace(/\s+/g, '-')}`;

/** Show the "Gear categories" tab (of the open menu of `pre`) that holds the box `key`: the other tabs' boxes are hidden and cannot be clicked. */
export async function showFromTabOf(pg: Page, pre: string, key: string) {
  await pg.click(`#${fromTabId(pre, ACTIVITY_SECTION[key])}`);
}

/** Tick or untick one "Gear categories" box (or the market board switch, key 'market'), then close the menu. */
export async function setFrom(pg: Page, pre: string, key: string, on: boolean) {
  await openFrom(pg, pre);
  if (key !== 'market') {
    await showFromTabOf(pg, pre, key);
  }
  const box = key === 'market' ? pg.locator(`#${pre}-market`) : pg.locator(`#${pre}-from-menu input[data-activity="${key}"]`);
  await (on ? box.check() : box.uncheck());
  await closeFrom(pg, pre);
}

/** The least width of the "Gear categories" menu, in px: what fits the longest hint on two lines. The menu is as wide as its box titles and
 * their numbers need, and never narrower. */
const FROM_MENU_MIN_WIDTH_PX = 436;
/** The most lines a box's text under its name may take. */
const FROM_HINT_MAX_LINES = 2;
/** The section (tab) titles of the "Gear categories" menu, in order, from ACTIVITIES (src/core/item-format.json). The last tab reads
 * row by row, two to a row, with Current on the left; the others read down each of two columns. */
const SECTIONS = Object.keys(ACTIVITY_KEYS_BY_SECTION);
const ROW_BY_ROW = SECTIONS.at(-1);

/** The keys of a tab's boxes in the order the menu shows them: ACTIVITIES order down the columns; row by row, each Current box
 * before its Legacy one (the pairs Extreme and Savage, then Ultimate). */
function readingOrder(title: string) {
  const keys = ACTIVITY_KEYS_BY_SECTION[title];
  if (title !== ROW_BY_ROW) {
    return keys;
  }
  const kind = (key: string) => key.replace(/_(current|legacy)$/, '');
  const kinds = [...new Set(keys.map(kind))];
  return [...keys].sort(
    (a, b) => kinds.indexOf(kind(a)) - kinds.indexOf(kind(b)) || Number(b.endsWith('_current')) - Number(a.endsWith('_current')),
  );
}

/** The tabs of the "Gear categories" menu and the boxes each shows, in the order they read: [title, names] from ACTIVITIES. */
const FROM_TABS = SECTIONS.map((title): [string, string[]] => [title, readingOrder(title).map(key => ACTIVITY_LABEL[key])]);

/** The open "Gear categories" menu of `pre`: its size and the window's, in px, and whether the menu or the page scrolls. */
export function fromMenuFit(pg: Page, pre: string) {
  return pg.evaluate((menuSel: string) => {
    const menu = document.querySelector(menuSel);
    if (!menu) {
      throw new Error(`fromMenuFit: nothing matches ${menuSel}`);
    }
    const box = menu.getBoundingClientRect();
    return {
      width: box.width,
      height: box.height,
      box: [box.left, box.top, box.right, box.bottom].map(Math.round),
      window: [document.documentElement.clientWidth, innerHeight],
      pageSideways: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      menuScrolls: menu.scrollWidth > menu.clientWidth + 1 || menu.scrollHeight > menu.clientHeight + 1,
    };
  }, `#${pre}-from-menu`);
}

/** The "Gear categories" menu of `pre` ('b' the browser, 's' the Auto-fill settings), starting from the default boxes, closed:
 * one surface (no (i) button or info panel); a head with the market board switch (its label only) at the left and
 * All / None / Default at the right; a tab per section (Everyday, Side content, Hard content, no Time-limited or Market board
 * tab) with its ticked count; each box a bold name with its text under it (two lines at most), Events & promotions last under Side
 * content, Hard content row by row; one size for every tab (436 px wide at the least), inside the window with nothing scrolling; the
 * tabs' keys (Left and Right wrap, Home, End, only the selected tab in the Tab order; the Tab order is the switch, the tabs,
 * the boxes, then All / None / Default); Escape closes it with the focus on the field's button and the last tab is kept; a
 * click outside closes it; All, None and Default. `outside`: a selector of something outside the control that a click may hit. */
export async function checkFromMenu(pg: Page, pre: string, outside: string) {
  const menu = `#${pre}-from-menu`;
  const tab = (title: string) => `#${fromTabId(pre, title)}`;
  const panel = (title: string) => `#${pre}-from-panel-${title.toLowerCase().replace(/\s+/g, '-')}`;
  const startTicked = await ticked(pg, pre);
  const startSummary = ((await pg.textContent(`#${pre}-from`)) ?? '').trim();

  // one surface: the (i) button and its panel are gone
  await expect(pg.locator(`#${pre}-from-info-btn`)).toHaveCount(0);
  await expect(pg.locator(`#${pre}-from-info`)).toHaveCount(0);

  // the tabs: three, each with its ticked count, only the selected one in the Tab order
  await openFrom(pg, pre);
  await pg.click(tab(SECTIONS[0]));
  await expect(pg.locator(`${menu} [role="tablist"] [role="tab"]`)).toHaveCount(FROM_TABS.length);
  await expect(pg.locator(`${menu} [role="tabpanel"]`)).toHaveCount(FROM_TABS.length);
  const counts = () =>
    FROM_TABS.map(([title]) => {
      const keys = ACTIVITY_KEYS_BY_SECTION[title];
      return `${title}${startTicked.filter(key => keys.includes(key)).length}/${keys.length}`;
    });
  for (const [index, [title]] of FROM_TABS.entries()) {
    await expect(pg.locator(tab(title))).toHaveText(counts()[index]);
  }

  // the head: the switch (its label and nothing else) at the left, All / None / Default at the right on its line, over the tabs
  await expect(pg.locator(`${menu} .from-switch`)).toBeVisible();
  const head = await pg.evaluate(
    ({ menuSel, marketSel, tabsSel }: { menuSel: string; marketSel: string; tabsSel: string }) => {
      const find = (selector: string) => {
        const found = document.querySelector(selector);
        if (!found) {
          throw new Error(`checkFromMenu: nothing matches ${selector}`);
        }
        return found;
      };
      const rect = (el: Element) => el.getBoundingClientRect();
      const menuEl = find(menuSel);
      const switchLabel = find(marketSel).closest('label');
      if (!switchLabel) {
        throw new Error('checkFromMenu: the market switch has no label');
      }
      const sw = rect(switchLabel);
      const links = [...menuEl.querySelectorAll<HTMLElement>('.from-acts button')];
      const first = rect(links[0] ?? menuEl);
      const last = rect(links[links.length - 1] ?? menuEl);
      const tabs = rect(find(tabsSel));
      return {
        links: links.map(menuLink => menuLink.dataset.action),
        switchLeft: sw.left - rect(menuEl).left,
        sameLine: Math.abs((first.top + first.bottom) / 2 - (sw.top + sw.bottom) / 2) <= 6,
        linksRightOfSwitch: first.left >= sw.right,
        linksAtRight: rect(menuEl).right - last.right <= 16,
        headAboveTabs: sw.bottom <= tabs.top && last.bottom <= tabs.top,
        switchHeight: sw.height,
      };
    },
    { menuSel: menu, marketSel: `#${pre}-market`, tabsSel: `${menu} [role="tablist"]` },
  );
  check(same(head.links, ['all', 'none', 'default']), `the ${pre} menu head has the actions ${head.links}, expected all, none, default`);
  check(
    head.switchLeft <= 16 && head.sameLine && head.linksRightOfSwitch && head.linksAtRight && head.headAboveTabs && head.switchHeight < 48,
    `the ${pre} menu head is not the switch at the left and All / None / Default at the right over the tabs: ${JSON.stringify(head)}`,
  );

  // each tab: exactly its boxes in reading order, each with a text of at most two lines under its name; one size for every tab
  const sizes: Awaited<ReturnType<typeof fromMenuFit>>[] = [];
  for (const [title, names] of FROM_TABS) {
    await pg.click(tab(title));
    for (const [other] of FROM_TABS) {
      await expect(pg.locator(tab(other))).toHaveAttribute('aria-selected', String(other === title));
      await expect(pg.locator(tab(other))).toHaveAttribute('tabindex', other === title ? '0' : '-1');
    }
    await expect(pg.locator(panel(title))).toHaveAttribute('aria-labelledby', fromTabId(pre, title));
    await expect(pg.locator(tab(title))).toHaveAttribute('aria-controls', panel(title).slice(1));
    const shown = await pg.locator(`${panel(title)} .from-name`).allTextContents();
    check(same(shown, names), `the ${pre} "${title}" tab shows ${shown.join(' | ')}, expected ${names.join(' | ')}`);
    const boxes = await pg.evaluate((panelSel: string) => {
      const panelEl = document.querySelector(panelSel);
      if (!panelEl?.parentElement) {
        throw new Error(`checkFromMenu: nothing matches ${panelSel}`);
      }
      const visible = getComputedStyle(panelEl).visibility === 'visible';
      return {
        visible,
        others: [...panelEl.parentElement.querySelectorAll('.from-panel')].filter(
          el => el !== panelEl && getComputedStyle(el).visibility === 'visible',
        ).length,
        boxes: [...panelEl.querySelectorAll('.from-opt')].map(label => {
          const nameElement = label.querySelector('.from-name');
          const hint = label.querySelector('.from-hint');
          if (!nameElement || !hint) {
            throw new Error('checkFromMenu: a box has no name or no text');
          }
          const name = nameElement.getBoundingClientRect();
          const hintBox = hint.getBoundingClientRect();
          const box = label.getBoundingClientRect();
          return {
            left: Math.round(box.left),
            top: Math.round(box.top),
            hintText: (hint.textContent ?? '').trim().length,
            hintLines: hintBox.height / Number.parseFloat(getComputedStyle(hint).lineHeight),
            hintUnderName: hintBox.top >= name.bottom - 1,
          };
        }),
      };
    }, panel(title));
    check(boxes.visible && boxes.others === 0, `the ${pre} "${title}" tab's panel is not the only one shown: ${JSON.stringify(boxes)}`);
    for (const [index, box] of boxes.boxes.entries()) {
      check(
        box.hintText > 0 && box.hintUnderName && box.hintLines <= FROM_HINT_MAX_LINES + 0.05,
        `the ${pre} "${title}" box ${names[index]} has no text under its name or more than ${FROM_HINT_MAX_LINES} lines: ${JSON.stringify(box)}`,
      );
    }
    // the reading order: Hard content across (two to a row, the right cell of the last row empty), the others down two columns
    const at = boxes.boxes;
    const rowsDown = Math.ceil(names.length / 2);
    if (title === ROW_BY_ROW) {
      check(
        at[0].top === at[1].top &&
          at[2].top === at[3].top &&
          at[0].top < at[2].top &&
          at[2].top < at[4].top &&
          at[0].left === at[2].left &&
          at[2].left === at[4].left &&
          at[1].left === at[3].left &&
          at[1].left > at[0].left,
        `the ${pre} "${title}" tab is not row by row, Current on the left: ${JSON.stringify(at)}`,
      );
    } else {
      const left = at.slice(0, rowsDown);
      const right = at.slice(rowsDown);
      check(
        left.every(box => box.left === left[0].left) &&
          right.every(box => box.left === right[0].left) &&
          right[0].left > left[0].left &&
          left.every((box, i) => i === 0 || box.top > left[i - 1].top) &&
          right[0].top === left[0].top,
        `the ${pre} "${title}" tab does not read down two columns of ${rowsDown} and ${names.length - rowsDown}: ${JSON.stringify(at)}`,
      );
    }
    sizes.push(await fromMenuFit(pg, pre));
  }
  const [first] = sizes;
  check(
    sizes.every(
      size =>
        size.width >= FROM_MENU_MIN_WIDTH_PX - 1 &&
        Math.abs(size.width - first.width) <= 0.5 &&
        Math.abs(size.height - first.height) <= 0.5,
    ),
    `the ${pre} Gear categories menu does not keep one size (${FROM_MENU_MIN_WIDTH_PX} px wide at the least) on every tab: ${JSON.stringify(sizes.map(s => [s.width, s.height]))}`,
  );
  for (const size of sizes) {
    const [left, top, right, bottom] = size.box;
    check(
      left >= 0 && top >= 0 && right <= size.window[0] && bottom <= size.window[1] && !size.pageSideways && !size.menuScrolls,
      `the ${pre} Gear categories menu is not whole inside the window, or something scrolls: ${JSON.stringify(size)}`,
    );
  }

  // the keyboard: Tab goes switch -> the selected tab only -> its boxes -> All, None, Default; the arrows, Home and End move
  // between the tabs and select (wrapping)
  await pg.click(tab(SECTIONS[0]));
  await pg.focus(`#${pre}-market`);
  await pg.keyboard.press('Tab');
  check((await focusedId(pg)) === fromTabId(pre, SECTIONS[0]), `${pre} menu: Tab from the switch did not reach the selected tab`);
  const tabKeys: [string, string][] = [
    [SECTIONS[1], 'ArrowRight'],
    [SECTIONS[2], 'ArrowRight'],
    [SECTIONS[0], 'ArrowRight'],
    [SECTIONS[2], 'ArrowLeft'],
    [SECTIONS[0], 'Home'],
    [SECTIONS[2], 'End'],
    [SECTIONS[0], 'Home'],
  ];
  for (const [title, key] of tabKeys) {
    await pg.keyboard.press(key);
    await expect(pg.locator(tab(title))).toHaveAttribute('aria-selected', 'true');
    check((await focusedId(pg)) === fromTabId(pre, title), `${pre} menu: the focus did not follow ${key} to the ${title} tab`);
  }
  const activeLabel = () =>
    pg.evaluate(() => {
      const active = document.activeElement;
      return active instanceof HTMLElement ? (active.dataset.activity ?? active.dataset.action) : undefined;
    });
  const everyday = ACTIVITY_KEYS_BY_SECTION[SECTIONS[0]];
  const order: (string | undefined)[] = [];
  for (let step = 0; step < everyday.length + 3; step++) {
    await pg.keyboard.press('Tab');
    order.push(await activeLabel());
  }
  check(
    same(order, [...everyday, 'all', 'none', 'default']),
    `${pre} menu: the Tab order after the tabs is ${order.join(', ')}, expected the first tab's boxes, then all, none, default`,
  );

  // a tick changes the tab's count and the field's summary; the boxes of the tab shown only can be reached with a click
  const quests = pg.locator(`${menu} input[data-activity="quests"]`);
  await quests.uncheck();
  await expect(pg.locator(tab(SECTIONS[0]))).toHaveText(
    `${SECTIONS[0]}${startTicked.filter(k => everyday.includes(k)).length - 1}/${everyday.length}`,
  );
  await quests.check();
  await expect(pg.locator(tab(SECTIONS[0]))).toHaveText(counts()[0]);

  // All, None, Default: the tabs' counts and the field's text follow, and Default gives back the starting boxes
  const link = (action: string) => pg.locator(`${menu} .from-acts [data-action="${action}"]`);
  await link('none').click();
  for (const [title, names] of FROM_TABS) {
    await expect(pg.locator(tab(title))).toHaveText(`${title}0/${names.length}`);
  }
  await expect(pg.locator(`#${pre}-from`)).toContainText('None');
  await link('all').click();
  for (const [title, names] of FROM_TABS) {
    await expect(pg.locator(tab(title))).toHaveText(`${title}${names.length}/${names.length}`);
  }
  await expect(pg.locator(`#${pre}-from`)).toContainText('All');
  await link('default').click();
  await expect(pg.locator(`#${pre}-from`)).toHaveText(startSummary);
  check(same(await ticked(pg, pre), startTicked), `${pre} menu: Default did not give back the starting boxes`);

  // Escape closes it with the focus on the field's button, and the last tab is kept while the control lives
  await pg.click(tab(SECTIONS[2]));
  await pg.keyboard.press('Escape');
  await expect(pg.locator(menu)).toBeHidden();
  // Zag gives the focus back a frame after the menu is hidden
  await poll(`the focus on the ${pre} Gear categories button after Escape`, async () => {
    const id = await focusedId(pg);
    return { ok: id === `${pre}-from`, got: id };
  });
  await openFrom(pg, pre);
  await expect(pg.locator(tab(SECTIONS[2]))).toHaveAttribute('aria-selected', 'true');
  await pg.click(tab(SECTIONS[0]));

  // a click outside the control closes it
  await pg.click(outside);
  await expect(pg.locator(menu)).toBeHidden();
}

/** Resolves after `count` frames of the page have been drawn. */
export const framesPass = (pg: Page, count: number) =>
  pg.evaluate(
    total =>
      new Promise<void>(done => {
        let left = total;
        const frame = () => (--left > 0 ? requestAnimationFrame(frame) : done());
        requestAnimationFrame(frame);
      }),
    count,
  );

/** Clicks the tab link `[data-tab=<tab>]` from the page itself, with no scroll or actionability wait of a Playwright click. */
export const clickTabFromPage = (pg: Page, tab: string) =>
  pg.evaluate((name: string) => {
    const link = document.querySelector<HTMLElement>(`[data-tab=${name}]`);
    if (!link) {
      throw new Error(`no tab link ${name}`);
    }
    link.click();
  }, tab);

/** The id of the element that has focus. */
export const focusedId = (pg: Page) => pg.evaluate(() => document.activeElement?.id ?? '');

/** Set the gear browser's filters to an item level window (name filter cleared). */
export async function fillBrowser(pg: Page, lo: number | string, hi: number | string, lvl: number | string, slot = 'any') {
  await showTab(pg, 'browse');
  await pg.fill('#b-q', '');
  await allExpansions(pg);
  await pg.fill('#b-min', String(lo));
  await pg.fill('#b-max', String(hi));
  await pg.fill('#b-lvl', String(lvl));
  await chooseSlot(pg, slot); // after the filters, so its slot has matches
}

/** Pick `slot` (a data-slot key: 'any', 'ring', ...) in the Gear browser's Slot menu: opens the menu and clicks the choice, which closes it. */
export async function chooseSlot(pg: Page, slot: string) {
  await pg.click('#b-slot');
  await pg.click(`#b-slots [data-slot="${slot}"]`);
}

export const browserRows = (pg: Page) => pg.locator('#gear-table tbody tr[data-key]');

export const hasHScroll = (pg: Page) => pg.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
