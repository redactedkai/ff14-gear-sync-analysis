// The "Page failed to start" message (src/startup-failure.js): none on a healthy load; shown on a page that fails in
// each way (a throw in the app script, an error while the page is built, a file cut short, the start marker missing); its Reset button; no Reset button
// when the browser blocks storage. The broken pages are copies of the built page written to the output folder.

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { UNLOAD_GUARD_OFF_KEY } from '../../../../src/ui/router/unload-guard.js';
import { OUT, PAGE_PATH, STORE_KEY } from '../../lib/constants.mjs';
import { check, expect } from '../../lib/expect.mjs';
import { afterFrames, newPage } from '../../lib/nav.mjs';

// where the app's script begins: the first <script> after the style (a later "<script>" is text inside the bundle)
const APP_SCRIPT_START = html => html.indexOf('<script>', html.indexOf('</style>')) + '<script>'.length;

/** A copy of the built page with `edit(html)` applied, written as startup-<name>.html; returns its file URL. */
function variantUrl(name, edit) {
  const file = resolve(OUT, `startup-${name}.html`);
  writeFileSync(file, edit(readFileSync(PAGE_PATH, 'utf8')), 'utf8');
  return pathToFileURL(file).href;
}

/** A script text, put first in the app's script, that makes the render of the element `tag` throw a ReferenceError naming `missing`
 * (no bundle code is edited: customElements.define is patched ahead of the bundle). */
const brokenRender = (tag, missing) => `{
  const define = customElements.define.bind(customElements);
  customElements.define = (name, constructor, options) => {
    if (name === ${JSON.stringify(tag)}) {
      const render = constructor.prototype.render;
      constructor.prototype.render = function () {
        ${missing}();
        return render.call(this);
      };
    }
    define(name, constructor, options);
  };
}`;
const BROKEN_SHEETS_SCREEN = brokenRender('gsa-sheets-screen', 'sheetsMissing');

/** The copy with a top-level throw first in the app's script: nothing of the app runs. */
const throwing = html => {
  const at = APP_SCRIPT_START(html);
  return `${html.slice(0, at)}throw new Error('injected failure (smoke test)');${html.slice(at)}`;
};

/** The copy cut after `keep(html)` characters. */
const cut = keep => html => html.slice(0, keep(html));

/** A new page of the group's context (so with its saved data), or, when `init` is given, of a new context that runs `init`
 * first in every page. Returns {page, close}. */
async function openPage(pg, init) {
  const context = init ? await pg.context().browser().newContext() : pg.context();
  if (init) {
    await context.addInitScript(init);
  }
  const page = await newPage(context);
  return { page, close: () => (init ? context.close() : page.close()) };
}

/** Open `url`, wait for the message and return what it says: {heading, error}. */
async function failedStart(page, url) {
  await page.goto(url);
  await expect(page.locator('#startfail')).toBeVisible();
  return {
    heading: (await page.locator('#startfail h2').textContent()).trim(),
    error: (await page.locator('#startfail-error').textContent()).trim(),
  };
}

const SEEDED = {
  [STORE_KEY]: '{"v":1}',
  [`${STORE_KEY}:sheets`]: '{"v":1,"order":[]}',
  [`${STORE_KEY}:sheet:a`]: 'x',
  [`${STORE_KEY}:sheet:b`]: 'y',
};
const FOREIGN = { 'other-app': 'keep', [`${STORE_KEY}0`]: 'keep too' }; // another page's key that starts like ours

/** A healthy load shows no message (the group's own page, loaded by the runner), and the page itself shows. */
export async function checkStartupHealthy(pg) {
  check((await pg.locator('#startfail').count()) === 0, 'a healthy page shows the failed-to-start message');
  check((await pg.locator('#boot').count()) === 0, 'the boot shell is still in a page that has started');
  check(await pg.locator('[data-tab=sheets]').isVisible(), 'the healthy page is not showing');
}

/** A throw in the app's script: the message shows (blank page) with the error's text. An error while an element draws, in the page's
 * root or in a screen: the same message, the rest of the page hidden. A file cut inside the style or inside the app's script: the
 * message shows. */
