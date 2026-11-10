/* Browser smoke test (Playwright) for dist/index.html, loaded from file://.

Fails (exit 1) on JS errors, console errors, wrong numbers in the page, stray undefined/NaN/null text,
or horizontal page scroll at 960 px (NARROW). Prints 'no errors' on success.

Expected values come from outside the code under test where possible:
  - sync caps at item level 123 (head/hands/feet 29, body/legs 47, accessories 23, 2H weapon 48;
    main stat 30/48/24/50) (the Wiki's item level 475 caps are checked in tests/unit/core-validation.test.js);
  - a set page's Fill over every piece a healer can wear: the set it suggests, synced to 123, has the Spell Speed src/core
    computes for the same settings in Node (the core is checked against a brute force over every loadout in
    tests/unit);
  - a 130 head piece (Spell Speed / Piety) reproducing the ranked stats of a real item level 130 healer head piece
    (Mind 33, Vitality 32, substats 31/22; its fixed Direct Hit 6 is not a rank; tests/unit/ui-views-piece.test.js finds it in
    the item database);
  - level sync (synced level 90, item level sync off): level 100 healer head pieces capped at the item level 660
    head values (Mind 248; tests/unit/core-sync-target.test.js derives them from the ItemLevel row), in the gear browser and
    in Piece stats (item level 660: ParamGrow.ItemLevelSync for level 90).

Layout: helpers, then the checks in one section per tab (settings panel, Gear browser, How the math works, saved
state, the checks across tabs, and the Sheets tab), then GROUPS and the runner at the end.

The steps run in groups, in parallel: each group gets a fresh browser context (so its own saved state) and page, set to
the shared setup (SHARED_SETUP: Sage, sync to 123, level 50), and runs its steps one after the other (see GROUPS).
Before each step that uses the shared setup, the runner checks it and names the step before if that one left it
changed. The numbers from src/core are computed in a worker thread (smoke-core.mjs), so the pages are never kept
waiting. Failures are printed in step order.

Setup once: npm install && npx playwright install chromium
Run: npm run build && npm run test:smoke
Environment: SMOKE_PAGE (page to test, default dist/index.html), SMOKE_OUT (screenshots, default tests/e2e/out),
SMOKE_WORKERS (groups at once, default half the cores up to 6), SMOKE_TRACE=1 (time of each step on stderr), SMOKE_ONLY
(a pattern on step names: run only the groups with a matching step).
*/

import assert from 'node:assert';
import { AsyncLocalStorage } from 'node:async_hooks';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { Worker } from 'node:worker_threads';
import { DEFAULT_EXCLUDE } from './smoke-core.mjs';
import { judge, parseComputed, probeTheme, probeText, readStyles, tokenColor, tokensFor } from './smoke-visual.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PAGE_PATH = process.env.SMOKE_PAGE ? resolve(process.env.SMOKE_PAGE) : resolve(ROOT, 'dist', 'index.html'); // run `npm run build` first
const PAGE = pathToFileURL(PAGE_PATH).href;
const OUT = process.env.SMOKE_OUT ? resolve(process.env.SMOKE_OUT) : resolve(ROOT, 'tests', 'e2e', 'out'); // screenshots (gitignored)
const shot = name => resolve(OUT, name);

const JOBS = ['SGE', 'WAR', 'PLD', 'BLM', 'NIN', 'DRG', 'BST', 'BLU'];
const ONE_HANDED = new Set(['PLD', 'BST']); // one-handed weapon + shield
const BAD_WORDS = ['undefined', 'NaN', 'null'];
const TIMEOUT = 10_000; // ms for any single wait
const WORKERS = Number(process.env.SMOKE_WORKERS) || Math.max(1, Math.min(6, availableParallelism() >> 1)); // pages at once: each is a busy browser process, so no more than half the cores
// The narrowest window the page must fit with no sideways page scroll: half of a 1920 screen, the tool beside the game.
// There is no phone layout (owner's decision, 2026-10-15).
const NARROW = { width: 960, height: 900 };
const STORE_KEY = 'ilvl-stat-lab-v4'; // localStorage key of the saved state (src/ui/state.js)

// Defaults owe nothing to any player's setup: no job chosen, no sync cap (sync off), level 100.
const [DEFAULT_JOB, DEFAULT_CAP, DEFAULT_LEVEL] = ['', '', '100'];
// The "Gear from" boxes in ACTIVITIES order (src/core/item-format.json); DEFAULT_EXCLUDE (smoke-core.mjs) are left out by
// default.
const ACTIVITY_KEYS = JSON.parse(readFileSync(new URL('../../src/core/item-format.json', import.meta.url), 'utf8')).activities.map(
  a => a.key,
);

// Sync caps at item level 123: slot -> [substat cap, main stat cap]. Same for every job (slot shares are job-neutral).
const CAPS_123 = {
  Head: [29, 30],
  Hands: [29, 30],
  Feet: [29, 30],
  Body: [47, 48],
  Legs: [47, 48],
  Earring: [23, 24],
  Necklace: [23, 24],
  Bracelet: [23, 24],
  Ring: [23, 24],
};
const CAPS_123_2H_WEAPON = [48, 50];

// Each group of steps runs on its own page, in parallel with the others. Its failed checks and the page's JS and
// console errors go to its own record (found through the async context), so the output is the same in every run.
const stepRecord = new AsyncLocalStorage();

function check(cond, msg) {
  if (!cond) stepRecord.getStore().failures.push(msg);
  return cond;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
const norm = s => s.replace(/\s+/g, ' ').trim();
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ---------- expect: polling assertions (the plain playwright library has none) ----------

async function poll(what, fn) {
  const end = Date.now() + TIMEOUT;
  let last = 'nothing read';
  for (;;) {
    try {
      const r = await fn();
      if (r.ok) return;
      last = r.got;
    } catch (e) {
      last = String(e.message).split('\n')[0];
    }
    if (Date.now() > end) throw new assert.AssertionError({ message: `expect ${what}: last seen ${JSON.stringify(last)}` });
    await sleep(50);
  }
}

function expect(loc) {
  const make = neg => {
    const m = (what, read, test) =>
      poll(`${neg ? 'not ' : ''}${what}`, async () => {
        const got = await read();
        const hit = test(got);
        return { ok: neg ? !hit : hit, got };
      });
    const text = () => loc.textContent({ timeout: 500 }).then(norm);
    const textTest = want => got => (want instanceof RegExp ? want.test(got) : got === want);
    return {
      toBeAttached: () =>
        m(
          'to be attached',
          async () => (await loc.count()) > 0,
          g => g,
        ),
      toBeVisible: () =>
        m(
          'to be visible',
          () => loc.isVisible(),
          g => g,
        ),
      toBeHidden: () =>
        m(
          'to be hidden',
          () => loc.isVisible(),
          g => !g,
        ),
      toBeEnabled: () =>
        m(
          'to be enabled',
          () => loc.isEnabled({ timeout: 500 }),
          g => g,
        ),
      toBeDisabled: () =>
        m(
          'to be disabled',
          () => loc.isEnabled({ timeout: 500 }),
          g => !g,
        ),
      toHaveText: want => m(`to have text ${want}`, text, textTest(typeof want === 'string' ? norm(want) : want)),
      toContainText: want => m(`to contain text ${want}`, text, g => g.includes(norm(want))),
      toHaveAttribute: (name, want) =>
        m(
          `to have attribute ${name}=${want}`,
          () => loc.getAttribute(name, { timeout: 500 }),
          g => g === want,
        ),
      toHaveValue: want =>
        m(
          `to have value ${want}`,
          () => loc.inputValue({ timeout: 500 }),
          g => g === want,
        ),
      toHaveCount: want =>
        m(
          `to have count ${want}`,
          () => loc.count(),
          g => g === want,
        ),
    };
  };
  return { ...make(false), not: make(true) };
}

// ---------- navigation helpers (each waits for a concrete condition, never a fixed sleep) ----------

/** Open the Job and sync panel if only its one-line strip shows (the Change button); it stays open until Close. */
async function openSettings(pg) {
  const change = pg.locator('#job-change');
  // the Sheets tab has no panel; on the other tabs the strip or the panel shows once the page has drawn (also with no job)
  if (await pg.locator('[data-tab=sheets][aria-selected="true"]').count()) return;
  await pg.waitForFunction(() => ['#job-change', '#job-panel'].some(selector => document.querySelector(selector)?.getClientRects().length));
  if (!(await change.isVisible())) return;
  await change.click();
  await expect(pg.locator('#job-panel')).toBeVisible();
}

/** Alpine has rendered: the job picker has its buttons and the settings panel names the job (or "none chosen"). */
async function waitReady(pg) {
  await expect(pg.locator('[data-job-id]').first()).toBeAttached();
  await expect(pg.locator('#job-name')).not.toHaveText('');
  await openSettings(pg);
}

/** The job the picker shows as selected, '' when none is. */
async function currentJob(pg) {
  const sel = pg.locator('[data-job-id][aria-checked="true"]');
  return (await sel.count()) ? await sel.getAttribute('data-job-id') : '';
}

/** An input's value; '#job' means the job picker's selection. */
async function fieldValue(pg, sel) {
  return sel === '#job' ? await currentJob(pg) : await pg.inputValue(sel);
}

/** Switch job (the page does not ask: nothing is lost but the job-specific choices). */
async function setJob(pg, job) {
  await openSettings(pg);
  await pg.click(`[data-job-id="${job}"]`);
  await expect(pg.locator('[data-job]')).toHaveAttribute('data-job', job);
}

/** The open tab's Job and sync panel as the fields show it: {job ('' for none), sync, cap, level}. */
async function readPanel(pg) {
  await openSettings(pg);
  return {
    job: await currentJob(pg),
    sync: await pg.locator('#sync').isChecked(),
    cap: await pg.inputValue('#cap'),
    level: await pg.inputValue('#level'),
  };
}

/** Make the open tab's panel show `want` (readPanel's shape), through the fields. Each tab has its own panel; most
 * checks work with one setup on every tab, so showTab carries the panel over. A tab with no job is not left
 * (the picker cannot clear a job). */
async function applyPanel(pg, want) {
  const now = await readPanel(pg);
  // a panel that starts as its strip (also with no job) is opened to change it
  if ((want.job && now.job !== want.job) || now.level !== want.level || now.sync !== want.sync || now.cap !== want.cap)
    await openSettings(pg);
  if (want.job && now.job !== want.job) await setJob(pg, want.job);
  if (now.level !== want.level) await setNumber(pg, '#level', want.level);
  if (now.sync !== want.sync || now.cap !== want.cap) {
    await pg.locator('#sync').setChecked(true);
    if (want.cap !== '') await setNumber(pg, '#cap', want.cap);
    await pg.locator('#sync').setChecked(want.sync);
  }
}

/** Open a tab. Its panel takes the settings of the tab left (applyPanel); `own` leaves the tab's own panel alone. */
async function showTab(pg, tab, own = false) {
  const left = await readPanel(pg);
  await pg.click(`[data-tab=${tab}]`);
  if (!own) await applyPanel(pg, left);
  await expect(pg.locator(`#tab-${tab}`)).toBeVisible();
}

async function showMath(pg, sub) {
  await showTab(pg, 'math');
  await pg.click(`[data-sub=${sub}]`);
  await expect(pg.locator(`#tab-${sub}`)).toBeVisible();
}

/** Press a set page's Fill (`button`: the page's '#sh-fill', or the Fill settings dialog's '#s-fill') and wait until that
 * search has answered, whatever it answered (the 'fill' measure the set page records per answer). */
async function startFill(pg, button = '#sh-fill') {
  const runs = await pg.evaluate("performance.getEntriesByName('fill').length");
  await pg.click(button);
  await pg.waitForFunction(n => performance.getEntriesByName('fill').length > n, runs, { timeout: TIMEOUT });
}

/** A set page's Fill: press it and wait until that search has finished and its result waits for Apply. */
async function runFill(pg, button = '#sh-fill') {
  await startFill(pg, button);
  await expect(pg.locator('#sh-apply')).toBeVisible();
}

/** Resolve after the frames a Fill on the page's thread waits for before it starts (two frames and a task), so a search
 * that was cancelled before them and still ran would have run by now. No fixed delay: the same events the Fill waits for. */
const afterFrames = pg =>
  pg.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(done)))));

/** Wait until the page's own state (the open tab and its Job and sync panel) is saved: a change is saved a moment later,
 * and a reload before that opens the page as it was. */
async function waitStateSaved(pg) {
  const tab = await pg.locator('[role=tab][aria-selected="true"]').getAttribute('data-tab');
  if (tab === 'sheets') return waitSaved(pg, "s => s.tab === 'sheets'");
  const panel = await readPanel(pg);
  const cap = JSON.stringify(panel.cap);
  await waitSaved(
    pg,
    `s => s.tab === ${JSON.stringify(tab)} && s.job === ${JSON.stringify(panel.job)} && s.sync === ${panel.sync} && String(s.cap ?? '') === ${cap} && String(s.level) === ${JSON.stringify(panel.level)}`,
  );
}

/** Store `sheet` (a saved sheet, the shape src/ui/sheet-storage.js reads) as the only one, and reload on it. */
async function seedSheet(pg, sheet) {
  await seedSheets(pg, [sheet]);
}

/** Store `sheets` (saved sheets) in that order, and reload on them; `broken` (record text by sheet id) are stored in the
 * order too, for records that cannot be read. */
async function seedSheets(pg, sheets, broken = {}) {
  await waitStateSaved(pg);
  await pg.evaluate(
    ([key, list, bad]) => {
      for (const s of list) localStorage.setItem(`${key}:sheet:${s.id}`, JSON.stringify(s));
      for (const [id, text] of Object.entries(bad)) localStorage.setItem(`${key}:sheet:${id}`, text);
      localStorage.setItem(`${key}:sheets`, JSON.stringify({ v: 1, order: [...list.map(s => s.id), ...Object.keys(bad)] }));
    },
    [STORE_KEY, sheets, broken],
  );
  await pg.reload();
  await waitReady(pg);
}

/** Open the set named `setName` of the sheet named `sheetName` from the Sheets tab. */
async function openSet(pg, sheetName, setName) {
  await pg.click('[data-tab=sheets]');
  await pg.locator('#sh-list a.sname', { hasText: sheetName }).click();
  await pg.locator('#sh-sets a.sname', { hasText: setName }).click();
  await expect(pg.locator('#sh-gear')).toBeVisible();
}

/** Body rows of a table (CSS selector or Locator) as lists of the texts of its visible cells. Hidden cells are
 * skipped, so positions match what a user sees. */
async function tableRows(pg, selector) {
  const table = typeof selector === 'string' ? pg.locator(selector) : selector;
  return await table.locator('tbody tr').evaluateAll(rows =>
    rows.map(r =>
      Array.from(r.cells)
        .filter(c => getComputedStyle(c).display !== 'none')
        .map(c => c.innerText.trim()),
    ),
  );
}

async function setNumber(pg, sel, value) {
  if (['#level', '#cap'].includes(sel)) await openSettings(pg);
  await pg.fill(sel, value);
  await pg.locator(sel).dispatchEvent('change');
}

/** Turn item level sync on (the cap field is disabled while it is off) and set the cap. */
async function setCap(pg, value) {
  await openSettings(pg);
  if (!(await pg.locator('#sync').isChecked())) await pg.locator('#sync').check();
  await setNumber(pg, '#cap', value);
}

/** Wait until the (debounced) saved state satisfies a JS predicate over it, s => ... The predicate sees the open tab's
 * Job and sync panel (job, cap, sync, level) at the top, as before each tab had its own. */
async function waitSaved(pg, jsCondition) {
  await pg.waitForFunction(
    `(k => { const GROUP = { sheets: 'browse', browse: 'browse', math: 'piece' };
      const withOpenPanel = s => ({ ...s, ...(s[GROUP[s.tab]] && ['job', 'cap', 'sync', 'level'].reduce((o, f) => ({ ...o, [f]: s[GROUP[s.tab]][f] }), {})) });
      let s; try { s = JSON.parse(localStorage.getItem(k)); } catch { return false; }
      return !!s && (${jsCondition})(withOpenPanel(s)); })(${JSON.stringify(STORE_KEY)})`,
  );
}

/* The settings every group but the fresh one starts from, and its steps find (the checks use the item level 123
   caps). */
const SHARED_SETUP = { job: 'SGE', sync: true, cap: '123', level: '50' };

/** Set the page to SHARED_SETUP, on the Gear browser (the page opens on the Sheets tab, which has no panel). */
async function setUpShared(pg) {
  await pg.click('[data-tab=browse]');
  await expect(pg.locator('[data-tab=browse]')).toHaveAttribute('aria-selected', 'true');
  await setJob(pg, SHARED_SETUP.job);
  await setCap(pg, SHARED_SETUP.cap);
  await setNumber(pg, '#level', SHARED_SETUP.level);
}

/** The settings that differ from SHARED_SETUP, as "field now (setup)" texts; empty when none does. */
async function sharedSetupChanges(pg) {
  const now = {
    job: await currentJob(pg),
    sync: await pg.locator('#sync').isChecked(),
    cap: await pg.inputValue('#cap'),
    level: await pg.inputValue('#level'),
  };
  return Object.keys(SHARED_SETUP)
    .filter(k => now[k] !== SHARED_SETUP[k])
    .map(k => `${k} ${now[k]} (${SHARED_SETUP[k]})`);
}

async function checkNoBadText(pg, where) {
  const txt = await pg.innerText('body');
  for (const bad of BAD_WORDS) check(!txt.includes(bad), `"${bad}" visible in ${where}`);
}

// ---------- checks: Settings panel: defaults, the cap field, job switch, level caps ----------

/** Switching job takes effect at once (nothing is lost but the job-specific choices, so the page does not ask): the
 * gear browser sorted by Critical Hit stays so on a job with the same stat, and goes back to item level when the stat
 * it is sorted by is the old job's own (Tenacity is not Piety). */
async function checkJobSwitch(pg) {
  await showTab(pg, 'browse');
  await setJob(pg, 'WAR');
  await expect(browserRows(pg).first()).toBeVisible();
  await pg.click('#gear-table [data-sort="crit"]');
  await pg.click('[data-job-id="GNB"]'); // same role as WAR
  await expect(pg.locator('[data-job]')).toHaveAttribute('data-job', 'GNB');
  // Gunbreaker has Critical Hit under the same name: the sort stays (audit 11 #2)
  await expect(pg.locator('#gear-table th[data-col="crit"]')).toHaveAttribute('aria-sort', 'descending');
  await pg.click('#gear-table [data-sort="spec"]');
  await setJob(pg, 'SGE');
  await expect(pg.locator('#gear-table th[data-col="ilvl"]')).toHaveAttribute('aria-sort', 'descending');
  await setUpShared(pg); // back to Sage for the next step
}

/** With sync on, the cap field asks for a cap while empty and for a whole item level in range. The message sits
 * under the field, so the label stays on one line and the cap input lines up with the synced level input. */
async function checkCapValidation(pg) {
  await pg.locator('#sync').check();
  await expect(pg.locator('#cap-error')).toHaveText('Enter a sync cap');
  check((await pg.getAttribute('#cap', 'aria-invalid')) === 'true', 'an empty cap with sync on is not marked invalid');
  const lay = await pg.evaluate(() => {
    const lab = document.querySelector('label[for=cap]');
    const top = s => document.querySelector(s).getBoundingClientRect().top;
    return { em: lab.getBoundingClientRect().height / Number.parseFloat(getComputedStyle(lab).fontSize), dy: top('#cap') - top('#level') };
  });
  check(lay.em < 2, `the sync cap label wraps (${lay.em.toFixed(1)} em high) while it asks for a cap`);
  check(Math.abs(lay.dy) < 1, `the cap input is ${lay.dy.toFixed(0)} px off the synced level input`);
  // the ranges next to the labels
  await expect(pg.locator('#level-range')).toHaveText('1–100');
  await expect(pg.locator('#cap-range')).toHaveText('1–795');
  // not a whole item level: an error, and the page keeps its last cap
  await pg.fill('#cap', '0');
  await expect(pg.locator('#cap-error')).toContainText('Enter a whole item level from 1 to');
  await pg.fill('#cap', '123');
  await expect(pg.locator('#cap-error')).toBeHidden();
  // the cap follows the level: at level 40 cap 123 is lowered to 43, the best gear made for level 40 (capCeiling),
  // once the level settles; back at level 50 it stays 43 (never raised), with no error either way
  await setNumber(pg, '#level', '40');
  await expect(pg.locator('#cap')).toHaveValue('43');
  await expect(pg.locator('#cap-error')).toBeHidden();
  await expect(pg.locator('#cap-lowered')).toHaveText('Lowered to 43, the highest for level 40.');
  check(await pg.locator('#cap').evaluate(e => e.classList.contains('lowered')), 'the lowered cap field does not flash');
  await setNumber(pg, '#level', '50');
  await expect(pg.locator('#cap')).toHaveValue('43');
  await expect(pg.locator('#cap-lowered')).toBeHidden(); // the note goes with the next change
  // a cap entered above what the level allows is lowered once it commits
  await pg.fill('#cap', '500');
  await expect(pg.locator('#cap')).toHaveValue('135');
  await expect(pg.locator('#cap-lowered')).toHaveText('Lowered to 135, the highest for level 50.');
  // above the highest real item level too: lowered the same way, not an error
  await pg.fill('#cap', '999');
  await expect(pg.locator('#cap')).toHaveValue('135');
  await expect(pg.locator('#cap-lowered')).toHaveText('Lowered to 135, the highest for level 50.');
  await expect(pg.locator('#cap-error')).toBeHidden();
  // the up arrow at the limit (owner's report, 2026-10-18): each press is lowered again, and the note stays put rather
  // than hiding and showing (the panel jumped); the field flashes again instead
  await pg.evaluate(() => {
    window.__noteHidden = 0;
    const note = document.querySelector('#cap-lowered');
    new MutationObserver(() => {
      if (note.style.display === 'none') window.__noteHidden++;
    }).observe(note, { attributes: true, attributeFilter: ['style'] });
  });
  await pg.locator('#cap').focus();
  for (let i = 0; i < 5; i++) {
    await pg.keyboard.press('ArrowUp');
    await pg.waitForTimeout(60);
  }
  await pg.waitForTimeout(400);
  await expect(pg.locator('#cap')).toHaveValue('135');
  await expect(pg.locator('#cap-lowered')).toHaveText('Lowered to 135, the highest for level 50.');
  check((await pg.evaluate(() => window.__noteHidden)) === 0, 'the lowered note hides and shows again on the up arrow');
  await pg.fill('#cap', '123');
  await setNumber(pg, '#level', '100');
  await pg.locator('#sync').uncheck();
}

/** Limited jobs: picking Blue Mage (level cap 80) or Beastmaster (50) clamps the synced level and the equip level
 * filter to the cap, both inputs' maximum follows it, and a typed level above the cap is not taken. */
async function checkJobLevelCap(pg) {
  await setJob(pg, 'SGE');
  await showTab(pg, 'browse');
  await setNumber(pg, '#level', '100');
  await setNumber(pg, '#b-lvl', '100');
  for (const [job, cap] of [
    ['BLU', '80'],
    ['BST', '50'],
  ]) {
    await setJob(pg, job);
    for (const sel of ['#level', '#b-lvl']) {
      await expect(pg.locator(sel)).toHaveValue(cap);
      const max = await pg.getAttribute(sel, 'max');
      check(max === cap, `${job}: ${sel} max is '${max}', expected ${cap}`);
    }
  }
  await waitSaved(pg, "s => s.job === 'BST' && s.level === 50");
  await setNumber(pg, '#level', '70');
  await pg.waitForTimeout(400); // longer than the save debounce
  const level = await pg.evaluate(
    `(s => s[{ sheets: 'browse', browse: 'browse', math: 'piece' }[s.tab]].level)(JSON.parse(localStorage.getItem("${STORE_KEY}")))`,
  );
  check(level === 50, `BST: a typed level 70 was taken (saved level ${JSON.stringify(level)})`);
  await setNumber(pg, '#level', '40');
  await waitSaved(pg, 's => s.level === 40');
  await setNumber(pg, '#level', '50'); // the shared setup
  await setJob(pg, 'SGE');
}

/** What prototype B17 measured for its Job and sync strip (parity report, P6): the closed strip is 54 px tall, so the tab
 * bar sits 53 px lower on the Gear browser than on Sheets. A pixel of rounding is allowed. */
const B17_STRIP_HEIGHT = 54;
const B17_TAB_BAR_SHIFT = 53;

/** The y of the tab bar and the strip's height, read from the page. */
const measureTabBar = pg =>
  pg.evaluate(() => ({
    tabs: document.querySelector('nav.tabs').getBoundingClientRect().top,
    strip: document.querySelector('#job-strip')?.closest('section').getBoundingClientRect().height ?? 0,
  }));

/** The Gear browser and How the math works show a one-line closed strip ("Job: Sage · Level 100 · Item level sync: off")
 * with a Change button; Change opens the full panel (Close shuts it, the keyboard focus follows the button), the tab bar
 * moves no more than B17's strip moves it, and a tab with no job starts as the strip too. */
async function checkJobStrip(pg) {
  await pg.setViewportSize(NARROW);
  await showTab(pg, 'browse');
  await setJob(pg, 'SGE');
  await setNumber(pg, '#level', '100');
  await pg.locator('#sync').uncheck();
  await pg.click('#job-close');
  await expect(pg.locator('#job-strip')).toBeVisible();
  await expect(pg.locator('#job-panel')).toBeHidden();
  const text = () => pg.locator('#job-strip > span').first().innerText();
  check((await text()) === 'Job: Sage · Level 100 · Item level sync: off', `strip text '${await text()}'`);
  check(await pg.evaluate(() => document.activeElement?.id === 'job-change'), 'Close leaves the focus on Change');

  // the tab bar: Sheets, Gear browser and How the math works (all closed)
  await pg.click('[data-tab=sheets]');
  const onSheets = await measureTabBar(pg);
  await pg.click('[data-tab=browse]');
  const onBrowser = await measureTabBar(pg);
  await pg.click('[data-tab=math]');
  const onMath = await measureTabBar(pg);
  check(Math.abs(onBrowser.strip - B17_STRIP_HEIGHT) <= 2, `the strip is ${onBrowser.strip} px tall, B17's is ${B17_STRIP_HEIGHT}`);
  for (const [name, m] of [
    ['Gear browser', onBrowser],
    ['How the math works', onMath],
  ]) {
    const shift = m.tabs - onSheets.tabs;
    check(shift <= B17_TAB_BAR_SHIFT + 2, `the tab bar sits ${shift} px lower on ${name} than on Sheets, B17: ${B17_TAB_BAR_SHIFT}`);
  }
  check(!(await hasHScroll(pg)), 'sideways scroll at 960 with the strip');

  // Change opens the full panel with the focus on Close; the fields work; Close goes back
  await pg.click('[data-tab=browse]');
  await pg.click('#job-change');
  await expect(pg.locator('#job-panel')).toBeVisible();
  await expect(pg.locator('#job-strip')).toBeHidden();
  check(await pg.evaluate(() => document.activeElement?.id === 'job-close'), 'Change leaves the focus on Close');
  check(!(await hasHScroll(pg)), 'sideways scroll at 960 with the panel open');
  // Escape closes the open panel and the focus goes back to Change; Change opens it again
  await pg.keyboard.press('Escape');
  await expect(pg.locator('#job-strip')).toBeVisible();
  await expect(pg.locator('#job-panel')).toBeHidden();
  await pg
    .waitForFunction(() => document.activeElement?.id === 'job-change', null, { timeout: 3000 })
    .catch(() => check(false, 'Escape in the open panel leaves the focus on Change'));
  await pg.click('#job-change');
  await expect(pg.locator('#job-panel')).toBeVisible();
  await pg.click('[data-job-id="WAR"]');
  await setNumber(pg, '#level', '90');
  await setCap(pg, '275');
  await pg.click('#job-close');
  check((await text()) === 'Job: Warrior · Level 90 · Item level sync: 275', `strip text with sync on '${await text()}'`);
  await pg.click('#job-change');

  // each tab keeps its own settings: the math tab is not Warrior at 90
  await pg.click('[data-tab=math]');
  await expect(pg.locator('[data-job]')).not.toHaveAttribute('data-job', 'WAR');
  await pg.click('[data-tab=browse]');
  await setJob(pg, 'SGE');
  await setNumber(pg, '#level', SHARED_SETUP.level);
  await setCap(pg, SHARED_SETUP.cap); // back to the shared setup
  await pg.setViewportSize({ width: 1280, height: 900 });
}

/** The checks that need a fresh page with nothing set: the title, the defaults and the cap field's validation. */
async function checkDefaults(pg) {
  const title = await pg.title();
  check(title === 'Gear Sync Analysis', `title is '${title}'`);
  for (const [sel, v] of Object.entries({ '#job': DEFAULT_JOB, '#cap': DEFAULT_CAP, '#level': DEFAULT_LEVEL })) {
    const got = await fieldValue(pg, sel);
    check(got === v, `default ${sel} is '${got}', expected '${v}'`);
  }
  check(!(await pg.locator('#sync').isChecked()), 'sync is on by default');
  check(await pg.locator('#cap').isDisabled(), 'the cap field is enabled while sync is off');
  // the page opens on the Sheets tab; the Gear browser with no job yet has no gear table
  await expect(pg.locator('#tab-sheets')).toBeVisible();
  await pg.click('[data-tab=browse]');
  await expect(pg.locator('#no-job')).toBeVisible();
  await expect(pg.locator('#job-panel')).toBeHidden(); // no job chosen: the strip too, with Change
  const none = await pg.locator('#job-strip > span').first().innerText();
  check(none === 'Job: none chosen · Level 100 · Item level sync: off', `strip text with no job '${none}'`);
  await pg.click('#job-change');
  await checkCapValidation(pg);
}

// ---------- checks: a set page's Fill, and the "Gear from" menu ----------

// The numbers the page must show come from src/core (smoke-core.mjs), computed in a worker thread.
let coreWorker;
const coreCalls = new Map(); // key -> promise of the result: a call made twice is computed once
let coreId = 0;

function startCore() {
  coreWorker = new Worker(new URL('./smoke-core.mjs', import.meta.url));
  coreWorker.on('message', ({ id, result, error }) => {
    const call = coreCalls.get(id);
    if (error) call.reject(new Error(error));
    else call.resolve(result);
  });
  coreWorker.on('error', e => {
    for (const c of coreCalls.values()) c.reject?.(e);
  });
}

/** `fn` of smoke-core.mjs in the worker, with JSON-able `args`. */
function core(fn, ...args) {
  const key = JSON.stringify([fn, args]);
  if (!coreCalls.has(key)) {
    const id = coreId++;
    const p = new Promise((resolve, reject) => coreCalls.set(id, { resolve, reject }));
    coreCalls.set(key, p);
    coreWorker.postMessage({ id, fn, args });
  }
  return coreCalls.get(key);
}
const coreGear = (...a) => core('coreGear', ...a);
const coreFiltered = (...a) => core('coreFiltered', ...a);
const coreRecipe = (...a) => core('coreRecipe', ...a);
const coreRings = (...a) => core('coreRings', ...a);
const coreStats = (...a) => core('coreStats', ...a);

/** The ticked "Gear from" boxes of the browser (pre 'b') or a set's Fill settings ('s'), in ACTIVITIES order, read from the DOM
 * (the menu may be closed). */
async function ticked(pg, pre) {
  return pg.locator(`#${pre}-from-menu input[data-activity]`).evaluateAll(bs => bs.filter(b => b.checked).map(b => b.dataset.activity));
}

/** Open the "Gear from" menu of `pre` if it is closed. */
async function openFrom(pg, pre) {
  if ((await pg.getAttribute(`#${pre}-from`, 'aria-expanded')) !== 'true') await pg.click(`#${pre}-from`);
  await expect(pg.locator(`#${pre}-from-menu`)).toBeVisible();
}

/** Close the "Gear from" menu of `pre`: Escape in the browser; in the Fill settings dialog the menu's button again, since
 * Escape there also closes the dialog (the dialog's key handler sees it too). */
async function closeFrom(pg, pre) {
  if (pre === 's') await pg.click(`#${pre}-from`);
  else await pg.keyboard.press('Escape');
  await expect(pg.locator(`#${pre}-from-menu`)).toBeHidden();
}

