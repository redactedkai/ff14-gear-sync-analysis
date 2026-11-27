/* The page's colors come only through the CSS tokens (CLAUDE.md, "Page rules"): no literal #hex, rgb(), hsl() or color name
   in a rule of src/styles/*.css (the Sheets rules included), in an inline style or a color attribute of the page's HTML
   (src/index.html), or in a quoted color of the UI scripts; the light and the
   dark token lists name the same tokens; and the two dark lists (system setting, forced) are equal. The scan is checked on
   made-up CSS first, so it cannot pass by finding nothing. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { readStyles } from '../../../scripts/build/styles.ts';
import { readThemeTokens } from '../../e2e/lib/visual.ts';
import { findLiteralColors } from '../helpers/css-colors.ts';

const SRC = new URL('../../../src/', import.meta.url);
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap(name => (statSync(join(dir, name)).isDirectory() ? walk(join(dir, name)) : [join(dir, name)]));

test('the scan finds a literal color of every kind, and passes var() and the token blocks', () => {
  const bad = (css: string, count = 1) => assert.equal(findLiteralColors(css).length, count, css);
  bad('.a { color: #fff; }');
  bad('.a { background: rgba(0, 0, 0, .5); }');
  bad('.a { border: 1px solid hsl(10 20% 30%); }');
  bad('.a { color: red; }');
  bad('@media (min-width: 1px) { .a { box-shadow: 0 0 2px oklch(50% 0.1 20); } }');
  bad('@keyframes k { from { background: #abc; } }');
  bad('.a { color: var(--fg); } .b { color: #123 }'); // the last declaration has no semicolon
  bad(':root { --bg: #fff; } .a { --mine: #fff; }'); // a custom property outside the token blocks is a literal too
  const fine = (css: string) => assert.deepEqual(findLiteralColors(css), [], css);
  fine(':root { --bg: #fff; --pop: 0 0 1px rgba(0, 0, 0, 0.2); }');
  fine('@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg: #000; } } :root[data-theme="dark"] { --bg: #000; }');
  fine('.a { color: var(--fg); background: transparent; border: 1px solid var(--line); outline-color: currentColor; }');
  fine('.a { content: "red"; font-family: Georgia, serif; } /* color: #fff; */');
  fine('@supports not (color: color-mix(in srgb, red 50%, blue)) { .a { background: var(--line); } }'); // a feature test
});

test('src/styles/*.css: every color outside the token blocks is a var(--token)', () => {
  // The `red` and `blue` in the @supports condition for color-mix() are a feature test, not a painted color, and the scan
  // does not read an at-rule's condition as a declaration.
  assert.deepEqual(findLiteralColors(readStyles()), []);
});

test('the page HTML paints no literal color: no style attribute or fill/stroke/color attribute with one', () => {
  const files = [join(fileURLToPath(SRC), 'index.html')];
  const found = [];
  for (const file of files) {
    const html = readFileSync(file, 'utf8').replace(/<!--[\s\S]*?-->/g, '');
    for (const [, style] of html.matchAll(/\sstyle="([^"]*)"/g)) {
      for (const declaration of findLiteralColors(`.x{${style};}`)) {
        found.push(`${file}: style ${declaration.property}: ${declaration.value}`);
      }
    }
    for (const [, name, value] of html.matchAll(/\s(fill|stroke|color|bgcolor|stop-color|flood-color)="([^"]*)"/gi)) {
      if (findLiteralColors(`.x{${name}:${value};}`).length) {
        found.push(`${file}: ${name}="${value}"`);
      }
    }
    for (const [block] of html.matchAll(/<style[\s\S]*?<\/style>/g)) {
      found.push(`${file}: a <style> block (${block.slice(0, 30)})`);
    }
  }
  assert.deepEqual(found, []);
});

/* The quoted colors in the .js and .ts files under `dir`, as "file: match". */
function quotedColors(dir: string): string[] {
  const found: string[] = [];
  for (const file of walk(dir).filter(f => /\.(js|ts)$/.test(f))) {
    const code = readFileSync(file, 'utf8');
    for (const [match] of code.matchAll(/['"`]\s*(#[0-9a-f]{3,8}|(?:rgba?|hsla?)\([^'"`)]*\))\s*['"`]/gi)) {
      found.push(`${file}: ${match}`);
    }
  }
  return found;
}

test('the UI scripts hold no quoted color literal (a style set from script would ignore the theme)', () => {
  assert.deepEqual(quotedColors(fileURLToPath(new URL('ui/', SRC))), []);
});

/* the scan reads .ts files too: a planted .ts stray with a quoted color is found, a clean one is not. */
test('the scan sees a quoted color in a .ts file', () => {
  const base = mkdtempSync(join(tmpdir(), 'theme-tokens-ts-'));
  try {
    writeFileSync(join(base, 'stray.ts'), "export const paint: string = '#ff0000';\n");
    writeFileSync(join(base, 'fine.ts'), "export const paint: string = 'var(--fg)';\n");
    assert.deepEqual(quotedColors(base), [`${join(base, 'stray.ts')}: '#ff0000'`]);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('the light and the dark token lists name the same tokens; the system-dark and forced-dark lists are equal', () => {
  const tokens = readThemeTokens(readStyles());
  assert.deepEqual(tokens.darkSetting, tokens.darkForced);
  const changed = Object.keys(tokens.darkForced);
  assert.ok(changed.length >= 20, `only ${changed.length} dark tokens`);
  for (const name of changed) {
    assert.ok(name in tokens.light, `${name} is dark only`);
  }
  // the colors that must differ between the schemes for the page to have a dark mode
  for (const name of ['--bg', '--surface', '--fg', '--muted', '--line', '--accent']) {
    assert.notEqual(tokens.light[name], tokens.darkForced[name], name);
  }
});
