/* The layout stress tool's windows (scripts/layout-stress/matrix.mjs): the screen and scale matrix, the sweep's widths and the text setups. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FONT_SETUPS,
  QUICK_WINDOWS,
  SCALES,
  SCREENS,
  buildMatrix,
  chooseSetups,
  parseWindow,
  setupFor,
  windowsForSetup,
  FONT_SETUP_WINDOWS,
} from '../../../../scripts/layout-stress/matrix.mjs';

/* The windows testing.md section 3.1 names for CSS screens: 1280 x 720 -> 1265 x 565, 1536 x 864 -> 1521 x 709, 1920 x 1080 -> 1905 x 925,
   2560 x 1440 -> 2545 x 1285 (the scrollbar 15 px wide, the taskbar and browser bars 155 px tall). Those are the doc's own numbers. */
test('a window is the CSS screen less the scrollbar, taskbar and browser bars', () => {
  const at = (physicalWidth, physicalHeight, scale) => {
    const setup = setupFor(physicalWidth, physicalHeight, scale);
    return `${setup.width}x${setup.height}`;
  };
  assert.equal(at(2560, 1440, 2), '1265x565'); // a 1440p panel at 200%
  assert.equal(at(1920, 1080, 1.25), '1521x709'); // a 1080p laptop at 125%
  assert.equal(at(1920, 1080, 1), '1905x925');
  assert.equal(at(3840, 2160, 2), '1905x925'); // a 4K laptop at 200% lands on the same window
  assert.equal(at(2560, 1440, 1), '2545x1285');
});

test('a screen under the 960 px floor is not supported; 960 exactly is', () => {
  assert.equal(setupFor(1920, 1080, 2).supported, true); // 960 x 540
  assert.equal(setupFor(1920, 1080, 2.25).supported, false); // 853 wide
  assert.equal(setupFor(1366, 768, 1.5).supported, false); // 910 wide
});

test('the matrix has every screen at every scale and checks a window two setups share once', () => {
  const { setups, windows } = buildMatrix();
  assert.equal(setups.length, SCREENS.length * SCALES.length);
  const supported = setups.filter(setup => setup.supported);
  assert.ok(windows.size < supported.length, 'some setups share a window');
  assert.equal([...windows.values()].flat().length, supported.length);
  assert.deepEqual(
    windows
      .get('1905x925')
      .map(setup => setup.physical)
      .sort(),
    ['1920x1080', '3840x2160'].sort(),
  );
  // every window is at least the floor less the scrollbar
  for (const key of windows.keys()) {
    assert.ok(parseWindow(key).width >= 945, key);
  }
});

test('the quick windows are valid window keys, and the setups are the page fonts alone unless all are asked for', () => {
  for (const key of QUICK_WINDOWS) {
    assert.match(key, /^\d+x\d+$/);
  }
  assert.deepEqual(
    chooseSetups(false).map(setup => setup.id),
    ['page'],
  );
  assert.deepEqual(
    chooseSetups(true).map(setup => setup.id),
    ['page', 'fallback', 'verdana', 'text125', 'text150', 'text200'],
  );
});

test('the text setups scale the root and the body, and the font setups block or force fonts', () => {
  const byId = Object.fromEntries(FONT_SETUPS.map(setup => [setup.id, setup]));
  assert.match(byId.text125.css, /html\{font-size:125%/);
  assert.match(byId.text200.css, /body\{font-size:30px/); // 15 px x 200%
  assert.equal(byId.fallback.blockFonts, true);
  assert.equal(byId.page.blockFonts, false);
  assert.match(byId.verdana.css, /Verdana/);
});

test('the page fonts visit every window, every other setup a chosen few that are windows of the matrix, a quick run the quick set', () => {
  const { windows } = buildMatrix();
  const all = [...windows.keys()];
  assert.deepEqual(windowsForSetup(all, 'page', false), all);
  assert.deepEqual(windowsForSetup(all, 'stress', false), FONT_SETUP_WINDOWS);
  assert.deepEqual(windowsForSetup(all, 'text200', false), FONT_SETUP_WINDOWS);
  for (const key of FONT_SETUP_WINDOWS) {
    assert.ok(windows.has(key), key);
  }
  assert.deepEqual(windowsForSetup(all, 'verdana', true), QUICK_WINDOWS);
});