/** Tick or untick one "Gear from" box (or the market board switch, key 'market'), then close the menu. */
async function setFrom(pg, pre, key, on) {
  await openFrom(pg, pre);
  const box = key === 'market' ? pg.locator(`#${pre}-market`) : pg.locator(`#${pre}-from-menu input[data-activity="${key}"]`);
  await (on ? box.check() : box.uncheck());
  await closeFrom(pg, pre);
}

/** The browser's "Gear from": the default boxes ticked, the button reads "11 of 20", the menu has two columns and a
 * line describing the box under the pointer, and fits the window; the market board switch off says so on the button,
 * and the choice is saved. */
async function checkGearFrom(pg) {
  await showTab(pg, 'browse');
  const searchedDefault = ACTIVITY_KEYS.filter(k => !DEFAULT_EXCLUDE.includes(k));
  const t0 = await ticked(pg, 'b');
  check(same(t0, searchedDefault), `listed by default: ${JSON.stringify(t0)}, expected ${JSON.stringify(searchedDefault)}`);
  await expect(pg.locator('#b-from')).toHaveText(`${searchedDefault.length} of ${ACTIVITY_KEYS.length}`);

  // the menu: two columns, the description line follows the pointer, inside the window
  await openFrom(pg, 'b');
  const cols = await pg.locator('#b-from-menu .from-cols > div').count();
  check(cols === 2, `the Gear from menu has ${cols} columns, expected 2`);
  await pg.hover('#b-from-menu [data-activity="hunts"]');
  await expect(pg.locator('#b-from-desc')).toContainText('Hunts: Allied Seals, Centurio Seals, Sacks of Nuts.');
  const inside = await pg.locator('#b-from-menu').evaluate(m => m.getBoundingClientRect().right <= document.documentElement.clientWidth);
  check(inside, 'the Gear from menu runs past the right edge of the window');
  await pg.keyboard.press('Escape');

  // the market board switch off, then Crafted left out: both saved
  await setFrom(pg, 'b', 'market', false);
  await expect(pg.locator('#b-from')).toHaveText(`${searchedDefault.length} of ${ACTIVITY_KEYS.length} · no market board`);
  await setFrom(pg, 'b', 'crafted', false);
  const savedOff = ACTIVITY_KEYS.filter(k => k === 'crafted' || DEFAULT_EXCLUDE.includes(k)).join(',');
  await waitSaved(pg, `s => s.browse.market === false && s.browse.exclude.join() === ${JSON.stringify(savedOff)}`);
  await setFrom(pg, 'b', 'crafted', true);
  await setFrom(pg, 'b', 'market', true);
  await expect(pg.locator('#b-from')).toHaveText(`${searchedDefault.length} of ${ACTIVITY_KEYS.length}`);
}

/** Scripts that keep the solver worker from running, for the fallback groups (addInitScript, before the page's own
 * script): a browser with no Worker, and a worker whose script fails as it loads (an 'error' event). */
const NO_WORKER = () => {
  delete window.Worker;
};
const FAILING_WORKER = () => {
  const RealWorker = window.Worker;
  window.Worker = class extends RealWorker {
    constructor(_pageWorkerUrl, options) {
      // the page's worker script is replaced by one that throws
      const failing = new Blob(['throw new Error("worker failed to load (smoke test)")'], { type: 'text/javascript' });
      super(URL.createObjectURL(failing), options);
    }
  };
};

/** A set page's Fill when its worker cannot run (ui/solver.js workerSolver's fallback, main.js): the search runs on the
 * page's thread with the core's numbers and its result can be applied; the Gear to search line and a changed goal are
 * answered too (a settings change searches again); Cancel right after Fill drops the search; the next Fill works; and no
 * worker is left running. The group's page errors are the runner's. */
async function checkWorkerFallback(pg) {
  const sync = { cap: 123, sync: true, level: 50 };
  const [mind, crit] = await Promise.all([coreRecipe('SGE', sync, {}), coreRecipe('SGE', sync, { target: 'crit' })]);
  await seedSheet(pg, FILL_SHEET);
  await openSet(pg, FILL_SHEET.name, 'Empty');
  await runFill(pg);
  await pg.click('#sh-apply');
  await expect(pg.locator('#sh-apply')).toHaveCount(0);
  await checkTotals(pg, 'the fallback Fill', mind.totals);
  // the next Fill works too: on the applied set it finds nothing to change
  await runFill(pg);
  await expect(pg.locator('#sh-apply')).toHaveText('Nothing to change');
  await pg.click('#sh-discard');
  await checkTotals(pg, 'after Discard', mind.totals);

  // a settings change searches again: the Gear to search line is answered, and Fill gives the new goal's set
  await pg.click('#sh-settings');
  await expect(pg.locator('#s-count')).toContainText('searching');
  await pg.selectOption('#s-target', 'crit');
  await runFill(pg, '#s-fill');
  await checkTotals(pg, 'the fallback Fill for another goal', crit.totals);
  await pg.click('#sh-apply');
  await expect(pg.locator('#sh-apply')).toHaveCount(0);

  // Cancel at once (both clicks in one task, before the search's frames): the search is dropped, the set stays
  const runs = await pg.evaluate("performance.getEntriesByName('fill').length");
  await pg.evaluate(async () => {
    document.querySelector('#sh-fill').click();
    await Promise.resolve(); // Alpine draws Cancel in a microtask
    document.querySelector('#sh-cancel').click();
  });
  await expect(pg.locator('#sh-fill')).toBeEnabled();
  await expect(pg.locator('#sh-toast')).toHaveText('Fill cancelled.');
  await afterFrames(pg); // a search Cancel failed to drop would have run by now
  const finished = (await pg.evaluate("performance.getEntriesByName('fill').length")) - runs;
  check(finished === 0, `a search cancelled before it started still ran (${finished})`);
  await expect(pg.locator('#sh-apply')).toHaveCount(0);
  await checkTotals(pg, 'after the cancelled Fill', crit.totals);
  await runFill(pg);
  await expect(pg.locator('#sh-apply')).toHaveText('Nothing to change');
  await pg.click('#sh-discard');
  check(pg.workers().length === 0, `${pg.workers().length} workers running after the fallback, not 0`);
  await pg.click('[data-tab=browse]');
}

/* A Sage sheet at the shared setup (level 50, synced to 123) with one set whose rows are all empty and unpinned, at its
   Fill settings' defaults (Mind first, melds on, food off). */