export async function checkStartupFailures(pg) {
  const { page, close } = await openPage(pg);
  try {
    const blank = await failedStart(page, variantUrl('throw', throwing));
    check(blank.heading.length > 0, 'blank case: no heading');
    check(blank.error === 'Error: injected failure (smoke test)', `blank case error text: '${blank.error}'`);
    check(await page.locator('#startfail-reload').isVisible(), 'no Reload button');

    // an error while the page is built, in a known spot: the Sheets screen's element (a Lit element, drawn in a microtask after the app's
    // script) gets a render that first calls a function nobody defines; the patch of customElements.define runs ahead of the bundle
    const partUrl = variantUrl('part', html => {
      const at = APP_SCRIPT_START(html);
      return `${html.slice(0, at)}${BROKEN_SHEETS_SCREEN}${html.slice(at)}`;
    });
    const part = await failedStart(page, partUrl);
    check(part.heading.length > 0, 'partly built: no heading');
    check(part.error.includes('sheetsMissing'), `partly built error text: '${part.error}'`);
    check(!(await page.locator('[data-tab=sheets]').isVisible()), 'a partly built page hides the rest of the page');

    // the same when the page's root element itself fails to draw: no start marker, the error's text
    const rootUrl = variantUrl('root', html => {
      const at = APP_SCRIPT_START(html);
      return `${html.slice(0, at)}${brokenRender('gsa-app', 'rootMissing')}${html.slice(at)}`;
    });
    const rootFailed = await failedStart(page, rootUrl);
    check(rootFailed.error.includes('rootMissing'), `root draw error text: '${rootFailed.error}'`);

    // the half-built page is never painted before the message hides it: a frame loop (from before the page's own scripts)
    // records any frame where the page's root is showing and the message is not (the boot shell may show: it is not the page)
    const watched = await openPage(pg, () => {
      window.__brokenFrame = false;
      const watch = () => {
        const root = document.querySelector('.wrap');
        const painted = root && getComputedStyle(root).display !== 'none';
        if (painted && !document.querySelector('#startfail')) {
          window.__brokenFrame = true;
        }
        requestAnimationFrame(watch);
      };
      requestAnimationFrame(watch);
    });
    try {
      await failedStart(watched.page, partUrl);
      await afterFrames(watched.page); // the frame loop has seen the frames after the message showed
      check(!(await watched.page.evaluate(() => window.__brokenFrame)), 'a partly built page was painted before the message hid it');
    } finally {
      await watched.close();
    }

    const cuts = {
      'inside the style': cut(html => html.indexOf('<style>') + 1000),
      "inside the app's script": cut(html => html.length - 300),
    };
    for (const [what, edit] of Object.entries(cuts)) {
      const got = await failedStart(page, variantUrl('cut', edit));
      check(got.heading.length > 0, `file cut ${what}: no heading`);
      check(got.error.startsWith('The page was not built'), `file cut ${what}: error text '${got.error}'`);
    }
  } finally {
    await close();
  }
}

// the statement main.js runs once the root element has drawn the page, as the minifier writes it; startup-failure.js reads the attribute it sets
const STARTED_MARKER = 'document.documentElement.dataset.started=""';

/** The copy without the statement that marks the page as started: every script runs and throws nothing, but the page never
 * says it finished. */
const withoutStartMarker = html => {
  if (!html.includes(STARTED_MARKER)) {
    throw new Error('the page has no started-marker statement to remove');
  }
  return html.replace(STARTED_MARKER, 'void 0');
};

/** A page whose start marker is missing and that threw no error: the message still shows, saying the page was not built. */
export async function checkStartupMarkerMissing(pg) {
  const { page, close } = await openPage(pg);
  try {
    const got = await failedStart(page, variantUrl('nomarker', withoutStartMarker));
    check(got.heading.length > 0, 'marker missing: no heading');
    check(got.error.startsWith('The page was not built'), `marker missing: error text '${got.error}'`);
    check(await page.locator('#startfail-reload').isVisible(), 'marker missing: no Reload button');
  } finally {
    await close();
  }
}

