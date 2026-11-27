/* The known failures of the layout stress tool (scripts/layout-stress/known-failures.mjs): a listed finding does not fail the run, and a listed finding that stops happening does. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KNOWN_FAILURES, applyKnownFailures } from '../../../../scripts/layout-stress/known-failures.mjs';

const finding = (rule, screen, view, extra = {}) => ({
  rule,
  severity: 'fail',
  screen,
  view,
  setup: 'page',
  browser: 'chromium',
  window: '960x700',
  ...extra,
});

test('a finding an entry lists is taken out and printed as a KNOWN FAILURE line', () => {
  const known = [{ rule: 'no-overlap', screen: 'gear', note: 'the Reset button overlaps the count' }];
  const findings = [
    finding('no-overlap', 'gear', 'gear'),
    finding('no-overlap', 'gear', 'gear-empty'),
    finding('no-overlap', 'sheets', 'manager'),
  ];
  const { fresh, knownLines, stale } = applyKnownFailures(findings, known);
  assert.deepEqual(fresh, [findings[2]]);
  assert.deepEqual(knownLines, ['KNOWN FAILURE (no-overlap, gear): the Reset button overlaps the count [2 finding(s)]']);
  assert.deepEqual(stale, []);
});

test('an entry that names a view, setup or browser matches only that one', () => {
  const known = [{ rule: 'label-one-line', screen: 'set', view: 'set', setup: 'text200', browser: 'webkit', note: 'n' }];
  const findings = [
    finding('label-one-line', 'set', 'set', { setup: 'text200', browser: 'webkit' }),
    finding('label-one-line', 'set', 'set', { setup: 'text200', browser: 'chromium' }),
  ];
  assert.equal(applyKnownFailures(findings, known).fresh.length, 1);
});

test('an entry that matched nothing is stale: the listed finding stopped happening', () => {
  const known = [{ rule: 'no-overlap', screen: 'gear', note: 'gone' }];
  const { fresh, knownLines, stale } = applyKnownFailures([finding('label-one-line', 'gear', 'gear')], known);
  assert.equal(fresh.length, 1);
  assert.deepEqual(knownLines, []);
  assert.deepEqual(stale, known);
});

test('every entry in the repo names a rule, a screen and a note', () => {
  for (const entry of KNOWN_FAILURES) {
    assert.ok(entry.rule && entry.screen && entry.note, JSON.stringify(entry));
  }
});
