// Saved state: reload, damaged storage, Reset to defaults.

import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { DEFAULT_CAP, DEFAULT_JOB, DEFAULT_LEVEL, OUT, PAGE, STORE_KEY } from '../../lib/constants.mjs';
import { check, checkNoBadText, expect, same, stepRecord } from '../../lib/expect.mjs';
import {
  browserRows,
  currentJob,
  fieldValue,
  fillBrowser,
  readPanel,
  setCap,
  setFrom,
  setJob,
  setNumber,
  showMath,
  showTab,
  ticked,
  waitReady,
  waitSaved,
} from '../../lib/nav.mjs';
import { SHARED_SETUP } from '../../lib/setup.mjs';
import { pickOption } from '../../lib/select.mjs';

/** Build a non-default state (job, cap, sync off, level, browser filters, Gear categories boxes and market board switch, Piece
 * stats slot and item level, How the math works open), reload, and every part comes back: the inputs and the open tab.
 * Nothing like a gear pool is saved. */
export async function checkReloadPersists(pg) {
  const [job, lo, hi, lvl] = ['DRG', 130, 135, 50]; // not the default job, a different role from the other checks
  await setJob(pg, job);
  await fillBrowser(pg, lo, hi, lvl);
  await setFrom(pg, 'b', 'tomes_legacy', false);
  await setFrom(pg, 'b', 'market', false);

  await setCap(pg, '130');
  await setNumber(pg, '#level', '60');
  if (await pg.locator('#sync').isChecked()) {
    await pg.locator('#sync').uncheck();
  }
  await expect(pg.locator('#cap')).toBeDisabled(); // no sync, so no cap to set
  // level sync to item level 270: the explainer's item level is held to its range (240 and up). With IL Sync off Stat Allocation
  // holds that item level as its cap (the Gear browser keeps the 130 typed above)
  await showMath(pg, 'piece');
  await pickOption(pg, '#p-slot', 'body');
  await setNumber(pg, '#p-ilvl', '300');

  const inputs = { '#job': job, '#cap': '270', '#level': '60', '#p-slot': 'body', '#p-ilvl': '300' };
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
    `s => s.job === '${job}' && s.cap === 270 && s.level === 60 && s.sync === false && s.tab === 'math'
    && s.piece.slot === 'body' && s.piece.ilvl === 300 && s.browse.exclude.includes('tomes_legacy')
    && s.browse.market === false && !('pool' in s) && !('opt' in s)`,
  );

  await pg.reload();
  await waitReady(pg);
  const selected = (await pg.getAttribute('[data-tab=math]', 'aria-current')) === 'page';
  check(selected && (await pg.locator('#tab-piece').isVisible()), 'after reload How the math works is not the open tab');
  for (const [sel, v] of Object.entries(inputs)) {
    const got = await fieldValue(pg, sel);
    check(got === v, `after reload ${sel} is '${got}', expected '${v}'`);
  }
  await showTab(pg, 'browse', true); // the Gear browser's own panel, not Stat Allocation's carried over
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
export async function checkCorruptedStorage(pg) {
  const blank = resolve(OUT, 'blank.html'); // written by main()
  for (const [what, raw] of BAD_STORAGE) {
    const usable = what === 'an old save with a broken pool'; // only that case stores a valid job
    const wantJob = usable ? 'SGE' : DEFAULT_JOB;
    const defaults = { '#job': wantJob, '#cap': DEFAULT_CAP, '#level': DEFAULT_LEVEL };
    if (usable) {
      Object.assign(defaults, { '#b-min': '', '#b-lvl': '100' });
    }
    const errors = stepRecord.getStore().errors;
    const nErrors = errors.length;
    await pg.goto(pathToFileURL(blank).href);
    await pg.evaluate(([k, v]) => localStorage.setItem(k, v), [STORE_KEY, raw]);
    await pg.goto(PAGE);
    await waitReady(pg);
    await expect(pg.locator('#tab-sheets')).toBeVisible(); // the page opens the first tab: a saved tab is not read
    await pg.click('[data-tab=browse]');
    await expect(pg.locator('#job-menu-btn')).toBeVisible();
    if (usable) {
      await expect(browserRows(pg).first()).toBeVisible();
    }
    for (const [sel, v] of Object.entries(defaults)) {
      const got = await fieldValue(pg, sel);
      check(got === v, `stored ${what}: ${sel} is '${got}', expected the default '${v}'`);
    }
    check(!(await pg.locator('#sync').isChecked()), `stored ${what}: sync is on, expected the default off`);
    await checkNoBadText(pg, `page loaded from stored ${what}`);
    check(errors.length === nErrors, `stored ${what}: JS errors on load: ${JSON.stringify(errors.slice(nErrors))}`);
    // the page repairs storage: the next save holds valid state, with no pool and no old optimizer settings
    const jobJs = `'${wantJob}'`;
    await waitSaved(pg, `s => s.job === ${jobJs} && !('pool' in s) && !('opt' in s) && Array.isArray(s.browse.exclude)`);
  }
}

/** Each tab has its own Job and sync panel and its own saved values: a job and level set on How the math works do not
 * touch the Gear browser's, the Sheets tab has no panel and changes neither, and a reload keeps both. */
export async function checkTabPanels(pg) {
  // without showTab's carrying the panel over; the tab opens a few frames after the click (store.openTab), so wait for it
  // before reading the panel
  const go = async tab => {
    await pg.click(`[data-tab=${tab}]`);
    await expect(pg.locator(`#tab-${tab}`)).toBeVisible();
  };
  // the math tab starts with the default job (the shared setup is the browser's)
  await go('math');
  check((await currentJob(pg)) === DEFAULT_JOB, "How the math works starts with the browser's job");
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
export async function checkReset(pg) {
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
  await expect(pg.locator('[data-job]')).toHaveAttribute('data-job', DEFAULT_JOB);
  check(messages.length === 2 && messages.every(message => message.length > 0), `reset dialog messages: ${JSON.stringify(messages)}`);
  const cj = await currentJob(pg);
  check(cj === DEFAULT_JOB, `after reset the job is '${cj}', expected '${DEFAULT_JOB}'`);
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