const FILL_SHEET = {
  v: 1,
  id: 's_fill',
  name: 'Fill check',
  description: '',
  job: 'SGE',
  level: 50,
  sync: { on: true, cap: 123 },
  sets: [
    {
      id: 'g_empty',
      name: 'Empty',
      description: '',
      pieces: ['weapon', 'offhand', 'head', 'body', 'hands', 'legs', 'feet', 'ear', 'neck', 'wrist', 'ring', 'ring'].map(slot => ({
        slot,
      })),
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

/* A Warrior sheet (level 100, no sync) whose set's Fill takes long: Determination > Critical Hit > Direct Hit with a
   Target GCD of 2.30, food and tier ranking (about 1.3 s on the owner's PC), so Cancel can stop it mid-search. */
const SLOW_FILL_SHEET = {
  ...FILL_SHEET,
  id: 's_slow',
  name: 'Slow fill',
  job: 'WAR',
  level: 100,
  sync: { on: false, cap: 123 },
  sets: [
    {
      ...FILL_SHEET.sets[0],
      fillSettings: {
        goal: { target: 'det', tb: 'crit', tb2: 'dh', gcd: 2.3, gcdMode: 'exact', byTier: true, melds: true, food: true },
        searchCriteria: { expOff: [], exclude: [...DEFAULT_EXCLUDE], market: true, min: '', max: '', lvl: 100 },
      },
    },
  ],
};

/** A set page's Fill on every piece a Sage can wear, at the shared setup's level and cap, with the Fill settings'
 * defaults: the set it suggests, applied, has the Mind the core finds for the same gear in Node (Total row: gear plus
 * the character's base). */
async function checkFillRealGear(pg) {
  const want = await coreGear('SGE', { cap: 123, sync: true, level: 50 }, 'main');
  await seedSheet(pg, FILL_SHEET);
  await openSet(pg, FILL_SHEET.name, 'Empty');
  await expect(pg.locator('#sh-fill')).toContainText('unpinned slots');
  await runFill(pg);
  await pg.click('#sh-apply');
  await expect(pg.locator('#sh-apply')).toHaveCount(0);
  await expect(pg.locator('#sh-total td[data-col="main"]')).toHaveText(want.on.toLocaleString('en-US'));
  await checkNoBadText(pg, 'a filled set');
  await pg.click('[data-tab=browse]');
}

// ---------- checks: the Fill settings dialog (the gear icon on a set page) ----------

/* The Fill settings checks run on a Sage sheet at level 100 with item level sync off, where Critical Hit is a goal that
   materia, spare points, a Target GCD, food, crafted gear and the filters under Gear to search all change. */
const DIALOG_SYNC = { cap: null, sync: false, level: 100 };
const DIALOG_SHEET = { ...FILL_SHEET, id: 's_dialog', name: 'Fill dialog', level: 100, sync: { on: false, cap: 795 } };
const DEFAULT_BOXES = ACTIVITY_KEYS.filter(k => !DEFAULT_EXCLUDE.includes(k));
/** The Gear to search line as the dialog shows it. */
const searchLine = (searched, all) => `· searching ${searched.toLocaleString('en-US')} of ${all.toLocaleString('en-US')} pieces`;

/** Open the Fill settings dialog of the open set page if it is closed. */
async function openFillSettings(pg) {
  if (!(await pg.locator('#sh-settings-dialog').isVisible())) await pg.click('#sh-settings');
  await expect(pg.locator('#sh-settings-dialog')).toBeVisible();
}

/** Wait until the Fill settings saved on the sheet's first set satisfy `test` (the set page saves a change at once). */
async function expectSavedFill(pg, sheet, what, test) {
  await poll(`saved Fill settings: ${what}`, async () => {
    const saved = await pg.evaluate(
      ([key, id]) => JSON.parse(localStorage.getItem(`${key}:sheet:${id}`))?.sets[0]?.fillSettings ?? null,
      [STORE_KEY, sheet.id],
    );
    return { ok: !!saved && test(saved), got: saved && { goal: saved.goal, searchCriteria: saved.searchCriteria } };
  });
}

/** The Total row's cells of the open set page against `totals` (coreRecipe's: the character panel's numbers). */
async function checkTotals(pg, what, totals, stats = Object.keys(totals)) {
  for (const stat of stats) {
    const got = await pg.locator(`#sh-total td[data-col="${stat}"]`).innerText();
    check(got === String(totals[stat]), `${what}: Total ${stat} is ${got}, the core finds ${totals[stat]}`);
  }
}

/** Fill from the dialog's own button, check the suggestion's Total row against the core's `want` (coreRecipe's shape),
 * run `more` while the result waits, then Discard. */
async function checkFilled(pg, what, want, more = null) {
  await openFillSettings(pg);
  await runFill(pg, '#s-fill');
  await checkTotals(pg, what, want.totals);
  if (more) await more();
  await pg.click('#sh-discard');
  await expect(pg.locator('#sh-apply')).toHaveCount(0);
}

/** The dialog's boxes against `want` ({id: value}): selects and number boxes by their value, switches by state. */
async function expectDialog(pg, want) {
  for (const [id, value] of Object.entries(want)) {
    const box = pg.locator(`#${id}`);
    if (typeof value === 'boolean') check((await box.isChecked()) === value, `#${id} is ${!value}, expected ${value}`);
    else await expect(box).toHaveValue(value);
  }
}

/** The goal part of the Fill settings dialog: Maximize, the tiebreaks, Spare points to tiebreaks, Materia and the Target
 * GCD, each wired (it saves into the set's fillSettings and changes what Fill finds, against the core), and all of it
 * kept across a reload. A change under a waiting Fill result drops the result. Food and the filters are in the next steps. */
async function checkFillGoal(pg) {
  const fill = fields => coreRecipe('SGE', DIALOG_SYNC, fields);
  const crit = { target: 'crit' };
  const [free, noMelds, tier, plain, gcd, gcdMin] = await Promise.all([
    fill(crit),
    fill({ ...crit, melds: false }),
    fill({ ...crit, tb: 'det' }),
    fill({ ...crit, tb: 'det', byTier: false }),
    fill({ ...crit, tb: 'det', gcd: 2.4 }),
    fill({ ...crit, tb: 'det', gcd: 2.4, gcdMode: 'min' }),
  ]);
  const { all, searched } = await coreGear('SGE', DIALOG_SYNC, 'crit');
  // each switch must change the answer, or the step could not tell that it is wired
  const moves = [
    ['Materia', free.totals.crit, noMelds.totals.crit],
    ['Spare points to tiebreaks', tier.totals.det, plain.totals.det],
    ['Target GCD', tier.totals.spd, gcd.totals.spd],
  ];
  let usable = gcd.status === 'ok' && gcdMin.status === 'ok';
  for (const [name, a, b] of moves)
    usable = check(a !== b, `${name} does not change the answer for Sage at level 100; pick another case`) && usable;
  if (!usable) return;

  await seedSheet(pg, DIALOG_SHEET);
  await openSet(pg, DIALOG_SHEET.name, 'Empty');
  await expect(pg.locator('#sh-goal')).toHaveCount(1); // no Fill settings saved yet: the goal line shows the defaults' goal
  await pg.click('#sh-settings');

  // 1. the defaults: Mind first, Materia on, Food off, spare points on but disabled with no tiebreak, any GCD, every
  // expansion, the default boxes, the equip level at the cap, and the line saying how many pieces are searched
  await expect(pg.locator('#s-count')).toHaveText(searchLine(searched, all));
  await expectDialog(pg, { 's-target': 'main', 's-tb1': '', 's-tb2': '', 's-gcd': '', 's-lvl': '100', 's-min': '', 's-max': '' });
  await expectDialog(pg, { 's-melds': true, 's-food': false, 's-by-tier': true });
  await expect(pg.locator('#s-by-tier')).toBeDisabled();
  await expect(pg.locator('#s-gcd')).toBeEnabled();
  await expect(pg.locator('#sh-settings-dialog .seg label.on')).toHaveText('exactly');
  await expect(pg.locator('#s-exp')).toHaveText('All expansions');
  await expect(pg.locator('#s-from')).toHaveText(`${DEFAULT_BOXES.length} of ${ACTIVITY_KEYS.length}`);
  const boxes = await ticked(pg, 's');
  check(same(boxes, DEFAULT_BOXES), `Gear from boxes in the Fill settings: ${JSON.stringify(boxes)}`);
  await pg.screenshot({ path: shot('fill-settings.png') });

  // 2. Maximize: saved, and the Target GCD range under its label
  await pg.selectOption('#s-target', 'crit');
  await expectSavedFill(pg, DIALOG_SHEET, 'Maximize Critical Hit', f => f.goal.target === 'crit');
  await expect(pg.locator('label[for="s-gcd"]')).toHaveText(/^Target GCD \(2\.50 to 2\.\d\d\)$/);
  await checkFilled(pg, 'Maximize Critical Hit', free, async () => {
    await expect(pg.locator('#sh-goal .gtxt')).toHaveText('CRT');
    await expect(pg.locator('#sh-goal .gcnt')).toHaveText(`· ${searched.toLocaleString('en-US')} pieces`);
  });

  // 3. Materia off, then on again
  await openFillSettings(pg);
  await pg.locator('#s-melds').uncheck();
  await expectSavedFill(pg, DIALOG_SHEET, 'Materia off', f => f.goal.melds === false);
  await checkFilled(pg, 'Materia off', noMelds);
  await openFillSettings(pg);
  await pg.locator('#s-melds').check();
  await expectSavedFill(pg, DIALOG_SHEET, 'Materia on', f => f.goal.melds === true);

  // 4. Tiebreak 1: a stat holds one rank (the goal's is not offered again, and a goal set to a tiebreak's stat swaps them);
  // Spare points to tiebreaks is usable once there is a tiebreak, and it changes the answer
  await expect(pg.locator('#s-tb1 option[value="crit"]')).toHaveCount(0);
  await pg.selectOption('#s-tb1', 'det');
  await expect(pg.locator('#s-by-tier')).toBeEnabled();
  await expectSavedFill(pg, DIALOG_SHEET, 'Tiebreak 1 Determination', f => f.goal.tb === 'det');
  await checkFilled(pg, 'Determination as Tiebreak 1, spare points on', tier);
  await openFillSettings(pg);
  await pg.locator('#s-by-tier').uncheck();
  await expectSavedFill(pg, DIALOG_SHEET, 'spare points off', f => f.goal.byTier === false);
  await checkFilled(pg, 'Determination as Tiebreak 1, spare points off', plain);
  await openFillSettings(pg);
  await pg.locator('#s-by-tier').check();
  await expectSavedFill(pg, DIALOG_SHEET, 'spare points on', f => f.goal.byTier === true);
  await pg.click('#sh-settings-dialog .shelp');
  await expect(pg.locator('#s-rank-pop')).toHaveText(
    'Substats only improve at tiers, so points short of the next tier do nothing in game. This sends those spare points to your tiebreaks instead.',
  );
  // the note's right edge is on the ? button's and inside the dialog (B17)
  await expect(pg.locator('#s-rank-pop')).toBeVisible();
  await poll('the Spare points note right edge on the ? button, inside the dialog', async () => {
    const edges = await pg.evaluate(() => {
      const right = selector => document.querySelector(selector).getBoundingClientRect().right;
      return { note: right('#s-rank-pop'), button: right('#sh-settings-dialog .shelp'), dialog: right('#sh-settings-dialog') };
    });
    return { ok: Math.abs(edges.note - edges.button) <= 1 && edges.note <= edges.dialog, got: edges };
  });
  await pg.click('#sh-settings-dialog .shelp');
  await expect(pg.locator('#s-rank-pop')).toBeHidden();
  await pg.selectOption('#s-target', 'det');
  await expectDialog(pg, { 's-target': 'det', 's-tb1': 'crit' });
  // a pick that moves another rank says so, as the prototype does
  await expect(pg.locator('#s-rank-note')).toHaveText('Tiebreak 1 changed to Critical Hit (a stat holds one rank).');
  await pg.selectOption('#s-target', 'crit');
  await expectDialog(pg, { 's-target': 'crit', 's-tb1': 'det' });
  await expect(pg.locator('#s-rank-note')).toHaveText('Tiebreak 1 changed to Determination (a stat holds one rank).');

  // 5. Target GCD: the box commits a number, exactly is marked, the goal line names it; a GCD one cannot have goes to the
  // slowest base GCD; with speed as the goal the box is off
  await setNumber(pg, '#s-gcd', '2.40');
  await expect(pg.locator('#s-rank-note')).toBeHidden(); // any other edit clears the swap note
  await expectSavedFill(pg, DIALOG_SHEET, 'Target GCD 2.40', f => Number(f.goal.gcd) === 2.4 && f.goal.gcdMode === 'exact');
  await expect(pg.locator('#sh-goal')).toContainText('CRT › DET, GCD 2.40');
  await checkFilled(pg, 'Target GCD 2.40', gcd, () => expect(pg.locator('#sh-figures [data-fig="gcd"] b').first()).toHaveText(gcd.gcd));
  await openFillSettings(pg);
  await pg.locator('#sh-settings-dialog .seg label', { hasText: 'or faster' }).click();
  await expect(pg.locator('#sh-settings-dialog .seg label.on')).toHaveText('or faster');
  await expectSavedFill(pg, DIALOG_SHEET, 'GCD or faster', f => f.goal.gcdMode === 'min');
  await expect(pg.locator('#sh-goal')).toContainText('GCD 2.40 or faster');
  await checkFilled(pg, 'Target GCD 2.40 or faster', gcdMin, () =>
    expect(pg.locator('#sh-figures [data-fig="gcd"] b').first()).toHaveText(gcdMin.gcd),
  );
  await openFillSettings(pg);
  await setNumber(pg, '#s-gcd', '3.00');
  await expect(pg.locator('#s-gcd')).toHaveValue('2.5');
  await expectSavedFill(pg, DIALOG_SHEET, 'GCD held to 2.5', f => Number(f.goal.gcd) === 2.5);
  await setNumber(pg, '#s-gcd', '2.40');
  await pg.selectOption('#s-target', 'spd');
  await expect(pg.locator('#s-gcd')).toBeDisabled();
  await expect(pg.locator('label[for="s-gcd"]')).toHaveText('Target GCD (off: the target is speed)');
  await pg.selectOption('#s-target', 'crit');
  await expect(pg.locator('#s-gcd')).toBeEnabled();
  await setNumber(pg, '#s-gcd', '');
  await expectSavedFill(pg, DIALOG_SHEET, 'any GCD', f => f.goal.gcd === '');

  // 6. a change of the settings drops a waiting result, with a note
  await runFill(pg, '#s-fill');
  await pg.click('#sh-settings');
  await pg.locator('#s-melds').uncheck();
  await expect(pg.locator('#sh-apply')).toHaveCount(0);
  await expect(pg.locator('#sh-toast')).toHaveText('The Fill settings changed, so the Fill result was dropped. Fill again.');
  await pg.locator('#s-melds').check();

  // 7. the settings kept across a reload, and the goal line with them
  await pg.selectOption('#s-tb2', 'dh');
  await pg.locator('#s-by-tier').uncheck();
  await pg.locator('#s-melds').uncheck();
  await setNumber(pg, '#s-gcd', '2.40');
  await pg.locator('#sh-settings-dialog .seg label', { hasText: 'exactly' }).click();
  await pg.locator('#s-food').check();
  await expectSavedFill(
    pg,
    DIALOG_SHEET,
    'the whole goal',
    f => f.goal.tb2 === 'dh' && !f.goal.byTier && !f.goal.melds && f.goal.food && Number(f.goal.gcd) === 2.4 && f.goal.gcdMode === 'exact',
  );
  await pg.reload();
  await waitReady(pg);
  await openSet(pg, DIALOG_SHEET.name, 'Empty');
  await expect(pg.locator('#sh-goal')).toContainText('CRT › DET › DHT, GCD 2.40');
  await pg.click('#sh-settings');
  await expectDialog(pg, { 's-target': 'crit', 's-tb1': 'det', 's-tb2': 'dh', 's-gcd': '2.4' });
  await expectDialog(pg, { 's-melds': false, 's-food': true, 's-by-tier': false });
  await expect(pg.locator('#sh-settings-dialog .seg label.on')).toHaveText('exactly');
  await checkNoBadText(pg, 'the Fill settings');
  await pg.keyboard.press('Escape');
  await pg.click('[data-tab=browse]');
}

/** Food in the Fill settings: switched on, Fill picks the meal with the core's numbers (every stat of the Total row,
 * meal included), the Food row names it, and the Take boxes agree with what Apply does: one per changed row and one for
 * the meal, Apply's count follows them, and declining the meal leaves the totals the core finds without it. With a Target
 * GCD the meal and the gear are chosen together, so the GCD asked is the one reached with the meal; a second Fill on the
 * applied set suggests only the meal. */
async function checkFillFood(pg) {
  const fill = fields => coreRecipe('SGE', DIALOG_SYNC, { target: 'crit', ...fields });
  const [noFood, food, withGcd] = await Promise.all([fill({}), fill({ food: true }), fill({ food: true, gcd: 2.4 })]);
  const usable = [
    check(food.meal && food.bonus.crit > 0, 'Sage level 100: the best meal adds no Critical Hit; pick another case'),
    check(food.totals.crit > noFood.totals.crit, 'Food does not raise Critical Hit; pick another case'),
    check(withGcd.meal && withGcd.bonus.spd > 0, 'Sage level 100: the meal for a GCD of 2.40 adds no speed; pick another case'),
  ].every(Boolean);
  if (!usable) return;
  // the gear's totals alone, on the same base
  const without = want => Object.fromEntries(Object.keys(want.totals).map(stat => [stat, want.totals[stat] - want.bonus[stat]]));
  const takeBoxes = pg.locator('#sh-gear .takebox input');
  const applyCount = async () => Number.parseInt((await pg.locator('#sh-apply').innerText()).replace(/\D+/g, ''), 10);

  await seedSheet(pg, DIALOG_SHEET);
  await openSet(pg, DIALOG_SHEET.name, 'Empty');
  await pg.click('#sh-settings');
  await pg.selectOption('#s-target', 'crit');
  check(!(await pg.locator('#s-food').isChecked()), 'Food is on by default');
  await pg.locator('#s-food').check();
  await expectSavedFill(pg, DIALOG_SHEET, 'Food on', f => f.goal.food === true);

  // 1. the best meal: the core's totals for every stat, its name on the Food row, a Take box per row and one for the meal
  await runFill(pg, '#s-fill');
  await checkTotals(pg, 'Food on', food.totals);
  await expect(pg.locator('#sh-meal-btn')).toContainText(food.meal);
  const boxes = await takeBoxes.count();
  check(boxes === 12, `${boxes} Take boxes for a Sage's 11 rows and a meal, expected 12`);
  check((await takeBoxes.evaluateAll(b => b.filter(x => x.checked).length)) === boxes, 'a Take box starts unticked');
  check((await applyCount()) === boxes, `Apply says "${await pg.locator('#sh-apply').innerText()}" for ${boxes} Take boxes`);
  await pg.screenshot({ path: shot('fill-food.png'), fullPage: true });

  // 2. declining the meal: Apply counts one less and the totals are the gear's alone on the same base
  await pg.locator('#sh-food-row .takebox input').uncheck();
  await expect(pg.locator('#sh-apply')).toHaveText(`Apply ${boxes - 1} changes`);
  await checkTotals(pg, 'meal declined', without(food));
  await pg.locator('#sh-food-row .takebox input').check();
  await expect(pg.locator('#sh-apply')).toHaveText(`Apply ${boxes} changes`);
  await checkTotals(pg, 'meal taken again', food.totals);
  await pg.click('#sh-discard');

  // 3. a Target GCD with food: the GCD reached is the one asked, with the meal; declining the meal still applies what the
  // preview showed, and the next Fill suggests the meal alone
  await pg.click('#sh-settings');
  await setNumber(pg, '#s-gcd', '2.40');
  await expectSavedFill(pg, DIALOG_SHEET, 'Target GCD 2.40', f => Number(f.goal.gcd) === 2.4);
  await runFill(pg, '#s-fill');
  await checkTotals(pg, 'Food and Target GCD 2.40', withGcd.totals);
  await expect(pg.locator('#sh-figures [data-fig="gcd"] b').first()).toHaveText(withGcd.gcd);
  await pg.locator('#sh-food-row .takebox input').uncheck();
  await checkTotals(pg, 'Target GCD, meal declined', without(withGcd));
  await pg.click('#sh-apply');
  await expect(pg.locator('#sh-apply')).toHaveCount(0);
  await checkTotals(pg, 'applied without the meal', without(withGcd));
  await expect(pg.locator('#sh-meal-btn')).toContainText('No food');
  await runFill(pg);
  await expect(pg.locator('#sh-apply')).toHaveText('Apply 1 change');
  check((await takeBoxes.count()) === 1, `${await takeBoxes.count()} Take boxes for a meal alone, expected 1`);
  await pg.click('#sh-apply');
  await expect(pg.locator('#sh-apply')).toHaveCount(0);
  await checkTotals(pg, 'applied with the meal', withGcd.totals);
  await expect(pg.locator('#sh-figures [data-fig="gcd"] b')).toHaveText(withGcd.gcd);
  await expect(pg.locator('#sh-meal-btn')).toContainText(withGcd.meal);
  await checkNoBadText(pg, 'a set with food');
  await pg.click('[data-tab=browse]');
}

/** "Best for goal" on the Food row (B17: the note beside the meal, the menu's switch, the pill in the full list):
 * a Fill with Food on, applied whole, shows "best for goal" (the saved list holds the several meals that tie), nothing while the result
 * waits; the menu opens on the tagged meals alone (N rows, the switch on) and the switch off lists every meal with the tagged
 * ones wearing the pill; a meal picked by hand and applied shows no note. The computed layout is B17's: the note 10 px from
 * the meal button, the pill 0.64rem bold with 6 px before it. */
async function checkFillBestMeal(pg) {
  // item level sync 123: several meals tie; sync off: one meal is best (the note, no count)
  await bestMealCase(pg, { ...DIALOG_SHEET, id: 's_best_sync', name: 'Best meal sync', sync: { on: true, cap: 123 } }, true);
  await bestMealCase(pg, DIALOG_SHEET, false);
}

/** One sheet of checkFillBestMeal: `several` says whether a Fill ties several meals. */
async function bestMealCase(pg, sheet, several) {
  await seedSheet(pg, sheet);
  await openSet(pg, sheet.name, 'Empty');
  await pg.click('#sh-settings');
  await pg.selectOption('#s-target', 'crit');
  await pg.locator('#s-food').check();
  await expectSavedFill(pg, sheet, 'Food on', f => f.goal.food === true);
  const note = pg.locator('#sh-food-row .mealline > .small');
  const switchIs = on =>
    poll(`the Best for goal switch ${on ? 'on' : 'off'}`, async () => ({
      ok: (await pg.locator('#sh-meal-menu .menu-tools .toggle input').isChecked()) === on,
      got: !on,
    }));
  const count = pg.locator('#sh-meal-btn .same-count');
  const savedList = () =>
    pg.evaluate(([key, id]) => JSON.parse(localStorage.getItem(`${key}:sheet:${id}`))?.sets[0]?.bestMeals ?? null, [STORE_KEY, sheet.id]);

  // 1. the result waits: no note; applied whole: the note, and the tie list saved with the set (no "1 of N" count)
  await runFill(pg, '#s-fill');
  await expect(note).toBeHidden();
  await pg.click('#sh-apply');
  await expect(pg.locator('#sh-apply')).toHaveCount(0);
  await expect(note).toHaveText('best for goal');
  await expect(count).toHaveCount(0);
  await poll('the tie list saved with the set', async () => ({ ok: !!(await savedList()), got: await savedList() }));
  const tied = (await savedList()).length;
  if (several) check(tied >= 2, `a Fill on Sage level 100 for Critical Hit with sync 123 ties ${tied} meals, expected several`);
  else check(tied === 1, `a Fill with sync off ties ${tied} meals, expected one`);

  // 2. the layout against B17 (proto-b17-settings: .mealline, .pill)
  const layout = await pg.evaluate(() => {
    const css = (el, ...props) => Object.fromEntries(props.map(p => [p, getComputedStyle(el)[p]]));
    const line = document.querySelector('#sh-food-row .mealline');
    const small = line.querySelector(':scope > .small');
    const btn = document.querySelector('#sh-meal-btn');
    return {
      line: css(line, 'display', 'alignItems', 'flexWrap'),
      note: {
        ...css(small, 'marginLeft', 'whiteSpace'),
        gap: small.getBoundingClientRect().left - btn.closest('.same').getBoundingClientRect().right,
      },
      oneLine:
        small.getBoundingClientRect().top >= line.getBoundingClientRect().top &&
        small.getBoundingClientRect().bottom <= line.getBoundingClientRect().bottom,
    };
  });
  check(
    layout.line.display === 'flex' && layout.line.flexWrap === 'nowrap' && layout.line.alignItems === 'center',
    `meal line layout ${JSON.stringify(layout.line)}`,
  );
  check(layout.note.marginLeft === '10px' && layout.note.whiteSpace === 'nowrap', `note ${JSON.stringify(layout.note)}`);
  check(Math.abs(layout.note.gap - 10) < 1, `the note is ${layout.note.gap} px from the meal button, expected 10`);
  check(layout.oneLine, 'the note is not on the meal line');

  // 3. the menu: the switch on, the tagged meals alone; off: every meal, the tagged ones with the pill
  await pg.click('#sh-meal-btn');
  const menu = pg.locator('#sh-meal-menu');
  const rows = menu.locator('.same-item[data-meal]:not([data-meal=""])');
  const toggle = menu.locator('.menu-tools .toggle input');
  await switchIs(true);
  await expect(menu.locator('.menu-tools .toggle')).toHaveText('Best for goal');
  await expect(rows).toHaveCount(tied);
  check((await menu.locator('.meal-item.best').count()) === 0, 'the pill shows while the switch is on');
  await pg.screenshot({ path: shot('best-meal-menu-on.png') });
  await toggle.uncheck();
  await poll('every meal listed', async () => {
    const listed = await rows.count();
    return { ok: listed > tied, got: listed };
  });
  await expect(menu.locator('.meal-item.best')).toHaveCount(tied);
  // the pill is a gold star (a mask) after the name, its alt text the words, 6 px from the name
  const star = await menu
    .locator('.meal-item.best .meal-name')
    .first()
    .evaluate(el => {
      const after = getComputedStyle(el, '::after');
      return Object.fromEntries(['content', 'width', 'height', 'marginLeft', 'maskImage', 'webkitMaskImage'].map(p => [p, after[p]]));
    });
  check(star.content.includes('best for goal'), `star alt text ${JSON.stringify(star)}`);
  check(
    Math.abs(Number.parseFloat(star.width) - 15.2) < 0.5 && star.width === star.height && star.marginLeft === '6px',
    `star size ${JSON.stringify(star)}`,
  );
  check(`${star.maskImage}${star.webkitMaskImage}`.includes('svg'), `star mask ${JSON.stringify(star)}`);
  await pg.screenshot({ path: shot('best-meal-menu-off.png') });
  await toggle.check();
  await expect(rows).toHaveCount(tied);
  // the switch stays as it was left: off, closed and opened again, still off; on again, still on
  await toggle.uncheck();
  await pg.click('#sh-meal-btn');
  await pg.click('#sh-meal-btn');
  await switchIs(false);
  await toggle.check();
  await pg.click('#sh-meal-btn');
  await pg.click('#sh-meal-btn');
  await switchIs(true);

  // 4. a meal picked by hand (not tagged) and applied: the note goes, the menu keeps its switch and the tagged meals
  await toggle.uncheck();
  await menu.locator('.same-item[data-meal]:not([data-meal=""]):not(.best)').first().click();
  await pg.click('#sh-apply');
  await expect(pg.locator('#sh-apply')).toHaveCount(0);
  await expect(note).toBeHidden();
  await pg.click('#sh-meal-btn');
  await expect(menu.locator('.menu-tools .toggle')).toHaveCount(1);
  await switchIs(false);
  await expect(menu.locator('.meal-item.best')).toHaveCount(tied);
  await toggle.check();
  await expect(rows).toHaveCount(tied + 1); // the tagged meals and the meal the set holds
  await expect(menu.locator('.meal-item.on')).toHaveCount(1);
  // the held meal leads alone, under its own heading
  await expect(menu.locator('[data-group="pick"] .same-head')).toHaveText('Your pick');
  await expect(menu.locator('[data-group="pick"] .meal-item')).toHaveCount(1);
  await pg.screenshot({ path: shot('best-meal-pick.png') });
  // the switch off: it still leads the full list, once
  await toggle.uncheck();
  await expect(menu.locator('[data-group="pick"] .same-head')).toHaveText('Your pick');
  await expect(menu.locator('.meal-item.on')).toHaveCount(1);
  await toggle.check();
  await pg.click('#sh-meal-btn');
  await checkNoBadText(pg, 'a set with a tagged meal');
  await pg.click('[data-tab=browse]');
}

/** A Fill that leaves a slot empty because no piece of it has an equip level within the Fill settings' Gear to search says
 * why under the bar: Sage has no weapon below level 60 (the lowest equip level in the item data), so a Fill up to equip
 * level 50 leaves the weapon empty and says so; the default (the job's cap) does not. */
async function checkEmptySlotNote(pg) {
  const low = { ...DIALOG_SHEET, id: 's_low_level', name: 'Level 50 sheet', level: 50 };
  // the set's Fill settings with Gear to search up to equip level 50 (the rest is read as the defaults)
  low.sets = low.sets.map(set => ({ ...set, fillSettings: { searchCriteria: { lvl: 50 } } }));
  await seedSheet(pg, low);
  await openSet(pg, low.name, 'Empty');
  await runFill(pg);
  await expect(pg.locator('#sh-empty-note')).toHaveText('Weapon: no Sage piece up to equip level 50, the lowest needs level 60.');
  await pg.click('#sh-discard');
  await expect(pg.locator('#sh-empty-note')).toBeHidden();
  await pg.click('[data-tab=browse]');
}

/** Gear to search in the Fill settings: the Expansion, Item level, Equip level and Gear from boxes and the market board
 * switch each change the line "searching N of M pieces" and the answer by what the core finds for the same filters; a
 * filter nothing passes says so on Fill; they are saved, kept across a reload, and not shared with the Gear browser's own
 * boxes. */
async function checkFillSearch(pg) {
  const filter = { expOff: ['ARR', 'HW', 'SB', 'ShB'], ilvlMax: 700 };
  const full = await coreGear('SGE', DIALOG_SYNC, 'crit');
  const noMarket = await coreGear('SGE', DIALOG_SYNC, 'crit', ['crafted'], DEFAULT_EXCLUDE, false);
  const filtered = await coreFiltered('SGE', DIALOG_SYNC, 'crit', filter);
  const low = await coreFiltered('SGE', DIALOG_SYNC, 'crit', { lvlMax: 50 });
  const noCrafted = await coreGear('SGE', DIALOG_SYNC, 'crit', [], ['crafted', ...DEFAULT_EXCLUDE], false);
  const crafted = noMarket.searched - noCrafted.searched;
  const usable = [
    check(filtered.on < full.on, 'the Expansion and item level filters do not lower Critical Hit; pick another case'),
    check(noMarket.without < noMarket.on, 'leaving crafted gear out does not lower Critical Hit; pick another case'),
    check(crafted > 0 && low.searched < full.searched, 'a box or the equip level leaves no piece out; pick another case'),
  ].every(Boolean);
  if (!usable) return;
  const line = result => searchLine(result.searched, result.all);

  await seedSheet(pg, DIALOG_SHEET);
  await openSet(pg, DIALOG_SHEET.name, 'Empty');
  await pg.click('#sh-settings');
  await pg.selectOption('#s-target', 'crit');
  await expect(pg.locator('#s-count')).toHaveText(line(full));

  // 1. Expansion and Item level: the count and the answer follow the browser's own filters; the menu closes by its button
  await pg.click('#s-exp');
  for (const box of await pg.locator('#s-exp-menu input').all()) {
    if (filter.expOff.includes(await box.getAttribute('data-exp'))) await box.uncheck();
  }
  await pg.click('#s-exp');
  await expect(pg.locator('#s-exp')).toHaveText('2 expansions');
  await setNumber(pg, '#s-max', String(filter.ilvlMax));
  await expect(pg.locator('#s-count')).toHaveText(line(filtered));
  await expectSavedFill(
    pg,
    DIALOG_SHEET,
    'two expansions, item level 700',
    f => same(f.searchCriteria.expOff, filter.expOff) && Number(f.searchCriteria.max) === filter.ilvlMax,
  );
  await checkFilled(pg, 'Expansion and item level filters', { totals: { crit: filtered.on } });

  // 2. a filter nothing passes: no pieces, and Fill says so
  await openFillSettings(pg);
  await setNumber(pg, '#s-min', '9999');
  await expect(pg.locator('#s-count')).toHaveText(searchLine(0, full.all));
  await startFill(pg, '#s-fill');
  await expect(pg.locator('#sh-fill-line')).toHaveText('Fill found no gear to search: no piece passes the filters under Gear to search.');
  await expect(pg.locator('#sh-apply')).toHaveCount(0);
  await openFillSettings(pg);
  await setNumber(pg, '#s-min', '');
  await setNumber(pg, '#s-max', '');
  await pg.click('#s-exp');
  for (const box of await pg.locator('#s-exp-menu input').all()) await box.check();
  await pg.click('#s-exp');
  await expect(pg.locator('#s-exp')).toHaveText('All expansions');
  await expect(pg.locator('#s-count')).toHaveText(line(full));

  // 3. Equip level: held to the job's level cap, and a lower one leaves out the pieces above it
  await setNumber(pg, '#s-lvl', '101');
  await expect(pg.locator('#s-lvl')).toHaveValue('100');
  await setNumber(pg, '#s-lvl', '50');
  await expect(pg.locator('#s-count')).toHaveText(line(low));
  await expectSavedFill(pg, DIALOG_SHEET, 'equip level 50', f => Number(f.searchCriteria.lvl) === 50);
  await setNumber(pg, '#s-lvl', '100');
  await expect(pg.locator('#s-count')).toHaveText(line(full));

  // 4. Gear from: the menu (two columns, a line for the box under the pointer, inside the window), the market board
  // switch and Crafted left out, each with the count and the answer the core finds
  await openFrom(pg, 's');
  const cols = await pg.locator('#s-from-menu .from-cols > div').count();
  check(cols === 2, `the Fill settings' Gear from menu has ${cols} columns, expected 2`);
  await pg.hover('#s-from-menu [data-activity="hunts"]');
  await expect(pg.locator('#s-from-desc')).toContainText('Hunts: Allied Seals, Centurio Seals, Sacks of Nuts.');
  const inside = await pg.locator('#s-from-menu').evaluate(m => m.getBoundingClientRect().right <= document.documentElement.clientWidth);
  check(inside, "the Fill settings' Gear from menu runs past the right edge of the window");
  await closeFrom(pg, 's');
  await setFrom(pg, 's', 'market', false);
  await expect(pg.locator('#s-from')).toHaveText(`${DEFAULT_BOXES.length} of ${ACTIVITY_KEYS.length} · no market board`);
  await expect(pg.locator('#s-count')).toHaveText(line(noMarket));
  await setFrom(pg, 's', 'crafted', false);
  await expect(pg.locator('#s-count')).toHaveText(line(noCrafted));
  const leftOut = ACTIVITY_KEYS.filter(k => k === 'crafted' || DEFAULT_EXCLUDE.includes(k));
  await expectSavedFill(
    pg,
    DIALOG_SHEET,
    'no market board, no crafted',
    f => f.searchCriteria.market === false && same(f.searchCriteria.exclude, leftOut),
  );
  await checkFilled(pg, 'no market board, no crafted gear', { totals: { crit: noMarket.without } });

  // 5. the choice is the set's own: the Gear browser's boxes stay at the defaults, and a reload keeps the set's
  await openFillSettings(pg);
  await pg.click('#s-exp');
  await pg.locator('#s-exp-menu input[data-exp="ARR"]').uncheck();
  await pg.click('#s-exp');
  await expect(pg.locator('#s-exp')).toHaveText('5 expansions');
  const withoutArr = await pg.locator('#s-count').innerText();
  await setNumber(pg, '#s-max', '700');
  await expect(pg.locator('#s-count')).not.toHaveText(withoutArr);
  const shownLine = await pg.locator('#s-count').innerText();
  await pg.keyboard.press('Escape');
  await pg.click('[data-tab=browse]');
  check(same(await ticked(pg, 'b'), DEFAULT_BOXES), "the Gear browser's boxes followed the Fill settings");
  await expect(pg.locator('#b-from')).toHaveText(`${DEFAULT_BOXES.length} of ${ACTIVITY_KEYS.length}`);
  await expect(pg.locator('#b-exp')).toHaveText('All expansions');
  await pg.reload();
  await waitReady(pg);
  await openSet(pg, DIALOG_SHEET.name, 'Empty');
  await pg.click('#sh-settings');
  await expect(pg.locator('#s-count')).toHaveText(shownLine);
  await expect(pg.locator('#s-exp')).toHaveText('5 expansions');
  await expectDialog(pg, { 's-max': '700', 's-min': '', 's-lvl': '100' });
  await expect(pg.locator('#s-from')).toHaveText(`${DEFAULT_BOXES.length - 1} of ${ACTIVITY_KEYS.length} · no market board`);
  check(!(await ticked(pg, 's')).includes('crafted'), 'Crafted came back after a reload');
  await checkNoBadText(pg, 'the Fill settings (Gear to search)');
  await pg.keyboard.press('Escape');
  await pg.click('[data-tab=browse]');
}

/* A Warrior sheet (level 100, no sync) whose set's Fill is as heavy as the data makes it: every "Gear from" box ticked
   (the most pieces), Determination > Critical Hit > Direct Hit, a Target GCD of 2.30, food and tier ranking. */
const CANCEL_SHEET = {
  ...SLOW_FILL_SHEET,
  id: 's_cancel',
  name: 'Cancel fill',
  sets: [
    {
      ...SLOW_FILL_SHEET.sets[0],
      fillSettings: {
        goal: SLOW_FILL_SHEET.sets[0].fillSettings.goal,
        searchCriteria: { ...SLOW_FILL_SHEET.sets[0].fillSettings.searchCriteria, exclude: [] },
      },
    },
  ],
};

/** Cancel stops a running Fill (ui/solver.js workerSolver cancel): the worker holding the search is ended, the result never
 * lands, the set is left as it was, one solver worker remains, and the next Fill is answered by the new worker with the
 * numbers the core finds. Fill and Cancel are clicked in one task, so no reply can arrive between them whatever the
 * machine's speed (a worker answers in a later task); the data (every box under Gear from, three goal stats, a Target GCD,
 * food) keeps the worker busy when it is ended, but nothing here depends on how long a search takes. */
async function checkFillCancel(pg) {
  const quick = { target: 'det', tb: '', tb2: '', food: false, gcd: '', exclude: [] };
  const want = await coreRecipe('WAR', { cap: null, sync: false, level: 100 }, quick);
  await seedSheet(pg, CANCEL_SHEET);
  await openSet(pg, CANCEL_SHEET.name, 'Empty');
  // the worker has the job's gear once the Gear to search line shows
  await pg.click('#sh-settings');
  await expect(pg.locator('#s-count')).toContainText('searching');
  await pg.keyboard.press('Escape');
  await expect(pg.locator('#sh-settings-dialog')).toHaveCount(0);
  let closed = 0;
  const watch = w => w.on('close', () => closed++);
  pg.workers().forEach(watch);
  pg.on('worker', watch);

  // Fill and Cancel in one task (Alpine draws Cancel in a microtask)
  const runs = await pg.evaluate("performance.getEntriesByName('fill').length");
  await pg.evaluate(async () => {
    document.querySelector('#sh-fill').click();
    await Promise.resolve();
    document.querySelector('#sh-cancel').click();
  });
  await expect(pg.locator('#sh-fill')).toBeEnabled();
  await expect(pg.locator('#sh-toast')).toHaveText('Fill cancelled.');
  await expect(pg.locator('#sh-apply')).toHaveCount(0);
  await poll('Cancel to end the searching worker', () => ({ ok: closed === 1, got: `${closed} workers ended` }));
  check(pg.workers().length === 1, `${pg.workers().length} solver workers after Cancel, not 1`);
  const finished = (await pg.evaluate("performance.getEntriesByName('fill').length")) - runs;
  check(finished === 0, `a cancelled Fill still answered (${finished})`);
  await expect(pg.locator('#sh-total td.small')).toContainText('slots empty'); // the set is as it was

  // the next Fill, a light one, is answered by the new worker with the core's numbers
  await pg.click('#sh-settings');
  await pg.selectOption('#s-tb1', '');
  await pg.selectOption('#s-tb2', '');
  await pg.locator('#s-food').uncheck();
  await setNumber(pg, '#s-gcd', '');
  await runFill(pg, '#s-fill');
  await checkTotals(pg, 'the Fill after Cancel', want.totals);
  check(pg.workers().length === 1, `${pg.workers().length} solver workers after the next Fill, not 1`);
  await pg.click('#sh-discard');
  await pg.click('[data-tab=browse]');
}

/** A solver worker that never answers a Fill while `window.__holdSolve` is true (a stand-in for a slow search: addInitScript,
 * before the page's own script). Gear to search requests still get their answers, and Cancel still ends the worker. The test
 * sets the flag, so a Fill stays running as long as the step needs, on any machine. */
const HOLD_SOLVE = () => {
  const RealWorker = window.Worker;
  window.__holdSolve = true;
  window.Worker = class extends RealWorker {
    postMessage(message, ...rest) {
      if (window.__holdSolve && message?.kind === 'solve') return;
      super.postMessage(message, ...rest);
    }
  };
};

/** Longest main-thread task allowed while a set page's piece menu or Food menu opens and draws its rows, at 4x slower CPU
 * (ms). Measured at 4x: 1.0 to 2.1 s before the menus drew their rows in steps and 0.2 to 0.3 s after; the margin is wide so a busy machine does not fail the run. */
const MENU_LONG_TASK_MS = 1000;

/** The menus of a set page draw a long list in steps (ui/views/limit-rows.js): on open the menu shows a window of rows and
 * the later ones follow, so no task is long at 4x slower CPU; every piece is still there at the end (the footer's count),
 * the search finds the last piece of the list, and the Food menu ends with all its meals. */
async function checkMenuSteps(pg) {
  await pg.setViewportSize({ width: 1280, height: 900 });
  await seedSheet(pg, SET_SHEET);
  await openSageSet(pg);
  const cdp = await pg.context().newCDPSession(pg);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  // Open `buttonSel`; the row counts of `menuSel` at its first frame and when they stop growing; the longest task
  const open = (buttonSel, menuSel) =>
    pg.evaluate(
      async ([buttonSel, menuSel]) => {
        const frame = () => new Promise(done => requestAnimationFrame(done));
        const rows = () => document.querySelectorAll(`${menuSel} .same-item`).length;
        let longest = 0;
        const observer = new PerformanceObserver(list => {
          for (const entry of list.getEntries()) longest = Math.max(longest, entry.duration);
        });
        observer.observe({ type: 'longtask' });
        document.querySelector(buttonSel).click();
        while (!document.querySelector(menuSel)) await frame();
        await frame();
        const first = rows();
        let last = first;
        for (let still = 0; still < 30; ) {
          await frame();
          still = rows() === last ? still + 1 : 0;
          last = rows();
        }
        await new Promise(done => setTimeout(done, 100)); // long-task entries arrive after the task
        observer.disconnect();
        return { first, last, longest };
      },
      [buttonSel, menuSel],
    );
  const close = async () => {
    await pg.keyboard.press('Escape');
    await pg.evaluate(() => document.body.click());
    await expect(pg.locator('.same-menu')).toHaveCount(0);
  };

  // the head piece menu (a long list): a window first, then every piece
  const head = await open('#sh-gear tr[data-row="2"] [data-pick]', '.pick-menu');
  const total = Number((await pg.locator('.pick-menu .same-foot').innerText()).match(/^(\d+) pieces/)[1]);
  assert.ok(total > 200, `a long list to test with (${total} pieces)`);
  assert.ok(head.first < total / 2, `the head menu opens with a window of rows, not all ${total}: ${head.first}`);
  assert.equal(
    head.last,
    total + 1, // every piece, and "Empty this slot" (the row holds a piece)
    'the head menu ends with every piece',
  );
  assert.ok(head.longest < MENU_LONG_TASK_MS, `the head menu's longest task at 4x: ${head.longest} ms (limit ${MENU_LONG_TASK_MS})`);
  const lastKey = await pg.locator('.pick-menu .same-item[data-game-id]').last().getAttribute('data-game-id');
  const lastName = await pg.locator('.pick-menu .same-item[data-game-id]').last().locator('span span').first().innerText();
  await close();

  // the search finds the last piece of the list at once, before the later rows are drawn
  await pg.locator('#sh-gear tr[data-row="2"] [data-pick]').click();
  await pg.locator('.pick-menu input[type=text]').fill(lastName);
  await expect(pg.locator(`.pick-menu .same-item[data-game-id="${lastKey}"]`)).toHaveCount(1);
  await close();

  // the Food menu: a window first, then every meal
  const food = await open('#sh-meal-btn', '#sh-meal-menu');
  assert.ok(food.last > food.first, `the Food menu draws its meals in steps: ${food.first} then ${food.last}`);
  assert.ok(food.longest < MENU_LONG_TASK_MS, `the Food menu's longest task at 4x: ${food.longest} ms (limit ${MENU_LONG_TASK_MS})`);
  await close();
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await cdp.detach();
}

/** The rows of the piece menu and the Food menu are picked through one click handler on the list (the rows carry
 * data-game-id and data-meal): a piece row picks its piece, Empty this slot empties the row, a Unique ring worn in the other
 * ring row is disabled and a click on it does nothing, a meal row picks its meal and No food clears it. */
async function checkMenuClicks(pg) {
  await pg.setViewportSize({ width: 1280, height: 900 });
  const AGATE = 49579; // Bygone Brass Ring of Healing, a Unique ring
  const sheet = structuredClone(SET_SHEET);
  sheet.sets[0].pieces[11] = { slot: 'ring', gameId: AGATE, stones: [] }; // the second ring row wears it
  await seedSheet(pg, sheet);
  await openSageSet(pg);
  const ring = pg.locator('#sh-gear tr[data-row="10"] [data-pick]');
  const menu = pg.locator('.pick-menu');
  const apply = pg.locator('#sh-apply');
  await ring.click();
  await expect(menu).toBeVisible();

  // a Unique ring worn in the other row: disabled, and a click on it changes nothing
  const taken = menu.locator(`.same-item[data-game-id="${AGATE}"]`);
  await taken.scrollIntoViewIfNeeded();
  await expect(taken).toBeDisabled();
  await expect(taken).toContainText('Unique, in the other ring');
  await taken.click({ force: true });
  await expect(menu).toBeVisible();
  await expect(apply).toHaveCount(0);

  // a piece row picks that piece
  const piece = menu.locator('.same-item[data-game-id]:not([disabled])').first();
  const pieceName = (await piece.locator('span span').first().innerText()).trim();
  await piece.click();
  await expect(menu).toHaveCount(0);
  await expect(ring).toContainText(pieceName);
  await expect(apply).toHaveText('Apply 1 change');

  // Empty this slot empties the row
  await ring.click();
  await menu.locator('[data-empty-slot]').click();
  await expect(menu).toHaveCount(0);
  await expect(ring).toHaveText('Choose a piece');

  // the Food menu: a meal row picks its meal, No food clears it
  const food = pg.locator('#sh-meal-btn');
  const mealMenu = pg.locator('#sh-meal-menu');
  await food.click();
  const meal = mealMenu.locator('.same-item[data-meal]:not([data-meal=""])').first();
  const mealKey = await meal.getAttribute('data-meal');
  await meal.click();
  await expect(mealMenu).toHaveCount(0);
  await expect(food).toContainText(mealKey);
  await food.click();
  await mealMenu.locator('.same-item[data-meal=""]').click();
  await expect(mealMenu).toHaveCount(0);
  await expect(food).toContainText('No food');

  await pg.click('#sh-discard');
  await expect(ring).not.toHaveText('Choose a piece');
  await pg.click('[data-tab=browse]');
}

/** The id of the element that has focus. */
const focusedId = pg => pg.evaluate(() => document.activeElement?.id ?? '');

/** The edit lock while a Fill runs (docs/engineering/sheets.md): on the set page every control that changes the set or its
 * sheet is off (the gear icon, the name's pencil, Copy, Delete, a piece, a pin, the Food row's button, New set in the set
 * menu), a click on a pin changes nothing, Cancel stays, and the ways off the page ask first: Keep waiting stays, Leave
 * and cancel the Fill opens the sheet's page with every control on again. A held worker (HOLD_SOLVE) keeps the Fill
 * running; the sheet's own level, cap, New set and reorder handles cannot be reached while it runs (leaving cancels it). */
async function checkEditLock(pg) {
  await pg.evaluate(() => {
    window.__holdSolve = true;
  });
  await seedSheet(pg, SET_SHEET);
  await openSageSet(pg);
  const locked = [
    '#sh-settings',
    '#sh-set-edit',
    '#sh-set-copy',
    '#sh-set-delete',
    '#sh-gear tr[data-row="4"] [data-pick]',
    '#sh-gear tr[data-row="2"] .pinic',
    '#sh-meal-btn',
  ];
  const stateOf = async () => {
    const off = [];
    for (const sel of locked) if (await pg.locator(sel).isDisabled()) off.push(sel);
    return off;
  };
  check((await stateOf()).length === 0, `at rest, controls are off: ${await stateOf()}`);

  // a Fill that does not finish
  await pg.click('#sh-fill');
  await expect(pg.locator('#sh-cancel')).toBeVisible();
  await expect(pg.locator('#sh-fill')).toHaveCount(0); // the Fill button gives way to "Solving…" and Cancel
  const off = await stateOf();
  check(same(off, locked), `during a Fill these controls stay on: ${locked.filter(sel => !off.includes(sel))}`);
  const pinned = pg.locator('#sh-gear tr[data-row="2"] .pinic');
  await pinned.click({ force: true });
  await expect(pinned).toHaveAttribute('aria-pressed', 'true'); // the click changed nothing
  await pg.click('#sh-set-switch');
  await expect(pg.locator('#sh-set-menu .setnew')).toBeDisabled();
  await pg.keyboard.press('Escape');
  await pg.screenshot({ path: shot('edit-lock.png') });

  // leaving asks; Keep waiting stays with the Fill running; Leave cancels it and unlocks the sheet's page
  await pg.click('#sh-set .setcrumb a:nth-of-type(2)');
  await expect(pg.locator('#sh-leave-q')).toHaveText('A Fill is still running for “Mine”. Leaving cancels it, and the set stays as it is.');
  await pg.click('#sh-leave-keep');
  await expect(pg.locator('#sh-cancel')).toBeVisible();
  await pg.click('#sh-set .setcrumb a:nth-of-type(2)');
  await pg.click('#sh-leave-go');
  await expect(pg.locator('#sh-sheet')).toBeVisible();
  for (const sel of [
    '#sh-level',
    '#sh-cap',
    '#sh-sync',
    '#sh-new-set',
    '#sh-edit',
    '#sh-copy',
    '#sh-delete',
    '#sh-sets .draghandle:not(.off)',
  ]) {
    await expect(pg.locator(sel).first())
      .toBeEnabled()
      .catch(() => check(false, `${sel} is off after the Fill was cancelled`));
  }
  check(
    (await pg.locator('#sh-sets .draghandle').evaluateAll(hs => hs.every(h => h.draggable))) === true,
    'a reorder handle cannot be dragged after the Fill was cancelled',
  );
  await pg.click('[data-tab=browse]');
}

/** Where focus goes on a set page: back to Fill after Cancel, nowhere broken after leaving a running Fill (no page errors:
 * the set page's late callbacks check `isConnected`), into the Fill settings dialog and back to its gear button, back to
 * the sets button after Keep, and onto Apply once a Fill result waits. */
async function checkSetPageFocus(pg) {
  await pg.evaluate(() => {
    window.__holdSolve = true;
  });
  await seedSheet(pg, SET_SHEET);
  await openSageSet(pg);

  // Cancel: focus returns to Fill
  await pg.click('#sh-fill');
  await expect(pg.locator('#sh-cancel')).toBeVisible();
  await pg.click('#sh-cancel');
  await expect(pg.locator('#sh-fill')).toBeEnabled();
  await poll('focus back on Fill after Cancel', async () => {
    const got = await focusedId(pg);
    return { ok: got === 'sh-fill', got };
  });

  // leaving a running Fill: "Leave and cancel the Fill" opens the sheet page with no page error
  await pg.click('#sh-fill');
  await expect(pg.locator('#sh-cancel')).toBeVisible();
  await pg.click('#sh-set .setcrumb a');
  await expect(pg.locator('#sh-leave-go')).toHaveText('Leave and cancel the Fill');
  await pg.click('#sh-leave-go');
  await expect(pg.locator('#sh-set')).toHaveCount(0);
  await openSageSet(pg);

  // the Fill settings dialog: focus goes to its first select, and back to the gear button on close
  await pg.click('#sh-settings');
  await expect(pg.locator('#sh-settings-dialog')).toBeVisible();
  const firstSelect = await pg.evaluate(() => document.querySelector('#sh-settings-dialog select')?.id ?? '');
  await poll('focus on the first select of the Fill settings', async () => {
    const got = await focusedId(pg);
    return { ok: firstSelect !== '' && got === firstSelect, got };
  });
  await pg.keyboard.press('Escape');
  await expect(pg.locator('#sh-settings-dialog')).toHaveCount(0);
  await poll('focus on the gear button after closing the Fill settings', async () => {
    const got = await focusedId(pg);
    return { ok: got === 'sh-settings', got };
  });

  // the leave question: Keep returns focus to the sets button
  await pg.locator('#sh-gear tr[data-row="4"] [data-pick]').click();
  await pg.locator('.pick-menu .same-item[data-game-id]').first().click();
  await expect(pg.locator('#sh-apply')).toHaveText('Apply 1 change');
  await pg.click('#sh-set .setcrumb a:nth-of-type(2)');
  await expect(pg.locator('#sh-leave')).toBeVisible();
  await pg.click('#sh-leave-keep');
  await expect(pg.locator('#sh-leave')).toHaveCount(0);
  await poll('focus on the sets button after Keep', async () => {
    const got = await focusedId(pg);
    return { ok: got === 'sh-set-switch', got };
  });
  await pg.click('#sh-discard');

  // a Fill result: Apply (Discard if Apply is disabled) has focus; a real search, so the held worker lets it through
  await pg.evaluate(() => {
    window.__holdSolve = false;
  });
  await runFill(pg);
  await poll('focus on Apply or Discard after a Fill result', async () => {
    const got = await focusedId(pg);
    const applyOff = await pg.locator('#sh-apply').isDisabled();
    return { ok: got === (applyOff ? 'sh-discard' : 'sh-apply'), got };
  });
  await pg.click('#sh-discard');
  await pg.click('[data-tab=browse]');
}

/** A set page's piece menu (the .pick-menu, roadmap A9) at the shortest window the page supports for height (960 x 700),
 * on a row near the table's bottom: it opens without a sideways scroll, between the pinned header and the window's bottom
 * and inside its right edge; Escape closes it; a row's menu button scrolled under the sticky heading stays under it (the
 * header and the column names draw over it); the search box takes the keys, a search with no match says so and Clear
 * search brings the pieces back; a picked piece is what the row shows and a draft of one change that Discard undoes. */
async function checkPickMenu(pg) {
  await pg.setViewportSize({ width: 960, height: 700 });
  await seedSheet(pg, SET_SHEET);
  await openSageSet(pg);
  const button = pg.locator('#sh-gear tr[data-row="6"] [data-pick]'); // the feet row: open, and near the table's bottom
  const menu = pg.locator('.pick-menu');
  await expect(button).toHaveText('Choose a piece');
  await button.click();
  await expect(menu).toBeVisible();
  check(!(await hasHScroll(pg)), `the piece menu scrolls the page sideways at 960 px`);
  await poll('the menu to sit between the pinned header and the window bottom, inside the right edge', async () => {
    const got = await pg.evaluate(() => {
      const box = document.querySelector('.pick-menu').getBoundingClientRect();
      const head = document.querySelector('#sh-set .shead').getBoundingClientRect();
      const round = Math.round;
      return {
        menuTop: round(box.top),
        menuBottom: round(box.bottom),
        headBottom: round(head.bottom),
        window: innerHeight,
        menuRight: round(box.right),
        width: document.documentElement.clientWidth,
      };
    });
    return { ok: got.menuTop >= got.headBottom && got.menuBottom <= got.window && got.menuRight <= got.width, got };
  });
  await pg.screenshot({ path: shot('pick-menu.png') });
  await pg.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);

  // scrolled under the sticky headings, the row's menu button stays below the pinned header and the column names
  const covered = await pg.evaluate(() => {
    const row = document.querySelector('#sh-gear tr[data-row="6"] [data-pick]');
    scrollBy(0, row.getBoundingClientRect().top - 4); // the row to the window's top, where the headings stick
    const head = document.querySelector('#sh-set .shead').getBoundingClientRect();
    const names = document.querySelector('#sh-gear thead th').getBoundingClientRect();
    const box = row.getBoundingClientRect();
    const hit = y => document.elementFromPoint(box.left + 10, y);
    const bad = [];
    if (!hit((head.top + head.bottom) / 2)?.closest('.shead')) bad.push('pinned header');
    if (!hit((names.top + names.bottom) / 2)?.closest('th')) bad.push('column names');
    return bad.join(' and ');
  });
  check(!covered, `a row's menu button draws over the ${covered}`);

  // search: the box has the focus; no match says so; Clear search brings the pieces back
  await button.click();
  await expect(menu).toBeVisible();
  await pg.waitForFunction(() => document.activeElement?.matches('.pick-menu input[type="text"]'));
  const pieces = menu.locator('.same-item[data-game-id]');
  // the menu draws its rows in steps (checkMenuSteps): wait for all of them, as many as the footer counts
  const count = Number((await menu.locator('.same-foot').innerText()).match(/^(\d+) pieces/)[1]);
  await expect(pieces).toHaveCount(count);
  check(count > 1, `the feet menu lists ${count} pieces`);
  await menu.locator('input[type="text"]').fill('zzzz');
  await expect(pieces).toHaveCount(0);
  await expect(menu.locator('.menu-empty')).toContainText('No piece matches "zzzz".');
  await menu.locator('.menu-empty button').click();
  await expect(pieces).toHaveCount(count);

  // a pick: the row shows it, the change waits as a draft, Discard puts the row back
  const other = pieces.first();
  const name = (await other.locator('span span').first().innerText()).trim();
  await other.click();
  await expect(menu).toHaveCount(0);
  await expect(button).toContainText(name);
  await expect(pg.locator('#sh-apply')).toHaveText('Apply 1 change');
  await checkNoBadText(pg, 'the piece menu');
  await pg.click('#sh-discard');
  await expect(button).toHaveText('Choose a piece');
  await pg.setViewportSize({ width: 1000, height: 900 });
  await pg.click('[data-tab=browse]');
}

/* A saved sheet of one empty set, named "Mine", for `job` at `level` (the sheet tests that need only a sheet of a job). */
const edgeSheet = (id, name, job, level, sync) => ({
  ...FILL_SHEET,
  id,
  name,
  job,
  level,
  sync,
  sets: [{ ...FILL_SHEET.sets[0], id: `g_${id}`, name: 'Mine' }],
});

/** The sheet manager and a sheet's page where they are easy to get wrong: a record that could not be read is listed with its
 * cause and Delete asks first (Cancel keeps it, Delete removes the record); Blue Mage (level 80) and Beastmaster (level 50)
 * show their level range on the sheet page and in the New sheet dialog, hold a typed level to it, and a saved level above
 * it opens as the cap; Copy from a set page lands on the sheet's list with the copy next to the original, and Delete from
 * a set page lands one level up, on the sheet's page. */
async function checkSheetEdges(pg) {
  const sync = { on: false, cap: 795 };
  await seedSheets(
    pg,
    [
      edgeSheet('s_blu', 'Blue', 'BLU', 100, sync),
      edgeSheet('s_bst', 'Beast', 'BST', 50, { on: true, cap: 135 }),
      edgeSheet('s_sge', 'Sage', 'SGE', 100, sync),
    ],
    { s_broken: '{not json' },
  );
  await pg.setViewportSize(NARROW);
  await pg.click('[data-tab=sheets]');
  const stored = id => pg.evaluate(([key, sheetId]) => localStorage.getItem(`${key}:sheet:${sheetId}`), [STORE_KEY, id]);

  // 1. a record that could not be read: listed with its cause; Delete asks, Cancel keeps it, Delete removes it
  await expect(pg.locator('#sh-unreadable h3')).toHaveText('Could not be read');
  await expect(pg.locator('#sh-unreadable')).toContainText('Could not be read: not valid JSON');
  await pg.locator('#sh-unreadable button', { hasText: 'Delete' }).click();
  await expect(pg.locator('#sh-dialog .question')).toContainText('Delete the saved sheet that could not be read');
  await pg.locator('#sh-dialog button', { hasText: 'Cancel' }).click();
  check((await stored('s_broken')) === '{not json', 'Cancel in the Delete question removed the unreadable record');
  await expect(pg.locator('#sh-unreadable')).toBeVisible();
  await pg.locator('#sh-unreadable button', { hasText: 'Delete' }).click();
  await pg.click('#sh-dlg-ok');
  await expect(pg.locator('#sh-unreadable')).toHaveCount(0);
  check((await stored('s_broken')) === null, 'Delete left the unreadable record in storage');
  check(
    same(await sheetNames(pg, '#sh-list'), ['Blue', 'Beast', 'Sage']),
    `sheets after deleting the record: ${await sheetNames(pg, '#sh-list')}`,
  );

  // 2. the level range of the jobs with a lower cap: Blue Mage 80 (saved above it: opens at it), Beastmaster 50
  await pg.locator('#sh-list a.sname', { hasText: 'Blue' }).click();
  await expect(pg.locator('#sh-level-range')).toHaveText('1–80');
  await expect(pg.locator('#sh-level')).toHaveValue('80');
  await setNumber(pg, '#sh-level', '99');
  await expect(pg.locator('#sh-level')).toHaveValue('80');
  await pg.click('#sh-sheet .setcrumb a');
  await pg.locator('#sh-list a.sname', { hasText: 'Beast' }).click();
  await expect(pg.locator('#sh-level-range')).toHaveText('1–50');
  await expect(pg.locator('#sh-level')).toHaveValue('50');
  await setNumber(pg, '#sh-level', '70');
  await expect(pg.locator('#sh-level')).toHaveValue('50');
  await expect(pg.locator('#sh-cap')).toHaveValue('135'); // the cap level 50 allows, unchanged
  await pg.click('#sh-sheet .setcrumb a');
  await pg.click('#sh-new');
  for (const [job, top] of [
    ['BST', '50'],
    ['BLU', '80'],
    ['WAR', '100'],
  ]) {
    await pg.click(`#sh-dialog [data-job-id=${job}]`);
    await expect(pg.locator('#sh-dialog label:has(#sh-dlg-level) .f-range')).toHaveText(`1–${top}`);
    await setNumber(pg, '#sh-dlg-level', '99');
    await expect(pg.locator('#sh-dlg-level')).toHaveValue(Math.min(99, Number(top)).toString());
  }
  await pg.keyboard.press('Escape');

  // 3. Copy from a set page: the sheet's list, the copy next to the original; Delete from a set page: the sheet's page
  await pg.locator('#sh-list a.sname', { hasText: 'Sage' }).click();
  await pg.locator('#sh-sets a.sname', { hasText: 'Mine' }).click();
  await pg.click('#sh-set-copy');
  await expect(pg.locator('#sh-sets')).toBeVisible();
  check(same(await sheetNames(pg, '#sh-sets'), ['Mine', 'Mine (1)']), `sets after Copy: ${await sheetNames(pg, '#sh-sets')}`);
  await pg.locator('#sh-sets a.sname', { hasText: 'Mine (1)' }).click();
  await pg.click('#sh-set-delete');
  await expect(pg.locator('#sh-dialog .question')).toContainText('Mine (1)');
  await pg.click('#sh-dlg-ok');
  await expect(pg.locator('#sh-set')).toHaveCount(0);
  await expect(pg.locator('#sh-sheet .crumbhere')).toHaveText('Sage');
  check(same(await sheetNames(pg, '#sh-sets'), ['Mine']), `sets after Delete: ${await sheetNames(pg, '#sh-sets')}`);
  await pg.locator('#sh-sets a.sname').click();
  await pg.click('#sh-set-delete');
  await pg.click('#sh-dlg-ok');
  await expect(pg.locator('#sh-no-sets h3')).toHaveText('No gear sets yet');
  check(!(await hasHScroll(pg)), `Sheets: a sheet's page scrolls sideways at ${NARROW.width} px`);
  await pg.setViewportSize({ width: 1000, height: 900 });
  await pg.click('[data-tab=browse]');
}

/* A saved sheet of one set whose row `row` holds the piece `gameId` with `stones`, for `job` (level 100, no sync). */
const pieceSheet = (id, name, job, row, gameId, stones) => ({
  ...edgeSheet(id, name, job, 100, { on: false, cap: 795 }),
  sets: [
    {
      ...FILL_SHEET.sets[0],
      id: `g_${id}`,
      name: 'Mine',
      pieces: FILL_SHEET.sets[0].pieces.map((piece, i) => (i === row ? { slot: piece.slot, gameId, stones } : piece)),
    },
  ],
});

/** The overmeld odds in a set page's materia menu (docs/mechanics/materia.md): an overmeld slot's menu has an "odds" row with
 * one figure per grade column, a guaranteed slot's has none, and a piece that cannot be high quality says its odds are
 * lower. Expected values are the game's MateriaGrade sheet's rates: Courtly Lover's Earrings (49309, high quality
 * possible) in its second overmeld slot give 10% for each of the four grades shown, and have no note; its guaranteed slot
 * has no odds row; Axe of the Fury (14756, no high quality) in its first overmeld slot give 12% 48% 60% 72% and the note.
 * Overmeld chips stay locked until the slots before them hold a stone, so those are seeded. */
async function checkOvermeldOdds(pg) {
  await pg.setViewportSize(NARROW);
  const stone = (stat, grade) => ({ stat, grade });
  await seedSheets(pg, [
    pieceSheet('s_odds_sge', 'Odds Sage', 'SGE', 7, 49309, [stone('crit', 12), stone('crit', 12)]),
    pieceSheet('s_odds_war', 'Odds Warrior', 'WAR', 0, 14756, [stone('crit', 7), stone('crit', 7)]),
  ]);
  const popup = pg.locator('.matpop');
  const note = "Odds for a piece that can't be high quality.";

  // Courtly Lover's Earrings: an overmeld slot has odds, the guaranteed slot has none
  await openSet(pg, 'Odds Sage', 'Mine');
  await pg.click('[data-chip="7:2"]');
  await expect(popup.locator('h5')).toHaveText('Earring · overmeld slot 2');
  await expect(popup).toContainText('odds');
  // an empty slot has no Remove (B17 leaves the place empty); a filled slot behind a later stone has one, disabled
  const footer = await popup.locator('.matfoot button').allInnerTexts();
  check(same(footer, ['Show all grades', 'Close']), `an empty slot's menu footer is ${footer}, not Show all grades, Close`);
  check(
    same(await popup.locator('.pc').allInnerTexts(), ['10%', '10%', '10%', '10%']),
    `the earring's overmeld odds are ${await popup.locator('.pc').allInnerTexts()}, not 10% 10% 10% 10%`,
  );
  check(!(await popup.innerText()).includes(note), 'a piece that can be high quality has the not-high-quality note');
  await pg.screenshot({ path: shot('overmeld-odds.png') });
  // every grade: those the slot cannot take (the high grades in a small slot) have no odds, shown as a dash, not 0%
  await popup.getByRole('button', { name: 'Show all grades' }).click();
  const allOdds = await popup.locator('.pc').allInnerTexts();
  check(
    same(allOdds, ['–', '10%', '–', '10%', '–', '10%', '–', '10%', '32%', '38%', '44%', '48%']),
    `the earring's odds for every grade are ${allOdds}, not a dash for the grades the slot cannot take`,
  );
  await pg.screenshot({ path: shot('overmeld-odds-all.png') });
  await pg.keyboard.press('Escape');
  await expect(popup).toHaveCount(0);
  await pg.click('[data-chip="7:0"]');
  await expect(popup.locator('h5')).toHaveText('Earring · slot 1 of 1');
  await expect(popup.locator('.matfoot button').first()).toHaveText('Remove');
  await expect(popup.locator('.matfoot button').first()).toBeDisabled();
  await expect(popup.locator('.pc')).toHaveCount(0);
  await pg.keyboard.press('Escape');

  // Axe of the Fury: the lower rates and the note
  await pg.click('#sh-set .setcrumb a');
  await openSet(pg, 'Odds Warrior', 'Mine');
  await pg.click('[data-chip="0:2"]');
  await expect(popup.locator('h5')).toHaveText('Weapon · overmeld slot 1');
  check(
    same(await popup.locator('.pc').allInnerTexts(), ['12%', '48%', '60%', '72%']),
    `the axe's overmeld odds are ${await popup.locator('.pc').allInnerTexts()}, not 12% 48% 60% 72%`,
  );
  await expect(popup).toContainText(note);
  check(!(await hasHScroll(pg)), `the materia menu scrolls the page sideways at ${NARROW.width} px`);
  await checkNoBadText(pg, 'the materia menu');
  await pg.keyboard.press('Escape');
  await pg.setViewportSize({ width: 1000, height: 900 });
  await pg.click('[data-tab=browse]');
}

/** Rules that switch at a width, each with a window one pixel either side (testing.md section 3.1): the set page's column
 * widths (72 px for the stat columns up to 1099 px, 80 from 1100), and Piece stats' two panels (one column up to 1299 px,
 * two from 1300). No sideways page scroll at any of the four widths. */
async function checkBreakpoints(pg) {
  await seedSheet(pg, SET_SHEET);
  await openSageSet(pg);
  const statColumn = () => pg.locator('#sh-gear thead th[data-col="crit"]').evaluate(th => Math.round(th.getBoundingClientRect().width));
  for (const [width, want] of [
    [1099, 72],
    [1100, 80],
  ]) {
    await pg.setViewportSize({ width, height: 900 });
    await poll(`a stat column ${want} px wide at ${width} px`, async () => {
      const got = await statColumn();
      return { ok: got === want, got };
    });
    check(!(await hasHScroll(pg)), `the set page scrolls sideways at ${width} px`);
  }
  await pg.setViewportSize({ width: 1000, height: 900 });
  await showMath(pg, 'piece');
  const columns = () => pg.locator('.twopanel').evaluate(panel => getComputedStyle(panel).gridTemplateColumns.split(' ').length);
  for (const [width, want] of [
    [1299, 1],
    [1301, 2],
  ]) {
    await pg.setViewportSize({ width, height: 900 });
    await poll(`Piece stats in ${want} column(s) at ${width} px`, async () => {
      const got = await columns();
      return { ok: got === want, got };
    });
    check(!(await hasHScroll(pg)), `Piece stats scrolls sideways at ${width} px`);
  }
  await pg.setViewportSize({ width: 1000, height: 900 });
  await pg.click('[data-tab=browse]');
}

/** Leaving the Sheets tab by a tab button while a set page has a draft asks first, with the set page's own dialog:
 * Keep editing stays on the set page, Discard and leave opens the tab asked for. */
async function checkTabGuard(pg) {
  await seedSheet(pg, SET_SHEET);
  await openSet(pg, SET_SHEET.name, 'Mine');
  const hands = pg.locator('#sh-gear tr[data-row="4"]');
  await hands.locator('[data-pick]').click();
  await pg.locator('.pick-menu .same-item[data-game-id]').first().click();
  await expect(pg.locator('#sh-apply')).toHaveText('Apply 1 change');
  await pg.click('[data-tab=browse]');
  await expect(pg.locator('#sh-leave')).toBeVisible();
  await pg.click('#sh-leave-keep');
  await expect(pg.locator('#tab-sheets')).toBeVisible();
  await expect(pg.locator('#sh-apply')).toHaveText('Apply 1 change');
  await pg.click('[data-tab=math]');
  await expect(pg.locator('#sh-leave')).toBeVisible();
  await pg.click('#sh-leave-discard');
  await expect(pg.locator('[data-tab=math]')).toHaveAttribute('aria-selected', 'true');
  await pg.click('[data-tab=browse]');
  await expect(pg.locator('#tab-browse')).toBeVisible();
}

// ---------- checks: Gear browser ----------

// Gear browser rings window: [job, item level from, item level to, equip level up to].
const RINGS_WINDOW = ['SGE', 140, 150, 60];

/** Set the gear browser's filters to an item level window (name filter cleared). */
async function fillBrowser(pg, lo, hi, lvl, slot = 'any') {
  await showTab(pg, 'browse');
  await pg.fill('#b-q', '');
  await allExpansions(pg);
  await pg.fill('#b-min', String(lo));
  await pg.fill('#b-max', String(hi));
  await pg.fill('#b-lvl', String(lvl));
  await pg.click(`#b-slots [data-slot="${slot}"]`); // after the filters, so its pill has matches
}

const browserRows = pg => pg.locator('#gear-table tbody tr[data-key]');

/** The gear browser marks every non-Unique ring x2 (it can be worn on both hands) and no Unique one. */
async function checkRingCopies(pg) {
  const [job, lo, hi, lvl] = RINGS_WINDOW;
  const want = await coreRings(job, lo, hi, lvl);
  if (!check(want.x2 > 0 && want.x2 < want.count, `${job} rings ${lo}-${hi}: no mix of Unique and non-Unique rings; pick another window`))
    return;
  await setJob(pg, job);
  await fillBrowser(pg, lo, hi, lvl, 'ring');
  await expect(pg.locator('#b-count')).toHaveText(`${want.count} matches`);
  // the ring pill counts them; Reset filters shows while filters are set
  await expect(pg.locator('#b-slots [data-slot="ring"] .n')).toHaveText(String(want.count));
  await expect(pg.locator('#b-slots [data-slot="ring"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(pg.locator('#b-reset')).toBeVisible();
  await expect(browserRows(pg)).toHaveCount(want.count);
  await expect(pg.locator('#gear-table .x2:visible')).toHaveCount(want.x2);
  // a heading sorts by its column, and again the other way
  // the sort goes by the piece's own item level, which the column shows (owner, 2026-10-19)
  const ilvls = () =>
    pg.locator('#gear-table tbody tr[data-key] td[data-col="ilvl"]').evaluateAll(cells => cells.map(c => Number(c.textContent)));
  const ilvlHead = pg.locator('#gear-table th:has([data-sort="ilvl"])');
  await pg.click('#gear-table [data-sort="ilvl"]');
  await expect(ilvlHead).toHaveAttribute('aria-sort', 'ascending');
  const up = await ilvls();
  check(
    up.every((v, i) => !i || up[i - 1] <= v),
    `ilvl ascending is not sorted: ${up}`,
  );
  await pg.click('#gear-table [data-sort="ilvl"]');
  await expect(ilvlHead).toHaveAttribute('aria-sort', 'descending');
  // the column and the row under the pointer are tinted (owner, 2026-10-19); a cell in neither is not
  await pg.hover('#gear-table tbody tr[data-key] td[data-col="crit"] >> nth=0');
  await expect(pg.locator('#gear-table')).toHaveAttribute('data-col', 'crit');
  const background = (row, col) =>
    pg
      .locator('#gear-table tbody tr[data-key]')
      .nth(row)
      .locator(`td[data-col="${col}"]`)
      .evaluate(e => getComputedStyle(e).backgroundColor);
  const inColumn = await background(1, 'crit');
  const inRow = await background(0, 'det');
  const plain = await background(1, 'det');
  check(inColumn !== plain, `the hovered column is not tinted (${inColumn} vs ${plain})`);
  check(inRow !== plain, `the hovered row is not tinted (${inRow} vs ${plain})`);
  // "/" jumps to the search, and the word is marked in the names; Reset filters clears every filter and hides
  await pg.locator('#b-count').click();
  await pg.keyboard.press('/');
  await pg.waitForFunction(() => document.activeElement?.id === 'b-q');
  await pg.keyboard.type('ring');
  await expect(pg.locator('#gear-table tbody tr[data-key] .mark').first()).toHaveText(/ring/i);
  // a value below a filter's range moves to its lowest value on leaving the box, shown there (not "no limit")
  await setNumber(pg, '#b-min', '-5');
  await expect(pg.locator('#b-min')).toHaveValue('1');
  await pg.click('#b-reset');
  await expect(pg.locator('#b-slots [data-slot="any"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(pg.locator('#b-q')).toHaveValue('');
  await expect(pg.locator('#b-min')).toHaveValue('');
  await expect(pg.locator('#b-reset')).toBeHidden();
  await expect(pg.locator('#gear-table th:has([data-sort="ilvl"])')).toHaveAttribute('aria-sort', 'descending'); // the sort stays
}

/** The Expansion dropdown's checkboxes, with the dropdown opened. */
async function expBoxes(pg) {
  if ((await pg.locator('#b-exp').getAttribute('aria-expanded')) !== 'true') await pg.click('#b-exp');
  return pg.locator('#b-exp-menu input');
}

/** Tick every expansion in the gear browser again, then close the dropdown. */
async function allExpansions(pg) {
  for (const box of await (await expBoxes(pg)).all()) if (!(await box.isChecked())) await box.check();
  await pg.keyboard.press('Escape');
}

/** Every expansion is ticked by default; with only Endwalker ticked, the browser keeps gear of its equip level band
 * (81 to 90) and the button names it; the choice is saved. */
async function checkExpansionFilter(pg) {
  await setJob(pg, 'WHM');
  await showTab(pg, 'browse');
  await expect(pg.locator('#b-exp')).toHaveText('All expansions'); // the default, before any filter is filled in
  await fillBrowser(pg, '', '', 100);
  await expect(pg.locator('#b-exp')).toHaveText('All expansions');
  const boxes = await expBoxes(pg);
  const all = await boxes.all();
  let allTicked = true;
  for (const b of all) allTicked = allTicked && (await b.isChecked());
  check(all.length === 6 && allTicked, 'every expansion is ticked by default');
  for (const b of all) if ((await b.getAttribute('data-exp')) !== 'EW') await b.uncheck();
  await pg.keyboard.press('Escape');
  await expect(pg.locator('#b-exp-menu')).toBeHidden();
  await expect(pg.locator('#b-exp')).toHaveText('Endwalker');
  await waitSaved(pg, "s => s.browse.expOff.join() === 'ARR,HW,SB,ShB,DT'");
  const lv = await pg.locator('#gear-table tbody tr td:nth-child(3)').allInnerTexts();
  check(
    lv.length > 0 && lv.every(x => Number.parseInt(x, 10) >= 81 && Number.parseInt(x, 10) <= 90),
    `Endwalker rows outside equip level 81-90: ${[...new Set(lv)].sort()}`,
  );
  await allExpansions(pg);
  await setUpShared(pg); // back to Sage for the next step
}

/** PLD (1H weapon + shield) offers an Off-hand slot in the browser; two-handed jobs do not. */
async function checkPldOffhand(pg) {
  await setJob(pg, 'PLD');
  await showTab(pg, 'browse');
  // the slot pills (data-slot keys); waited for, since the list is worked out after the job switch
  await expect(pg.locator('#b-slots [data-slot="offhand"]')).toHaveCount(1);
  await pg.screenshot({ path: shot('browser.png'), fullPage: true });
  await setJob(pg, 'WAR');
  await expect(pg.locator('#b-slots [data-slot="offhand"]')).toHaveCount(0);
}

/** The browser's page line (owner's pick P1 a, 2026-10-20): Next and a page number show other rows and scroll the
 * table's box to its first row; a slot pill or a sort goes back to page 1; the line keeps its place (and the table its
 * top) whether the key at its right shows or not. Leaves the shared setup as it found it. */
async function checkBrowserPages(pg) {
  // every Sage piece: many pages
  await fillBrowser(pg, '', '', '');
  const pages = pg.locator('#b-pages');
  const current = pages.locator('[aria-current="page"]');
  const firstKey = () => browserRows(pg).first().getAttribute('data-key');
  const tableBox = pg.locator('#tab-browse .tablewrap');
  const scrollTop = () => tableBox.evaluate(box => box.scrollTop);
  await expect(current).toHaveText('1');
  await expect(pages.locator('[aria-label="Previous page"]')).toBeDisabled();
  await expect(browserRows(pg)).toHaveCount(100);

  // Next: other rows, the table back at its top
  await tableBox.evaluate(box => (box.scrollTop = 900));
  const page1 = await firstKey();
  await pages.locator('[aria-label="Next page"]').click();
  await expect(current).toHaveText('2');
  check((await firstKey()) !== page1, 'Next did not change the rows');
  check((await scrollTop()) === 0, 'Next did not scroll the table to its top');
  // a page number, the same
  await tableBox.evaluate(box => (box.scrollTop = 900));
  const page2 = await firstKey();
  await pages.locator('[aria-label="Page 3"]').click();
  await expect(current).toHaveText('3');
  check((await firstKey()) !== page2, 'a page number did not change the rows');
  check((await scrollTop()) === 0, 'a page number did not scroll the table to its top');

  // a slot pill and a sort go back to page 1
  await pg.click('#b-slots [data-slot="body"]');
  await expect(current).toHaveText('1');
  await pages.locator('[aria-label="Next page"]').click();
  await expect(current).toHaveText('2');
  await pg.click('#gear-table [data-sort="name"]');
  await expect(current).toHaveText('1');

  // the key shows with sync on (item level 130 is above the cap of 123) and not with it off (no piece above level
  // 50): the line and the table stay where they are
  await fillBrowser(pg, 100, 140, 50);
  await expect(pg.locator('#b-key')).toBeVisible();
  const lineTop = () => pg.locator('#tab-browse .pageline').evaluate(line => line.getBoundingClientRect().top);
  const tableTop = () => tableBox.evaluate(box => box.getBoundingClientRect().top);
  const withKey = [await lineTop(), await tableTop()];
  await pg.locator('#sync').uncheck();
  await expect(pg.locator('#b-key')).toBeHidden();
  const withoutKey = [await lineTop(), await tableTop()];
  check(same(withKey, withoutKey), `the page line or the table moved when the key went: ${withKey} vs ${withoutKey}`);
  await setCap(pg, SHARED_SETUP.cap);
}

// ---------- checks: How the math works: Piece stats, Substat tiers, GCD ----------

/** Piece stats at cap 123: for every slot, a piece above the cap is cut to the slot's caps, so its main stat and 1st
 * substat bars end at the known values. A shield job has an Off-hand slot, a two-handed job does not. */
async function checkSyncCaps(pg, job) {
  await showMath(pg, 'piece');
  const slots = await pg.locator('#p-slot option').allInnerTexts();
  check(ONE_HANDED.has(job) === slots.includes('Off-hand'), `${job}: Piece stats slots ${JSON.stringify(slots)}`);
  const caps = ONE_HANDED.has(job) ? CAPS_123 : { ...CAPS_123, Weapon: CAPS_123_2H_WEAPON };
  for (const [slot, [sub, main]] of Object.entries(caps)) {
    await pg.selectOption('#p-slot', { label: slot });
    await setNumber(pg, '#p-ilvl', '160'); // above the cap, inside the slider's range
    await expect(pg.locator('#p-lead')).toContainText('Synced to 123');
    const kept = await pg.locator('#p-bars .num b').allInnerTexts(); // main stat, Vitality, 1st and 2nd substat
    check(kept[0] === String(main), `${job}: ${slot} main stat cap '${kept[0]}', expected ${main}`);
    check(kept[2] === String(sub), `${job}: ${slot} substat cap '${kept[2]}', expected ${sub}`);
  }
  await pg.selectOption('#p-slot', { label: 'Head' });
  await pg.click('#p-ilvl-reset');
}

/** Opens Piece stats' "Each stat, step by step" if it is closed. */
async function openSteps(pg) {
  if (!(await pg.locator('#p-steps').evaluate(d => d.open))) await pg.click('#p-steps > summary');
}

/** A closed details panel ("Each stat, step by step") is only its summary plus padding: the flex gap of the panel must
    not add space for the hidden content (it added 14 px, 2026-10-17). */
async function checkClosedPanel(pg) {
  await showMath(pg, 'piece');
  if (await pg.locator('#p-steps').evaluate(d => d.open)) await pg.click('#p-steps > summary');
  const extra = await pg.locator('#p-steps').evaluate(d => {
    const cs = getComputedStyle(d);
    const frame = ['paddingTop', 'paddingBottom', 'borderTopWidth', 'borderBottomWidth'].reduce((n, k) => n + parseFloat(cs[k]), 0);
    return d.getBoundingClientRect().height - frame - d.querySelector('summary').getBoundingClientRect().height;
  });
  check(Math.abs(extra) < 1, `closed #p-steps has ${extra.toFixed(1)} px beyond its summary and padding`);
}

/** SGE, ilvl 130 head, Spell Speed / Piety = the ranked stats of a real item level 130 healer head piece. */
async function checkPieceLab(pg) {
  await showMath(pg, 'piece');
  await pg.selectOption('#p-slot', 'head');
  await pg.selectOption('#p-s1', 'spd');
  await pg.selectOption('#p-s2', 'spec');
  await setNumber(pg, '#p-ilvl', '130');
  await openSteps(pg);
  await expect(pg.locator('#p-out thead')).toContainText('This head (item level 130)');
  await expect(pg.locator('#p-out tbody tr')).toHaveCount(4);
  await expect(pg.locator('#p-s3')).toHaveCount(0); // no third rank: a third line exists only as healer Direct Hit
  // columns: stat (name, then its share), this head (its value first), the head at the cap (the ceiling), in the duty
  const rows = await tableRows(pg, '#p-out');
  const byStat = Object.fromEntries(
    rows.map(r => [r[0].split('\n')[0], { raw: parseInt(r[1], 10), ceiling: parseInt(r[2], 10), duty: parseInt(r[3], 10) }]),
  );
  const expected = { Mind: 33, Vitality: 32, 'Spell Speed': 31, Piety: 22 };
  for (const [stat, v] of Object.entries(expected)) {
    check(byStat[stat]?.raw === v, `Piece stats ilvl 130 head ${stat} raw ${byStat[stat]?.raw}, expected ${v}`);
  }
  // 130 is above the 123 cap: the head caps (29 substat, 30 main) are the ceiling, and the duty keeps the lower number
  check(
    byStat.Mind?.ceiling === 30 && byStat['Spell Speed']?.ceiling === 29 && byStat.Mind?.duty === 30 && byStat['Spell Speed']?.duty === 29,
    `Piece stats ceiling / duty Mind ${byStat.Mind?.ceiling}/${byStat.Mind?.duty}, Spell Speed ${byStat['Spell Speed']?.ceiling}/${byStat['Spell Speed']?.duty}, expected 30/30 and 29/29`,
  );
  await expect(pg.locator('#p-slices span.on')).toHaveText(/Head\s*8\.5%/);
  // the explainer: the item level 130 head against the melded item level 123 head, and the curve
  await expect(pg.locator('#p-vs')).toContainText('melded');
  await expect(pg.locator('#p-vs b')).toContainText(' more.');
  await expect(pg.locator('#p-curve-chart svg')).toBeVisible();
  await pg.click('#p-ilvl-reset');
}

// How the math works, Substat tiers. Sage at level 100 (SUB 420, MAIN 440): Spell Speed 624 is in AkhMorning's 2.47 s tier, which
// starts at 613 on the panel (gear speed 193; validation.md section 5).

/** Tiers (Sage, level 100, item level sync off): each value starts at its base; a typed Spell Speed lands in
 * AkhMorning's tier; a value out of range is held to it, with no note; a level typed into the settings shows its tiers while the field still has focus (no change
 * event, no typing wait); a level typed into the sub-tab's own box holds when the settings' level changes, and an
 * empty box goes back to the settings' level; with sync on and no cap there is no "enter a sync cap" message on Tiers; Paladin's Tenacity
 * has two effect columns; no sideways scroll at NARROW. */
async function checkTiers(pg) {
  await pg.setViewportSize(NARROW);
  await setJob(pg, 'SGE');
  await showMath(pg, 'tiers');
  await pg.locator('#sync').uncheck();
  await setNumber(pg, '#level', '100');
  await expect(pg.locator('#t-level')).toHaveValue('100');
  await expect(pg.locator('#t-table [data-n="crit"]')).toHaveValue('420');
  await expect(pg.locator('#t-table [data-n="det"]')).toHaveValue('440');
  await setNumber(pg, '#t-table [data-n="spd"]', '624');
  await expect(pg.locator('#t-table tbody td.cur[data-to^="spd:"]').first()).toHaveText('613');
  await expect(pg.locator('#t-table tbody td.cur[data-to^="spd:"]').nth(1)).toHaveText('2.47s');

  // a value under the base is shown at the base, a speed above the most any job can have at the most; no note
  await setNumber(pg, '#t-table [data-n="crit"]', '5');
  await expect(pg.locator('#t-table [data-n="crit"]')).toHaveValue('420');
  await setNumber(pg, '#t-table [data-n="spd"]', '99999');
  await expect(pg.locator('#t-table [data-n="spd"]')).toHaveValue('3679');
  await setNumber(pg, '#t-table [data-n="spd"]', '624');
  // a level change drops the typed value for good: back at level 100, the base again (it used to come back)
  await setNumber(pg, '#t-level', '90');
  await setNumber(pg, '#t-level', '');
  await expect(pg.locator('#t-level')).toHaveValue('100');
  await expect(pg.locator('#t-table [data-n="spd"]')).toHaveValue('420');

  // the level follows each valid keystroke, while the field keeps focus
  await pg.focus('#level');
  await pg.keyboard.press('Control+A');
  await pg.keyboard.type('90');
  await expect(pg.locator('#t-level')).toHaveValue('90');
  check((await pg.evaluate(() => document.activeElement?.id)) === 'level', 'the level field lost focus while typing');
  await pg.keyboard.press('Tab');

  // the sub-tab's own level: Spell Speed's base at level 80 while the settings say 50, kept when they say 60; an empty
  // box goes back to the settings' level
  await setNumber(pg, '#level', '50');
  await setNumber(pg, '#t-level', '80');
  await expect(pg.locator('#t-table [data-n="spd"]')).toHaveValue('380');
  await setNumber(pg, '#level', '60');
  await expect(pg.locator('#t-level')).toHaveValue('80');
  await setNumber(pg, '#t-level', '');
  await expect(pg.locator('#t-level')).toHaveValue('60');
  await setNumber(pg, '#level', '90');
  await expect(pg.locator('#t-level')).toHaveValue('90');

  // the sub-tab's level follows each valid keystroke too (no Enter needed), and keeps focus
  await pg.focus('#t-level');
  await pg.keyboard.press('Control+A');
  await pg.keyboard.type('80');
  await expect(pg.locator('#t-table [data-n="spd"]')).toHaveValue('380');
  check((await pg.evaluate(() => document.activeElement?.id)) === 't-level', 'the tiers level box lost focus while typing');
  await setNumber(pg, '#t-level', '');
  await expect(pg.locator('#t-level')).toHaveValue('90');

  // a ? note says what the substat does and how big its tiers are here (level 90 DIV 1900: 1900/200 = 9.5)
  await pg.click('#t-table [data-help="crit"]');
  await expect(pg.locator('#t-pop')).toContainText('At level 90, each tier is 9 or 10 points.');
  await pg.keyboard.press('Escape');
  await expect(pg.locator('#t-pop')).toBeHidden();

  // sync settings do not matter here
  await pg.locator('#sync').check();
  await setNumber(pg, '#cap', '');
  await expect(pg.locator('#t-table')).toBeVisible();
  check(!(await pg.isVisible('#m-off')), 'the "enter a sync cap" message shows on Tiers');

  await setJob(pg, 'PLD');
  const names = (await pg.locator('#t-table tr.lcols th').allInnerTexts()).map(t => t.trim().toLowerCase());
  check(same(names.slice(-3), ['from', 'dmg & heal', 'dmg taken']), `Paladin's Tenacity columns: ${JSON.stringify(names)}`);
  await checkNoBadText(pg, 'math:tiers');
  check(!(await hasHScroll(pg)), `Tiers: horizontal page scroll at ${NARROW.width} px`);
  await pg.screenshot({ path: shot('tiers.png'), fullPage: true });
  await setUpShared(pg); // the job, cap and level the next step starts from
}

/** How the math works, GCD: its own level (the synced level until one is typed), haste and speed. The level box waits
 * for typing to stop and corrects a level out of range (its note as hover text); the speed box holds a typed speed to the level's
 * range once typing stops; a row or a bar clicked sets the speed or the level; a haste marks its levels; Piece stats'
 * controls stay off the tab, and the step table never has empty rows. */
async function checkGcdTab(pg) {
  await showMath(pg, 'gcd');
  await expect(pg.locator('#p-slot')).toBeHidden();
  await expect(pg.locator('#p-range')).toBeHidden();
  await expect(pg.locator('#g-level')).toHaveValue('50');
  // the base: 341 at level 50, its step first in the table, no empty rows
  await expect(pg.locator('#g-speed')).toHaveValue('341');
  await expect(pg.locator('#g-table tbody tr')).toHaveCount(13);
  check((await pg.locator('#g-table tbody tr').first().getAttribute('class'))?.includes('cur'), 'at the base the base step is not first');
  // the speed box waits for typing to stop, then holds the speed to the range ("1" is the base only afterwards)
  await pg.focus('#g-speed');
  await pg.keyboard.press('Control+A');
  await pg.keyboard.type('753');
  await expect(pg.locator('#g-facts')).toContainText('2.10s');
  await expect(pg.locator('#g-facts')).toContainText('more to reach 2.09s');
  await expect(pg.locator('#g-table tbody tr.cur')).toHaveText(/753\s*2\.10s\s*−15\.7%/);
  check(
    (await pg.locator('#g-table tbody tr').nth(6).getAttribute('class'))?.includes('cur'),
    'the step of the speed is not in the middle row',
  );
  await pg.keyboard.press('Control+A');
  await pg.keyboard.type('1');
  check((await pg.inputValue('#g-speed')) === '1', 'the speed box changed while typing');
  await expect(pg.locator('#g-speed')).toHaveValue('341');
  await setNumber(pg, '#g-speed', '5000');
  await expect(pg.locator('#g-speed')).toHaveValue('800');
  await expect(pg.locator('#g-most')).toHaveText('800');
  // a row sets the speed; the steps past the most are greyed out and do nothing
  await pg.locator('#g-table tbody tr:not(.out)').nth(2).click();
  check((await pg.inputValue('#g-speed')) !== '800', 'a row click did not set the speed');
  await pg.click('#g-reset');
  await expect(pg.locator('#g-speed')).toHaveValue('341');
  // the level box: a level out of range is corrected once typing stops, the note as hover text; a bar sets the level
  await pg.focus('#g-level');
  await pg.keyboard.press('Control+A');
  await pg.keyboard.type('150');
  await expect(pg.locator('#g-level')).toHaveValue('100');
  await expect(pg.locator('#g-level')).toHaveAttribute('title', 'Lowered to 100, the highest level.');
  await expect(pg.locator('#g-speed')).toHaveValue('420');
  await pg.locator('#g-chart [data-level="78"]').click();
  await expect(pg.locator('#g-level')).toHaveValue('78');
  // a haste: its levels marked on the chart, its percent among the facts
  await pg.selectOption('#g-haste', 'SAM');
  await expect(pg.locator('#g-chart .hasteline')).toHaveCount(2);
  await expect(pg.locator('#g-facts')).toContainText('haste (Fuka)');
  await checkNoBadText(pg, 'math:gcd');
  await pg.selectOption('#g-haste', '');
  await setNumber(pg, '#g-level', '');
  await expect(pg.locator('#g-level')).toHaveValue('50');
}

// ---------- checks: Saved state: reload, damaged storage, Reset to defaults ----------

/** Build a non-default state (job, cap, sync off, level, browser filters, Gear from boxes and market board switch, Piece
 * stats slot and item level, How the math works open), reload, and every part comes back: the inputs and the open tab.
 * Nothing like a gear pool is saved. */
async function checkReloadPersists(pg) {
  const [job, lo, hi, lvl] = ['DRG', 130, 135, 50]; // not the default job, a different role from the other checks
  await setJob(pg, job);
  await fillBrowser(pg, lo, hi, lvl);
  await setFrom(pg, 'b', 'tomes_legacy', false);
  await setFrom(pg, 'b', 'market', false);

  await setCap(pg, '130');
  await setNumber(pg, '#level', '60');
  if (await pg.locator('#sync').isChecked()) await pg.locator('#sync').uncheck();
  await expect(pg.locator('#cap')).toBeDisabled(); // no sync, so no cap to set
  // level sync to item level 270: the explainer's item level is held to its range (240 and up)
  await showMath(pg, 'piece');
  await pg.selectOption('#p-slot', 'body');
  await setNumber(pg, '#p-ilvl', '300');

  const inputs = { '#job': job, '#cap': '130', '#level': '60', '#p-slot': 'body', '#p-ilvl': '300' };
  const browserInputs = { '#b-min': String(lo), '#b-max': String(hi), '#b-lvl': String(lvl) };
  const boxes = await ticked(pg, 'b');
  check(!boxes.includes('tomes_legacy') && boxes.includes('relics'), `browser boxes before reload: ${JSON.stringify(boxes)}`);
  for (const [sel, v] of Object.entries(inputs)) {
    const got = await fieldValue(pg, sel);
    check(got === v, `reload setup: ${sel} is '${got}' before reload, expected '${v}'`);
  }
  // wait for the debounced save of the last change, rather than sleeping
  await waitSaved(
    pg,
    `s => s.job === '${job}' && s.cap === 130 && s.level === 60 && s.sync === false && s.tab === 'math'
    && s.piece.slot === 'body' && s.piece.ilvl === 300 && s.browse.exclude.includes('tomes_legacy')
    && s.browse.market === false && !('pool' in s) && !('opt' in s)`,
  );

  await pg.reload();
  await waitReady(pg);
  const selected = (await pg.getAttribute('[data-tab=math]', 'aria-selected')) === 'true';
  check(selected && (await pg.locator('#tab-piece').isVisible()), 'after reload How the math works is not the open tab');
  for (const [sel, v] of Object.entries(inputs)) {
    const got = await fieldValue(pg, sel);
    check(got === v, `after reload ${sel} is '${got}', expected '${v}'`);
  }
  await showTab(pg, 'browse');
  for (const [sel, v] of Object.entries(browserInputs)) {
    const got = await fieldValue(pg, sel);
    check(got === v, `after reload ${sel} is '${got}', expected '${v}'`);
  }
  const got = await ticked(pg, 'b');
  check(same(got, boxes), `after reload the b-from boxes are ${JSON.stringify(got)}, expected ${JSON.stringify(boxes)}`);
  check(!(await pg.locator('#b-market').isChecked()), 'after reload the browser market board switch is on, expected off');
  check(!(await pg.locator('#sync').isChecked()), 'after reload sync is on, expected off');
  await setFrom(pg, 'b', 'tomes_legacy', true);
  await setFrom(pg, 'b', 'market', true);
  await pg.locator('#sync').check(); // leave sync on for the later checks
  await expect(pg.locator('#cap')).toBeEnabled();
  const cap = await pg.inputValue('#cap');
  check(cap === '130', `the cap is '${cap}' after sync came back on, expected 130`);
}

// Stored values that are not usable state: each must load as the defaults without a JS error.
const BAD_STORAGE = [
  ['invalid JSON', '{"job": "WAR", "cap": 13'],
  ['a JSON array', '[1, 2, 3]'],
  [
    'wrong-typed fields',
    JSON.stringify({
      job: 42,
      cap: 'abc',
      sync: 'yes',
      level: null,
      tab: 7,
      mathTab: {},
      piece: 'head',
      browse: [1],
      opt: { target: 5, tb: null, tb2: 'x', exclude: 'pvp' },
      poolFilter: 3,
      pool: { 0: { id: 'x' } },
    }),
  ],
  // a save from the gear pool days, with broken pool items: the pool is dropped
  [
    'an old save with a broken pool',
    JSON.stringify({ job: 'SGE', tab: 'pool', pool: [null, 5, { id: 3 }, { id: 'a', type: 'ring', ilvl: 'big' }] }),
  ],
];

/** Invalid JSON, wrong-typed saved values or an old save with a gear pool: the page loads with the default settings
 * and no JS error. The bad value is written from a separate blank page (same file:// storage), so no pending save of
 * this page can overwrite it before the load. */
async function checkCorruptedStorage(pg) {
  const blank = resolve(OUT, 'blank.html'); // written by main()
  for (const [what, raw] of BAD_STORAGE) {
    const wantJob = what === 'an old save with a broken pool' ? 'SGE' : DEFAULT_JOB; // only that case stores a valid job
    const defaults = { '#job': wantJob, '#cap': DEFAULT_CAP, '#level': DEFAULT_LEVEL };
    if (wantJob) Object.assign(defaults, { '#b-min': '', '#b-lvl': '100' });
    const errors = stepRecord.getStore().errors;
    const nErrors = errors.length;
    await pg.goto(pathToFileURL(blank).href);
    await pg.evaluate(([k, v]) => localStorage.setItem(k, v), [STORE_KEY, raw]);
    await pg.goto(PAGE);
    await waitReady(pg);
    if (wantJob) {
      await expect(pg.locator('#tab-browse')).toBeVisible(); // the old Gear pool tab opens as the Gear browser
      await expect(browserRows(pg).first()).toBeVisible();
    } else {
      await expect(pg.locator('#tab-sheets')).toBeVisible(); // an unusable save opens the first tab
      await pg.click('[data-tab=browse]');
      await expect(pg.locator('#no-job')).toBeVisible();
    }
    for (const [sel, v] of Object.entries(defaults)) {
      const got = await fieldValue(pg, sel);
      check(got === v, `stored ${what}: ${sel} is '${got}', expected the default '${v}'`);
    }
    check(!(await pg.locator('#sync').isChecked()), `stored ${what}: sync is on, expected the default off`);
    await checkNoBadText(pg, `page loaded from stored ${what}`);
    check(errors.length === nErrors, `stored ${what}: JS errors on load: ${JSON.stringify(errors.slice(nErrors))}`);
    // the page repairs storage: the next save holds valid state, with no pool and no old optimizer settings
    const jobJs = wantJob ? `'${wantJob}'` : 'null';
    await waitSaved(pg, `s => s.job === ${jobJs} && !('pool' in s) && !('opt' in s) && Array.isArray(s.browse.exclude)`);
  }
}

/** Each tab has its own Job and sync panel and its own saved values: a job and level set on How the math works do not
 * touch the Gear browser's, the Sheets tab has no panel and changes neither, and a reload keeps both. */
async function checkTabPanels(pg) {
  const go = tab => pg.click(`[data-tab=${tab}]`); // without showTab's carrying the panel over
  // the math tab starts with no job (the shared setup is the browser's)
  await go('math');
  await expect(pg.locator('#no-job')).toBeVisible();
  check((await currentJob(pg)) === '', "How the math works starts with the browser's job");
  await setJob(pg, 'BLM');
  await setNumber(pg, '#level', '70');
  await go('sheets');
  await expect(pg.locator('section[aria-label="Job and sync settings"]')).toBeHidden();
  await go('browse');
  const browsePanel = JSON.stringify(await readPanel(pg));
  check(
    browsePanel === JSON.stringify({ job: SHARED_SETUP.job, sync: true, cap: SHARED_SETUP.cap, level: SHARED_SETUP.level }),
    `the Gear browser's panel changed: ${browsePanel}`,
  );
  // a reload keeps each tab's own values
  await waitSaved(pg, "s => s.browse.job === 'SGE' && s.piece.job === 'BLM' && s.piece.level === 70");
  await pg.reload();
  await waitReady(pg);
  for (const [tab, job, level] of [
    ['math', 'BLM', '70'],
    ['browse', SHARED_SETUP.job, SHARED_SETUP.level],
  ]) {
    await go(tab);
    await expect(pg.locator(`#tab-${tab}`)).toBeVisible();
    const panel = await readPanel(pg);
    check(
      panel.job === job && panel.level === level,
      `after reload the ${tab} tab's panel is ${JSON.stringify(panel)}, expected ${job} at level ${level}`,
    );
  }
}

/** Reset to defaults asks with the browser's own dialog: Cancel keeps everything, OK restores every default. */
async function checkReset(pg) {
  await setJob(pg, 'SGE');
  await setCap(pg, '130'); // a cap level 50 allows (135 at most)
  await fillBrowser(pg, 100, '', 100);
  await pg.fill('#b-q', 'Ring');
  await waitSaved(pg, "s => s.browse.q === 'Ring' && +s.browse.min === 100"); // typed filters commit after a short wait
  const messages = [];
  const answer = accept =>
    pg.once('dialog', d => {
      messages.push(d.message());
      return accept ? d.accept() : d.dismiss();
    });

  answer(false);
  await pg.click('#reset');
  await expect(pg.locator('[data-job]')).toHaveAttribute('data-job', 'SGE');
  check((await pg.inputValue('#cap')) === '130', 'Cancel changed the cap');
  check((await pg.inputValue('#b-q')) === 'Ring', 'Cancel changed the name filter');
  answer(true);
  await pg.click('#reset');
  await expect(pg.locator('#no-job')).toBeVisible();
  check(
    same(messages, ["Reset this tab's settings to their defaults?", "Reset this tab's settings to their defaults?"]),
    `reset dialog messages: ${JSON.stringify(messages)}`,
  );
  const cj = await currentJob(pg);
  check(cj === '', `after reset the job is '${cj}', expected none`);
  check(!(await pg.locator('#sync').isChecked()), 'after reset sync is on, expected off');
  for (const [sel, v] of Object.entries({ '#cap': DEFAULT_CAP, '#level': DEFAULT_LEVEL })) {
    const got = await pg.inputValue(sel);
    check(got === v, `after reset ${sel} is '${got}', expected '${v}'`);
  }
  await setJob(pg, 'SGE');
  await showTab(pg, 'browse');
  for (const sel of ['#b-q', '#b-min']) {
    const got = await pg.inputValue(sel);
    check(got === '', `after reset ${sel} is '${got}', expected empty`);
  }
  await setCap(pg, '123'); // back to the caps the later checks expect
  await setNumber(pg, '#level', '50');
}

// ---------- checks: Across the tabs: level sync, and every tab for each job at 960 px ----------

// Level sync: level 100 healer head pieces at item level 780 or more, at synced level 90 (item level sync off), are
// capped at the item level 660 head values; Mind 248 and the head substat cap 184 come from ItemLevel row 660 x 85 per
// mille (core-sync-target.test.js).
const HEAD_MAIN_CAP_660 = 248;
const HEAD_SUB_CAP_660 = '184';

const hasHScroll = pg => pg.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);

/** Synced level 90 with item level sync off, at NARROW width: the gear browser shows the level-synced value, Piece stats
 * cuts a head to the item level 660 caps; no bad text, no horizontal scroll. */
async function checkLevelSync(pg) {
  await pg.setViewportSize(NARROW);
  await setJob(pg, 'SGE');
  await pg.locator('#sync').uncheck();
  await setNumber(pg, '#level', '90');
  await fillBrowser(pg, 780, '', 100, 'head');
  // the synced main stat on top with the cap bar, the head's own value on the muted line under it
  check(/\bsynced\b/.test((await browserRows(pg).first().getAttribute('class')) || ''), 'a synced browser row is not marked synced');
  await expect(pg.locator('#b-key')).toBeVisible();
  // the key says what the muted line is; the row names only the piece (audit 11 #7)
  check(!(await browserRows(pg).first().locator('td').first().innerText()).includes('before sync'), 'a synced row repeats "before sync"');
  await expect(browserRows(pg).first().locator('td.cut > span:first-child').first()).toHaveText(String(HEAD_MAIN_CAP_660));
  await checkNoBadText(pg, 'level sync/browse');
  check(!(await hasHScroll(pg)), `level sync: horizontal page scroll at ${NARROW.width} px (browse)`);
  await showMath(pg, 'piece');
  await pg.selectOption('#p-slot', 'head');
  await setNumber(pg, '#p-ilvl', '780');
  await expect(pg.locator('#p-lead')).toContainText('Synced to 660');
  const kept = await pg.locator('#p-bars .num b').allInnerTexts();
  check(kept[0] === String(HEAD_MAIN_CAP_660), `level 90 head main stat cap '${kept[0]}', expected ${HEAD_MAIN_CAP_660}`);
  check(kept[2] === HEAD_SUB_CAP_660, `level 90 head substat cap '${kept[2]}', expected ${HEAD_SUB_CAP_660}`);
  await checkNoBadText(pg, 'level sync/piece');
  check(!(await hasHScroll(pg)), `level sync: horizontal page scroll at ${NARROW.width} px (math)`);
  await pg.click('#p-ilvl-reset');
  await showTab(pg, 'browse');
  await pg.screenshot({ path: shot('level-sync.png'), fullPage: true });
  // back to the shared setup: level 50, sync to 123, no browser filters
  await fillBrowser(pg, '', '', 100);
  await setNumber(pg, '#level', '50');
  await setCap(pg, '123');
  await pg.setViewportSize({ width: 1000, height: 900 });
}

/* The level caps of the jobs that stop below 100 (CLAUDE.md: BLU 80, BST 50); every other walked job has 100. */
const JOB_LEVEL_CAP = { BST: 50, BLU: 80 };

/** A saved sheet for `job` at the shared setup (level 50, synced to 123) with one empty set whose Fill settings ask for
 * food: Maximize the main stat, spare points to tiebreaks off (the gear first, then the meal: the cheap search), every box
 * at its default, the equip level at the job's cap. */
const walkSheet = job => ({
  ...FILL_SHEET,
  id: `s_walk_${job}`,
  name: `Walk ${job}`,
  job,
  sets: [
    {
      ...FILL_SHEET.sets[0],
      fillSettings: {
        goal: { target: 'main', tb: '', tb2: '', gcd: '', gcdMode: 'exact', byTier: false, melds: true, food: true },
        searchCriteria: { expOff: [], exclude: [...DEFAULT_EXCLUDE], market: true, min: '', max: '', lvl: JOB_LEVEL_CAP[job] ?? 100 },
      },
    },
  ],
});

/** A set page for one walked job, from the shared setup's level and cap: the rows its weapon kind has (one-handed jobs have
 * an off-hand row), the special substat's column only for a job that has one, the Gear to search line counting the
 * pieces the core searches, a Fill with food whose main stat is the core's (a meal has no main stat), a meal on the Food
 * row, the Defense row, no bad text and no sideways scroll at 960 px. The last job takes the screenshot. */
async function checkWalkSet(pg, job) {
  const sync = { cap: 123, sync: true, level: 50 };
  const { searched, on } = await coreGear(job, sync, 'main');
  const stats = await coreStats(job);
  await seedSheet(pg, walkSheet(job));
  await openSet(pg, `Walk ${job}`, 'Empty');
  const rows = await pg.locator('#sh-gear tr[data-row]').count();
  check(rows === (ONE_HANDED.has(job) ? 12 : 11), `${job}: ${rows} rows in the set's table`);
  await expect(pg.locator('#sh-gear thead th[data-col="spec"]')).toHaveCount(stats.includes('spec') ? 1 : 0);
  await expect(pg.locator('#sh-goal .gcnt')).toHaveText(`· ${searched.toLocaleString('en-US')} pieces`);
  await runFill(pg);
  await pg.click('#sh-apply');
  await expect(pg.locator('#sh-apply')).toHaveCount(0);
  await checkTotals(pg, `${job} Fill with food`, { main: on });
  await expect(pg.locator('#sh-meal-btn')).not.toHaveText('No food');
  await expect(pg.locator('#sh-defense td.defense')).toHaveText(
    /^Physical [\d,]+\s*·\s*−\d+% damage\s*\/\s*Magic [\d,]+\s*·\s*−\d+% damage$/,
  );
  await checkNoBadText(pg, `${job}/set page`);
  check(!(await hasHScroll(pg)), `${job}: the set page scrolls sideways at ${NARROW.width} px`);
  if (job === JOBS.at(-1)) await pg.screenshot({ path: shot('narrow-set.png'), fullPage: true });
  await pg.click('[data-tab=browse]');
}

/** Every tab for one job: no undefined/NaN/null text, correct sync caps, page fits NARROW width, and a set page of the job
 * (checkWalkSet). One step per job; the last job takes the screenshots. */
const walkJob = job => async pg => {
  await pg.setViewportSize(NARROW);
  await setJob(pg, job);
  await showTab(pg, 'browse');
  await expect(pg.locator('#b-count')).not.toHaveText('');
  await checkNoBadText(pg, `${job}/browse`);
  await showMath(pg, 'piece');
  await expect(pg.locator('#p-bars .num').first()).toBeVisible();
  await checkNoBadText(pg, `${job}/math:piece`);
  await checkSyncCaps(pg, job);
  await showMath(pg, 'gcd');
  await expect(pg.locator('#g-chart svg')).toBeVisible();
  await expect(pg.locator('#g-table tbody tr')).toHaveCount(13);
  await checkNoBadText(pg, `${job}/math:gcd`);
  await showMath(pg, 'tiers');
  await expect(pg.locator('#t-table tbody td.cur').first()).toBeVisible();
  await checkNoBadText(pg, `${job}/math:tiers`);
  check(!(await hasHScroll(pg)), `${job}: horizontal page scroll at ${NARROW.width} px`);
  if (job === JOBS.at(-1)) await pg.screenshot({ path: shot('narrow.png'), fullPage: true });
  await checkWalkSet(pg, job);
};

// ---------- checks: the Sheets tab (the sheet manager and a sheet's page) ----------

/** A list's rows on the Sheets tab: the names in its first column, in order. */
const sheetNames = (pg, table) => pg.locator(`${table} tbody tr a.sname`).allInnerTexts();
/** A button of a list row's actions ("Open", "Edit", "Copy", "Delete"), by the row's place (1 is the first). */
const rowAction = (pg, table, row, text) => pg.locator(`${table} tbody tr:nth-of-type(${row}) .rowacts button`, { hasText: text });

/** A saved sheet record for White Mage holding one set with the Ironworks Magitek Cane (item level 120, a White Mage
 * weapon no other healer can wear) in its weapon row, pinned: written straight to storage, since the step needs only the
 * record (the set page picks a piece in checkSetPage and checkPickMenu). */
const CANE_SHEET = {
  v: 1,
  id: 's_cane',
  name: 'Canes',
  description: '',
  job: 'WHM',
  level: 100,
  sync: { on: false, cap: 795 },
  sets: [
    {
      id: 'g_cane',
      name: 'Cane set',
      description: '',
      pieces: ['weapon', 'offhand', 'head', 'body', 'hands', 'legs', 'feet', 'ear', 'neck', 'wrist', 'ring', 'ring'].map((slot, i) =>
        i === 0 ? { slot, gameId: 8645, stones: [] } : { slot },
      ),
      meal: null,
      pinned: { pieces: [0], meal: false },
      fillSettings: null,
      createdAt: 0,
      updatedAt: 0,
    },
  ],
  gameData: { commit: 'd9582a6', date: '2026-09-30' },
  createdAt: 0,
  updatedAt: 0,
};

/** The Sheets tab's manager flows: the empty state, New sheet, Edit name and description, the level and sync fields,
 * New set and the set page's read-only line, set notes, reordering by keyboard and by drag, Copy sheet (and its list of
 * pieces to clear, from a seeded White Mage cane), Delete, and a reload keeping it all; no panel on the tab, no
 * sideways scroll at 960 px. */
async function checkSheets(pg) {
  await pg.setViewportSize(NARROW);
  await pg.click('[data-tab=sheets]');
  await expect(pg.locator('#tab-sheets')).toBeVisible();
  await expect(pg.locator('section[aria-label="Job and sync settings"]')).toBeHidden();
  await expect(pg.locator('#no-job')).toHaveCount(0);
  await expect(pg.locator('#sh-empty h3')).toHaveText('No sheets yet');

  // New sheet: the name follows the job, level and sync until one is typed
  await pg.click('#sh-new-first');
  await expect(pg.locator('#sh-dialog')).toBeVisible();
  await pg.click('#sh-dialog [data-job-id=WHM]');
  await expect(pg.locator('#sh-dlg-name')).toHaveValue('White Mage Lv 100');
  await setNumber(pg, '#sh-dlg-level', '50');
  await pg.locator('#sh-dlg-sync').check();
  // a cap above what the level allows is lowered with the Job and sync panel's note (level 50: item level 135)
  await setNumber(pg, '#sh-dlg-cap', '500');
  await expect(pg.locator('#sh-dlg-cap')).toHaveValue('135');
  await expect(pg.locator('#sh-dlg-cap-lowered')).toHaveText('Lowered to 135, the highest for level 50.');
  await setNumber(pg, '#sh-dlg-cap', '130');
  await expect(pg.locator('#sh-dlg-cap-lowered')).toBeHidden();
  await expect(pg.locator('#sh-dlg-name')).toHaveValue('White Mage Lv 50 ilvl 130');
  await pg.fill('#sh-dlg-description', 'Week 1\nsecond line');
  check(!(await hasHScroll(pg)), `Sheets: the New sheet dialog scrolls the page sideways at ${NARROW.width} px`);
  await pg.click('#sh-dlg-ok');
  await expect(pg.locator('#sh-sheet .crumbhere')).toHaveText('White Mage Lv 50 ilvl 130');
  await expect(pg.locator('#sh-description')).toHaveText('Week 1 second line');
  await expect(pg.locator('#sh-no-sets h3')).toHaveText('No gear sets yet');
  await expect(pg.locator('#sh-level')).toHaveValue('50');

  // Edit name and description; an emptied name is refused and put back
  await pg.click('#sh-edit');
  await pg.fill('#sh-dlg-name', '  ');
  await pg.click('#sh-dlg-ok');
  await expect(pg.locator('#sh-dialog .dlgerr')).toHaveText('A name cannot be empty: the old name is back in the box.');
  await expect(pg.locator('#sh-dlg-name')).toHaveValue('White Mage Lv 50 ilvl 130');
  await pg.fill('#sh-dlg-name', 'Heal T1');
  await pg.keyboard.press('Enter');
  await expect(pg.locator('#sh-sheet .crumbhere')).toHaveText('Heal T1');

  // level and item level sync change at once, no question; a cap above what the level allows is lowered with the
  // Job and sync panel's note (level 70: item level 405, its weapons), and the note goes with a cap the level allows
  await setNumber(pg, '#sh-level', '70');
  await setNumber(pg, '#sh-cap', '500');
  await expect(pg.locator('#sh-cap')).toHaveValue('405');
  await expect(pg.locator('#sh-cap-lowered')).toHaveText('Lowered to 405, the highest for level 70.');
  await pg.screenshot({ path: shot('sheet-cap-lowered.png') });
  await setNumber(pg, '#sh-cap', '300');
  await expect(pg.locator('#sh-cap-lowered')).toBeHidden();

  // New set opens the set page with the sheet's settings as a read-only line
  await pg.click('#sh-new-set-first');
  await expect(pg.locator('#sh-set .crumbhere')).toHaveText('Set 1');
  await expect(pg.locator('#sh-set-settings')).toHaveText('White Mage · Level 70 · Item level sync 300');
  await pg.click('#sh-set .setcrumb a:nth-of-type(2)');
  await pg.click('#sh-new-set');
  await pg.click('#sh-set .setcrumb a:nth-of-type(2)');
  check(same(await sheetNames(pg, '#sh-sets'), ['Set 1', 'Set 2']), `sets: ${await sheetNames(pg, '#sh-sets')}`);
  // the set's notes: edited in "Name and description", the first line in the list
  await rowAction(pg, '#sh-sets', 1, 'Edit').click();
  await expect(pg.locator('#sh-dlg-title')).toHaveText('Name and description');
  await pg.fill('#sh-dlg-description', 'My own set\nwith a crafted body');
  await pg.click('#sh-dlg-ok');
  await expect(pg.locator('#sh-sets .setnotes')).toHaveText('My own set');
  // keyboard reorder: the handle keeps the focus and the live region says where the row went
  await pg.locator('#sh-sets tbody tr:nth-of-type(2) .draghandle').focus();
  await pg.keyboard.press('ArrowUp');
  await expect(pg.locator('#sh-live')).toHaveText('Set 2 moved to position 1 of 2.');
  check(same(await sheetNames(pg, '#sh-sets'), ['Set 2', 'Set 1']), `sets after the move: ${await sheetNames(pg, '#sh-sets')}`);
  const focusedRow = await pg.evaluate(() => document.activeElement?.closest('tr')?.dataset.set);
  const firstRow = await pg.locator('#sh-sets tbody tr:nth-of-type(1)').getAttribute('data-set');
  check(focusedRow === firstRow, 'the moved row did not keep the focus on its handle');
  check(!(await hasHScroll(pg)), `Sheets: a sheet's page scrolls sideways at ${NARROW.width} px`);
  await pg.screenshot({ path: shot('sheet-page.png'), fullPage: true });

  // a second sheet goes to the top; drag the first below it
  await pg.click('#sh-sheet .setcrumb a');
  await pg.click('#sh-new');
  await pg.click('#sh-dialog [data-job-id=PLD]');
  await pg.click('#sh-dlg-ok');
  await pg.click('#sh-sheet .setcrumb a');
  check(same(await sheetNames(pg, '#sh-list'), ['Paladin Lv 100', 'Heal T1']), `sheets: ${await sheetNames(pg, '#sh-list')}`);
  await pg.locator('#sh-list tbody tr:nth-of-type(1) .draghandle').dragTo(pg.locator('#sh-list tbody tr:nth-of-type(2)'), {
    targetPosition: { x: 300, y: 60 },
  });
  await expect(pg.locator('#sh-list tbody tr:nth-of-type(1) a.sname')).toHaveText('Heal T1');

  // Copy sheet to another healer: the manager shows the copy on top
  await rowAction(pg, '#sh-list', 1, 'Copy').click();
  await expect(pg.locator('#sh-dlg-name')).toHaveValue('Heal T1 (1)');
  await pg.click('#sh-dialog [data-job-id=AST]');
  await pg.click('#sh-dlg-ok');
  await expect(pg.locator('#tab-sheets .toast')).toHaveText('Copied as “Heal T1 (1)”.');
  await expect(pg.locator('#sh-list tbody tr:nth-of-type(1) .jobcell')).toHaveText('Astrologian');

  // Delete asks first; the row goes
  await rowAction(pg, '#sh-list', 3, 'Delete').click();
  await expect(pg.locator('#sh-dialog .question')).toHaveText('Delete the sheet “Paladin Lv 100” (it has no gear sets)?');
  // the question opens with the focus on Cancel: a stray Enter does not delete
  await pg
    .waitForFunction(() => document.activeElement?.id === 'sh-dlg-cancel', null, { timeout: 3000 })
    .catch(() => check(false, 'a delete question opens with the focus on Cancel'));
  // Escape closes the question and the focus goes back to the Delete link that opened it
  await pg.keyboard.press('Escape');
  await expect(pg.locator('#sh-dialog')).toHaveCount(0);
  await pg
    .waitForFunction(() => document.activeElement?.tagName === 'BUTTON' && document.activeElement.textContent.trim() === 'Delete', null, {
      timeout: 3000,
    })
    .catch(() => check(false, 'after Escape on a delete question the focus is back on the Delete link'));
  await rowAction(pg, '#sh-list', 3, 'Delete').click();
  await pg.click('#sh-dlg-ok');
  check(same(await sheetNames(pg, '#sh-list'), ['Heal T1 (1)', 'Heal T1']), `sheets after Delete: ${await sheetNames(pg, '#sh-list')}`);
  check(!(await hasHScroll(pg)), `Sheets: the manager scrolls sideways at ${NARROW.width} px`);
  await checkNoBadText(pg, 'the sheet manager');

  // a reload keeps the sheets, their order, settings and sets; a record not in the order (the seeded one) comes last
  await pg.evaluate(([key, sheet]) => localStorage.setItem(`${key}:sheet:${sheet.id}`, JSON.stringify(sheet)), [STORE_KEY, CANE_SHEET]);
  await waitSaved(pg, "s => s.tab === 'sheets'");
  await pg.reload();
  await waitReady(pg);
  await expect(pg.locator('#tab-sheets')).toBeVisible();
  check(
    same(await sheetNames(pg, '#sh-list'), ['Heal T1 (1)', 'Heal T1', 'Canes']),
    `sheets after reload: ${await sheetNames(pg, '#sh-list')}`,
  );
  await rowAction(pg, '#sh-list', 2, 'Open').click();
  await expect(pg.locator('#sh-level')).toHaveValue('70');
  await expect(pg.locator('#sh-cap')).toHaveValue('300');
  check(same(await sheetNames(pg, '#sh-sets'), ['Set 2', 'Set 1']), `sets after reload: ${await sheetNames(pg, '#sh-sets')}`);
  await expect(pg.locator('#sh-sets .setnotes')).toHaveText('My own set');

  // Copy sheet to a job that cannot wear a piece: the form lists it and waits for the box
  await pg.click('#sh-sheet .setcrumb a');
  await rowAction(pg, '#sh-list', 3, 'Copy').click();
  await pg.click('#sh-dialog [data-job-id=AST]');
  await expect(pg.locator('#sh-dlg-clear')).toContainText('Astrologian cannot wear 1 piece.');
  await expect(pg.locator('#sh-dlg-clear li')).toHaveText('Cane set · Weapon: Ironworks Magitek Cane');
  await expect(pg.locator('#sh-dlg-ok')).toBeDisabled();
  check(!(await hasHScroll(pg)), `Sheets: the Copy sheet dialog scrolls sideways at ${NARROW.width} px`);
  await pg.screenshot({ path: shot('sheet-copy.png') });
  await pg.locator('#sh-dlg-ack').check();
  await pg.click('#sh-dlg-ok');
  await expect(pg.locator('#tab-sheets .toast')).toHaveText('Copied as “Canes (1)”. 1 piece cleared in the copy.');
  // back on the Gear browser for the runner (the shared setup's panel)
  await pg.setViewportSize({ width: 1000, height: 900 });
  await pg.click('[data-tab=browse]');
}

/** The Sheets tab's dialogs and menus as a user types into them: New sheet shows the range texts (1–100, 1–795) and the
 * default name for the job, a blank name is refused with the default put back, and the dialog stays open; Copy sheet puts
 * "(1)" back the same way; a dialog's first box takes the focus and Escape gives it back to the button that opened the
 * dialog; the sheet page's switch menu gives the focus to the current sheet; a new set's page shows the breadcrumb and the
 * sheet's settings read-only (item level sync off here; checkSheets has it on). At 960 px. */
async function checkSheetForms(pg) {
  await pg.setViewportSize(NARROW);
  await pg.click('[data-tab=sheets]');
  await pg.click('#sh-new-first');
  await expect(pg.locator('#sh-dialog')).toBeVisible();
  await poll('focus in the New sheet dialog', async () => {
    const got = await focusedId(pg);
    return { ok: got === 'sh-dlg-name', got };
  });
  await pg.click('#sh-dialog [data-job-id=WHM]');
  await expect(pg.locator('#sh-dlg-name')).toHaveValue('White Mage Lv 100');
  await expect(pg.locator('#sh-dialog label:has(#sh-dlg-level) .f-range')).toHaveText('1–100');
  await expect(pg.locator('#sh-dialog label:has(#sh-dlg-cap) .f-range')).toHaveText('1–795');
  await pg.fill('#sh-dlg-name', '   ');
  await pg.click('#sh-dlg-ok');
  await expect(pg.locator('#sh-dialog .dlgerr')).toHaveText('A name cannot be empty: the default name is back in the box.');
  await expect(pg.locator('#sh-dlg-name')).toHaveValue('White Mage Lv 100');
  await expect(pg.locator('#sh-dialog')).toBeVisible();
  await pg.click('#sh-dlg-ok');
  await expect(pg.locator('#sh-sheet .crumbhere')).toHaveText('White Mage Lv 100');
  await expect(pg.locator('#sh-level-range')).toHaveText('1–100');
  await expect(pg.locator('#sh-cap-range')).toHaveText('1–795');

  // Copy sheet: Escape gives the focus back to the button; a blank name comes back as "(1)"
  await pg.click('#sh-copy');
  await expect(pg.locator('#sh-dialog')).toBeVisible();
  await pg.keyboard.press('Escape');
  await expect(pg.locator('#sh-dialog')).toHaveCount(0);
  await poll('focus back on Copy sheet after Escape', async () => {
    const got = await focusedId(pg);
    return { ok: got === 'sh-copy', got };
  });
  await pg.click('#sh-copy');
  await expect(pg.locator('#sh-dlg-name')).toHaveValue('White Mage Lv 100 (1)');
  await pg.fill('#sh-dlg-name', '');
  await pg.click('#sh-dlg-ok');
  await expect(pg.locator('#sh-dialog .dlgerr')).toHaveText('A name cannot be empty: the default name is back in the box.');
  await expect(pg.locator('#sh-dlg-name')).toHaveValue('White Mage Lv 100 (1)');
  await pg.click('#sh-dlg-ok');
  await expect(pg.locator('#tab-sheets .toast')).toHaveText('Copied as “White Mage Lv 100 (1)”.');

  // the switch menu: the current sheet takes the focus; Escape closes it
  await pg.locator('#sh-list a.sname', { hasText: 'White Mage Lv 100 (1)' }).click();
  await pg.click('#sh-sheet-switch');
  await expect(pg.locator('#sh-sheet-menu')).toBeVisible();
  await poll('focus on the current sheet in the switch menu', async () => {
    const got = await pg.evaluate(() => {
      const a = document.activeElement;
      return a?.matches('#sh-sheet-menu .setitem.cur') ? a.textContent.trim() : `${a?.tagName} ${a?.id}`;
    });
    return { ok: got === 'White Mage Lv 100 (1)', got };
  });
  await pg.keyboard.press('Escape');
  await expect(pg.locator('#sh-sheet-menu')).toHaveCount(0);

  // a new set's page: the breadcrumb and the sheet's settings
  await pg.click('#sh-new-set-first');
  await expect(pg.locator('#sh-set .setcrumb')).toContainText('White Mage Lv 100 (1)');
  await expect(pg.locator('#sh-set .crumbhere')).toHaveText('Set 1');
  await expect(pg.locator('#sh-set-settings')).toHaveText('White Mage · Level 100 · Item level sync off');
  check(!(await hasHScroll(pg)), `Sheets: a new set's page scrolls sideways at ${NARROW.width} px`);
  await pg.setViewportSize({ width: 1000, height: 900 });
  await pg.click('[data-tab=browse]');
}

/** A sheet's item level cap follows its level by the Job and sync panel's rule and with its note (checkCapValidation's
 * checks, on the sheet's page): the ranges, an error for text that is no item level (the sheet keeps its cap), a cap
 * lowered when the level changes and never raised, a cap typed too high lowered, the note staying put under the up
 * arrow at the limit, and a saved cap above what its level allows repaired as it is read. */
async function checkSheetCap(pg) {
  // saved at level 70 with cap 500: read as 405, the best gear made for level 70 (its weapons)
  const sheet = { v: 1, id: 's_cap', name: 'Cap', description: '', job: 'SGE', level: 70, sync: { on: true, cap: 500 }, sets: [] };
  await seedSheet(pg, { ...sheet, gameData: { commit: 'd9582a6', date: '2026-09-30' }, createdAt: 0, updatedAt: 0 });
  await pg.click('[data-tab=sheets]');
  await pg.locator('#sh-list a.sname', { hasText: 'Cap' }).click();
  await expect(pg.locator('#sh-cap')).toHaveValue('405');
  await expect(pg.locator('#sh-cap-lowered')).toBeHidden(); // repaired on reading, with no note
  // the ranges next to the labels
  await expect(pg.locator('#sh-level-range')).toHaveText('1–100');
  await expect(pg.locator('#sh-cap-range')).toHaveText('1–795');
  await setNumber(pg, '#sh-level', '50');
  await expect(pg.locator('#sh-cap')).toHaveValue('135');
  await setNumber(pg, '#sh-cap', '123');
  await expect(pg.locator('#sh-cap-lowered')).toBeHidden();
  // not a whole item level: an error, and the sheet keeps its last cap
  await pg.fill('#sh-cap', '0');
  await expect(pg.locator('#sh-cap-error')).toContainText('Enter a whole item level from 1 to');
  await pg.locator('#sh-cap').dispatchEvent('change');
  await pg.fill('#sh-cap', '123');
  await expect(pg.locator('#sh-cap-error')).toBeHidden();
  await waitSaved(pg, 's => true');
  check(
    await pg.evaluate(key => JSON.parse(localStorage.getItem(`${key}:sheet:s_cap`)).sync.cap === 123, STORE_KEY),
    'Sheets: the cap field took 0',
  );
  // the cap follows the level: at level 40 cap 123 is lowered to 43, the best gear made for level 40; back at level 50
  // it stays 43 (never raised), with no error either way
  await setNumber(pg, '#sh-level', '40');
  await expect(pg.locator('#sh-cap')).toHaveValue('43');
  await expect(pg.locator('#sh-cap-error')).toBeHidden();
  await expect(pg.locator('#sh-cap-lowered')).toHaveText('Lowered to 43, the highest for level 40.');
  check(await pg.locator('#sh-cap').evaluate(e => e.classList.contains('lowered')), 'Sheets: the lowered cap field does not flash');
  await setNumber(pg, '#sh-level', '50');
  await expect(pg.locator('#sh-cap')).toHaveValue('43');
  await expect(pg.locator('#sh-cap-lowered')).toBeHidden(); // the note goes with the next change
  // a cap entered above what the level allows is lowered once it commits; above the highest real item level too
  for (const typed of ['500', '999']) {
    await pg.fill('#sh-cap', typed);
    await expect(pg.locator('#sh-cap')).toHaveValue('135');
    await expect(pg.locator('#sh-cap-lowered')).toHaveText('Lowered to 135, the highest for level 50.');
    await expect(pg.locator('#sh-cap-error')).toBeHidden();
  }
  // the up arrow at the limit: each press is lowered again, and the note stays put rather than hiding and showing
  await pg.evaluate(() => {
    window.__noteHidden = 0;
    const note = document.querySelector('#sh-cap-lowered');
    new MutationObserver(() => {
      if (note.style.display === 'none') window.__noteHidden++;
    }).observe(note, { attributes: true, attributeFilter: ['style'] });
  });
  await pg.locator('#sh-cap').focus();
  for (let i = 0; i < 5; i++) {
    await pg.keyboard.press('ArrowUp');
    await pg.waitForTimeout(60);
  }
  await pg.waitForTimeout(400);
  await expect(pg.locator('#sh-cap')).toHaveValue('135');
  await expect(pg.locator('#sh-cap-lowered')).toHaveText('Lowered to 135, the highest for level 50.');
  check((await pg.evaluate(() => window.__noteHidden)) === 0, 'Sheets: the lowered note hides and shows again on the up arrow');
  await pg.click('[data-tab=browse]');
}

/* A Sage sheet (level 100, synced to 123) with one set of crafted item level 115 pieces (tests/unit/helpers/
   sheet-fixtures.js sageSet): the weapon, hands and feet rows empty, every other row pinned, and notes. */
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
const SET_SHEET = {
  v: 1,
  id: 's_sage',
  name: 'Bahamut T13 Healer',
  description: '',
  job: 'SGE',
  level: 100,
  sync: { on: true, cap: 123 },
  sets: [
    {
      id: 'g_mine',
      name: 'Mine',
      description: 'Week 1: crafted body\nsecond line',
      pieces: SAGE_ROWS.map(([slot, gameId]) => (gameId ? { slot, gameId, stones: [] } : { slot })),
      meal: null,
      pinned: { pieces: [2, 3, 5, 7, 8, 9, 10, 11], meal: false },
      fillSettings: null,
      createdAt: 0,
      updatedAt: 0,
    },
  ],
  gameData: { commit: 'd9582a6', date: '2026-09-30' },
  createdAt: 0,
  updatedAt: 0,
};

/** Open the seeded Sage set's page from the Sheets tab. */
async function openSageSet(pg) {
  await openSet(pg, SET_SHEET.name, 'Mine');
}

/** A set page: the header (breadcrumb, sheet settings, notes, Fill), a piece picked by hand as a draft (Discard, then
 * Apply, which pins it), a pin, the question before leaving a draft, a real Fill with its Take boxes (Discard, the
 * question before leaving a result, then Apply), and a reload keeping it all; no sideways scroll at 960 px. */
async function checkSetPage(pg) {
  await pg.setViewportSize(NARROW);
  await pg.evaluate(
    ([key, sheet]) => {
      localStorage.setItem(`${key}:sheet:${sheet.id}`, JSON.stringify(sheet));
      localStorage.setItem(`${key}:sheets`, JSON.stringify({ v: 1, order: [sheet.id] }));
    },
    [STORE_KEY, SET_SHEET],
  );
  await pg.reload();
  await waitReady(pg);
  await openSageSet(pg);
  await expect(pg.locator('#sh-set .crumbhere')).toHaveText('Mine');
  await expect(pg.locator('#sh-set-settings')).toHaveText('Sage · Level 100 · Item level sync 123');
  await expect(pg.locator('#sh-set-notes')).toHaveText('Week 1: crafted body second line');
  // the weapon, hands and feet rows and the meal are open
  await expect(pg.locator('#sh-fill')).toHaveText('Fill 4 unpinned slots');
  check(!(await hasHScroll(pg)), `Set page: scrolls sideways at ${NARROW.width} px`);

  // a piece picked by hand is a draft: Discard drops it, Apply saves it pinned
  const hands = pg.locator('#sh-gear tr[data-row="4"]');
  const pickHands = async () => {
    await hands.locator('[data-pick]').click();
    await expect(pg.locator('.pick-menu')).toBeVisible();
    await pg.locator('.pick-menu .same-item[data-game-id]').first().click();
    await expect(pg.locator('#sh-apply')).toHaveText('Apply 1 change');
  };
  await pickHands();
  check(await pg.locator('#sh-fill').isDisabled(), 'Set page: Fill is on during a draft');
  await pg.click('#sh-discard');
  await expect(pg.locator('#sh-toast')).toContainText('Discarded');
  await pickHands();
  // leaving with a draft asks first; Keep editing stays
  await pg.click('#sh-set .setcrumb a:nth-of-type(2)');
  await expect(pg.locator('#sh-leave')).toBeVisible();
  await pg.click('#sh-leave-keep');
  await expect(pg.locator('#sh-set .crumbhere')).toHaveText('Mine');
  await pg.click('#sh-apply');
  await expect(pg.locator('#sh-toast')).toContainText('Applied');
  await expect(hands.locator('.pinic')).toHaveAttribute('aria-pressed', 'true');
  const handsName = (await hands.locator('[data-pick]').innerText()).trim();
  await expect(pg.locator('#sh-fill')).toHaveText('Fill 3 unpinned slots');
  // a pin: saved at once
  await pg.locator('#sh-gear tr[data-row="2"] .pinic').click();
  await expect(pg.locator('#sh-fill')).toHaveText('Fill 4 unpinned slots');
  await pg.locator('#sh-gear tr[data-row="2"] .pinic').click();

  // Fill: a real search; the result waits with Take boxes; Discard keeps the set
  await pg.click('#sh-fill');
  await expect(pg.locator('#sh-discard')).toBeVisible();
  check((await pg.locator('#sh-gear .takebox').count()) >= 2, 'Set page: the Fill result has no Take boxes');
  check(await hands.locator('[data-pick]').isDisabled(), 'Set page: a piece can be changed while a Fill result waits');
  await pg.click('#sh-discard');
  await expect(pg.locator('#sh-toast')).toHaveText('Fill result discarded.');
  // Fill again; leaving asks first (Keep reviewing); one Take box off, then Apply
  await pg.click('#sh-fill');
  await expect(pg.locator('#sh-apply')).toBeVisible();
  await pg.click('#sh-set .setcrumb a');
  await expect(pg.locator('#sh-leave-keep')).toHaveText('Keep reviewing');
  await pg.click('#sh-leave-keep');
  const applyAll = (await pg.locator('#sh-apply').innerText()).trim();
  await pg.locator('#sh-gear .takebox input').first().uncheck();
  check((await pg.locator('#sh-apply').innerText()).trim() !== applyAll, 'Set page: a Take box off does not change Apply');
  check(!(await hasHScroll(pg)), `Set page: a Fill result scrolls sideways at ${NARROW.width} px`);
  await pg.screenshot({ path: shot('set-page-fill.png'), fullPage: true });
  await pg.click('#sh-apply');
  await expect(pg.locator('#sh-apply')).toHaveCount(0);
  const weapon = (await pg.locator('#sh-gear tr[data-row="0"] [data-pick]').innerText()).trim();

  // a reload keeps the set as applied
  await waitSaved(pg, "s => s.tab === 'sheets'");
  await pg.reload();
  await waitReady(pg);
  await openSageSet(pg);
  await expect(hands.locator('[data-pick]')).toHaveText(handsName);
  await expect(pg.locator('#sh-gear tr[data-row="0"] [data-pick]')).toHaveText(weapon);
  await checkNoBadText(pg, 'the set page');
  await pg.setViewportSize({ width: 1000, height: 900 });
  await pg.click('[data-tab=browse]');
}

// ---------- first paint ----------

/* Run in the page before its own script (addInitScript): at every animation frame from the first, until the page has
   settled, what is about to be painted: whether the page (.wrap) shows at all, the Job and sync panel and the job it
   names, and which tab panels. Read back from window.__firstPaint. */
const FIRST_PAINT_PROBE = () => {
  const frames = [];
  window.__firstPaint = frames;
  const shown = el => !!el && el.getClientRects().length > 0;
  const record = () => {
    if (document.body)
      frames.push({
        page: shown(document.querySelector('.wrap')),
        panel: shown(document.querySelector('section[aria-label="Job and sync settings"]')),
        job: document.getElementById('job-name')?.textContent ?? '',
        tabs: ['sheets', 'browse', 'math'].filter(tab => shown(document.getElementById(`tab-${tab}`))),
      });
    if (frames.length < 600) requestAnimationFrame(record);
  };
  requestAnimationFrame(record);
};

/** The page never paints half-built (owner's report: the empty Job and sync panel and the tab bar with no tab showed for
 * about 100 ms before the Sheets tab): from the first frame the page shows at all, the open tab's panel shows, and the
 * Job and sync panel shows only on the tabs that have one. Checked with the CPU slowed 4 times (the window was wider
 * there), on a fresh page (the Sheets tab), with the Gear browser and How the math works saved as the open tab, and on
 * a reload from a set page (which opens at the sheet manager). */
async function checkFirstPaint(pg) {
  const cdp = await pg.context().newCDPSession(pg);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await pg.addInitScript(FIRST_PAINT_PROBE);
  const load = async (where, saved) => {
    await pg.evaluate(
      ([key, state]) => {
        localStorage.clear();
        if (state) localStorage.setItem(key, JSON.stringify(state));
      },
      [STORE_KEY, saved],
    );
    await pg.reload();
    await waitReady(pg);
    await checkPaints(pg, where);
  };
  await load('a fresh page', null);
  await load('the Gear browser saved open', { tab: 'browse', browse: { job: 'SGE', sync: true, cap: 123, level: 50 } });
  await load('How the math works saved open', { tab: 'math', piece: { job: 'WHM', sync: false, cap: null, level: 100 } });
  await load('How the math works saved open with no job', { tab: 'math' });
  // a set page open: a reload opens the sheet manager
  await pg.evaluate(
    ([key, sheet]) => {
      localStorage.setItem(`${key}:sheet:${sheet.id}`, JSON.stringify(sheet));
      localStorage.setItem(`${key}:sheets`, JSON.stringify({ v: 1, order: [sheet.id] }));
    },
    [STORE_KEY, SET_SHEET],
  );
  await pg.reload();
  await waitReady(pg);
  await openSageSet(pg);
  await waitSaved(pg, "s => s.tab === 'sheets'");
  await pg.reload();
  await waitReady(pg);
  await checkPaints(pg, 'a reload from a set page');
  await expect(pg.locator('#sh-list')).toBeVisible();
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await cdp.detach();
}

/** Check the frames FIRST_PAINT_PROBE recorded since the last load: the page settled with the Job and sync panel only
 * off the Sheets tab, and every frame that showed the page showed it as it settled. */
async function checkPaints(pg, where) {
  await pg.waitForFunction(() => window.__firstPaint?.length >= 30); // a few frames after the page is ready
  const tab = await pg.locator('[role=tab][aria-selected="true"]').getAttribute('data-tab');
  const frames = await pg.evaluate(() => window.__firstPaint);
  const settled = frames.at(-1);
  check(
    settled.page && settled.panel === (tab !== 'sheets'),
    `first paint, ${where}: the page settled as ${JSON.stringify(settled)} on the ${tab} tab`,
  );
  // every frame that shows the page shows it as it settled
  const bad = frames.findIndex(f => f.page && !same(f, settled));
  check(
    bad < 0,
    `first paint, ${where}: frame ${bad} of ${frames.length} shows ${JSON.stringify(frames[bad])}, then ${JSON.stringify(settled)}`,
  );
}

// ---------- checks: the Sheets tab in two browser tabs, in both color schemes, at the five viewports ----------

/** Open the New sheet dialog from the manager (empty or not), pick `job`, type `name`, and create: the new sheet's page opens. */
async function createSheetByHand(page, job, name) {
  await page.locator('#sh-new-first, #sh-new').first().click();
  await page.click(`#sh-dialog [data-job-id=${job}]`);
  await page.fill('#sh-dlg-name', name);
  await page.click('#sh-dlg-ok');
  await expect(page.locator('#sh-sheet .crumbhere')).toHaveText(name);
}

/** From a sheet's page (or a set's) to the sheet manager, by the breadcrumb. */
async function toManager(page) {
  await page.locator('#sh-sheet .setcrumb a, #sh-set .setcrumb a').first().click();
  await expect(page.locator('#sh-manager')).toBeVisible();
}

/** The sheets' record keys and index, as another browser tab would find them in the shared storage. */
const storedSheets = page =>
  page.evaluate(key => {
    const records = {};
    for (let i = 0; i < localStorage.length; i++) {
      const name = localStorage.key(i);
      if (name.startsWith(`${key}:sheet:`)) records[name.slice(`${key}:sheet:`.length)] = localStorage.getItem(name);
    }
    return { index: JSON.parse(localStorage.getItem(`${key}:sheets`) ?? 'null'), records };
  }, STORE_KEY);

/** Two browser tabs on the same saved sheets (docs/engineering/sheets.md, "Reading and writing": a tab reads fresh records
 * each time it opens the manager or a sheet; the last write of a sheet wins; there is no live sync; a sheet record the
 * index lacks is listed after the indexed ones; an unreadable record is listed with its cause and left alone). Two pages of
 * one browser context share localStorage, as two browser tabs do. Page A is the step's page, page B a second one. Checked:
 * B reads A's new sheet and set when it opens; B's open pages do not change under it (no live sync) until it opens the
 * manager or a sheet again; a rename in B is what A reads on its next open; two edits of one sheet leave the last saved
 * record whole and both managers list every sheet once; A's reorder is the order B reads; a sheet deleted in A that B
 * lists sends B to the manager (the sheet is gone), and one B still has open and edits is written back by B (the last
 * write wins) and listed once; a record the index lacks, an index naming a record that does not exist and a record this build
 * cannot read are listed as the docs say. Both pages must raise no page or console error (the runner reports those). */
async function checkTwoTabs(pg) {
  const rec = stepRecord.getStore();
  const other = await pg.context().newPage();
  other.setDefaultTimeout(TIMEOUT);
  other.on('pageerror', e => rec.errors.push(`page error (second tab): ${e.message ?? e}`));
  other.on('console', m => {
    if (m.type() === 'error' && !m.text().includes('ERR_')) rec.errors.push(`console error (second tab): ${m.text()}`);
  });
  const names = (page, table = '#sh-list') => sheetNames(page, table);
  const manager = async page => {
    await page.click('[data-tab=sheets]');
    await expect(page.locator('#tab-sheets')).toBeVisible();
  };
  const renameSheet = async (page, name, description) => {
    await page.click('#sh-edit');
    if (name !== null) await page.fill('#sh-dlg-name', name);
    if (description !== null) await page.fill('#sh-dlg-description', description);
    await page.click('#sh-dlg-ok');
    await expect(page.locator('#sh-dialog')).toHaveCount(0);
  };
  const open = (page, name) => page.locator('#sh-list a.sname', { hasText: new RegExp(`^${name}$`) }).click();

  // 1. A makes a sheet and a set; B, opening the page after that, reads both
  await manager(pg);
  await createSheetByHand(pg, 'SGE', 'Alpha');
  await pg.click('#sh-new-set-first');
  await expect(pg.locator('#sh-set .crumbhere')).toHaveText('Set 1');
  await toManager(pg);
  await other.goto(PAGE);
  await waitReady(other);
  await manager(other);
  check(same(await names(other), ['Alpha']), `two tabs: the second tab lists ${await names(other)}, not Alpha, when it opens`);
  await open(other, 'Alpha');
  check(
    same(await names(other, '#sh-sets'), ['Set 1']),
    `two tabs: the second tab shows the sets ${await names(other, '#sh-sets')}, not Set 1`,
  );

  // 2. A makes a second sheet; B's open page and its switch menu do not change (no live sync); opening the manager reads it
  await createSheetByHand(pg, 'WHM', 'Beta');
  await toManager(pg);
  check(same(await names(pg), ['Beta', 'Alpha']), `two tabs: the first tab lists ${await names(pg)}, not Beta, Alpha`);
  await other.click('#sh-sheet-switch');
  await expect(other.locator('#sh-sheet-menu')).toBeVisible();
  check(
    same(
      await other.locator('#sh-sheet-menu .setitem').allInnerTexts(),
      ['All sheets (1)', 'Alpha', '+ New sheet'].map(t => t),
    ),
    `two tabs: the second tab's switch menu changed under it, to ${await other.locator('#sh-sheet-menu .setitem').allInnerTexts()}`,
  );
  await other.keyboard.press('Escape');
  await expect(other.locator('#sh-sheet-menu')).toHaveCount(0);
  await toManager(other);
  check(same(await names(other), ['Beta', 'Alpha']), `two tabs: the second tab's manager lists ${await names(other)}, not Beta, Alpha`);

  // 3. B renames Alpha; A, with its manager still showing the old name, reads the new one when it opens the sheet
  await open(other, 'Alpha');
  await renameSheet(other, 'Alpha B', null);
  check(same(await names(pg), ['Beta', 'Alpha']), `two tabs: the first tab's manager changed under it, to ${await names(pg)}`);
  await open(pg, 'Alpha');
  await expect(pg.locator('#sh-sheet .crumbhere')).toHaveText('Alpha B');

  // 4. both edit Alpha B: A its name, then B (which still holds the name it saw) its description; B saved last, so the record
  // is B's whole: its name and its description; A's rename is lost, and nothing is torn or listed twice
  await renameSheet(pg, 'Alpha A', null);
  await renameSheet(other, null, 'from the second tab');
  const record = Object.values((await storedSheets(pg)).records)
    .map(text => JSON.parse(text))
    .find(sheet => sheet.name.startsWith('Alpha'));
  check(
    record.name === 'Alpha B' && record.description === 'from the second tab',
    `two tabs: the stored sheet is "${record.name}" / "${record.description}", not B's whole record "Alpha B" / "from the second tab"`,
  );
  await toManager(pg);
  await open(pg, 'Alpha B');
  await expect(pg.locator('#sh-description')).toHaveText('from the second tab');
  await toManager(pg);
  await toManager(other);
  for (const [which, page] of [
    ['first', pg],
    ['second', other],
  ]) {
    check(same(await names(page), ['Beta', 'Alpha B']), `two tabs: the ${which} tab lists ${await names(page)} after the two edits`);
    check(
      (await page.locator('#sh-unreadable').count()) === 0,
      `two tabs: the ${which} tab lists a sheet that cannot be read after the two edits`,
    );
  }
  const afterEdits = await storedSheets(pg);
  check(
    Object.keys(afterEdits.records).length === 2 && same([...afterEdits.index.order].sort(), Object.keys(afterEdits.records).sort()),
    `two tabs: the index ${JSON.stringify(afterEdits.index)} and the records ${Object.keys(afterEdits.records)} disagree after the two edits`,
  );

  // 5. A reorders (Beta below Alpha B, by keyboard); that order is what B reads
  await pg.locator('#sh-list tbody tr:nth-of-type(1) .draghandle').focus();
  await pg.keyboard.press('ArrowDown');
  await expect(pg.locator('#sh-live')).toHaveText('Beta moved to position 2 of 2.');
  check(same(await names(pg), ['Alpha B', 'Beta']), `two tabs: the first tab lists ${await names(pg)} after the move`);
  await open(other, 'Alpha B'); // the second tab's manager is stale (Beta first): opening a sheet reads fresh
  await toManager(other); // and the manager read fresh
  check(same(await names(other), ['Alpha B', 'Beta']), `two tabs: the second tab reads ${await names(other)}, not A's order Alpha B, Beta`);
  const moved = await storedSheets(pg);
  check(
    same(
      moved.index.order.map(id => JSON.parse(moved.records[id]).name),
      ['Alpha B', 'Beta'],
    ),
    `two tabs: the stored order is ${moved.index.order.map(id => JSON.parse(moved.records[id]).name)}, not Alpha B, Beta`,
  );

  // 6. A deletes Beta while B's switch menu (read before) still lists it: choosing it sends B to the manager, without Beta
  await open(other, 'Alpha B');
  await rowAction(pg, '#sh-list', 2, 'Delete').click();
  await expect(pg.locator('#sh-dialog .question')).toContainText('Delete the sheet “Beta”');
  await pg.click('#sh-dlg-ok');
  check(same(await names(pg), ['Alpha B']), `two tabs: the first tab lists ${await names(pg)} after deleting Beta`);
  await other.click('#sh-sheet-switch');
  check(
    (await other.locator('#sh-sheet-menu .setitem', { hasText: 'Beta' }).count()) === 1,
    'two tabs: the second tab no longer lists the deleted sheet in its switch menu before it read again',
  );
  await other.locator('#sh-sheet-menu .setitem', { hasText: 'Beta' }).click();
  await expect(other.locator('#sh-manager')).toBeVisible();
  check(same(await names(other), ['Alpha B']), `two tabs: the second tab lists ${await names(other)} after choosing the deleted sheet`);

  // 7. A deletes Alpha B while B has its page open; B's edit writes it back (the last write wins) and it is listed once
  await open(other, 'Alpha B');
  await rowAction(pg, '#sh-list', 1, 'Delete').click();
  await expect(pg.locator('#sh-dialog .question')).toContainText('Delete the sheet “Alpha B” and its 1 gear set?');
  await pg.click('#sh-dlg-ok');
  await expect(pg.locator('#sh-empty h3')).toHaveText('No sheets yet');
  await expect(other.locator('#sh-sheet .crumbhere')).toHaveText('Alpha B'); // B's open page is not taken away
  await renameSheet(other, 'Back from B', null);
  await createSheetByHand(pg, 'AST', 'Gamma'); // A, from its empty manager
  await toManager(pg);
  check(same(await names(pg), ['Gamma', 'Back from B']), `two tabs: the first tab lists ${await names(pg)} after B's write-back`);
  await toManager(other);
  check(same(await names(other), ['Gamma', 'Back from B']), `two tabs: the second tab lists ${await names(other)} after its write-back`);

  // 8. a record the index lacks comes last; an index naming a record that is not there is ignored; a record this build cannot
  // read is listed with its cause and kept, the sheets around it unharmed
  const state = await storedSheets(pg);
  const backId = state.index.order.find(id => JSON.parse(state.records[id]).name === 'Back from B');
  await pg.evaluate(
    ([key, kept]) => {
      localStorage.setItem(`${key}:sheets`, JSON.stringify({ v: 1, order: ['s_ghost', kept] })); // no record s_ghost; Gamma not listed
      localStorage.setItem(`${key}:sheet:s_future`, JSON.stringify({ v: 99, id: 's_future' }));
    },
    [STORE_KEY, backId],
  );
  await open(other, 'Back from B'); // opening a sheet reads fresh ...
  await toManager(other); // ... and so does the manager
  check(
    same(await names(other), ['Back from B', 'Gamma']),
    `two tabs: with Gamma missing from the index the list is ${await names(other)}, not Back from B, Gamma`,
  );
  await expect(other.locator('#sh-unreadable')).toContainText('s_future');
  check((await storedSheets(other)).records.s_future !== undefined, 'two tabs: the record this build cannot read was deleted on its own');
  await other.close();
  await pg.click('[data-tab=browse]');
}

// ---- the Sheets screens for the theme and viewport checks ----

const VIEW_STONES = [
  { stat: 'crit', grade: 12 },
  { stat: 'crit', grade: 12 },
];
/** Three saved sheets, the manager's list in this order: a Sage sheet (level 100, no sync) whose set's earring row holds
 * Courtly Lover's Earrings (49309) with two stones, pinned, so a Fill keeps it and the materia menu of its overmeld slot has the
 * odds row; a White Mage sheet with five empty sets; a Warrior sheet. Each has a description, so a list row has its note. */
function viewSheets() {
  const sage = pieceSheet('s_view_sge', 'Sage with an earring', 'SGE', 7, 49309, VIEW_STONES);
  sage.description = 'Week 1 of the tier';
  sage.sets[0].pinned = { pieces: [7], meal: false };
  const five = {
    ...edgeSheet('s_view_five', 'Five sets', 'WHM', 100, { on: true, cap: 123 }),
    description: 'Five empty sets',
    sets: [1, 2, 3, 4, 5].map(n => ({
      ...FILL_SHEET.sets[0],
      id: `g_five_${n}`,
      name: `Set ${n}`,
      description: n === 1 ? 'first notes' : '',
    })),
  };
  const tank = { ...edgeSheet('s_view_war', 'Tank', 'WAR', 100, { on: false, cap: 795 }), description: 'A tank sheet' };
  return [sage, five, tank];
}

/** On the Sheets tab: open the sheet `sheetName`, then its set `setName`; the sheet manager first. */
async function openViewSet(pg, sheetName, setName) {
  await openSet(pg, sheetName, setName);
}

// ---- dark mode and light mode ----

/** Probes of the theme checks: `named` are `{ name, selector }` elements whose text must reach WCAG AA (an `optional` one may be
 * missing); `surfaces` are `{ name, selector, token }` elements whose background is the token's color. */
const THEME_SCREENS = {
  manager: {
    named: [
      { name: 'column names', selector: '#sh-list thead th' },
      { name: 'sheet name', selector: '#sh-list a.sname' },
      { name: 'row note (muted)', selector: '#sh-list .sorigin' },
      { name: 'row action', selector: '#sh-list .rowacts .linkbtn' },
      { name: 'settings cell', selector: '#sh-list tbody td:nth-child(3)' },
      { name: 'hint (muted)', selector: '#sh-manager p.small.dim' },
      { name: 'New sheet button', selector: '#sh-new' },
      { name: 'heading', selector: '#sh-manager h2' },
    ],
    surfaces: [],
    min: 20,
  },
  sheet: {
    named: [
      { name: 'column names', selector: '#sh-sets thead th' },
      { name: 'set name', selector: '#sh-sets a.sname' },
      { name: 'set note', selector: '#sh-sets .setnotes' },
      { name: 'figure cell', selector: '#sh-sets tbody td.n' },
      { name: 'range (muted) .f-range', selector: '#sh-level-range' },
      { name: 'cap field note', selector: '#sh-cap-lowered' },
      { name: 'level field', selector: '#sh-level' },
      { name: 'Edit button', selector: '#sh-edit' },
      { name: 'Delete sheet button', selector: '#sh-delete' },
      { name: 'New set button', selector: '#sh-new-set' },
      { name: 'description', selector: '#sh-description' },
      { name: 'panel note (muted)', selector: '#sh-sheet .panel p.small.dim' },
      { name: 'breadcrumb link', selector: '#sh-sheet .setcrumb a' },
    ],
    surfaces: [{ name: 'settings panel', selector: '#sh-sheet .panel', token: '--surface' }],
    min: 25,
  },
  suggestion: {
    named: [
      { name: 'column names', selector: '#sh-gear thead th' },
      { name: 'stat cell', selector: '#sh-gear tbody td.n' },
      { name: 'muted cell', selector: '#sh-gear td .dim' },
      { name: 'total row', selector: '#sh-total td.n' },
      { name: 'tier row (muted)', selector: '#sh-tier td.small' },
      { name: 'Take box label', selector: '#sh-gear .takebox span' },
      { name: 'better delta', selector: '#sh-figures em.dl.good', optional: true },
      { name: 'worse delta', selector: '#sh-figures em.dl.bad', optional: true },
      { name: 'Apply button', selector: '#sh-apply' },
      { name: 'Discard button', selector: '#sh-discard' },
      { name: 'Delete button', selector: '#sh-set-delete' },
      { name: 'goal line', selector: '#sh-goal' },
      { name: 'sheet settings line', selector: '#sh-set-settings' },
      { name: 'set name', selector: '#sh-set-name' },
      { name: 'stat block label', selector: '#sh-figures .cl' },
    ],
    surfaces: [{ name: 'set bar', selector: '#sh-set .tbar', token: '--surface' }],
    min: 40,
  },
  stoneMenu: {
    named: [
      { name: 'menu title', selector: '.matpop h5' },
      { name: 'odds label', selector: '.matpop .matgrid .s' },
      { name: 'odds figure', selector: '.matpop .matgrid .pc' },
      { name: 'grade heading', selector: '.matpop .matgrid .h' },
      { name: 'stone button', selector: '.matpop .matgrid button:not(.na)' },
      { name: 'menu footer button', selector: '.matpop .matfoot button' },
      { name: 'menu note', selector: '.matpop .rmnote', optional: true },
      { name: 'materia chip', selector: '#sh-gear .mchip' },
      { name: 'piece button', selector: '#sh-gear td.item .same-btn' },
    ],
    surfaces: [{ name: 'materia menu', selector: '.matpop', token: '--surface' }],
    min: 20,
  },
  newSheetDialog: {
    named: [
      { name: 'dialog title', selector: '#sh-dialog h3' },
      { name: 'field label', selector: '#sh-dialog label.f' },
      { name: 'range (muted) .f-range', selector: '#sh-dialog .f-range' },
      { name: 'name box', selector: '#sh-dlg-name' },
      { name: 'cap field note', selector: '#sh-dlg-cap-lowered' },
      { name: 'error line', selector: '#sh-dialog .dlgerr' },
      { name: 'job row label', selector: '#sh-dialog .jobrow-label' },
      { name: 'Create button', selector: '#sh-dlg-ok' },
      { name: 'Cancel button', selector: '#sh-dialog .dlgbtns button:not(.primary)' },
    ],
    surfaces: [{ name: 'dialog', selector: '#sh-dialog', token: '--surface' }],
    min: 25,
  },
};

/** Contrast findings the page has today (reported to the owner, not yet changed): printed as "KNOWN FAILURE" lines, they do not
 * fail the run, and a finding that stops happening fails it until it is removed here (checkThemes). `test` is matched against the
 * probed element's name, `scheme` limits it to one scheme; `note` says what is under WCAG AA 4.5. None today. */
const KNOWN_LOW_CONTRAST = [];

/** The six ways the page can be told its scheme: the system setting alone (dark, light), and `data-theme` forced to each value
 * under each system setting. The scheme shown is the forced one, else the system's (CLAUDE.md, "Page rules"). */
const THEME_COMBINATIONS = [
  ['dark', null],
  ['light', null],
  ['dark', 'dark'],
  ['light', 'dark'],
  ['dark', 'light'],
  ['light', 'light'],
];

/** The open Sheets screen `screenName` (a THEME_SCREENS key) under each THEME_COMBINATION: the page's tokens are the
 * stylesheet's for the scheme shown (read from src/styles.css, not from the page), the body and the listed surfaces are painted
 * in them, and every probed text reaches WCAG AA against the background it sits on (4.5, large text 3). Screenshots of the two
 * system settings go to the output folder. */
async function inEveryTheme(pg, screenName, seen) {
  const screen = THEME_SCREENS[screenName];
  const css = readStyles();
  const tokens = { light: tokensFor(css, 'light'), dark: tokensFor(css, 'dark') };
  const names = Object.keys(tokens.light).filter(name => !['--serif', '--sans', '--mono'].includes(name));
  for (const [system, forced] of THEME_COMBINATIONS) {
    const scheme = forced ?? system;
    const where = `${screenName}, system ${system}${forced ? `, data-theme ${forced}` : ''}`;
    await pg.emulateMedia({ colorScheme: system });
    await pg.evaluate(theme => {
      if (theme) document.documentElement.setAttribute('data-theme', theme);
      else document.documentElement.removeAttribute('data-theme');
    }, forced);

    // the tokens, and the body and surfaces painted with them
    const shown = await pg.evaluate(probeTheme, { names, surfaces: screen.surfaces });
    // a computed custom property is written the way the browser prints numbers (.18 for 0.18)
    const printed = text => text.replace(/0\./g, '.');
    const wrongTokens = names.filter(name => printed(shown.tokens[name]) !== printed(tokens[scheme][name]));
    check(
      !wrongTokens.length,
      `theme (${where}): ${wrongTokens.length} tokens are not the ${scheme} ones: ${wrongTokens
        .slice(0, 3)
        .map(n => `${n} ${JSON.stringify(printed(shown.tokens[n]))} (want ${JSON.stringify(printed(tokens[scheme][n]))})`)
        .join('; ')}`,
    );
    const rgbOf = token => tokenColor(tokens[scheme][token]).slice(0, 3);
    const isColor = (text, token) => same(parseComputed(text)?.slice(0, 3), rgbOf(token));
    check(
      isColor(shown.body, '--bg'),
      `theme (${where}): the page background is ${shown.body}, not ${scheme} --bg ${tokens[scheme]['--bg']}`,
    );
    for (const { name, token } of screen.surfaces) {
      check(
        isColor(shown.surfaces[name], token),
        `theme (${where}): the ${name} background is ${shown.surfaces[name]}, not ${scheme} ${token}`,
      );
    }

    // contrast
    const samples = await pg.evaluate(probeText, { named: screen.named, root: '#tab-sheets' });
    const wanted = new Map(screen.named.map(n => [n.name, n]));
    const missing = samples.filter(s => s.missing && !wanted.get(s.name).optional).map(s => s.name);
    check(!missing.length, `theme (${where}): nothing to read for ${missing.join(', ')}`);
    const judged = samples.filter(s => !s.missing).map(s => ({ name: s.name, ...judge(s) }));
    check(judged.length >= screen.min, `theme (${where}): only ${judged.length} texts probed, expected at least ${screen.min}`);
    const knownFor = j => KNOWN_LOW_CONTRAST.find(k => k.test.test(j.name) && (!k.scheme || k.scheme === scheme));
    const low = judged.filter(j => !j.ok && !knownFor(j));
    for (const j of judged.filter(j => !j.ok && knownFor(j))) {
      const known = knownFor(j);
      seen.add(`${known.id}|${scheme}`);
      stepRecord
        .getStore()
        .known.set(
          `contrast ${known.id} ${scheme}`,
          `KNOWN FAILURE (contrast, ${scheme}): ${known.note} (${j.ratio.toFixed(2)}, ${j.name.slice(0, 40)})`,
        );
    }
    const lowNames = [...new Map(low.map(j => [j.name, j])).values()];
    check(
      !low.length,
      `contrast (${where}): ${lowNames.length} texts under WCAG AA: ${lowNames
        .slice(0, 5)
        .map(j => `${j.name} ${j.ratio.toFixed(2)} (need ${j.need})`)
        .join('; ')}`,
    );

    if (!forced) await pg.screenshot({ path: shot(`theme-${screenName}-${system}.png`), fullPage: screenName !== 'newSheetDialog' });
  }
  await pg.emulateMedia({ colorScheme: null });
  await pg.evaluate(() => document.documentElement.removeAttribute('data-theme'));
}

/** The Sheets tab's key screens in dark and light (checks in inEveryTheme): the manager with three sheets, a sheet's page with
 * a lowered cap's note, a set page with a Fill suggestion, its materia menu (an overmeld slot, with the odds row) and the New
 * sheet dialog with a field note and an error line. The stylesheet itself is checked for literal colors in
 * tests/unit/styles.theme-tokens.test.js. */
async function checkThemes(pg) {
  const seen = new Set(); // the known contrast findings that happened (KNOWN_LOW_CONTRAST), as "id|scheme"
  await seedSheets(pg, viewSheets());
  await pg.click('[data-tab=sheets]');
  await expect(pg.locator('#sh-list')).toBeVisible();
  await inEveryTheme(pg, 'manager', seen);

  // the New sheet dialog: a cap lowered (its note) and a blank name (its error line)
  await pg.click('#sh-new');
  await pg.click('#sh-dialog [data-job-id=SGE]');
  await pg.locator('#sh-dlg-sync').check();
  await setNumber(pg, '#sh-dlg-cap', '999');
  await expect(pg.locator('#sh-dlg-cap-lowered')).toBeVisible();
  await pg.fill('#sh-dlg-name', '');
  await pg.click('#sh-dlg-ok');
  await expect(pg.locator('#sh-dialog .dlgerr')).toBeVisible();
  await inEveryTheme(pg, 'newSheetDialog', seen);
  await pg.keyboard.press('Escape');
  await expect(pg.locator('#sh-dialog')).toHaveCount(0);

  // a sheet's page, with its cap note
  await pg.locator('#sh-list a.sname', { hasText: 'Five sets' }).click();
  await setNumber(pg, '#sh-cap', '999');
  await expect(pg.locator('#sh-cap-lowered')).toBeVisible();
  await inEveryTheme(pg, 'sheet', seen);

  // a set page with a Fill suggestion, then the materia menu of the earring's overmeld slot
  await pg.click('#sh-sheet .setcrumb a');
  await openViewSet(pg, 'Sage with an earring', 'Mine');
  await runFill(pg);
  await inEveryTheme(pg, 'suggestion', seen);
  await pg.click('#sh-discard');
  await pg.click('[data-chip="7:2"]');
  await expect(pg.locator('.matpop')).toBeVisible();
  await inEveryTheme(pg, 'stoneMenu', seen);
  await pg.keyboard.press('Escape');
  for (const known of KNOWN_LOW_CONTRAST) {
    const wanted = known.id;
    check(
      [...seen].some(found => found.startsWith(`${wanted}|`)),
      `theme: the known contrast finding "${wanted}" no longer happens: remove it from KNOWN_LOW_CONTRAST`,
    );
  }
  await pg.click('[data-tab=browse]');
}

// ---- the five viewports ----

/** The test windows of docs/engineering/testing.md section 3.1, by CSS screen: [name, width, height]. */
const VIEWPORTS = [
  ['960 floor', 960, 700],
  ['1280 x 720', 1265, 565],
  ['1536 x 864', 1521, 709],
  ['1920 x 1080', 1905, 925],
  ['2560 x 1440', 2545, 1285],
];
/** The container's maximum width in px (src/styles.css `.wrap`; docs/roadmap.md A14 settles it at 1280 for every tab) and
 * the page's gutter in px on each side: the body's 16 px side padding (styles.css resets the body margin). */
const WRAP_MAX = 1280;
const PAGE_SIDE_GUTTER = 16;

/** In the page: the window's and the container's widths, for the container and sideways-scroll checks. */
const probeWidths = () => {
  const root = document.documentElement;
  const wrap = document.querySelector('.wrap').getBoundingClientRect();
  return { inner: innerWidth, client: root.clientWidth, scroll: root.scrollWidth, left: wrap.left, right: wrap.right, width: wrap.width };
};

/** In the page: the boxes of a set page's sticky header, the column names row and the first body row, the window's height
 * and the scroll position. */
const probeSetBoxes = () => {
  const box = el => {
    const r = el.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
  };
  const names = document.querySelector('#sh-gear thead th');
  const centerHit = (el, selector) => {
    const r = el.getBoundingClientRect();
    return !!document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)?.closest(selector);
  };
  const head = document.querySelector('#sh-set .shead');
  return {
    head: box(head),
    names: box(names),
    firstRow: box(document.querySelector('#sh-gear tbody tr')),
    headOnTop: centerHit(head, '.shead'),
    namesOnTop: centerHit(names, 'th'),
    scrollY: Math.round(scrollY),
    maxScroll: Math.round(document.documentElement.scrollHeight - innerHeight),
    innerHeight,
    clientWidth: document.documentElement.clientWidth,
  };
};

/** In the page: the box of the open menu `selector` and the sticky header's bottom edge. */
const probeMenu = selector => {
  const r = document.querySelector(selector).getBoundingClientRect();
  return {
    top: r.top,
    bottom: r.bottom,
    left: r.left,
    right: r.right,
    headBottom: document.querySelector('#sh-set .shead').getBoundingClientRect().bottom,
    innerHeight,
    clientWidth: document.documentElement.clientWidth,
  };
};

/** Assert the width rules of one screen at the window `vp` ([name, width, height]): no sideways scroll (the page's
 * scrollWidth within the window's innerWidth), and the container as wide as the documented cap allows, min(1280, the
 * page's width less its side padding), centered. */
async function checkWidths(pg, vp, screenName) {
  const w = await pg.evaluate(probeWidths);
  const where = `${vp[0]} (${vp[1]} x ${vp[2]}), ${screenName}`;
  check(w.scroll <= w.inner, `viewport ${where}: scrollWidth ${w.scroll} is more than innerWidth ${w.inner}`);
  const wantWidth = Math.min(WRAP_MAX, w.client - 2 * PAGE_SIDE_GUTTER);
  check(
    Math.abs(w.width - wantWidth) <= 1,
    `viewport ${where}: the container is ${w.width} px wide, not ${wantWidth} (cap ${WRAP_MAX}, page ${w.client})`,
  );
  check(
    Math.abs(w.left - (w.client - w.right)) <= 1,
    `viewport ${where}: the container is not centered (left ${w.left}, right gap ${w.client - w.right})`,
  );
}

/** Menus that end below the window's bottom edge at a test window today, with the row scrolled as far up as the page allows (reported to the owner, not yet changed), by
 * "<width>x<height>|<menu>": printed as "KNOWN FAILURE" lines; a menu that now fits fails the run until it is removed. */
const KNOWN_MENU_OVERFLOW = new Map();

/** Assert an open menu `selector` fits the window and stays below the sticky header (the piece menu check of checkPickMenu, here at
 * every window). */
async function checkMenuFits(pg, vp, what, selector, seen) {
  const m = await pg.evaluate(probeMenu, selector);
  const where = `${vp[0]} (${vp[1]} x ${vp[2]}), ${what}`;
  check(
    m.left >= 0 && m.right <= m.clientWidth,
    `viewport ${where}: the menu runs outside the window sideways (${Math.round(m.left)} to ${Math.round(m.right)} of ${m.clientWidth})`,
  );
  check(
    m.top >= m.headBottom - 1,
    `viewport ${where}: the menu starts at ${Math.round(m.top)}, under the sticky header that ends at ${Math.round(m.headBottom)}`,
  );
  const below = m.bottom - m.innerHeight;
  const known = KNOWN_MENU_OVERFLOW.get(`${vp[1]}x${vp[2]}|${what}`);
  if (known && below > 1) {
    seen.add(`${vp[1]}x${vp[2]}|${what}`);
    stepRecord
      .getStore()
      .known.set(
        `menu ${where}`,
        `KNOWN FAILURE (layout, ${where}): ${known}; ends at ${Math.round(m.bottom)}, the window's ${m.innerHeight}`,
      );
  } else {
    check(below <= 1, `viewport ${where}: the menu ends at ${Math.round(m.bottom)}, below the window's ${m.innerHeight}`);
  }
}

/** Scroll a set page so the row `selector` sits just under the sticky header and the column names: the most room a menu opened
 * from the row can have below it, the same at every run (a click would scroll the row to wherever it first shows). */
async function alignRowUnderHeader(pg, selector) {
  // the header's height and the column names' place settle after a window resize, so scroll again until the scroll position
  // holds still (a row near the page's end cannot reach the top: the page stops at its end, which is the most room it has)
  await pg.evaluate(async rowSelector => {
    const frames = () => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
    let stable = 0;
    for (let tries = 0; tries < 40 && stable < 3; tries++) {
      await frames();
      const before = scrollY;
      const row = document.querySelector(rowSelector).getBoundingClientRect();
      const head = document.querySelector('#sh-set .shead').getBoundingClientRect();
      const names = document.querySelector('#sh-gear thead th').getBoundingClientRect();
      scrollBy(0, row.top - (head.bottom + names.height + 4));
      await frames();
      stable = Math.abs(scrollY - before) < 0.5 ? stable + 1 : 0;
    }
  }, selector);
}

/** Press Tab from the set page's breadcrumb until the focus is on the element `id` (at most `limit` presses), and say whether it
 * got there with the element in view (the point at its center belongs to it, not to the sticky header over it). */
async function tabTo(pg, id, limit = 60) {
  for (let i = 0; i < limit; i++) {
    await pg.keyboard.press('Tab');
    const at = await pg.evaluate(() => {
      const el = document.activeElement;
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return { id: el.id, shown: !!hit && el.contains(hit) };
    });
    if (at.id === id) return at.shown ? 'reached' : 'hidden under another element';
  }
  return `not reached in ${limit} presses`;
}

/** The Sheets tab's screens at the five test windows of testing.md section 3.1 (a screenshot of each to the output folder):
 * at each window the sheet manager (three sheets), a sheet's page (five sets) and a set page (every row filled by a Fill, applied),
 * with its piece menu and materia menu open. Geometry only, no pixel baselines: no sideways scroll; the container as wide as the
 * 1280 px cap and the page's width allow, centered; each menu inside the window and below the sticky header; the column names
 * below the sticky header at the top and, scrolled to the bottom, the header and the column names still on top of the rows; and
 * the Tab key reaching Fill, then (a piece picked by hand) Apply and Discard, each in view. */
async function checkViewports(pg) {
  const seen = new Set(); // the known menu overflows that happened (KNOWN_MENU_OVERFLOW)
  await seedSheets(pg, viewSheets());
  await pg.setViewportSize({ width: VIEWPORTS[0][1], height: VIEWPORTS[0][2] });
  await pg.click('[data-tab=sheets]');
  // fill the Sage set once: every row has a piece, the pinned earring among them
  await openViewSet(pg, 'Sage with an earring', 'Mine');
  await runFill(pg);
  await pg.click('#sh-apply');
  await expect(pg.locator('#sh-apply')).toHaveCount(0);
  await expect(pg.locator('#sh-gear tr[data-row="6"] [data-pick]')).not.toHaveText('Choose a piece');
  let scrolledAt = 0;

  for (const vp of VIEWPORTS) {
    const [label, width, height] = vp;
    const slug = `${width}x${height}`;
    await pg.setViewportSize({ width, height });
    const toTop = () => pg.evaluate(() => scrollTo(0, 0));

    // the sheet manager, three sheets
    await pg.click('#sh-set .setcrumb a');
    await expect(pg.locator('#sh-list')).toBeVisible();
    check((await sheetNames(pg, '#sh-list')).length === 3, `viewport ${label}: the manager lists ${await sheetNames(pg, '#sh-list')}`);
    await checkWidths(pg, vp, 'the sheet manager');
    await pg.screenshot({ path: shot(`viewport-${slug}-manager.png`) });

    // a sheet's page, five sets
    await pg.locator('#sh-list a.sname', { hasText: 'Five sets' }).click();
    await expect(pg.locator('#sh-sets')).toBeVisible();
    check((await sheetNames(pg, '#sh-sets')).length === 5, `viewport ${label}: the sheet lists ${await sheetNames(pg, '#sh-sets')}`);
    await checkWidths(pg, vp, "a sheet's page");
    await pg.screenshot({ path: shot(`viewport-${slug}-sheet.png`), fullPage: true });

    // the set page: top of the page
    await pg.click('#sh-sheet .setcrumb a');
    await openViewSet(pg, 'Sage with an earring', 'Mine');
    await toTop();
    await checkWidths(pg, vp, 'the set page');
    const top = await pg.evaluate(probeSetBoxes);
    check(
      top.names.top >= top.head.bottom - 1,
      `viewport ${label}: the column names start at ${Math.round(top.names.top)}, inside the header that ends at ${Math.round(top.head.bottom)}`,
    );
    check(
      top.firstRow.top >= top.names.bottom - 1,
      `viewport ${label}: the first row starts at ${Math.round(top.firstRow.top)}, inside the column names that end at ${Math.round(top.names.bottom)}`,
    );
    await pg.screenshot({ path: shot(`viewport-${slug}-set-page.png`) });

    // the materia menu of the earring's overmeld slot, then the piece menu of the feet row
    await alignRowUnderHeader(pg, '#sh-gear tr[data-row="7"]');
    await pg.click('[data-chip="7:2"]');
    await expect(pg.locator('.matpop')).toBeVisible();
    await checkMenuFits(pg, vp, 'the materia menu', '.matpop', seen);
    await checkWidths(pg, vp, 'the materia menu');
    await pg.screenshot({ path: shot(`viewport-${slug}-stone-menu.png`) });
    await pg.keyboard.press('Escape');
    await expect(pg.locator('.matpop')).toHaveCount(0);
    await alignRowUnderHeader(pg, '#sh-gear tr[data-row="6"]');
    await pg.locator('#sh-gear tr[data-row="6"] [data-pick]').click();
    await expect(pg.locator('.pick-menu')).toBeVisible();
    await checkMenuFits(pg, vp, 'the piece menu', '.pick-menu', seen);
    await checkWidths(pg, vp, 'the piece menu');
    await pg.screenshot({ path: shot(`viewport-${slug}-piece-menu.png`) });
    await pg.keyboard.press('Escape');
    await expect(pg.locator('.pick-menu')).toHaveCount(0);

    // scrolled to the bottom: the header and the column names stay on top and in place
    await pg.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
    const bottom = await pg.evaluate(probeSetBoxes);
    if (bottom.scrollY > 0) {
      scrolledAt++;
      check(
        Math.abs(bottom.head.top) <= 1,
        `viewport ${label}: scrolled to the bottom the header is at ${Math.round(bottom.head.top)}, not 0`,
      );
      check(bottom.headOnTop, `viewport ${label}: scrolled to the bottom something covers the sticky header`);
      check(bottom.namesOnTop, `viewport ${label}: scrolled to the bottom something covers the column names`);
      check(
        Math.abs(bottom.names.top - bottom.head.bottom) <= 2,
        `viewport ${label}: scrolled to the bottom the column names are at ${Math.round(bottom.names.top)}, not below the header (${Math.round(bottom.head.bottom)})`,
      );
    } else {
      check(bottom.maxScroll <= 0, `viewport ${label}: the page could not scroll to the bottom`);
    }
    await pg.screenshot({ path: shot(`viewport-${slug}-set-page-bottom.png`) });

    // the Tab key: Fill, then a piece picked by hand makes a draft with Apply and Discard
    await toTop();
    await pg.locator('#sh-set .setcrumb a').first().focus();
    const fill = await tabTo(pg, 'sh-fill');
    check(fill === 'reached', `viewport ${label}: Tab to Fill: ${fill}`);
    await pg.locator('#sh-gear tr[data-row="6"] [data-pick]').click();
    await pg.locator('.pick-menu .same-item[data-game-id]:not(.on):not([disabled])').first().click();
    await expect(pg.locator('#sh-apply')).toBeVisible();
    await toTop();
    await pg.locator('#sh-set .setcrumb a').first().focus();
    const apply = await tabTo(pg, 'sh-apply');
    check(apply === 'reached', `viewport ${label}: Tab to Apply: ${apply}`);
    const discard = await tabTo(pg, 'sh-discard', 3);
    check(discard === 'reached', `viewport ${label}: Tab on to Discard: ${discard}`);
    await pg.click('#sh-discard');
    await expect(pg.locator('#sh-apply')).toHaveCount(0);
  }
  for (const wanted of KNOWN_MENU_OVERFLOW.keys()) {
    check(seen.has(wanted), `viewports: the known overflow "${wanted}" no longer happens: remove it from KNOWN_MENU_OVERFLOW`);
  }
  check(scrolledAt >= 2, `viewports: the set page scrolled at only ${scrolledAt} windows, so the sticky header was not exercised`);
  await pg.setViewportSize({ width: 1000, height: 900 });
  await pg.click('[data-tab=browse]');
}

/** The Fill settings dialog's pop-ups (Expansion, Gear from, the Spare points note) float over the dialog instead of being
 * cut by its scroll box: at 960 and 1925 px wide each opens fully inside the window, its text is whole, its last rows
 * belong to it (not to the dialog behind it or the backdrop), and the dialog gets no scrollbar. Escape closes the pop-up
 * first (focus back on its button), the next Escape the dialog. */
async function checkFillMenus(pg) {
  const probe = ([menuSel, buttonSel]) => {
    const menu = document.querySelector(menuSel);
    const dialog = document.querySelector('#sh-settings-dialog');
    const box = menu.getBoundingClientRect();
    const owns = (x, y) => menu.contains(document.elementFromPoint(x, y));
    return {
      box: [box.left, box.top, box.right, box.bottom].map(Math.round),
      window: [document.documentElement.clientWidth, innerHeight],
      // the menu's own corners (a hair inside): clipped by the dialog they would show what is behind it
      cornersOwned: owns(box.right - 6, box.bottom - 6) && owns(box.left + 6, box.top + 6),
      cutText: [...menu.querySelectorAll('span, small, p, label')].filter(el => el.scrollWidth > el.clientWidth + 1).length,
      menuSidewaysScroll: menu.scrollWidth > menu.clientWidth + 1,
      dialogSidewaysScroll: dialog.scrollWidth > dialog.clientWidth,
      dialogScrollbar: dialog.scrollHeight > dialog.clientHeight,
      button: buttonSel,
    };
  };
  for (const [width, height] of [
    [960, 900],
    [1925, 1000],
  ]) {
    await pg.setViewportSize({ width, height });
    await seedSheet(pg, SET_SHEET);
    await openSageSet(pg);
    await pg.click('#sh-settings');
    await expect(pg.locator('#sh-settings-dialog')).toBeVisible();
    for (const [what, buttonId, menuSel] of [
      ['Gear from menu', 's-from', '#s-from-menu'],
      ['Expansion menu', 's-exp', '#s-exp-menu'],
      ['Spare points note', 'sh-rank-help', '#s-rank-pop'],
    ]) {
      const where = `${width} px, ${what}`;
      await pg.click(buttonId === 'sh-rank-help' ? '#sh-settings-dialog .shelp' : `#${buttonId}`);
      await expect(pg.locator(menuSel)).toBeVisible();
      await poll(`${where} to sit inside the window with its corners and text whole and no dialog scrollbar`, async () => {
        const got = await pg.evaluate(probe, [menuSel, buttonId]);
        const [left, top, right, bottom] = got.box;
        const [windowWidth, windowHeight] = got.window;
        const ok =
          left >= 0 &&
          top >= 0 &&
          right <= windowWidth &&
          bottom <= windowHeight &&
          got.cornersOwned &&
          got.cutText === 0 &&
          !got.menuSidewaysScroll &&
          !got.dialogSidewaysScroll &&
          !got.dialogScrollbar;
        return { ok, got };
      });
      // Escape closes the pop-up and keeps the dialog; focus goes back to the pop-up's button (the note's ? takes none)
      if (buttonId !== 'sh-rank-help') await pg.locator(`${menuSel} input`).first().focus(); // the keyboard is inside the menu
      await pg.keyboard.press('Escape');
      await expect(pg.locator(menuSel)).toBeHidden();
      await expect(pg.locator('#sh-settings-dialog')).toBeVisible();
      if (buttonId !== 'sh-rank-help') {
        await poll(`${where}: focus on its button after Escape`, async () => {
          const got = await focusedId(pg);
          return { ok: got === buttonId, got };
        });
      }
    }
    // with every pop-up closed, the next Escape closes the dialog
    await pg.keyboard.press('Escape');
    await expect(pg.locator('#sh-settings-dialog')).toHaveCount(0);
  }
  await pg.click('[data-tab=browse]');
}

// ---------- corner radii of the Sheets surfaces (docs/engineering/ui.md, "Corner radii") ----------

const FOUR = '4px 4px 4px 4px'; // the one radius: fields, buttons, panels, tables, menus, dialogs
const SQUARE = '0px 0px 0px 0px';
/* surface, selector (first match), computed corners (top-left, top-right, bottom-right, bottom-left). The values are
   B17's (docs/scratchpad/sheet-flow/proto-b17-settings), measured in a browser; docs/engineering/ui.md lists them. */
const RADII = {
  manager: [
    ['Sheets manager: New sheet button', '#sh-new', FOUR],
    ['Sheets manager: table box', '#tab-sheets .tablewrap', FOUR],
    ['Sheets manager: row link button', '#sh-list .linkbtn', FOUR],
  ],
  newSheetDialog: [
    ['Dialog box', '#sh-dialog', FOUR],
    ['Dialog: text field', '#sh-dlg-name', FOUR],
    ['Dialog: number field', '#sh-dlg-level', FOUR],
    ['Dialog: primary button', '#sh-dlg-ok', FOUR],
    ['Dialog: switch track', '#sh-dlg-sync', '12px 12px 12px 12px'],
  ],
  deleteDialog: [
    ['Question box', '#sh-dialog', FOUR],
    ['Question: danger button', '#sh-dlg-ok', FOUR],
  ],
  sheetPage: [
    ['Sheet page: settings panel', 'section.panel[aria-label="Sheet settings"]', FOUR],
    ['Sheet page: number field', '#sh-level', FOUR],
    ['Sheet page: switch track', '#sh-sync', '12px 12px 12px 12px'],
    ['Sheet page: sets table box', '.tablewrap:has(#sh-sets)', FOUR],
    ['Sheet page: breadcrumb caret', '#sh-sheet-switch', FOUR],
  ],
  sheetMenu: [
    ['Breadcrumb menu box', '#sh-sheet-menu', FOUR],
    ['Breadcrumb menu row', '#sh-sheet-menu .setitem', FOUR],
  ],
  setPage: [
    ['Set page: Fill button', '#sh-fill', FOUR],
    ['Set page: Fill settings gear', '#sh-settings', FOUR],
    ['Set page: Copy button', '#sh-set-copy', FOUR],
    ['Set page: stat block', '#sh-figures', FOUR],
    ['Set page: gear table box', '#tab-sheets .tablewrap.settable', FOUR],
    ['Gear table: header first cell', '#sh-gear thead th:first-child', '4px 0px 0px 0px'],
    ['Gear table: header middle cell', '#sh-gear thead th:nth-child(3)', SQUARE],
    ['Gear table: header last cell', '#sh-gear thead th:last-child', '0px 4px 0px 0px'],
    ['Gear table: body (bottom corners)', '#sh-gear tbody', '0px 0px 4px 4px'],
    ['Gear table: last row first cell', '#sh-defense td:first-child', '0px 0px 0px 4px'],
    ['Gear table: last row last cell', '#sh-defense td:last-child', '0px 0px 4px 0px'],
    ['Piece button', '#sh-gear .same-btn', FOUR],
    ['Stone chip', '#sh-gear .mchip', FOUR],
    ['Origin pill', '#sh-gear .pill', '999px 999px 999px 999px'],
  ],
  pieceMenu: [
    ['Piece menu box', '.pick-menu', FOUR],
    ['Piece menu: search box', '.pick-menu input[type="text"]', FOUR],
    ['Piece menu: row', '.pick-menu .same-item', FOUR],
  ],
  foodMenu: [
    ['Food menu box', '#sh-meal-menu', FOUR],
    ['Food menu: search box', '#sh-meal-menu input[type="text"]', FOUR],
    ['Food menu: stat pill button', '#sh-meal-menu .meal-pill', '999px 999px 999px 999px'],
  ],
  stoneMenu: [['Stone menu box', '.matpop', FOUR]],
  fillSettings: [
    ['Fill settings dialog box', '#sh-settings-dialog', FOUR],
    ['Fill settings: select', '#s-target', FOUR],
    ['Fill settings: number field', '#s-lvl', FOUR],
    ['Fill settings: menu button', '#s-exp', FOUR],
    ['Fill settings: segmented control', '#sh-settings-dialog .seg', FOUR],
    ['Fill settings: ? button', '#sh-settings-dialog .shelp', '50% 50% 50% 50%'],
  ],
  fillMenu: [['Fill settings: menu box', '#s-exp-menu', FOUR]],
};

/** The four computed corner radii of the first element matching `selector`, as "tl tr br bl". */
const radiiAt = (pg, selector) =>
  pg.evaluate(sel => {
    const el = document.querySelector(sel);
    if (!el) return 'not found';
    const cs = getComputedStyle(el);
    return [cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomRightRadius, cs.borderBottomLeftRadius].join(' ');
  }, selector);

/** Check every row of RADII[screen] on the open screen. */
async function checkRadiiOf(pg, screen) {
  for (const [surface, selector, want] of RADII[screen]) {
    const got = await radiiAt(pg, selector);
    check(got === want, `radius: ${surface} (${selector}) is ${got}, not ${want}`);
  }
}

/** Colour of the device pixels at `points` ([x, y] in device pixels of `png`), read through a canvas on `reader`. */
async function pixelsOf(reader, png, points) {
  return await reader.evaluate(
    async ([base64, pts]) => {
      const img = new Image();
      img.src = `data:image/png;base64,${base64}`;
      await img.decode();
      const ctx = Object.assign(document.createElement('canvas'), { width: img.width, height: img.height }).getContext('2d');
      ctx.drawImage(img, 0, 0);
      return pts.map(([x, y]) => [...ctx.getImageData(x, y, 1, 1).data].slice(0, 3));
    },
    [png.toString('base64'), points],
  );
}

/** The rounded corners of the set table, at the owner's real scale (2x device pixels, a 1920 x 950 window, dark): the
 * stuck column-name row has its own rounded top corners (cell borders, not collapsed) and a page-coloured wedge in each
 * corner, so the rows scrolling under it never show their square side borders through the curve; the table's bottom
 * corners are rounded; every surface has the documented radius. Each assertion fails when its CSS is taken out (verified
 * on a broken copy of the page). */
async function checkRadii(pg) {
  const ctx = await pg
    .context()
    .browser()
    .newContext({ viewport: { width: 1920, height: 950 }, deviceScaleFactor: 2, colorScheme: 'dark' });
  const page = await ctx.newPage();
  page.setDefaultTimeout(TIMEOUT);
  const reader = await ctx.newPage();
  try {
    await page.goto(PAGE);
    await waitReady(page);
    await seedSheets(page, [SET_SHEET, { ...FILL_SHEET, id: 's_b', name: 'Second sheet' }]);
    await page.click('[data-tab=sheets]');
    await expect(page.locator('#sh-list')).toBeVisible();
    await checkRadiiOf(page, 'manager');
    await page.click('#sh-new');
    await expect(page.locator('#sh-dialog')).toBeVisible();
    await checkRadiiOf(page, 'newSheetDialog');
    await page.locator('#sh-dialog button', { hasText: 'Cancel' }).click();
    await page.locator('#sh-list tr', { hasText: 'Second sheet' }).getByText('Delete', { exact: true }).click();
    await expect(page.locator('#sh-dialog')).toBeVisible();
    await checkRadiiOf(page, 'deleteDialog');
    await page.locator('#sh-dialog button', { hasText: 'Cancel' }).click();

    await page.locator('#sh-list a.sname', { hasText: SET_SHEET.name }).click();
    await expect(page.locator('#sh-sheet')).toBeVisible();
    await checkRadiiOf(page, 'sheetPage');
    await page.click('#sh-sheet-switch');
    await expect(page.locator('#sh-sheet-menu')).toBeVisible();
    await checkRadiiOf(page, 'sheetMenu');
    await page.keyboard.press('Escape');
    await page.mouse.click(5, 5);
    await page.locator('#sh-sets a.sname', { hasText: 'Mine' }).click();
    await expect(page.locator('#sh-gear')).toBeVisible();
    await checkRadiiOf(page, 'setPage');

    // the menus and dialogs of the set page
    await page.click('#sh-gear tbody tr:nth-child(3) .same-btn');
    await expect(page.locator('.pick-menu')).toBeVisible();
    await page.locator('.pick-menu input[type="text"]').focus();
    await checkRadiiOf(page, 'pieceMenu');
    await page.keyboard.press('Escape');
    await page.click('#sh-meal-btn');
    await expect(page.locator('#sh-meal-menu')).toBeVisible();
    await checkRadiiOf(page, 'foodMenu');
    await page.keyboard.press('Escape');
    await page.locator('#sh-gear .mchip').first().click();
    await expect(page.locator('.matpop')).toBeVisible();
    await checkRadiiOf(page, 'stoneMenu');
    await page.keyboard.press('Escape');
    await page.click('#sh-settings');
    await expect(page.locator('#sh-settings-dialog')).toBeVisible();
    await checkRadiiOf(page, 'fillSettings');
    await page.click('#s-exp');
    await expect(page.locator('#s-exp-menu')).toBeVisible();
    await checkRadiiOf(page, 'fillMenu');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await expect(page.locator('#sh-settings-dialog')).toHaveCount(0);

    // the scrollbar thumbs
    const thumb = await page.evaluate(() =>
      [...document.styleSheets]
        .flatMap(sheet => {
          try {
            return [...sheet.cssRules]; // the Google Fonts sheet is cross-origin: no rules to read
          } catch {
            return [];
          }
        })
        .filter(r => r.selectorText?.endsWith('::-webkit-scrollbar-thumb'))
        .map(r => r.style.borderRadius),
    );
    check(thumb.length > 0 && thumb.every(r => r === '4px'), `radius: the scrollbar thumb is ${thumb.join(', ')}, not 4px`);

    // the stuck column-name row, at the bottom of the page (the window is shorter than the page, so it sticks)
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await sleep(200);
    const head = await page.evaluate(() => {
      const cells = [...document.querySelectorAll('#sh-gear thead th')];
      const box = el => {
        const r = el.getBoundingClientRect();
        return { left: r.left, right: r.right, top: r.top };
      };
      return {
        first: box(cells[0]),
        last: box(cells.at(-1)),
        // stuck: scrolled, and the cell's top edge is exactly the page header's bottom edge (not a pixel under it)
        stuckGap: cells[0].getBoundingClientRect().top - document.querySelector('#sh-set .shead').getBoundingClientRect().bottom,
        scrolled: scrollY > 0,
        page: getComputedStyle(document.body).backgroundColor.match(/\d+/g).slice(0, 3).map(Number),
      };
    });
    check(
      head.scrolled && Math.abs(head.stuckGap) < 0.05,
      `radius: the gear table's column-name row is not stuck exactly under the page header at the page bottom (gap ${head.stuckGap} px)`,
    );
    // the pixels outside the arc are the page colour, not a row border showing through
    for (const [corner, x0, y0, flip] of [
      ['top-left', head.first.left, head.first.top, false],
      ['top-right', head.last.right - 4, head.first.top, true],
    ]) {
      const png = await page.screenshot({ clip: { x: x0, y: y0, width: 4, height: 4 } }); // 8 x 8 device pixels
      const points = [];
      for (let i = 0; i < 8; i++)
        for (let j = 0; j < 8; j++) {
          const cx = (i + 0.5) / 2; // the pixel centre in css px, from the clip's left edge
          const dx = flip ? cx : 4 - cx; // its distance from the arc's centre: 4 css px in from the edge, 4 down
          const dy = 4 - (j + 0.5) / 2;
          if (Math.hypot(dx, dy) > 4.5) points.push([i, j]);
        }
      const colours = await pixelsOf(reader, png, points);
      const off = colours.filter(c => c.some((v, k) => Math.abs(v - head.page[k]) > 3));
      check(
        points.length >= 6 && off.length === 0,
        `radius: stuck header ${corner} corner: ${off.length} of ${points.length} pixels outside the arc are not the page colour (${JSON.stringify(off[0])}, want ${JSON.stringify(head.page)})`,
      );
    }
  } finally {
    await ctx.close();
  }
}

// ---------- the steps, in groups, and the runner ----------

const walk = job => ({ name: `walkJobs ${job}`, run: walkJob(job), shared: false });
/** Read looks off the page. `spec` maps a name to one of: ['css', selector, ...properties] (their computed values,
 * joined by spaces), ['below', selector] (the element's top edge in px under the tab bar), ['gap', upper, lower] (px
 * from the upper element's bottom edge to the lower one's top edge), ['token', '--name'] (a design token's colour, read
 * through a probe element, so it holds in either theme). A missing element reads "not found". */
const lookAt = (pg, spec) =>
  pg.evaluate(spec => {
    const find = selector => document.querySelector(selector);
    const read = ([kind, ...args]) => {
      if (kind === 'token') {
        const probe = document.createElement('i');
        probe.style.color = `var(${args[0]})`;
        document.body.append(probe);
        const colour = getComputedStyle(probe).color;
        probe.remove();
        return colour;
      }
      const els = args.slice(0, kind === 'gap' ? 2 : 1).map(find);
      if (els.some(el => !el)) return 'not found';
      const tenth = px => Math.round(px * 10) / 10;
      if (kind === 'below') return tenth(els[0].getBoundingClientRect().top - find('nav.tabs').getBoundingClientRect().bottom);
      if (kind === 'gap') return tenth(els[1].getBoundingClientRect().top - els[0].getBoundingClientRect().bottom);
      const cs = getComputedStyle(els[0]);
      return args
        .slice(1)
        .map(prop => cs.getPropertyValue(prop))
        .join(' ');
    };
    return Object.fromEntries(Object.entries(spec).map(([name, item]) => [name, read(item)]));
  }, spec);

const MONO = '"IBM Plex Mono", ui-monospace, Menlo, Consolas, monospace';

/** The look of the Sheets screens, as set by the approved prototype (B17): computed borders, padding, weights and the
 * space under the tab bar. A colour is compared with its design token, never with one typed here. Each check fails
 * when its CSS is taken out (verified on a broken copy of the page). */
async function checkVisualParity(pg) {
  const is = (got, want, what) => check(got === want, `look: ${what} is "${got}", not "${want}"`);
  // the seeded Sage set with a Sage-only weapon (Phantom Pendulums Eclipticum), so that Copy to Scholar has a piece to clear
  const [mine] = SET_SHEET.sets;
  const withWeapon = {
    ...SET_SHEET,
    sets: [{ ...mine, pieces: [{ slot: 'weapon', gameId: 37291, stones: [] }, ...mine.pieces.slice(1)] }],
  };
  await seedSheet(pg, withWeapon);

  // the manager: heading 18 px under the tab bar; the head cell over the names (28 px handle + 6 px gap); 8 px cell sides
  await pg.click('[data-tab=sheets]');
  await expect(pg.locator('#sh-list')).toBeVisible();
  const manager = await lookAt(pg, {
    heading: ['below', '#sh-manager h2'],
    head: ['css', '#sh-list thead th', 'padding-left', 'padding-right'],
    cell: ['css', '#sh-list tbody td:nth-of-type(2)', 'padding-top', 'padding-left', 'padding-right', 'vertical-align'],
    handle: ['css', '#sh-list .dragcell', 'margin-left'],
    lastRule: ['css', '#sh-list tbody tr:last-of-type td', 'border-bottom-width'],
  });
  is(manager.heading, 18, 'the manager heading, px under the tab bar');
  is(manager.head, '34px 8px', 'the manager head cell padding (left, right)');
  is(manager.cell, '9px 8px 8px top', 'a manager figure cell (padding top, left, right; vertical-align)');
  is(manager.handle, '-8px', 'the drag cell margin-left');
  is(manager.lastRule, '0px', 'the last manager row border-bottom');

  // a sheet's page: the breadcrumb line 10 px under the tab bar; set figures centred beside the name
  await pg.locator('#sh-list a.sname', { hasText: SET_SHEET.name }).click();
  await expect(pg.locator('#sh-sets')).toBeVisible();
  const sheet = await lookAt(pg, {
    crumb: ['below', '#sh-sheet .setline'],
    head: ['css', '#sh-sets thead th', 'padding-left'],
    cell: ['css', '#sh-sets tbody td.n', 'padding-top', 'padding-bottom', 'vertical-align'],
  });
  is(sheet.crumb, 10, "the sheet page's breadcrumb line, px under the tab bar");
  is(sheet.head, '34px', 'the set list head cell padding-left');
  is(sheet.cell, '7px 7px middle', 'a set list figure cell (padding top, bottom; vertical-align)');

  // a set page: the sticky header 8 px under the tab bar; the stats block
  await pg.locator('#sh-sets a.sname', { hasText: 'Mine' }).click();
  await expect(pg.locator('#sh-figures')).toBeVisible();
  // an empty slot behind another empty one waits (slots fill in order): dimmed by colour as in B17, at full opacity
  const waiting = await pg.evaluate(() => {
    const chip = document.querySelector('#sh-gear .mchip.empty:disabled');
    if (!chip) return null;
    const style = getComputedStyle(chip);
    const muted = getComputedStyle(document.documentElement).getPropertyValue('--muted').trim();
    const probe = Object.assign(document.createElement('i'), { style: `color:${muted}` });
    document.body.append(probe);
    const mutedRgb = getComputedStyle(probe).color;
    probe.remove();
    return { opacity: style.opacity, cursor: style.cursor, dimmer: style.color !== mutedRgb };
  });
  check(waiting !== null, 'look: the seeded set has an empty stone slot behind another empty one');
  if (waiting) {
    is(waiting.opacity, '1', 'a waiting empty stone chip: opacity');
    is(waiting.cursor, 'default', 'a waiting empty stone chip: cursor');
    check(waiting.dimmer, 'look: a waiting empty stone chip is dimmed by colour (not the --muted of a clickable empty chip)');
  }
  const total = '#sh-figures .crow:not(.hrow)';
  const stats = await lookAt(pg, {
    line: ['token', '--line'],
    surface: ['token', '--surface'],
    muted: ['token', '--muted'],
    crumb: ['below', '#sh-set .setline'],
    box: ['css', '#sh-figures', 'border-top-width', 'border-top-style', 'border-top-color', 'background-color'],
    names: ['css', '#sh-figures .hrow', 'border-top-width', 'padding-left', 'padding-right', 'height'],
    total: ['css', total, 'border-top-width', 'border-top-style', 'border-top-color', 'padding-left', 'padding-right', 'height'],
    label: ['css', `${total} .cl`, 'font-weight', 'font-size'],
    name: ['css', '#sh-figures .cn', 'font-size', 'text-transform', 'text-align', 'color'],
    figure: ['css', `${total} .cc b`, 'font-weight', 'font-size', 'font-family'],
    belowHeader: ['gap', '#sh-set .shead', '#sh-set-notes'], // the seeded set has notes: the first thing under the header
  });
  is(stats.crumb, 8, "the set page's header, px under the tab bar");
  is(stats.box, `1px solid ${stats.line} ${stats.surface}`, 'the stats block border and background');
  is(stats.names, '0px 12px 8px 24px', 'the figure-name row (border-top, padding left, right, height)');
  is(
    stats.total,
    `1px solid ${stats.line} 12px 8px 30px`,
    'the Total row: its top border is the rule under the figure names (width, style, colour), padding left, right, height',
  );
  is(stats.label, '600 13.12px', 'the Total label (weight, size)');
  is(stats.name, `12px uppercase right ${stats.muted}`, 'a figure name (size, case, alignment, colour)');
  is(stats.figure, `600 14.08px ${MONO}`, 'a Total figure (weight, size, font)');
  is(stats.belowHeader, 6, 'the gap under the sticky header, px');

  // the Fill settings dialog: the dialog frame, the part headings under the title, the close button, the open menus
  await pg.click('#sh-settings');
  await expect(pg.locator('#sh-settings-dialog')).toBeVisible();
  await pg.click('#s-exp');
  const settings = await lookAt(pg, {
    line: ['token', '--line'],
    shadow: ['token', '--dialog-shadow'],
    frame: ['css', '#sh-settings-dialog', 'border-top-color', 'box-shadow'],
    title: ['css', '#sh-cfg-title', 'font-size'],
    part: ['css', '#s-gear-h', 'font-size'],
    close: ['css', '#sh-settings-dialog .cfghead .linkbtn', 'font-size', 'align-items', 'justify-content'],
    menu: ['css', '#s-exp-menu', 'min-height'],
  });
  is(settings.frame, `${settings.line} ${settings.shadow} 0px 12px 48px 0px`, 'the dialog border colour and shadow (colour, offset, blur)');
  is(settings.title, '18.4px', 'the Fill settings title size');
  is(settings.part, '16.8px', 'a part heading (Gear to search) size');
  is(settings.close, '17.6px center center', 'the settings close button (font size, align-items, justify-content)');
  is(settings.menu, '160px', 'an open settings menu, min-height');
  await pg.keyboard.press('Escape'); // the menu may take the key; a second press closes the dialog
  if (await pg.locator('#sh-settings-dialog').isVisible()) await pg.keyboard.press('Escape');
  await expect(pg.locator('#sh-settings-dialog')).toHaveCount(0);

  // a piece menu: its footer is a surface-coloured strip at the normal line height
  await pg.click('[data-pick="2"]');
  await expect(pg.locator('.pick-menu .same-foot')).toBeVisible();
  const menu = await lookAt(pg, {
    surface: ['token', '--surface'],
    foot: ['css', '.pick-menu .same-foot', 'background-color', 'line-height'],
  });
  is(menu.foot, `${menu.surface} normal`, 'the piece menu footer (background, line-height)');
  await pg.keyboard.press('Escape');

  // pieces a Fill suggests (a Take box, a locked table) and the goal's rank chips, built by hand: the rules need the
  // classes only. The Take line keeps the label's line height (the suggested piece at 1.25); a button of the locked
  // table keeps full contrast; a rank chip is the token's tint.
  await pg.evaluate(() => {
    const cell = document.querySelector('#sh-gear tbody td.item');
    cell.insertAdjacentHTML(
      'beforeend',
      '<label class="takebox" id="v-take"><input type="checkbox"><span>Take <span class="dim" id="v-take-dim">melds</span></span></label>',
    );
    document
      .querySelector('#sh-gear')
      .insertAdjacentHTML(
        'beforebegin',
        '<div class="ghostlock" id="v-lock"><button type="button" id="v-lock-btn" disabled>x</button></div><i class="rk" id="v-rk">1</i>',
      );
  });
  const lines = await pg.evaluate(() => {
    const px = id => getComputedStyle(document.querySelector(id)).lineHeight;
    return {
      label: px('#v-take'),
      word: px('#v-take > span'),
      piece: String(Math.round(Number.parseFloat(px('#v-take-dim')) * 10) / 10) + 'px',
      size: getComputedStyle(document.querySelector('#v-take-dim')).fontSize,
    };
  });
  is(lines.word, lines.label, 'the Take line height (the word "Take" follows the label)');
  is(lines.piece, `${Math.round(Number.parseFloat(lines.size) * 1.25 * 10) / 10}px`, 'the suggested piece after Take, line height');
  const locked = await lookAt(pg, {
    tint: ['token', '--tint'],
    button: ['css', '#v-lock-btn', 'opacity'],
    chip: ['css', '#v-rk', 'background-color'],
  });
  is(locked.button, '1', 'a disabled button of the locked table, opacity');
  is(locked.chip, locked.tint, 'a rank chip background is the --tint token');
  // B17's value: the text colour at 22 % (light) or 20 % (dark)
  check(
    ['rgba(27, 42, 44, 0.22)', 'rgba(229, 238, 237, 0.2)'].includes(locked.tint),
    `look: the --tint token is "${locked.tint}", not the text colour at 22 % (light) or 20 % (dark)`,
  );
  await pg.evaluate(() => {
    for (const id of ['#v-take', '#v-lock', '#v-rk']) document.querySelector(id)?.remove();
  });

  // a question (delete a set): 520 px wide; 8 px from the question to its line, 16 px to the buttons
  await pg.click('#sh-set-delete');
  await expect(pg.locator('#sh-dialog')).toBeVisible();
  const question = await lookAt(pg, {
    box: ['css', '#sh-dialog', 'width'],
    underQuestion: ['gap', '#sh-dialog .question', '#sh-dialog .question + p'],
    toButtons: ['gap', '#sh-dialog .question + p', '#sh-dialog .dlgbtns'],
    note: ['css', '#sh-dialog .question + p', 'font-size', 'color'],
    muted: ['token', '--muted'],
  });
  is(question.box, '520px', 'a question dialog, width');
  is(question.underQuestion, 8, 'a question dialog: px from the question to the line under it');
  is(question.toButtons, 16, 'a question dialog: px from its last line to the buttons');
  is(question.note, `14.4px ${question.muted}`, 'the line under a question (size, colour)');
  await pg.click('#sh-dialog .dlgbtns button:not(.danger)');
  await expect(pg.locator('#sh-dialog')).toHaveCount(0);

  // the sheet page's Copy dialog with the clearing warning: its left rule is the cap-part colour
  await pg.click('#sh-set .setcrumb a >> nth=1');
  await expect(pg.locator('#sh-sheet')).toBeVisible();
  await pg.click('#sh-copy');
  await pg.click('#sh-dialog .jobchoice[data-job-id=SCH]');
  await expect(pg.locator('#sh-dlg-clear')).toBeVisible();
  const copy = await lookAt(pg, {
    part: ['token', '--cap-part'],
    warning: ['css', '#sh-dlg-clear', 'border-left-color', 'border-left-width'],
  });
  is(copy.warning, `${copy.part} 3px`, 'the Copy dialog warning left rule (colour, width)');
  await pg.keyboard.press('Escape');
}

const step = fn => ({ name: fn.name, run: fn, shared: true });
const GROUPS = [
  { fresh: true, steps: [step(checkDefaults)] },
  { fresh: true, slow: true, steps: [step(checkFirstPaint)] },
  { steps: [step(checkPieceLab), step(checkClosedPanel), step(checkJobSwitch), step(checkJobStrip), step(checkPldOffhand)] },
  { steps: [step(checkBrowserPages)] },
  { steps: [step(checkTabPanels)] },
  { steps: [step(checkSheets)] },
  { steps: [step(checkSheetForms)] },
  { steps: [step(checkSheetEdges)] },
  { steps: [step(checkOvermeldOdds)] },
  { steps: [step(checkPickMenu), step(checkMenuClicks), step(checkBreakpoints), step(checkFillMenus)] },
  { steps: [step(checkSheetCap)] },
  { fresh: true, steps: [step(checkTwoTabs)] },
  { slow: true, steps: [step(checkThemes)] },
  { slow: true, steps: [step(checkViewports)] },
  { slow: true, steps: [step(checkSetPage), step(checkTabGuard)] },
  { slow: true, steps: [step(checkRadii)] },
  { steps: [step(checkVisualParity)] },
  { slow: true, steps: [step(checkFillRealGear)] },
  { slow: true, steps: [step(checkFillGoal)] },
  { slow: true, steps: [step(checkFillFood), step(checkFillBestMeal)] },
  { slow: true, steps: [step(checkFillSearch)] },
  { slow: true, steps: [step(checkEmptySlotNote)] },
  { slow: true, steps: [step(checkFillCancel)] },
  { slow: true, steps: [step(checkMenuSteps)] },
  { slow: true, initScript: HOLD_SOLVE, steps: [step(checkEditLock), step(checkSetPageFocus)] },
  { slow: true, steps: [step(checkRingCopies), step(checkGearFrom)] },
  { slow: true, steps: [step(checkExpansionFilter), step(checkReset)] },
  { slow: true, steps: [step(checkReloadPersists)] },
  { slow: true, steps: [step(checkCorruptedStorage)] },
  { slow: true, steps: [step(checkLevelSync), step(checkJobLevelCap)] },
  { slow: true, steps: [step(checkTiers), step(checkGcdTab)] },
  { slow: true, initScript: NO_WORKER, steps: [{ ...step(checkWorkerFallback), name: 'checkWorkerFallback (no Worker)' }] },
  { slow: true, initScript: FAILING_WORKER, steps: [{ ...step(checkWorkerFallback), name: 'checkWorkerFallback (worker fails)' }] },
  { steps: ['SGE', 'WAR', 'PLD'].map(walk) },
  { steps: ['BLM', 'NIN', 'DRG'].map(walk) },
  { steps: ['BST', 'BLU'].map(walk) },
];

/** One group on a new page. Returns what it found: the page and console errors and the failed checks, in order. */
async function runGroup(browser, group) {
  const rec = { name: group.steps.map(s => s.name).join(', '), errors: [], failures: [], known: new Map(), steps: [] };
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 900 } });
  if (group.initScript) await ctx.addInitScript(group.initScript);
  try {
    await stepRecord.run(rec, async () => {
      const pg = await ctx.newPage();
      pg.setDefaultTimeout(TIMEOUT);
      pg.on('pageerror', e => rec.errors.push(`page error: ${e.message ?? e}`));
      // ERR_* console errors are network failures (Google Fonts offline), not page bugs
      pg.on('console', m => {
        if (m.type() === 'error' && !m.text().includes('ERR_')) rec.errors.push(`console error: ${m.text()}`);
      });
      const fail = async (name, e) => {
        rec.failures.push(`${name}: ${String(e.message ?? e).split('\n')[0]}`);
        await pg.screenshot({ path: shot(`fail-${name.replaceAll(' ', '-')}.png`), fullPage: true }).catch(() => {});
      };
      try {
        await pg.goto(PAGE);
        await waitReady(pg);
        if (!group.fresh) await setUpShared(pg);
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

async function main() {
  if (!existsSync(PAGE_PATH)) {
    console.log(`${PAGE_PATH} not found; run \`npm run build\` first`);
    return 1;
  }
  mkdirSync(OUT, { recursive: true });
  // screenshots of failures from earlier runs would make a passing run look failed
  for (const file of readdirSync(OUT)) if (/^fail-.*\.png$/.test(file)) rmSync(resolve(OUT, file));
  writeFileSync(resolve(OUT, 'blank.html'), '<!doctype html><title>blank</title>', 'utf-8'); // for checkCorruptedStorage

  // SMOKE_ONLY: a pattern on step names; only the groups with a matching step run (for working on one step)
  const only = process.env.SMOKE_ONLY && new RegExp(process.env.SMOKE_ONLY);
  const groups = only ? GROUPS.filter(g => g.steps.some(st => only.test(st.name))) : GROUPS;
  const t0 = Date.now();
  startCore();
  const browser = await chromium.launch();
  const records = [];
  try {
    // a pool of workers takes the steps in order; the output below is in step order whichever finishes first
    const queue = groups.map((_, i) => i).sort((a, b) => Number(!!groups[b].slow) - Number(!!groups[a].slow)); // slow ones first
    const worker = async () => {
      for (let i = queue.shift(); i !== undefined; i = queue.shift()) records[i] = await runGroup(browser, groups[i]);
    };
    await Promise.all(Array.from({ length: Math.min(WORKERS, groups.length) }, worker));
  } finally {
    await browser.close();
    await coreWorker.terminate();
  }

  if (process.env.SMOKE_TRACE) {
    for (const r of records) for (const [name, ms] of r.steps) console.error(`${String(ms).padStart(6)} ms  ${name}`);
    console.error(`${String(Date.now() - t0).padStart(6)} ms  total`);
  }
  // known failures (KNOWN_LOW_CONTRAST, KNOWN_MENU_OVERFLOW): printed by name, never hidden, and they do not fail the run
  for (const r of records) for (const line of r.known.values()) console.log(line);
  const problems = records.flatMap(r => [...r.errors, ...r.failures]);
  console.log(problems.join('\n') || 'no errors');
  return problems.length ? 1 : 0;
}

process.exitCode = await main();
