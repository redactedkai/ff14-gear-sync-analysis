/* Browser smoke test (Playwright) for dist/index.html, loaded from file://.

Fails (exit 1) on JS errors, console errors, wrong numbers in the page, stray undefined/NaN/null text,
or horizontal page scroll at 960 px (NARROW). Prints 'no errors' on success.

Expected values come from outside the code under test where possible:
  - sync caps at item level 123 (head/hands/feet 29, body/legs 47, accessories 23, 2H weapon 48;
    main stat 30/48/24/50) and the FFXIV Wiki's item level 475 caps;
  - the optimizer over every piece a healer and a tank can wear: the page's best Spell/Skill Speed, synced to 123 and
    unsynced, equals what src/core computes for the same gear in Node (the core is checked against a brute force over
    every loadout in tests/unit), and so do the totals with crafted gear left out and with materia off;
  - a 130 head piece (Spell Speed / Piety) reproducing the ranked stats of a real item level 130 healer head piece
    (Mind 33, Vitality 32, substats 31/22; its fixed Direct Hit 6 is not a rank; tests/unit/views.test.js finds it in
    the item database);
  - level sync (synced level 90, item level sync off): level 100 healer head pieces capped at the item level 660
    head values (Mind 248; tests/unit/level-sync.test.js derives them from the ItemLevel row), in the gear browser and
    in Piece stats (item level 660: ParamGrow.ItemLevelSync for level 90).

The steps run in groups, in parallel: each group gets a fresh browser context (so its own saved state) and page, set to
Sage, sync to 123, level 50, and runs its steps one after the other (see GROUPS). The numbers from src/core are
computed in a worker thread (smoke-core.mjs), so the pages are never kept waiting. Failures are printed in step order.

Setup once: npm install && npx playwright install chromium
Run: npm run build && npm run smoke
Environment: SMOKE_PAGE (page to test, default dist/index.html), SMOKE_OUT (screenshots, default tests/e2e/out),
SMOKE_WORKERS (groups at once, default half the cores up to 6), SMOKE_TRACE=1 (time of each step on stderr).
*/

import assert from 'node:assert';
import { AsyncLocalStorage } from 'node:async_hooks';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { Worker } from 'node:worker_threads';
import { DEFAULT_EXCLUDE } from './smoke-core.mjs';

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

/** Alpine has rendered: the job picker has its buttons and the settings panel names the job (or "none chosen"). */
async function waitReady(pg) {
  await expect(pg.locator('[data-job-id]').first()).toBeAttached();
  await expect(pg.locator('#job-name')).not.toHaveText('');
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
  await pg.click(`[data-job-id="${job}"]`);
  await expect(pg.locator('[data-job]')).toHaveAttribute('data-job', job);
}

async function showTab(pg, tab) {
  await pg.click(`[data-tab=${tab}]`);
  await expect(pg.locator(`#tab-${tab}`)).toBeVisible();
}

async function showMath(pg, sub) {
  await showTab(pg, 'math');
  await pg.click(`[data-sub=${sub}]`);
  await expect(pg.locator(`#tab-${sub}`)).toBeVisible();
}

/** The optimizer output is debounced and only renders on its tab: wait until a result panel is shown. */
async function waitOptimizer(pg) {
  await showTab(pg, 'opt');
  await expect(pg.locator('#o-out .panel')).toBeVisible();
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
  await pg.fill(sel, value);
  await pg.locator(sel).dispatchEvent('change');
}

/** Turn item level sync on (the cap field is disabled while it is off) and set the cap. */
async function setCap(pg, value) {
  if (!(await pg.locator('#sync').isChecked())) await pg.locator('#sync').check();
  await setNumber(pg, '#cap', value);
}

/** Wait until the (debounced) saved state satisfies a JS predicate over it, s => ... */
async function waitSaved(pg, jsCondition) {
  await pg.waitForFunction(
    `(k => { let s; try { s = JSON.parse(localStorage.getItem(k)); } catch { return false; }
      return !!s && (${jsCondition})(s); })(${JSON.stringify(STORE_KEY)})`,
  );
}

async function checkNoBadText(pg, where) {
  const txt = await pg.innerText('body');
  for (const bad of BAD_WORDS) check(!txt.includes(bad), `"${bad}" visible in ${where}`);
}

// ---------- checks ----------

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
const coreRings = (...a) => core('coreRings', ...a);

const optTotal = pg => pg.locator('#o-out .readout > div').first().locator('b');

async function expectTotal(pg, want, what) {
  try {
    await expect(optTotal(pg)).toHaveText(String(want));
  } catch (e) {
    if (!(e instanceof assert.AssertionError)) throw e;
    check(false, `${what}: optimizer total '${await optTotal(pg).innerText()}', expected ${want}`);
  }
}

const countText = (searched, total) => `· searching ${searched.toLocaleString('en-US')} of ${total.toLocaleString('en-US')} pieces`;

// Optimizer checks: [job, target], at the shared setup (level 50, cap 123), synced and with item level sync off.
const OPT_CASES = [
  ['SGE', 'spd'],
  ['WAR', 'spd'],
];

/** For a healer and a tank, with no gear chosen by hand: the page searches every piece the job can wear (minus the
 * default "Gear from" boxes), says how many, and its best speed stat, synced to 123 and with item level sync off (level
 * sync to 50 still applies), equals the core's optimizer over the same gear. The optimizer itself is checked against a
 * brute force over every loadout in tests/unit. One step per case. */
const checkRealGearOptimizer =
  ([job, target]) =>
  async pg => {
    await setJob(pg, job);
    await waitOptimizer(pg);
    await pg.selectOption('#o-target', target);
    const speed = (await pg.locator(`#o-target option[value="${target}"]`).innerText()).trim();
    await expect(pg.locator('#o-result')).toHaveAttribute('data-target', target);
    for (const synced of [true, false]) {
      const want = await coreGear(job, { cap: 123, sync: synced, level: 50 }, target);
      await pg.locator('#sync').setChecked(synced);
      await expect(pg.locator('#o-count')).toHaveText(countText(want.searched, want.all));
      await expectTotal(pg, want.on, `${job} ${synced ? 'synced' : 'unsynced'} ${speed}`);
      check((await pg.locator('#o-out .readout').innerText()).includes(speed), `${job}: optimizer result does not name ${speed}`);
      if (synced) await pg.screenshot({ path: shot(`optimizer-${job}.png`), fullPage: true });
    }
  };

