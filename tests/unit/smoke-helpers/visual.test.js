/* The smoke test's contrast arithmetic and token reader (tests/e2e/lib/visual.mjs), so a wrong formula cannot make the
   theme checks in smoke.mjs pass or fail wrongly. Expected values are the WCAG's: black on white is 21:1, #777777 on white
   is 4.48:1 and #767676 on white 4.54:1 (the usual "darkest gray that passes AA" pair, https://webaim.org/resources/
   contrastchecker/), large text starts at 18 pt, or 14 pt bold. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AA_LARGE,
  AA_TEXT,
  blend,
  contrastRatio,
  isLargeText,
  judge,
  luminance,
  readStyles,
  readThemeTokens,
  shownColors,
  tokenColor,
  tokensFor,
} from '../../e2e/lib/visual.mjs';

const near = (got, want, tolerance = 0.005) => assert.ok(Math.abs(got - want) <= tolerance, `${got} is not ${want} +/- ${tolerance}`);

test('luminance: black is 0, white is 1', () => {
  assert.equal(luminance([0, 0, 0]), 0);
  near(luminance([255, 255, 255]), 1, 1e-9);
});

test('contrast: black on white is 21 in either order; the same color is 1', () => {
  near(contrastRatio([0, 0, 0], [255, 255, 255]), 21, 1e-9);
  near(contrastRatio([255, 255, 255], [0, 0, 0]), 21, 1e-9);
  near(contrastRatio([40, 90, 60], [40, 90, 60]), 1, 1e-12);
});

test('contrast: the published AA boundary pair, #767676 passes and #777777 fails on white', () => {
  const white = [255, 255, 255];
  near(contrastRatio([0x76, 0x76, 0x76], white), 4.54);
  near(contrastRatio([0x77, 0x77, 0x77], white), 4.48);
  assert.ok(judge({ color: [0x76, 0x76, 0x76, 1], opacity: 1, layers: [[255, 255, 255, 1]], size: 15, weight: 400 }).ok);
  assert.ok(!judge({ color: [0x77, 0x77, 0x77, 1], opacity: 1, layers: [[255, 255, 255, 1]], size: 15, weight: 400 }).ok);
});

test('large text: 24 px, or 18.66 px and bold; the threshold is 3 instead of 4.5', () => {
  assert.equal(isLargeText(24, 400), true);
  assert.equal(isLargeText(23.9, 400), false);
  assert.equal(isLargeText(18.67, 700), true);
  assert.equal(isLargeText(18.67, 600), false);
  assert.equal(isLargeText(18, 700), false);
  // #949494 on white is 3.03:1: enough for large text only
  const gray = { color: [0x94, 0x94, 0x94, 1], opacity: 1, layers: [[255, 255, 255, 1]] };
  assert.equal(judge({ ...gray, size: 15, weight: 400 }).need, AA_TEXT);
  assert.equal(judge({ ...gray, size: 15, weight: 400 }).ok, false);
  assert.equal(judge({ ...gray, size: 24, weight: 400 }).need, AA_LARGE);
  assert.equal(judge({ ...gray, size: 24, weight: 400 }).ok, true);
});

test('a translucent layer is painted over the nearest opaque one, and text opacity lightens the text', () => {
  // 50% black over white is mid gray 127.5 (hand calculation: 0 * 0.5 + 255 * 0.5)
  assert.deepEqual(blend([0, 0, 0, 0.5], [255, 255, 255]), [127.5, 127.5, 127.5]);
  const shown = shownColors({
    color: [0, 0, 0, 1],
    opacity: 1,
    layers: [
      [0, 0, 0, 0.5],
      [255, 255, 255, 1],
      [0, 0, 255, 1],
    ],
    size: 15,
    weight: 400,
  });
  assert.deepEqual(shown.background, [127.5, 127.5, 127.5]); // the blue layer under the opaque white is never seen
  assert.deepEqual(shown.text, [0, 0, 0]);
  // black text at opacity 0.5 on white shows as 127.5 gray
  const faded = shownColors({ color: [0, 0, 0, 1], opacity: 0.5, layers: [[255, 255, 255, 1]], size: 15, weight: 400 });
  assert.deepEqual(faded.text, [127.5, 127.5, 127.5]);
});

test('a background with no opaque layer or with an image is marked as a guess', () => {
  assert.equal(shownColors({ color: [0, 0, 0, 1], opacity: 1, layers: [[0, 0, 0, 0]], gradient: false }).guessed, true);
  assert.equal(shownColors({ color: [0, 0, 0, 1], opacity: 1, layers: [[9, 9, 9, 1]], gradient: true }).guessed, true);
  assert.equal(shownColors({ color: [0, 0, 0, 1], opacity: 1, layers: [[9, 9, 9, 1]], gradient: false }).guessed, false);
});

test('token reader: the light, system-dark and forced-dark blocks of styles.css, with the dark lists equal', () => {
  const tokens = readThemeTokens(readStyles());
  assert.equal(tokens.light['--bg'], '#f4f2ea');
  assert.equal(tokens.darkSetting['--bg'], '#0d1517');
  assert.equal(tokens.darkForced['--bg'], '#0d1517');
  // the file's own rule ("the two lists must match")
  assert.deepEqual(tokens.darkSetting, tokens.darkForced);
  // every dark token overrides a light one
  for (const name of Object.keys(tokens.darkForced)) assert.ok(name in tokens.light, `${name} has no light value`);
  assert.equal(tokensFor(readStyles(), 'dark')['--serif'], tokens.light['--serif']); // an unchanged token carries over
  assert.notEqual(tokensFor(readStyles(), 'dark')['--surface'], tokensFor(readStyles(), 'light')['--surface']);
});

test('token reader on a small stylesheet, comments ignored, a missing block named', () => {
  const css = `:root { --a: #fff; /* --a: #000; */ --b: 0 1px 2px rgba(0, 0, 0, 0.2); }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --a: #111; color-scheme: dark; } }
:root[data-theme="dark"] { --a: #111; }`;
  assert.deepEqual(readThemeTokens(css), {
    light: { '--a': '#fff', '--b': '0 1px 2px rgba(0, 0, 0, 0.2)' },
    darkSetting: { '--a': '#111' },
    darkForced: { '--a': '#111' },
  });
  assert.throws(() => readThemeTokens(':root { --a: #fff; }'), /no "@media \(prefers-color-scheme: dark\)" block/);
});

test('token colors: hex and rgba values, nothing else', () => {
  assert.deepEqual(tokenColor('#0d1517'), [13, 21, 23, 1]);
  assert.deepEqual(tokenColor('rgba(0, 0, 0, 0.45)'), [0, 0, 0, 0.45]);
  assert.equal(tokenColor('0 8px 24px rgba(40, 35, 20, 0.18)'), null);
});
