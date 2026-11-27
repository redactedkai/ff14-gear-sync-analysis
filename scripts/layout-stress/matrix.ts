/* The windows the layout stress tool visits (docs/engineering/testing.md, section 3.1): the matrix of physical screens and
   Windows display scales, the heights of the width sweep, and the text and font setups. Pure: no browser, no files. */

/* The physical screens (width, height in device pixels) the matrix covers. */
export const SCREENS = Object.freeze([
  [1366, 768],
  [1920, 1080],
  [2560, 1440],
  [2560, 1600],
  [2880, 1800],
  [3840, 2160],
]);

/* The Windows display scales (1 is 100%). */
export const SCALES = Object.freeze([1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 3]);

/* What a maximised browser takes from the screen, in CSS pixels, measured on the owner's Windows 10 machine (Chrome, one
   maximised window, 2026-11): the vertical scrollbar's width, the taskbar's height, and the height of the tabs, address
   bar and bookmarks bar. */
export const CHROME = Object.freeze({ scrollbarWidth: 15, taskbarHeight: 40, browserBarsHeight: 115 });

/* The narrowest CSS screen the page supports (a window narrower than this is not supported). */
export const FLOOR_CSS_WIDTH = 960;

/* The widths of the continuous sweep, in CSS pixels, and its coarse step (every change inside a step is then bisected down to 1 px). */
export const SWEEP_FROM = 960;
export const SWEEP_TO = 2560;
export const SWEEP_STEP = 40;

/* The heights the sweep runs at: the short window (a 1080p laptop at 150%) and a tall one. The quick run uses the middle one. */
export const SWEEP_HEIGHTS = Object.freeze([565, 900]);
export const QUICK_SWEEP_HEIGHTS = Object.freeze([700]);

/* The windows (viewport width x height) of the quick run: the 960 px floor, the short window, the owner's window and the widest. */
export const QUICK_WINDOWS = Object.freeze(['960x700', '1265x565', '1905x925', '2545x1285']);

/* One physical screen at one scale as a setup: its CSS screen (device pixels over the scale, rounded down), the window a
   maximised browser gets on it (`width` x `height`: the scrollbar, taskbar and browser bars taken off), and whether the CSS
   screen reaches the floor. `chrome` and `floor` are the measured sizes above, or others for a test. */
export function setupFor(physicalWidth, physicalHeight, scale, chrome = CHROME, floor = FLOOR_CSS_WIDTH) {
  const cssWidth = Math.floor(physicalWidth / scale);
  const cssHeight = Math.floor(physicalHeight / scale);
  return {
    physical: `${physicalWidth}x${physicalHeight}`,
    scale,
    cssWidth,
    cssHeight,
    width: cssWidth - chrome.scrollbarWidth,
    height: cssHeight - chrome.taskbarHeight - chrome.browserBarsHeight,
    supported: cssWidth >= floor,
  };
}

/* The whole matrix: `setups` (every screen at every scale) and `windows`, a Map from "WxH" to the supported setups that
   land on that window, so a window two setups share is checked once. */
export function buildMatrix(screens = SCREENS, scales = SCALES, chrome = CHROME, floor = FLOOR_CSS_WIDTH) {
  const setups = screens.flatMap(([width, height]) => scales.map(scale => setupFor(width, height, scale, chrome, floor)));
  const windows = new Map();
  for (const setup of setups.filter(item => item.supported)) {
    const key = `${setup.width}x${setup.height}`;
    if (!windows.has(key)) {
      windows.set(key, []);
    }
    windows.get(key).push(setup);
  }
  return { setups, windows };
}

/* A window key "WxH" as {width, height}. */
export function parseWindow(key) {
  const [width, height] = key.split('x').map(Number);
  return { width, height };
}

/* The text and font setups: `id`, a `label`, `blockFonts` (the request for Google Fonts is refused, so the page's fallback
   stack shows) and `css` (a style the tool adds after the page's own, forcing the setup). A text size scales the page's root
   font size and the body's 15 px, as a browser's "larger text" setting would. */
const BODY_PX = 15;
const textScale = percent => `html{font-size:${percent}% !important} body{font-size:${(BODY_PX * percent) / 100}px !important}`;
export const FONT_SETUPS = Object.freeze([
  { id: 'page', label: 'Page fonts', blockFonts: false, css: '' },
  { id: 'fallback', label: 'Google Fonts blocked', blockFonts: true, css: '' },
  {
    id: 'verdana',
    label: 'Wide font (Verdana)',
    blockFonts: true,
    css: ':root{--sans:Verdana,sans-serif !important;--mono:"Lucida Console",monospace !important}',
  },
  { id: 'text125', label: '125% text', blockFonts: false, css: textScale(125) },
  { id: 'text150', label: '150% text', blockFonts: false, css: textScale(150) },
  { id: 'text200', label: '200% text', blockFonts: false, css: textScale(200) },
]);

/* The setups a run uses: the page's own fonts only, or all of them with `--fonts`. */
export function chooseSetups(allFonts) {
  return allFonts ? FONT_SETUPS : FONT_SETUPS.slice(0, 1);
}

/* The windows the text and font setups and the stress build (every setup but the page's own fonts) are visited in: the floor, the
   short and the tall ones, the owner's window and the widest, to keep a full run to about an hour and a half. Every one is a window of the matrix. */
export const FONT_SETUP_WINDOWS = Object.freeze([
  '945x385',
  '1009x485',
  '1137x565',
  '1265x565',
  '1521x709',
  '1691x805',
  '1905x925',
  '2545x1285',
]);

/* The window keys one setup is visited in: the quick run's windows in a quick run; the page's own fonts visit every window
   `allKeys`; every other setup visits FONT_SETUP_WINDOWS. */
export function windowsForSetup(allKeys, setupId, quick) {
  if (quick) {
    return QUICK_WINDOWS;
  }
  return setupId === 'page' ? allKeys : FONT_SETUP_WINDOWS.filter(key => allKeys.includes(key));
}