/** Typing a number commits once, after a pause: typing a cap of 123 key by key runs the optimizer once (for 123),
 * not for 1 and 12 on the way; the result says how long the solve took. */
async function checkTypingDebounce(pg) {
  await setJob(pg, 'SGE');
  await waitOptimizer(pg);
  await setCap(pg, '130'); // a cap level 50 allows (135 at most), not the 123 the typing below ends on
  await expect(pg.locator('#o-time')).toHaveText(/^Solved in \d+ ms\.$/);
  await pg.waitForTimeout(600); // longer than the typing and optimizer waits: nothing pending
  const runs = () => pg.evaluate("performance.getEntriesByName('optimizer').length");
  const before = await runs();
  // Typing replaces the selected 130, as a user would: three input events, 60 ms apart (faster than the 300 ms typing
  // wait). The keys are sent from inside the page, so a busy machine cannot stretch the pauses between them.
  await pg.evaluate(async () => {
    const cap = document.querySelector('#cap');
    cap.focus();
    cap.select();
    for (const text of ['1', '12', '123']) {
      cap.value = text;
      cap.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(r => setTimeout(r, 60));
    }
  });
  await waitSaved(pg, 's => s.cap === 123');
  await pg.waitForTimeout(600);
  const n = (await runs()) - before;
  check(n === 1, `typing a cap of 123 ran the optimizer ${n} times, expected once`);
  await expect(pg.locator('#o-time')).toHaveText(/^Solved in \d+ ms\.$/);
}

/** Switching job takes effect at once (nothing is lost but the job-specific choices, so the page does not ask) and
 * puts the optimizer target back to the main stat. */
async function checkJobSwitch(pg) {
  await setJob(pg, 'WAR');
  await waitOptimizer(pg);
  await pg.selectOption('#o-target', 'crit');
  await expect(pg.locator('#o-result')).toHaveAttribute('data-target', 'crit');
  await pg.click('[data-job-id="GNB"]'); // same role as WAR
  await expect(pg.locator('[data-job]')).toHaveAttribute('data-job', 'GNB');
  const t = await pg.inputValue('#o-target');
  check(t === 'main', `after a job switch the target is '${t}'`);
  await expect(pg.locator('#o-result')).toHaveAttribute('data-target', 'main');
}

// Gear browser rings window: [job, item level from, item level to, equip level up to].
const RINGS_WINDOW = ['SGE', 140, 150, 60];

/** Set the gear browser's filters to an item level window (name filter cleared). */
async function fillBrowser(pg, lo, hi, lvl, slot = 'any') {
  await showTab(pg, 'browse');
  await pg.fill('#b-q', '');
  await pg.selectOption('#b-type', slot);
  await allExpansions(pg);
  await pg.fill('#b-min', String(lo));
  await pg.fill('#b-max', String(hi));
  await pg.fill('#b-lvl', String(lvl));
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
  await expect(pg.locator('#b-count')).toHaveText(`· ${want.count} matches`);
  await expect(browserRows(pg)).toHaveCount(want.count);
  await expect(pg.locator('#gear-table .x2:visible')).toHaveCount(want.x2);
}

/** The ticked "Gear from" boxes of the optimizer (pre 'o') or the browser ('b'), in ACTIVITIES order, read from the DOM
 * (the menu may be closed). */
async function ticked(pg, pre) {
  return pg.locator(`#${pre}-from-menu input[data-activity]`).evaluateAll(bs => bs.filter(b => b.checked).map(b => b.dataset.activity));
}

/** Open the "Gear from" menu of `pre` if it is closed. */
async function openFrom(pg, pre) {
  if ((await pg.getAttribute(`#${pre}-from`, 'aria-expanded')) !== 'true') await pg.click(`#${pre}-from`);
  await expect(pg.locator(`#${pre}-from-menu`)).toBeVisible();
}

/** Tick or untick one "Gear from" box (or the market board switch, key 'market'), then close the menu. */
async function setFrom(pg, pre, key, on) {
  await openFrom(pg, pre);
  const box = key === 'market' ? pg.locator(`#${pre}-market`) : pg.locator(`#${pre}-from-menu input[data-activity="${key}"]`);
  await (on ? box.check() : box.uncheck());
  await pg.keyboard.press('Escape');
}

// A setting where crafted gear and materia both change the best Critical Hit (Sage, level 100, no sync).
const GROUPS_CASE = ['SGE', { cap: null, sync: false, level: 100 }, 'crit'];

/** Gear to search, "Gear from": the default boxes ticked, the button reads "11 of 20", the menu has two columns and a
 * line describing the box under the pointer, and fits the window. With the market board switch off (the button says
 * so), unticking Crafted changes the total to what the core computes without it, and the count in the heading with it;
 * the choice is saved. The browser has its own boxes: the optimizer's choice does not change them. */
