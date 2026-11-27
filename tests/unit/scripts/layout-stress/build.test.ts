/* The layout stress tool's private builds (scripts/layout-stress/build.ts): the patches of the stress build apply to the page's source as it is now. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT, STRESS_ITEM_LEVEL, STRESS_LEVEL, STRESS_PATCHES, applyPatch } from '../../../../scripts/layout-stress/build.ts';

test('a patch replaces its text, and throws when the text is not in the source any more', () => {
  const patch = { file: 'x.js', from: 'MAX = 1;', to: 'MAX = 2;' };
  assert.equal(applyPatch('export const MAX = 1;\n', patch), 'export const MAX = 2;\n');
  assert.throws(() => applyPatch('export const LIMIT = 1;', patch), /does not apply/);
  assert.equal(applyPatch('a a a', { file: 'x', from: 'a', to: 'b', all: true }), 'b b b');
  assert.equal(applyPatch('a a a', { file: 'x', from: 'a', to: 'b' }), 'b a a');
});

test('every stress patch applies to the repository source as it is now (a moved limit is found here, not by a quiet run on the real limits)', () => {
  for (const patch of STRESS_PATCHES) {
    const text = readFileSync(join(REPO_ROOT, patch.file), 'utf8');
    assert.doesNotThrow(() => applyPatch(text, patch), patch.file);
  }
});

test('the stress build sets the level limit to 888 and the item level limit to 8888', () => {
  const tables = readFileSync(join(REPO_ROOT, 'src/core/tables.ts'), 'utf8');
  const patched = STRESS_PATCHES.filter(patch => patch.file === 'src/core/tables.ts').reduce(applyPatch, tables);
  assert.match(patched, /export const MAX_LEVEL = 888;/);
  assert.match(patched, /export const MAX_REAL = 8888;/);
  assert.equal(STRESS_LEVEL, 888);
  assert.equal(STRESS_ITEM_LEVEL, 8888);
});
