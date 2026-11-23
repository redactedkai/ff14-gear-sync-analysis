/* The stacking scale (src/styles/tokens.css): every z-index in the stylesheet names a --z-* token, the tokens keep the
   order the page has always had, and the rules a library positioner needs are in place. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readStyles } from '../../../scripts/build/styles.mjs';

const css = readStyles().replace(/\/\*[\s\S]*?\*\//g, '');

/* The value of each --z-* token, from the first :root block that defines it, as {name: number}. */
function zTokens() {
  const tokens = {};
  for (const [, name, value] of css.matchAll(/(--z-[a-z0-9-]+):\s*(\d+)\s*;/g)) tokens[name] ??= Number(value);
  return tokens;
}

test('every z-index is a --z-* token, never a bare number', () => {
  const bare = [...css.matchAll(/z-index:\s*([^;]+);/g)].map(match => match[1].trim()).filter(value => !/^var\(--z-[a-z0-9-]+\)$/.test(value));
  assert.deepEqual(bare, [], 'a z-index that is not a --z-* token');
});

test('every --z-* token a rule uses is defined', () => {
  const tokens = zTokens();
  const used = [...new Set([...css.matchAll(/z-index:\s*var\((--z-[a-z0-9-]+)\)/g)].map(match => match[1]))];
  assert.deepEqual(
    used.filter(name => !(name in tokens)),
    [],
    'a z-index token with no value',
  );
});

test('the scale keeps its order: row, bar, popover, menu, dialog, toast (a tie is allowed)', () => {
  const tokens = zTokens();
  const scale = ['--z-row', '--z-bar', '--z-popover', '--z-menu', '--z-dialog', '--z-toast'];
  for (const name of scale) assert.ok(name in tokens, `${name} is missing`);
  const values = scale.map(name => tokens[name]);
  assert.deepEqual(
    values,
    [...values].sort((a, b) => a - b),
    'the six named layers are not in rising order',
  );
});

test('a menu inside a library positioner is static, so the positioner places it', () => {
  assert.match(css, /\[data-part="positioner"\]\s*>\s*:is\(\.popover,\s*\.multi-menu,\s*\.same-menu,\s*\.setmenu,\s*\.matpop,\s*\.setpop\)\s*\{\s*position:\s*static/);
});

test('the page scroll lock follows an open dialog, not a mounted one', () => {
  assert.ok(!/html:has\(\.dlg\)/.test(css), 'html:has(.dlg) locks the page for a dialog that is only mounted');
  assert.match(css, /html:has\(\.dlg\[open\],\s*\.dlg\[data-state="open"\]\)\s*\{\s*overflow:\s*hidden/);
});