async function checkGearFrom(pg) {
  const [job, sync, target] = GROUPS_CASE;
  const noMarket = await coreGear(job, sync, target, ['crafted'], DEFAULT_EXCLUDE, false);
  if (!check(noMarket.without < noMarket.on, `${job}: leaving crafted gear out does not lower the total; pick another case`)) return;
  const want = await coreGear(job, sync, target);
  await setJob(pg, job);
  await pg.locator('#sync').uncheck();
  await setNumber(pg, '#level', String(sync.level));
  await waitOptimizer(pg);
  await pg.selectOption('#o-target', target);
  const searchedDefault = ACTIVITY_KEYS.filter(k => !DEFAULT_EXCLUDE.includes(k));
  const t0 = await ticked(pg, 'o');
  check(same(t0, searchedDefault), `searched by default: ${JSON.stringify(t0)}, expected ${JSON.stringify(searchedDefault)}`);
  await expect(pg.locator('#o-from')).toHaveText(`${searchedDefault.length} of ${ACTIVITY_KEYS.length}`);
  await expectTotal(pg, want.on, `${job} ${target}, default boxes`);
  await expect(pg.locator('#o-count')).toHaveText(countText(want.searched, want.all));

  // the menu: two columns, the description line follows the pointer, inside the window
  await openFrom(pg, 'o');
  const cols = await pg.locator('#o-from-menu .from-cols > div').count();
  check(cols === 2, `the Gear from menu has ${cols} columns, expected 2`);
  await pg.hover('#o-from-menu [data-activity="hunts"]');
  await expect(pg.locator('#o-from-desc')).toContainText('Hunts: Allied Seals, Centurio Seals, Sacks of Nuts.');
  const inside = await pg.locator('#o-from-menu').evaluate(m => m.getBoundingClientRect().right <= document.documentElement.clientWidth);
  check(inside, 'the Gear from menu runs past the right edge of the window');
  await pg.keyboard.press('Escape');

  // the market board switch off, then Crafted left out
  await setFrom(pg, 'o', 'market', false);
  await expect(pg.locator('#o-from')).toHaveText(`${searchedDefault.length} of ${ACTIVITY_KEYS.length} \u00b7 no market board`);
  await expectTotal(pg, noMarket.on, `${job} ${target}, no market board`);
  await setFrom(pg, 'o', 'crafted', false);
  await expectTotal(pg, noMarket.without, `${job} ${target}, no market board, crafted left out`);
  const nCrafted = noMarket.searched - (await coreGear(job, sync, target, [], ['crafted', ...DEFAULT_EXCLUDE], false)).searched;
  await expect(pg.locator('#o-count')).toHaveText(countText(noMarket.searched - nCrafted, noMarket.all));
  const savedOff = ACTIVITY_KEYS.filter(k => k === 'crafted' || DEFAULT_EXCLUDE.includes(k)).join(',');
  await waitSaved(pg, `s => s.opt.market === false && s.opt.exclude.join() === ${JSON.stringify(savedOff)}`);
  await showTab(pg, 'browse');
  const tb = await ticked(pg, 'b');
  check(same(tb, searchedDefault), `the browser boxes followed the optimizer: ${JSON.stringify(tb)}`);
  await expect(pg.locator('#b-from')).toHaveText(`${searchedDefault.length} of ${ACTIVITY_KEYS.length}`);
  await waitOptimizer(pg);
  await setFrom(pg, 'o', 'crafted', true);
  await setFrom(pg, 'o', 'market', true);
  await expectTotal(pg, want.on, `${job} ${target}, back to the defaults`);
  await pg.locator('#sync').check();
  await setNumber(pg, '#level', '50');
}

// Sage, level 100, no sync, Critical Hit, searching Endwalker and Dawntrail gear of item level 700 or less only.
const OPT_FILTER = { expOff: ['ARR', 'HW', 'SB', 'ShB'], ilvlMax: 700 };

/** The optimizer's own Expansion, item level and equip level filters: the total and the count in the heading equal
 * the core's over the gear the browser's filters would keep; the browser's filters do not move; the choice is saved;
 * a filter nothing passes says so. */
async function checkOptFilters(pg) {
  const [job, sync, target] = GROUPS_CASE;
  const want = await coreFiltered(job, sync, target, OPT_FILTER);
  const full = await coreGear(job, sync, target);
  if (!check(want.on < full.on, `${job}: the filters do not lower the total; pick another case`)) return;
  await setJob(pg, job);
  await pg.locator('#sync').uncheck();
  await setNumber(pg, '#level', String(sync.level));
  await fillBrowser(pg, '', '', 100);
  await waitSaved(pg, "s => s.browse.min === '' && s.browse.max === '' && String(s.browse.lvl) === '100'");
  const browseCount = await pg.locator('#b-count').innerText();
  await waitOptimizer(pg);
  await pg.selectOption('#o-target', target);
  await pg.click('#o-exp');
  for (const b of await pg.locator('#o-exp-menu input').all()) {
    if (OPT_FILTER.expOff.includes(await b.getAttribute('data-exp'))) await b.uncheck();
  }
  await pg.keyboard.press('Escape');
  await expect(pg.locator('#o-exp')).toHaveText('2 expansions');
  await setNumber(pg, '#o-max', String(OPT_FILTER.ilvlMax));
  await expectTotal(pg, want.on, `${job} ${target}, optimizer filters`);
  await expect(pg.locator('#o-count')).toHaveText(countText(want.searched, want.all));
  // number inputs bound with x-model save strings
  await waitSaved(pg, `s => s.opt.expOff.join() === 'ARR,HW,SB,ShB' && String(s.opt.max) === '${OPT_FILTER.ilvlMax}'`);
  await setNumber(pg, '#o-min', '9999');
  await expect(pg.locator('#o-excluded')).toBeVisible();
  await showTab(pg, 'browse');
  await expect(pg.locator('#b-exp')).toHaveText('All expansions');
  await expect(pg.locator('#b-count')).toHaveText(browseCount);
  // back to no limits
  await showTab(pg, 'opt');
  await setNumber(pg, '#o-min', '');
  await setNumber(pg, '#o-max', '');
  await pg.click('#o-exp');
  for (const b of await pg.locator('#o-exp-menu input').all()) await b.check();
  await pg.keyboard.press('Escape');
  await expectTotal(pg, full.on, `${job} ${target}, filters cleared`);
  await pg.locator('#sync').check();
  await setNumber(pg, '#level', '50');
}

/** Melds are on by default: the total equals the core's with melds, and each melded pick names its stones; the
 * switch off gives the core's total without melds and no meld lines. The choice is saved. */
