// Usage: node shots.mjs <page.html> <tag> [ONLY regex] [--full]
// Clipped screenshots of the region each finding changes, at 1440 px (and 960 px where `narrow` is set), light theme.
// Saves shots/<id>-<tag>-<width>.png next to this script. --full saves full-page shots to full/ instead (for checking).
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
const require = createRequire(resolve('package.json')); // run from the repo root, which has Playwright
const { chromium } = require('playwright');

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const full = args.includes('--full');
const [pagePath, tag, onlyArg] = args.filter(a => a !== '--full');
const URL = pathToFileURL(resolve(pagePath)).href;
const outDir = resolve(here, full ? 'full' : 'shots');
mkdirSync(outDir, { recursive: true });
const KEY = 'ilvl-stat-lab-v4';

const SGE = { job: 'SGE', cap: 123, sync: true, level: 100, tab: 'opt', mathTab: 'piece' };
const SETTINGS = '.panel[aria-label="Job and sync settings"]';
const settle = pg => pg.waitForTimeout(450);
const run = async pg => {
  await pg.click('#o-run');
  await pg.waitForSelector('#o-out .panel', { timeout: 60000 });
  await pg.waitForSelector('#o-busy', { state: 'hidden', timeout: 60000 });
  await settle(pg);
};

// id -> {state, steps, clip: [selectors] (union of their boxes), narrow: also 960 px}
const VIEWS = {
  '11-1': {
    state: { job: 'WAR', level: 100, sync: false, cap: null, tab: 'opt', opt: { target: 'crit' } },
    steps: async pg => {
      // the user types the synced level, as a newcomer does
      await pg.fill('#level', '90');
      await pg.locator('#level').dispatchEvent('change');
      await settle(pg);
      await run(pg);
    },
    clip: [SETTINGS, '#o-controls', '#o-table'],
  },
  '11-2': {
    state: { ...SGE, opt: { target: 'mind', tb: 'spd', gcd: 2.4, food: true } },
    steps: async pg => {
      await pg.click('[data-job-id="SCH"]');
      await settle(pg);
    },
    clip: [SETTINGS, '#o-goal'],
  },
  '11-3': {
    state: { ...SGE, tab: 'math', mathTab: 'piece' },
    steps: async () => {},
    clip: ['#m-bar', '#p-piece'],
  },
  '11-4': {
    state: { job: 'SGE', level: 100, sync: false, cap: null, tab: 'opt' },
    steps: async () => {},
    clip: [SETTINGS],
    narrow: true,
  },
  '11-4on': {
    state: { ...SGE },
    steps: async () => {},
    clip: [SETTINGS],
  },
  '11-5': {
    state: { job: 'SGE', level: 90, sync: false, cap: null, tab: 'opt', opt: { lvl: 100 } },
    steps: run,
    clip: ['#o-table'],
  },
  '11-7': {
    state: { ...SGE, tab: 'browse' },
    steps: async () => {},
    clip: ['.titleline', '#b-key', '#gear-table tbody tr:nth-of-type(-n+5)'],
  },
  '11-8': {
    state: { ...SGE, cap: null, sync: false, opt: { gcd: 2.4, food: true } },
    steps: run,
    clip: ['#o-result .readout', '#o-table tbody tr:nth-of-type(-n+7)'],
  },
  '11-9': {
    state: { ...SGE },
    steps: async () => {},
    clip: ['#o-goal'],
    narrow: true,
  },
  '11-10': {
    state: { ...SGE, cap: null, sync: false },
    steps: run,
    clip: ['#o-result .readout', '.tablekey'],
  },
  '11-11': {
    state: { ...SGE, cap: null, sync: false },
    steps: run,
    clip: ['#o-defense', '#o-total-note', '#o-result .tablekey'],
  },
  '11-12': {
    state: { ...SGE, tab: 'browse', browse: { q: 'Bozjan Coat of Healing' } },
    steps: async () => {},
    clip: ['.titleline', '#gear-table'],
  },
  '11-13': {
    state: { ...SGE, tab: 'math', mathTab: 'gcd' },
    steps: async () => {},
    clip: ['#m-bar'],
    narrow: true,
  },
  '11-14': {
    state: { ...SGE, level: 70, tab: 'math', mathTab: 'gcd' },
    steps: async () => {},
    clip: [SETTINGS, '#m-bar', '#g-facts'],
    narrow: true,
  },
  '11-15': {
    state: null,
    steps: async () => {},
    clip: ['header', '#no-job'],
  },
  '10-1': {
    state: { ...SGE },
    steps: run,
    clip: ['#o-table tr.total', '#o-effect'],
  },
  '10-4': {
    state: { ...SGE, tab: 'math', mathTab: 'piece' },
    steps: async pg => {
      await pg.click('#m-help');
      await settle(pg);
    },
    clip: ['#m-help-pop'],
  },
  W1: {
    state: { ...SGE, cap: null, sync: false },
    steps: async pg => {
      // hold the bar on screen: the busy state without a search behind it
      await pg.evaluate(() => {
        const el = document.querySelector('#o-run').closest('[x-data="optimizer"]');
        el._x_dataStack[0].busy = true;
      });
      await settle(pg);
    },
    clip: ['#o-goal', '#o-busy', '#o-cancel'],
  },
};

