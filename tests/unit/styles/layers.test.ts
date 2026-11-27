/* The stylesheet's cascade layers (src/styles/entry.css): every rule is inside a named layer, because a rule outside every layer
   beats all layered rules whatever their specificity, and every layer a block uses is named in the order statement. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readStyles } from '../../../scripts/build/styles.ts';

/* The top-level constructs of `css` (comments removed): {head, hasBlock}, where head is the text before the `{` or the `;`. */
function topLevel(css: string): { head: string; hasBlock: boolean }[] {
  const found: { head: string; hasBlock: boolean }[] = [];
  let depth = 0;
  let start = 0;
  for (let at = 0; at < css.length; at++) {
    const char = css[at];
    if (char === '{') {
      if (depth === 0) {
        found.push({ head: css.slice(start, at).trim(), hasBlock: true });
      }
      depth++;
    } else if (char === '}') {
      depth--;
      if (depth === 0) {
        start = at + 1;
      }
    } else if (char === ';' && depth === 0) {
      found.push({ head: css.slice(start, at).trim(), hasBlock: false });
      start = at + 1;
    }
  }
  return found;
}

const constructs = topLevel(readStyles().replace(/\/\*[\s\S]*?\*\//g, ''));
const order = constructs.find(item => !item.hasBlock && item.head.startsWith('@layer'));
const declared = order
  ? order.head
      .replace('@layer', '')
      .split(',')
      .map((name: string) => name.trim())
  : [];

test('the stylesheet names its layers once, first, in one @layer statement', () => {
  assert.ok(order, 'no @layer order statement');
  assert.equal(constructs[0], order, 'the order statement is not the first thing in the stylesheet');
  assert.equal(constructs.filter(item => !item.hasBlock).length, 1, 'a statement other than the order statement');
  assert.ok(declared.length >= 2, 'fewer than two layers');
});

test('every rule is inside a layer named in the order statement', () => {
  const outside = constructs.filter(item => item.hasBlock && !item.head.startsWith('@layer ')).map(item => item.head);
  assert.deepEqual(outside, [], 'a rule outside every layer');
  // a sublayer `parent.child` counts as its parent: the order statement names the top layers
  const used = [...new Set(constructs.filter(item => item.hasBlock).map(item => item.head.replace('@layer ', '').trim().split('.')[0]))];
  assert.deepEqual(
    used.filter(name => !declared.includes(name)),
    [],
    'a layer the order statement does not name',
  );
  assert.deepEqual(
    declared.filter(name => !used.includes(name)),
    [],
    'a layer in the order statement that no file uses',
  );
});