async function checkMelds(pg) {
  const [job, sync, target] = GROUPS_CASE;
  const want = await coreGear(job, sync, target);
  if (!check(want.on > want.off, `${job}: melds do not raise ${target}; pick another case`)) return;
  await setJob(pg, job);
  await pg.locator('#sync').uncheck();
  await setNumber(pg, '#level', String(sync.level));
  await waitOptimizer(pg);
  await pg.selectOption('#o-target', target);
  const melds = pg.locator('#o-melds');
  check(await melds.isChecked(), 'melds are on by default');
  check(!(await pg.locator('#o-food').isChecked()), 'Food is on by default');
  await expectTotal(pg, want.on, 'melds on');
  await expect(pg.locator('#o-result .meld').first()).toBeVisible();
  // every pick has its target at its cap here (melded up to it), so each target cell is marked
  const rows = await pg.locator('#o-result tbody tr:not(.total):not(.tier)').count();
  await expect(pg.locator('#o-result td.gold .atcap')).toHaveCount(rows);
  await expect(pg.locator('#o-effect')).toContainText('%'); // the tier rows: Critical Hit rate
  await checkNoBadText(pg, 'melds/on');
  await melds.uncheck();
  await expectTotal(pg, want.off, 'melds off');
  await expect(pg.locator('#o-result .meld')).toHaveCount(0);
  await waitSaved(pg, 's => s.opt.melds === false');
  await melds.check();
  await expectTotal(pg, want.on, 'melds back on');
  // leave the target on the main stat: the result is only recomputed while this tab is open, and a later check that
  // waits for a Critical Hit result would otherwise read this one
  await pg.selectOption('#o-target', 'main');
  await expect(pg.locator('#o-result')).toHaveAttribute('data-target', 'main');
  await pg.locator('#sync').check();
  await setNumber(pg, '#level', '50');
}

/** The numbers of the result table's row `rowSel` under the stat column headed `header` (SpS, DET, ...). */
async function columnValues(pg, rowSel, header) {
  const heads = (await pg.locator('#o-result thead th').allInnerTexts()).map(h => h.trim().toUpperCase()); // shown in capitals
  const cell = await pg.locator(`${rowSel} td`).nth(heads.indexOf(header.toUpperCase())).innerText();
  return Number.parseInt(cell.split(/\s+/)[0].replace(/^\+/, '') || '0', 10);
}

/** Food off by default; switched on it picks the best meal for the goal: the gear rows stay, the With food row is
 * gear plus the Food row, the GCD line names the food, the choice is saved. A chosen meal without speed leaves speed
 * alone. */
async function checkFood(pg) {
  await setJob(pg, 'SGE');
  await pg.locator('#sync').check();
  await setCap(pg, '123');
  await setNumber(pg, '#level', '50');
  await waitOptimizer(pg);
  await pg.selectOption('#o-target', 'spd');
  await expect(pg.locator('#o-result')).toHaveAttribute('data-target', 'spd');
  const food = pg.locator('#o-food');
  check(!(await food.isChecked()), 'Food is on by default');
  await expect(pg.locator('#o-food-row')).toHaveCount(0);
  const gearCells = () => pg.locator('#o-result tbody tr:not(.total, .food, .tier) td:nth-child(2) > span').allInnerTexts();
  const gearItems = await gearCells();
  await food.check();
  await expect(pg.locator('#o-food-row')).toBeVisible();
  await expect(pg.locator('#o-meal-note')).toHaveText('HQ, best for goal');
  check(same((await gearCells()).slice(0, gearItems.length), gearItems), 'Food changed the gear');
  const gearSpd = await columnValues(pg, '#o-result tr.total:not(#o-food-total)', 'SpS');
  const bonus = await columnValues(pg, '#o-food-row', 'SpS');
  const withFood = await columnValues(pg, '#o-food-total', 'SpS');
  check(bonus > 0 && withFood === gearSpd + bonus, `Spell Speed with food ${withFood} is not ${gearSpd} + ${bonus}`);
  // the Total row is the character panel's number: level 50 base speed 341 (AkhMorning) plus gear
  const base = 341;
  await expect(pg.locator('#o-result .readout')).toContainText(
    `${withFood} Spell Speed (${base} base, ${gearSpd - base} gear, ${bonus} food)`,
  );
  await expect(pg.locator('#o-total-note')).toHaveText('Clan bonuses can affect MND and VIT.');
  await expect(pg.locator('#o-effect')).toContainText('gear and food');
  await waitSaved(pg, 's => s.opt.food === true');
  // the Food row's menu: the search box takes the keys; "Best for goal" lists the meals with the best's result, off
  // every meal; two stat pills narrow it to a pair and grey out the rest; the search matches meal names
  await pg.click('#o-meal-btn');
  // the box takes focus a frame after the menu shows
  const focused = await pg
    .waitForFunction(() => document.activeElement?.id === 'o-meal-q', null, { timeout: 2000 })
    .then(() => true)
    .catch(() => false);
  check(focused, 'the Food menu opened without focus in its search box');
  const meals = pg.locator('#o-meal-menu [data-meal]');
  const bestCount = await meals.count();
  await pg.locator('#o-meal-best').uncheck();
  const allCount = await meals.count();
  check(bestCount >= 1 && allCount > bestCount, `Best for goal lists ${bestCount} of ${allCount} meals`);
  await pg.click('#o-meal-menu [data-stat="det"]');
  await pg.click('#o-meal-menu [data-stat="crit"]');
  check(await pg.locator('#o-meal-menu [data-stat="dh"]').isDisabled(), 'a third stat pill is not greyed out');
  const pairCount = await meals.count();
  check(pairCount >= 1 && pairCount < allCount, `the DET and CRT pills list ${pairCount} of ${allCount} meals`);
  const name = await meals.first().getAttribute('data-meal');
  await pg.fill('#o-meal-q', name.split(' ')[0].toLowerCase());
  check((await meals.count()) >= 1, `searching "${name.split(' ')[0]}" finds no meal`);
  // a meal picked from the menu: shown and marked picked, no speed from a Determination + Critical Hit meal
  await meals.first().click();
  await expect(pg.locator('#o-meal-btn')).toContainText(name);
  await expect(pg.locator('#o-meal-note')).toHaveText('HQ, picked');
  check((await columnValues(pg, '#o-food-total', 'SpS')) === gearSpd, 'a meal without speed changed Spell Speed');
  check((await columnValues(pg, '#o-food-row', 'DET')) > 0, 'the Determination meal adds no Determination');
  await checkNoBadText(pg, 'food');
  // a new setting clears the pick, as it clears the rows' picks
  await pg.selectOption('#o-target', 'main');
  await expect(pg.locator('#o-result')).toHaveAttribute('data-target', 'main');
  await expect(pg.locator('#o-meal-note')).toHaveText('HQ, best for goal');
}

/** Rank by tier: on by default; the readout names the goal and tiebreaks in order and the Tier row marks them; off, both
 * go and the choice is saved. */