/** The start marker is set only once the page's root element has drawn: a patch of customElements.define from before the page's scripts
 * reads the marker as `<gsa-app>` draws (absent), and it is set after the page has loaded. A marker set before the start would claim
 * a start that has not happened. */
export async function checkStartupMarkerAfterStart(pg) {
  const { page, close } = await openPage(pg, () => {
    window.__markerAt = [];
    const define = customElements.define.bind(customElements);
    customElements.define = (name, elementClass, options) => {
      if (name === 'gsa-app') {
        const render = elementClass.prototype.render;
        elementClass.prototype.render = function () {
          window.__markerAt.push('started' in document.documentElement.dataset);
          return render.call(this);
        };
      }
      define(name, elementClass, options);
    };
  });
  try {
    await page.goto(pathToFileURL(PAGE_PATH).href);
    await expect(page.locator('[data-tab=sheets][aria-current=page]')).toBeVisible();
    const markerAt = await page.evaluate(() => window.__markerAt);
    check(markerAt.length >= 1, `the root's draws seen: ${JSON.stringify(markerAt)}`);
    check(!markerAt[0], 'the start marker was already set when the root drew for the first time');
    check(await page.evaluate(() => 'started' in document.documentElement.dataset), 'the started page has no start marker');
  } finally {
    await close();
  }
}

/** Reset: Cancel keeps every key; Delete removes the page's keys (the settings key and every key that starts with it and a
 * colon) and no other page's, then reloads. */
export async function checkStartupReset(pg) {
  const { page, close } = await openPage(pg);
  // the smoke runner's own dev flag (init-scripts.mjs NO_UNLOAD_GUARD) is not one of the page's saved data
  const keys = async () => (await page.evaluate(() => Object.keys(localStorage).sort())).filter(key => key !== UNLOAD_GUARD_OFF_KEY);
  try {
    await page.goto(variantUrl('reset', throwing));
    await page.evaluate(
      seed => {
        for (const [key, value] of Object.entries(seed)) {
          localStorage.setItem(key, value);
        }
      },
      { ...SEEDED, ...FOREIGN },
    );
    await page.reload();
    await expect(page.locator('#startfail-ask')).toBeVisible();
    await expect(page.locator('#startfail-confirm')).toBeHidden();
    await page.click('#startfail-ask');
    await expect(page.locator('#startfail-confirm')).toBeVisible();
    await page.click('#startfail-cancel');
    await expect(page.locator('#startfail-confirm')).toBeHidden();
    const kept = await keys();
    check(kept.length === 6, `Cancel changed the saved keys: ${JSON.stringify(kept)}`);

    await page.click('#startfail-ask');
    await page.click('#startfail-do');
    await expect(page.locator('#startfail-none')).toBeVisible(); // reloaded: nothing of the page's is left to reset
    const left = await keys();
    check(JSON.stringify(left) === JSON.stringify(Object.keys(FOREIGN).sort()), `keys left after Reset: ${JSON.stringify(left)}`);
    const flag = await page.evaluate(key => localStorage.getItem(key), UNLOAD_GUARD_OFF_KEY);
    check(flag === '1', `Reset removed the dev flag of the reload guard (now ${flag})`);
  } finally {
    await close();
  }
}

/** A browser that does not let the page read its storage: the message says so and has no Reset button. */
export async function checkStartupBlockedStorage(pg) {
  const { page, close } = await openPage(pg, () =>
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new DOMException('blocked (smoke test)', 'SecurityError');
      },
    }),
  );
  try {
    await failedStart(page, variantUrl('blocked', throwing));
    await expect(page.locator('#startfail-blocked')).toBeVisible();
    check((await page.locator('#startfail-ask').count()) === 0, 'a Reset button shows with storage blocked');
    check(await page.locator('#startfail-reload').isVisible(), 'no Reload button with storage blocked');
  } finally {
    await close();
  }
}

/** The boot shell's tabs, with what each shows: the address that opens the tab (the page does not save the open tab; a bare address is
 * the Sheets tab), the selected tab link's label and the loading line. */
