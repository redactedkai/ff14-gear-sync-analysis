/* Opening the page in a browser for the stress tool: one fresh browser context per page, with the saved sheets of a
   fixture in its storage, the fonts and text setup forced, and page errors collected. */
import { pathToFileURL } from 'node:url';
import { seedArgument, seedStorage } from './fixtures.ts';

/* The style added to every page: no animation or smooth scrolling, so a measure never catches a page half-way, and no
   scrollbar, so a window is as wide as the matrix says in every browser (the matrix has already taken the 15 px of a
   real scrollbar off the window, and Firefox and WebKit would draw it again). */
const NO_MOTION =
  '*,*::before,*::after{animation:none !important;transition:none !important;scroll-behavior:auto !important}' +
  '*{scrollbar-width:none !important} ::-webkit-scrollbar{display:none !important}';

/* Browser notices that are not faults of the page: WebKit reports a ResizeObserver callback that changed the layout again as an
   error event, the spec calls it harmless. */
const BENIGN_ERRORS = /^ResizeObserver loop/;

/* How long the page may take to start. */
const START_TIMEOUT_MS = 30000;

/* Waits until fonts are loaded and two frames have been drawn, so the layout is final. */
export async function settle(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}

/* Opens the page `file` (a path) in a new context of `browser`, in a window `width` x `height`, dark. `fixture` is the
   saved sheets to start with (fixtures.ts); `failWrites` makes every write to storage fail; `setup` is a font setup
   (matrix.ts FONT_SETUPS: its Google Fonts requests are refused and its style added). Returns {context, page, errors,
   fonts}: `errors` fills with the page's script errors, `fonts` says whether the page's own fonts were loaded. */
export async function openPage(browser, { file, width, height, fixture, failWrites = false, setup }) {
  const context = await browser.newContext({ viewport: { width, height }, colorScheme: 'dark' });
  if (setup?.blockFonts) {
    await context.route(/fonts\.(googleapis|gstatic)\.com/, route => route.abort());
  }
  await context.addInitScript(seedStorage, seedArgument(fixture, failWrites));
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => {
    if (!BENIGN_ERRORS.test(error.message)) {
      errors.push(error.message);
    }
  });
  await page.goto(pathToFileURL(file).href, { timeout: START_TIMEOUT_MS });
  await page.waitForSelector('html[data-started]', { timeout: START_TIMEOUT_MS });
  await page.waitForSelector('#boot', { state: 'detached', timeout: START_TIMEOUT_MS }); // the startup check has run and shown the page
  await page.addStyleTag({ content: NO_MOTION + (setup?.css ?? '') });
  if (!setup?.blockFonts && fontsReachable !== false) {
    fontsReachable = await waitForPageFonts(page);
  }
  await settle(page);
  return { context, page, errors, fonts: !setup?.blockFonts && fontsReachable === true };
}

/* Whether the request for Google Fonts has been answered so far: null before the first page, then true or false. When it
   was not answered (no network), later pages do not wait for it again, and the report says the page's fonts were not the real ones. */
let fontsReachable = null;
export function pageFontsLoaded() {
  return fontsReachable;
}

/* Waits (briefly) for the page's own web font to load; returns whether it did. The stylesheet link loads after the page
   starts, so `document.fonts.ready` alone can answer before the font is asked for. */
async function waitForPageFonts(page) {
  return page
    .waitForFunction(() => [...document.fonts].some(face => face.family.includes('IBM Plex Sans') && face.status === 'loaded'), null, {
      timeout: 5000,
    })
    .then(() => true)
    .catch(() => false);
}