async function checkRankByTier(pg) {
  await setJob(pg, 'SGE');
  await waitOptimizer(pg);
  const byTier = pg.locator('#o-by-tier');
  check(await byTier.isChecked(), 'Rank by tier is off by default');
  await pg.selectOption('#o-target', 'crit');
  await pg.selectOption('#o-tb1', 'det');
  await expect(pg.locator('#o-result')).toHaveAttribute('data-target', 'crit');
  await expect(pg.locator('#o-held')).toHaveText(/^Ranked by tier: Critical Hit [\d.]+%, then Determination \+[\d.]+%/);
  await expect(pg.locator('#o-tier td.held')).toHaveCount(2);
  await byTier.uncheck();
  await expect(pg.locator('#o-held')).toHaveCount(0);
  await expect(pg.locator('#o-tier td.held')).toHaveCount(0);
  await waitSaved(pg, 's => s.opt.byTier === false');
  await byTier.check();
  await expect(pg.locator('#o-held')).toBeVisible();
  await waitSaved(pg, 's => s.opt.byTier === true');
  await checkNoBadText(pg, 'rank by tier');
  await pg.selectOption('#o-tb1', '');
  await pg.selectOption('#o-target', 'main');
  await expect(pg.locator('#o-result')).toHaveAttribute('data-target', 'main');
}

/** Target GCD (and, at level 100, the note on relics left out): the box is empty (any GCD) with no line; a GCD one step from the free result is met exactly, the
 * result's GCD is the one typed and the line gives the speed on the character panel; "or faster" and the GCD are
 * saved; the goal speed disables the box; a hasted job names its haste, a job switch clears the box, and a GCD the job
 * cannot have says why. Runs in its own group: it leaves Ninja at level 100 with sync off. */
async function checkTargetGcd(pg) {
  await setJob(pg, 'SGE');
  await pg.locator('#sync').uncheck();
  await setNumber(pg, '#level', '100');
  await waitOptimizer(pg);
  await pg.selectOption('#o-target', 'crit');
  await expect(pg.locator('#o-result')).toHaveAttribute('data-target', 'crit');
  // level 100 relics whose substats the player allocates (Phantom Pendulums Occultum) are left out, with a note
  await expect(pg.locator('#o-relic-note')).toHaveText('Relic weapons with customizable substats are left out.');
  const box = pg.locator('#o-gcd');
  check((await box.inputValue()) === '' && (await box.isEnabled()), 'the Target GCD box is not empty and enabled by default');
  await expect(pg.locator('#o-gcd-line')).toHaveCount(0);
  const gcdCard = pg.locator('#o-out .readout > div').nth(1).locator('b');
  const free = Number.parseFloat(await gcdCard.innerText());
  const asked = Math.round((free >= 2.5 ? free - 0.01 : free + 0.01) * 100) / 100;
  await setNumber(pg, '#o-gcd', asked.toFixed(2));
  await expect(pg.locator('#o-gcd-line')).toHaveText(/^Spell Speed \d+ to \d+ \(character panel\)$/);
  await expect(gcdCard).toHaveText(`${asked.toFixed(2)}s`);
  await pg.locator('#o-gcd-mode label', { hasText: 'or faster' }).click();
  await expect(pg.locator('#o-gcd-line')).toBeVisible();
  await waitSaved(pg, `s => s.opt.gcd == ${asked} && s.opt.gcdMode === 'min'`);
  await checkNoBadText(pg, 'target gcd');
  await pg.selectOption('#o-target', 'spd');
  await expect(box).toBeDisabled();
  await expect(pg.locator('#o-gcd-line')).toHaveCount(0);
  await expect(pg.locator('#o-gcd-hint')).toHaveText('off: the goal is speed');
  await setJob(pg, 'NIN');
  await waitOptimizer(pg);
  check((await box.inputValue()) === '', 'a job switch kept the Target GCD');
  await expect(pg.locator('#o-gcd-row')).toContainText('Target GCD (Increase Attack Speed 15%)');
  await pg.selectOption('#o-target', 'crit');
  await pg.locator('#o-gcd-mode label', { hasText: 'exactly' }).click();
  await setNumber(pg, '#o-gcd', '2.40');
  await expect(pg.locator('#o-gcd-line')).toContainText("Ninja's GCD is 2.12 at most (Increase Attack Speed 15%)");
  await expect(pg.locator('#o-nogcd')).toBeVisible();
  await checkNoBadText(pg, 'target gcd/none');
  await setNumber(pg, '#o-gcd', '');
  await expect(pg.locator('#o-result')).toBeVisible();
  await pg.screenshot({ path: shot('target-gcd.png'), fullPage: true });
}