const SHELL_TABS = [
  { tab: 'browse', hash: '#/gear', label: 'Gear browser', line: '"Loading the Gear browser…"' },
  { tab: 'sheets', hash: '', label: 'Sheets', line: '"Loading Sheets…"' },
  { tab: 'math', hash: '#/math/gcd', label: 'How the math works', line: '"Loading math analysis…"' },
  { tab: 'browse', hash: '#//gear?job=SGE', label: 'Gear browser', line: '"Loading the Gear browser…"' },
  { tab: 'math', hash: '#///math//gcd', label: 'How the math works', line: '"Loading math analysis…"' },
];

/** A slow start is not a blank page: for each tab's address, the boot shell (title, tab bar with that tab selected, the
 * tab's loading line) shows from the first frame until the page has started and is gone after, nothing of the page shows
 * beside it, and the page that replaces it has its tab bar in the same place. The CPU is slowed 4x so the shell stays up long
 * enough to be seen. */
export async function checkStartupShell(pg) {
  // the init script as text, so the settings key and the saved state go into it
  const watchShell = (key, saved) => {
    localStorage.setItem(key, saved);
    window.__shell = { shown: false, selected: '', line: '', title: '', leaked: '' };
    const rectOf = el => {
      const box = el.getBoundingClientRect();
      return [box.x, box.y, box.width, box.height].map(n => Math.round(n * 10) / 10);
    };
    const watch = () => {
      const shell = document.querySelector('#boot');
      if (shell && shell.offsetParent !== null) {
        const chosen = [...shell.querySelectorAll('[data-boot]')].filter(b => getComputedStyle(b).fontWeight === '600');
        window.__shell.shown = true;
        window.__shell.selected = chosen.map(b => b.textContent.trim()).join(',');
        window.__shell.line = getComputedStyle(shell.querySelector('.bootload'), '::after').content;
        window.__shell.title = shell.querySelector('h1').textContent;
        window.__shell.bar = rectOf(shell.querySelector('nav.tabs'));
        // anything of the page itself painted beside the shell
        const root = document.querySelector('.wrap');
        if (root && getComputedStyle(root).display !== 'none') {
          window.__shell.leaked = 'the page root';
        }
        const panel = [...document.querySelectorAll('.tab')].find(tab => tab.getClientRects().length > 0);
        if (panel) {
          window.__shell.leaked = `the ${panel.id} panel`;
        }
      }
      requestAnimationFrame(watch);
    };
    requestAnimationFrame(watch);
  };
  for (const { tab, hash, label, line } of SHELL_TABS) {
    const { page, close } = await openPage(
      pg,
      `(${watchShell.toString()})(${JSON.stringify(STORE_KEY)}, ${JSON.stringify(JSON.stringify({}))})`,
    );
    const what = `address ${hash || '(none)'}`;
    try {
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      await page.goto(pathToFileURL(PAGE_PATH).href + hash);
      await expect(page.locator(`[data-tab=${tab}][aria-current=page]`)).toBeVisible();
      await expect(page.locator('#boot')).toHaveCount(0);
      const shell = await page.evaluate(() => window.__shell);
      check(shell.shown, `${what}: the boot shell was never painted before the page started`);
      check(shell.selected === label, `${what}: the boot shell's selected tab: '${shell.selected}', expected '${label}'`);
      check(shell.line === line, `${what}: the boot shell's loading line: ${shell.line}`);
      check(shell.title === 'Gear Sync Analysis', `${what}: the boot shell's title: '${shell.title}'`);
      check(shell.leaked === '', `${what}: ${shell.leaked} was painted while the boot shell showed`);
      const live = await page.evaluate(() => {
        const box = document.querySelector('.wrap nav.tabs').getBoundingClientRect();
        return [box.x, box.y, box.width, box.height].map(n => Math.round(n * 10) / 10);
      });
      check(JSON.stringify(live) === JSON.stringify(shell.bar), `${what}: the tab bar moved from ${shell.bar} (shell) to ${live} (page)`);
    } finally {
      await close();
    }
  }
}