const only = onlyArg ? new RegExp(onlyArg) : null;
const browser = await chromium.launch();
const jobs = [];
for (const [id, v] of Object.entries(VIEWS)) {
  if (only && !only.test(id)) continue;
  for (const width of [1440, 960]) jobs.push({ id, v, width });
}
const errors = [];
async function one({ id, v, width }) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: 'light', reducedMotion: 'reduce' });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  if (v.state) {
    await ctx.addInitScript(
      ([k, s]) => {
        if (!sessionStorage.getItem('seeded')) {
          localStorage.setItem(k, s);
          sessionStorage.setItem('seeded', '1');
        }
      },
      [KEY, JSON.stringify(v.state)],
    );
  }
  const pg = await ctx.newPage();
  pg.on('pageerror', e => errors.push(`${id}: ${e.message}`));
  await pg.goto(URL);
  await settle(pg);
  await v.steps(pg);
  await pg.mouse.move(width - 2, 2);
  await pg.evaluate(() => {
    const t = document.querySelector('#o-time');
    if (t) t.textContent = 'Solved in 120 ms.';
  });
  await settle(pg);
  const sw = await pg.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (sw > 0) errors.push(`${id} ${width}: sideways scroll ${sw}px`);
  const file = resolve(outDir, `${id}-${tag}-${width}.png`);
  if (full) {
    await pg.screenshot({ path: file, fullPage: true, animations: 'disabled', caret: 'hide' });
  } else {
    const box = await pg.evaluate(sels => {
      let top = Infinity,
        bottom = -Infinity,
        left = Infinity,
        right = -Infinity;
      for (const s of sels)
        for (const el of document.querySelectorAll(s)) {
          const r = el.getBoundingClientRect();
          if (!r.width || !r.height) continue;
          top = Math.min(top, r.top + scrollY);
          bottom = Math.max(bottom, r.bottom + scrollY);
          left = Math.min(left, r.left + scrollX);
          right = Math.max(right, r.right + scrollX);
        }
      return top === Infinity ? null : { top, bottom, left, right };
    }, v.clip);
    if (!box) {
      errors.push(`${id} ${width}: nothing to clip`);
      await pg.screenshot({ path: file, fullPage: true });
    } else {
      const pad = 12;
      const x = Math.max(0, box.left - pad);
      const clip = {
        x,
        y: Math.max(0, box.top - pad),
        width: Math.min(width, box.right + pad) - x,
        height: box.bottom - box.top + 2 * pad,
      };
      await pg.screenshot({ path: file, clip, fullPage: true, animations: 'disabled', caret: 'hide' });
    }
  }
  await ctx.close();
}
const POOL = 4;
let next = 0;
await Promise.all(
  Array.from({ length: POOL }, async () => {
    while (next < jobs.length) await one(jobs[next++]);
  }),
);
await browser.close();
console.log(`${jobs.length} shots`);
if (errors.length) console.log(errors.join('\n'));