/** Build a non-default state (job, cap, sync off, level, optimizer target, tiebreaks and Gear from boxes, browser
 * filters, Gear from boxes and market board switch, Piece stats slot and item level, Gear optimizer tab open), reload, and every part comes
 * back: the inputs, the open tab and the same optimizer total. Nothing like a gear pool is saved. */
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
  await waitOptimizer(pg);
  await setFrom(pg, 'o', 'relics', false);
  await pg.selectOption('#o-tb1', 'det');
  await pg.selectOption('#o-tb2', 'vit');
  await pg.selectOption('#o-target', 'crit'); // last, so the result below includes every change
  // the result is debounced: wait until it is for the new target before reading the total
  await expect(pg.locator('#o-result')).toHaveAttribute('data-target', 'crit');
  const total = optTotal(pg);
  const before = await total.innerText();

  const inputs = {
    '#job': job,
    '#cap': '130',
    '#level': '60',
    '#b-type': 'any',
    '#b-min': String(lo),
    '#b-max': String(hi),
    '#b-lvl': String(lvl),
    '#p-slot': 'body',
    '#p-ilvl': '300',
    '#o-target': 'crit',
    '#o-tb1': 'det',
    '#o-tb2': 'vit',
  };
  const groups = { o: await ticked(pg, 'o'), b: await ticked(pg, 'b') };
  check(!groups.o.includes('relics') && groups.o.includes('tomes_legacy'), `optimizer boxes before reload: ${JSON.stringify(groups.o)}`);
  check(!groups.b.includes('tomes_legacy') && groups.b.includes('relics'), `browser boxes before reload: ${JSON.stringify(groups.b)}`);
  for (const [sel, v] of Object.entries(inputs)) {
    const got = await fieldValue(pg, sel);
    check(got === v, `reload setup: ${sel} is '${got}' before reload, expected '${v}'`);
  }
  // wait for the debounced save of the last change, rather than sleeping
  await waitSaved(
    pg,
    `s => s.job === '${job}' && s.cap === 130 && s.level === 60 && s.sync === false && s.tab === 'opt'
    && s.opt.target === 'crit' && s.opt.tb === 'det' && s.opt.tb2 === 'vit' && s.piece.slot === 'body'
    && s.piece.ilvl === 300 && s.opt.exclude.includes('relics') && s.browse.exclude.includes('tomes_legacy')
    && s.browse.market === false && s.opt.market === true && !('pool' in s)`,
  );

  await pg.reload();
  await waitReady(pg);
  const selected = (await pg.getAttribute('[data-tab=opt]', 'aria-selected')) === 'true';
  check(selected && (await pg.locator('#tab-opt').isVisible()), 'after reload the Gear optimizer tab is not the open tab');
  for (const [sel, v] of Object.entries(inputs)) {
    const got = await fieldValue(pg, sel);
    check(got === v, `after reload ${sel} is '${got}', expected '${v}'`);
  }
  for (const [pre, want] of Object.entries(groups)) {
    const got = await ticked(pg, pre);
    check(same(got, want), `after reload the ${pre}-from boxes are ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`);
  }
  check(!(await pg.locator('#b-market').isChecked()), 'after reload the browser market board switch is on, expected off');
  check(!(await pg.locator('#sync').isChecked()), 'after reload sync is on, expected off');
  await waitOptimizer(pg);
  try {
    await expect(total).toHaveText(before);
  } catch (e) {
    if (!(e instanceof assert.AssertionError)) throw e;
    const got = (await total.count()) ? await total.innerText() : 'no result';
    check(false, `after reload the optimizer total is '${got}', expected '${before}' as before reload`);
  }
  await setFrom(pg, 'o', 'relics', true);
  await showTab(pg, 'browse');
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
    if (wantJob) Object.assign(defaults, { '#b-min': '', '#b-lvl': '100', '#o-target': 'main', '#o-tb1': '', '#o-tb2': '' });
    const errors = stepRecord.getStore().errors;
    const nErrors = errors.length;
    await pg.goto(pathToFileURL(blank).href);
    await pg.evaluate(([k, v]) => localStorage.setItem(k, v), [STORE_KEY, raw]);
    await pg.goto(PAGE);
    await waitReady(pg);
    if (wantJob) {
      await expect(pg.locator('#tab-browse')).toBeVisible(); // the old Gear pool tab opens as the Gear browser
      await expect(browserRows(pg).first()).toBeVisible();
      await showTab(pg, 'opt');
      await expect(pg.locator('#o-result')).toBeVisible();
    } else {
      await expect(pg.locator('#no-job')).toBeVisible();
    }
    for (const [sel, v] of Object.entries(defaults)) {
      const got = await fieldValue(pg, sel);
      check(got === v, `stored ${what}: ${sel} is '${got}', expected the default '${v}'`);
    }
    check(!(await pg.locator('#sync').isChecked()), `stored ${what}: sync is on, expected the default off`);
    await checkNoBadText(pg, `page loaded from stored ${what}`);
    check(errors.length === nErrors, `stored ${what}: JS errors on load: ${JSON.stringify(errors.slice(nErrors))}`);
    // the page repairs storage: the next save holds valid state, with no pool
    const jobJs = wantJob ? `'${wantJob}'` : 'null';
    await waitSaved(pg, `s => s.job === ${jobJs} && !('pool' in s) && Array.isArray(s.opt.exclude)`);
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
    same(messages, ['Reset every setting to its default?', 'Reset every setting to its default?']),
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
}

/** PLD (1H weapon + shield) offers an Off-hand slot in the browser; two-handed jobs do not. */
async function checkPldOffhand(pg) {
  await setJob(pg, 'PLD');
  await showTab(pg, 'browse');
  let opts = await pg.locator('#b-type option').allInnerTexts();
  check(opts.includes('Off-hand'), `PLD slot filter has no Off-hand: ${JSON.stringify(opts)}`);
  await pg.screenshot({ path: shot('browser.png'), fullPage: true });
  await setJob(pg, 'WAR');
  opts = await pg.locator('#b-type option').allInnerTexts();
  check(!opts.includes('Off-hand'), `WAR slot filter offers Off-hand: ${JSON.stringify(opts)}`);
}

// Level sync: level 100 healer head pieces at item level 780 or more, at synced level 90 (item level sync off), are
// capped at the item level 660 head values; Mind 248 and the head substat cap 184 come from ItemLevel row 660 x 85 per
// mille (level-sync.test.js).
const HEAD_MAIN_CAP_660 = 248;
const HEAD_SUB_CAP_660 = '184';

const hasHScroll = pg => pg.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);

/** Other pieces with the same result (roadmap A9), at the shared setup (Sage, level 50, item level 123), where every
 * row has others: at NARROW width, the weapon row's menu opens without a sideways scroll; a piece picked from it is what
 * the row shows, the result stays the same, the menu closes; any setting change clears the pick. */
async function checkSameResult(pg) {
  await pg.setViewportSize(NARROW);
  await waitOptimizer(pg);
  // a solve for changed settings closes any open menu: let the group's setup settle first
  await pg.waitForTimeout(600);
  const button = pg.locator('#o-table .same-btn').first();
  await expect(button).toBeVisible();
  const total = await optTotal(pg).innerText();
  const first = await button.locator('span').first().innerText();
  await button.click();
  const menu = pg.locator('#o-table .same-menu').first();
  await expect(menu).toBeVisible();
  check(!(await hasHScroll(pg)), 'the same-result menu scrolls the page sideways at 960 px');
  const other = menu.locator('.same-item:not(.on)').first();
  const name = await other.locator('span span').first().innerText();
  await other.click();
  await expect(menu).toBeHidden();
  await expect(button.locator('span').first()).toHaveText(name);
  await expect(optTotal(pg)).toHaveText(total);
  await checkNoBadText(pg, 'same result/picked');
  // a setting change gives a new result, and the rows start again from the easiest pieces
  // (one solve apart: settings changed and changed back within the optimizer's wait keep the pick)
  await pg.selectOption('#o-tb1', 'crit');
  await pg.waitForTimeout(600);
  await pg.selectOption('#o-tb1', '');
  await expect(button.locator('span').first()).toHaveText(first);
}

