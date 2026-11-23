/* The smoke test's handling of axe-core findings (tests/e2e/lib/axe.mjs): which elements count as known, which violations
   stay new, and which known entries matched. The violations are shaped as axeViolations returns them. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitKnown } from '../../e2e/lib/axe.mjs';

const violation = (rule, targets) => ({ rule, impact: 'serious', help: `${rule} help`, targets });

test('splitKnown: no known entries leaves every violation new', () => {
  const found = [violation('region', ['.tabs']), violation('button-name', ['#a', '#b'])];
  const { fresh, matched } = splitKnown(found, []);
  assert.deepEqual(fresh, found);
  assert.equal(matched.size, 0);
});

test('splitKnown: an entry without a target covers every element of its rule', () => {
  const entry = { rule: 'region', note: 'x' };
  const { fresh, matched } = splitKnown([violation('region', ['.tabs', 'h2', 'p'])], [entry]);
  assert.deepEqual(fresh, []);
  assert.deepEqual([...matched], [entry]);
});

test('splitKnown: an entry with a target covers that element only; the others stay new', () => {
  const entry = { rule: 'label-content-name-mismatch', target: '#b-from', note: 'x' };
  const { fresh, matched } = splitKnown([violation('label-content-name-mismatch', ['#b-from', '#other'])], [entry]);
  assert.deepEqual(fresh, [violation('label-content-name-mismatch', ['#other'])]);
  assert.deepEqual([...matched], [entry]);
});

test('splitKnown: an entry with targetContains covers the elements whose selector holds that text', () => {
  const entry = { rule: 'aria-command-name', targetContains: '.draghandle', note: 'x' };
  const found = [violation('aria-command-name', ['tr[data-sheet="a"] .draghandle', 'tr[data-sheet="b"] .draghandle', '#close'])];
  const { fresh, matched } = splitKnown(found, [entry]);
  assert.deepEqual(fresh, [violation('aria-command-name', ['#close'])]);
  assert.deepEqual([...matched], [entry]);
});

test('splitKnown: an entry of another rule does not cover the element', () => {
  const entry = { rule: 'region', target: '#b-from', note: 'x' };
  const { fresh, matched } = splitKnown([violation('button-name', ['#b-from'])], [entry]);
  assert.equal(fresh.length, 1);
  assert.equal(matched.size, 0);
});

test('splitKnown: an entry that matches nothing is not reported as matched', () => {
  const unused = { rule: 'landmark-one-main', note: 'x' };
  const used = { rule: 'region', note: 'x' };
  const { matched } = splitKnown([violation('region', ['.tabs'])], [unused, used]);
  assert.deepEqual([...matched], [used]);
});
