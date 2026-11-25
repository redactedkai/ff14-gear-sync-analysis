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
import { flag, numberOption, option } from '../perf/args.mjs';
import { VIEWS, openView, prepareContext, viewUrl } from './views.mjs';

const WIDTHS = [1440, 960];
const SCHEMES = ['light', 'dark'];
const VIEWPORT_HEIGHT = 900;

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

if (readFileSync(pagePath, 'utf8').includes('class="build-badge"')) {
  console.warn('warning: the page carries the DEV badge; build it with GITHUB_REF_NAME=main to compare across branches');
}

const errors = [];

/* One shot: a fresh context at `width` in `scheme`, the view's saved state, its steps, then the PNG. */
async function shoot(browserInstance, { name, view, width, scheme }) {
  const context = await browserInstance.newContext({
    viewport: { width, height: VIEWPORT_HEIGHT },
    colorScheme: scheme,
    reducedMotion: 'reduce',
  });
  if (!webFonts) {
    await context.route(/fonts\.(googleapis|gstatic)\.com/, route => route.abort());
  }
  await prepareContext(context, view);
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
  await page.goto(viewUrl(pathToFileURL(pagePath).href, view));
  await openView(page, view);

  const sideways = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (sideways > 0) {
    errors.push(`${name} ${width} ${scheme}: sideways scroll of ${sideways} px`);
  }
  await page.screenshot({ path: resolve(outDir, `${name}-${width}-${scheme}.png`), fullPage: true, animations: 'disabled', caret: 'hide' });
}

// every view at every width and scheme, shot by a few workers in parallel
const shots = [];
for (const [name, view] of Object.entries(VIEWS)) {
  if (onlyPattern && !onlyPattern.test(name)) {
    continue;
  }
  for (const width of WIDTHS) {
    for (const scheme of SCHEMES) {
      shots.push({ name, view, width, scheme });
    }
  }
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