/** Synced level 90 with item level sync off, at NARROW width: the gear browser shows the level-synced value, the
 * optimizer total is marked synced, Piece stats cuts a head to the item level 660 caps; no bad text, no horizontal
 * scroll. */
async function checkLevelSync(pg) {
  await pg.setViewportSize(NARROW);
  await setJob(pg, 'SGE');
  await pg.locator('#sync').uncheck();
  await setNumber(pg, '#level', '90');
  await fillBrowser(pg, 780, '', 100, 'head');
  await expect(browserRows(pg).first()).toContainText(`→${HEAD_MAIN_CAP_660}`);
  await checkNoBadText(pg, 'level sync/browse');
  await waitOptimizer(pg);
  await expect(pg.locator('#o-out .readout')).toContainText('synced');
  await expect(optTotal(pg)).not.toHaveText('');
  await checkNoBadText(pg, 'level sync/opt');
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
  for (const where of ['browse', 'opt']) {
    await showTab(pg, where);
    check(!(await hasHScroll(pg)), `level sync: horizontal page scroll at ${NARROW.width} px (${where})`);
  }
  await pg.screenshot({ path: shot('level-sync.png'), fullPage: true });
  // back to the shared setup: level 50, sync to 123, no browser filters
  await fillBrowser(pg, '', '', 100);
  await setNumber(pg, '#level', '50');
  await setCap(pg, '123');
  await pg.setViewportSize({ width: 1000, height: 900 });
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
  const level = await pg.evaluate(`JSON.parse(localStorage.getItem("${STORE_KEY}")).level`);
  check(level === 50, `BST: a typed level 70 was taken (saved level ${JSON.stringify(level)})`);
  await setNumber(pg, '#level', '40');
  await waitSaved(pg, 's => s.level === 40');
  await setNumber(pg, '#level', '50'); // the shared setup
  await setJob(pg, 'SGE');
}

// How the math works, Substat tiers. Sage at level 100 (SUB 420, MAIN 440): Spell Speed 624 is in AkhMorning's 2.47 s tier, which
// starts at 613 on the panel (gear speed 193; validation.md section 5).
const TIERS_SHORT = { crit: 'CRT', det: 'DET', dh: 'DHT', spd: 'SpS', spec: 'PIE' };

/** Tiers (Sage, level 100, item level sync off): with no optimizer result for these settings each value starts at its
 * base and Fill is off; a typed Spell Speed lands in AkhMorning's tier; once the optimizer has run, the values are its
 * Total row's substats; a level typed into the settings shows its tiers while the field still has focus (no change
 * event, no typing wait); with sync on and no cap there is no "enter a sync cap" message on Tiers; Paladin's Tenacity
 * has two effect columns; no sideways scroll at NARROW. */
async function checkTiers(pg) {
  await pg.setViewportSize(NARROW);
  await setJob(pg, 'SGE');
  // settings changed away from the optimizer tab: it has no result for them yet
  await showMath(pg, 'tiers');
  await pg.locator('#sync').uncheck();
  await setNumber(pg, '#level', '100');
  await expect(pg.locator('#t-title')).toHaveText('Sage substat tiers at level 100');
  await expect(pg.locator('#t-fill')).toBeDisabled();
  check(Number(await pg.$eval('#t-fill', e => getComputedStyle(e).opacity)) < 1, 'the disabled Fill chip does not look disabled');
  await expect(pg.locator('#t-table [data-n="crit"]')).toHaveValue('420');
  await expect(pg.locator('#t-table [data-n="det"]')).toHaveValue('440');
  await setNumber(pg, '#t-table [data-n="spd"]', '624');
  await expect(pg.locator('#t-table tbody tr.cur td[data-to^="spd:"]').first()).toHaveText('613');
  await expect(pg.locator('#t-table tbody tr.cur td[data-to^="spd:"]').nth(1)).toHaveText('2.47s');

  // the optimizer's result fills the boxes: its Total row, substat by substat. The panel of the last result shows at
  // once, so wait for a solve for these settings
  const runs = await pg.evaluate("performance.getEntriesByName('optimizer').length");
  await waitOptimizer(pg);
  await pg.waitForFunction(n => performance.getEntriesByName('optimizer').length > n, runs, { timeout: TIMEOUT });
  // header cells are shown in capitals (CSS), so compare in upper case
  const heads = (await pg.locator('#o-out thead tr').first().locator('th').allInnerTexts()).map(t => t.trim().toUpperCase());
  const total = (await pg.locator('#o-out tr.total').first().locator('td').allInnerTexts()).map(t => t.trim());
  await showMath(pg, 'tiers');
  await expect(pg.locator('#t-fill')).toBeEnabled();
  for (const [stat, short] of Object.entries(TIERS_SHORT)) {
    const want = total[heads.indexOf(short.toUpperCase())];
    check(
      want != null && (await pg.inputValue(`#t-table [data-n="${stat}"]`)) === want,
      `Tiers ${stat} is not the optimizer's Total ${want}`,
    );
  }
  await setNumber(pg, '#t-table [data-n="crit"]', '5');
  await expect(pg.locator('#t-table [data-n="crit"]')).toHaveValue('420');
  await expect(pg.locator('#t-table .lnote').first()).toHaveText('Under the base of 420; shown at 420.');
  await pg.click('#t-fill');
  await expect(pg.locator('#t-table [data-n="crit"]')).toHaveValue(total[heads.indexOf(TIERS_SHORT.crit)]);

  // the level follows each valid keystroke, while the field keeps focus
  await pg.focus('#level');
  await pg.keyboard.press('Control+A');
  await pg.keyboard.type('90');
  await expect(pg.locator('#t-title')).toHaveText('Sage substat tiers at level 90');
  check((await pg.evaluate(() => document.activeElement?.id)) === 'level', 'the level field lost focus while typing');
  await pg.keyboard.press('Tab');

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
}

