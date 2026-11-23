/* The dialogs' backdrop (src/styles/sheets.css, `.dlg::backdrop`) reads the --backdrop token, which a ::backdrop inherits from
   :root only in Chrome 122, Firefox 120 and Safari 17.4 and later. Older browsers use the fallback value written after the
   comma, once for the light theme and once for each way of choosing the dark one. Those literals must equal the token's own
   values in src/styles/tokens.css, so a change of the token fails here until the fallback follows. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readStyles } from '../../../scripts/build/styles.mjs';
import { readThemeTokens, tokenColor } from '../../e2e/lib/visual.mjs';

const css = readStyles().replace(/\/\*[\s\S]*?\*\//g, '');
const tokens = readThemeTokens(css);

/* The fallback colour of the `.dlg::backdrop` rule whose selector is `selector`, as [r, g, b, alpha]. */
function fallbackOf(selector) {
  const rule = css.indexOf(`${selector} .dlg::backdrop {`);
  assert.ok(rule >= 0, `no ${selector} .dlg::backdrop rule`);
  const body = css.slice(css.indexOf('{', rule) + 1, css.indexOf('}', rule));
  const match = /background:\s*var\(--backdrop,\s*([^)]*\))\s*\)/.exec(body);
  assert.ok(match, `the ${selector} rule has no var(--backdrop, <fallback>)`);
  return tokenColor(match[1].trim());
}

test('the backdrop fallback of the light theme is the light --backdrop token', () => {
  const rule = /(?:^|\})\s*\.dlg::backdrop \{([^}]*)\}/.exec(css);
  assert.ok(rule, 'no plain .dlg::backdrop rule');
  const fallback = tokenColor(/var\(--backdrop,\s*([^)]*\))\s*\)/.exec(rule[1])[1].trim());
  assert.deepEqual(fallback, tokenColor(tokens.light['--backdrop']));
});

test('the backdrop fallback of the system-dark and the forced-dark theme is the dark --backdrop token', () => {
  assert.deepEqual(fallbackOf(':root:not([data-theme="light"])'), tokenColor(tokens.darkSetting['--backdrop']));
  assert.deepEqual(fallbackOf(':root[data-theme="dark"]'), tokenColor(tokens.darkForced['--backdrop']));
});

test('the two themes differ, so a fallback copied to the wrong theme would be caught', () => {
  assert.notDeepEqual(tokenColor(tokens.light['--backdrop']), tokenColor(tokens.darkForced['--backdrop']));
});