/** Every tab for one job: no undefined/NaN/null text, correct sync caps, page fits NARROW width. Food is on, as it is
 * for the later jobs of a sequential walk. One step per job; the last job takes the screenshot. */
const walkJob = job => async pg => {
  await pg.setViewportSize(NARROW);
  await setJob(pg, job);
  await waitOptimizer(pg);
  await pg.locator('#o-food').check();
  await showTab(pg, 'browse');
  await expect(pg.locator('#b-count')).not.toHaveText('');
  await checkNoBadText(pg, `${job}/browse`);
  await waitOptimizer(pg);
  await expect(pg.locator('#o-count')).toContainText(' pieces');
  await checkNoBadText(pg, `${job}/opt`);
  await expect(pg.locator('#o-food-row')).toBeVisible();
  // the note that weapon damage comes first (its value is not shown), none for Blue Mage (Intelligence scales its
  // damage); defense always
  if (job === 'BLU') await expect(pg.locator('#o-wd-note')).toBeHidden();
  else await expect(pg.locator('#o-wd-note')).toHaveText('Weapon damage comes first, before the goal.');
  await expect(pg.locator('#o-defense td.defense')).toHaveText(/^Physical [\d,]+ · Magic [\d,]+ · −\d+% \/ −\d+% damage taken$/);
  await showMath(pg, 'piece');
  await expect(pg.locator('#p-bars .num').first()).toBeVisible();
  await checkNoBadText(pg, `${job}/math:piece`);
  await checkSyncCaps(pg, job);
  await showMath(pg, 'gcd');
  await expect(pg.locator('#g-chart svg')).toBeVisible();
  await checkNoBadText(pg, `${job}/math:gcd`);
  await showMath(pg, 'tiers');
  await expect(pg.locator('#t-table tbody tr.cur')).toBeVisible();
  await checkNoBadText(pg, `${job}/math:tiers`);
  check(!(await hasHScroll(pg)), `${job}: horizontal page scroll at ${NARROW.width} px`);
  if (job === JOBS.at(-1)) await pg.screenshot({ path: shot('narrow.png'), fullPage: true });
};

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
  await expect(pg.locator('#no-job')).toBeVisible(); // no job yet: no gear table
  await checkCapValidation(pg);
}

// The steps, in groups. A group runs its steps one after the other on a fresh page (own browser context, so own saved
// state) from the same start: Sage, sync to 123, level 50, which the steps use, and each step leaves that setup
// behind. The groups run in parallel. `fresh` groups get the page as it loads, with nothing set. `slow` groups start
// first. A page boot is half a second of CPU, so steps that take little are put together.
const realGear = c => ({ name: `checkRealGearOptimizer ${c[0]}`, run: checkRealGearOptimizer(c) });
const walk = job => ({ name: `walkJobs ${job}`, run: walkJob(job) });
const step = fn => ({ name: fn.name, run: fn });
const GROUPS = [
  { fresh: true, steps: [step(checkDefaults)] },
  { steps: [step(checkPieceLab), step(checkClosedPanel), step(checkJobSwitch), step(checkPldOffhand)] },
  ...OPT_CASES.map(c => ({ slow: true, steps: [realGear(c)] })),
  { slow: true, steps: [step(checkTypingDebounce)] },
  { slow: true, steps: [step(checkRingCopies), step(checkGearFrom)] },
  { slow: true, steps: [step(checkOptFilters)] },
  { slow: true, steps: [step(checkMelds), step(checkFood), step(checkRankByTier)] },
  { slow: true, steps: [step(checkTargetGcd)] },
  { slow: true, steps: [step(checkExpansionFilter), step(checkReset)] },
  { slow: true, steps: [step(checkReloadPersists)] },
  { slow: true, steps: [step(checkCorruptedStorage)] },
  { slow: true, steps: [step(checkLevelSync), step(checkJobLevelCap)] },
  { slow: true, steps: [step(checkSameResult)] },
  { slow: true, steps: [step(checkTiers)] },
  { steps: ['SGE', 'WAR', 'PLD'].map(walk) },
  { steps: ['BLM', 'NIN', 'DRG'].map(walk) },
  { steps: ['BST', 'BLU'].map(walk) },
];

/** One group on a new page. Returns what it found: the page and console errors and the failed checks, in order. */
async function runGroup(browser, group) {
  const rec = { name: group.steps.map(s => s.name).join(', '), errors: [], failures: [], steps: [] };
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 900 } });
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
        if (!group.fresh) {
          await setJob(pg, 'SGE');
          await setCap(pg, '123'); // the checks use the item level 123 caps
          await setNumber(pg, '#level', '50');
        }
      } catch (e) {
        await fail(`${rec.name} (setup)`, e);
        return;
      }
      for (const step of group.steps) {
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
  writeFileSync(resolve(OUT, 'blank.html'), '<!doctype html><title>blank</title>', 'utf-8'); // for checkCorruptedStorage

  const t0 = Date.now();
  startCore();
  const browser = await chromium.launch();
  const records = [];
  try {
    // a pool of workers takes the steps in order; the output below is in step order whichever finishes first
    const queue = GROUPS.map((_, i) => i).sort((a, b) => Number(!!GROUPS[b].slow) - Number(!!GROUPS[a].slow)); // slow ones first
    const worker = async () => {
      for (let i = queue.shift(); i !== undefined; i = queue.shift()) records[i] = await runGroup(browser, GROUPS[i]);
    };
    await Promise.all(Array.from({ length: Math.min(WORKERS, GROUPS.length) }, worker));
  } finally {
    await browser.close();
    await coreWorker.terminate();
  }

  if (process.env.SMOKE_TRACE) {
    for (const r of records) for (const [name, ms] of r.steps) console.error(`${String(ms).padStart(6)} ms  ${name}`);
    console.error(`${String(Date.now() - t0).padStart(6)} ms  total`);
  }
  const problems = records.flatMap(r => [...r.errors, ...r.failures]);
  console.log(problems.join('\n') || 'no errors');
  return problems.length ? 1 : 0;
}

process.exitCode = await main();
