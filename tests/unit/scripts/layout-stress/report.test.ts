/* The layout stress tool's report (scripts/layout-stress/report.mjs): grouping, escaping and the page's sections, on made-up findings. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FONT_SETUPS } from '../../../../scripts/layout-stress/matrix.mjs';
import { escapeHtml, groupFindings, renderReport, shortList, windowRows } from '../../../../scripts/layout-stress/report.mjs';

const finding = (rule: string, severity: string, window: string, extra: Record<string, unknown> = {}) => ({
  rule,
  severity,
  screen: 'gear',
  view: 'gear',
  setup: 'page',
  browser: 'chromium',
  where: 'strip',
  detail: 'text',
  window,
  ...extra,
});

test('html text is escaped, and a long list is shortened with a count', () => {
  assert.equal(escapeHtml('<b a="1">&'), '&lt;b a=&quot;1&quot;&gt;&amp;');
  assert.equal(shortList(['a', 'b'], 5), 'a, b');
  assert.equal(shortList(['a', 'b', 'c', 'd', 'e', 'f', 'g'], 5), 'a, b, c, d, e and 2 more');
});

test('the same finding in other windows is one row with its windows, failures first', () => {
  const groups = groupFindings([
    finding('label-one-line', 'warn', '960x700'),
    finding('no-overlap', 'fail', '960x700'),
    finding('no-overlap', 'fail', '1265x565'),
    finding('no-overlap', 'fail', '960x700'),
  ]);
  assert.deepEqual(
    groups.map(group => [group.rule, group.windows]),
    [
      ['no-overlap', ['960x700', '1265x565']],
      ['label-one-line', ['960x700']],
    ],
  );
});

test('the rows do not depend on which window finished first: the detail and the windows go by window size', () => {
  const small = finding('pinned-share', 'warn', '960x700', { detail: '45% of the window pinned (312 of 700 px)' });
  const large = finding('pinned-share', 'warn', '1265x565', { detail: '50% of the window pinned (284 of 565 px)' });
  const wide = finding('pinned-share', 'warn', '2545x1285', { detail: '20% of the window pinned (257 of 1285 px)' });
  const first = groupFindings([large, wide, small]);
  assert.deepEqual(groupFindings([small, wide, large]), first);
  assert.deepEqual(groupFindings([wide, large, small]), first);
  assert.deepEqual([first[0].windows, first[0].detail], [['960x700', '1265x565', '2545x1285'], small.detail]);
});

test('the window rows of a screen and setup count failures and warnings and name the rules', () => {
  const results = [
    {
      browser: 'chromium',
      setup: 'page',
      screen: 'gear',
      window: '1905x925',
      setups: [{ physical: '1920x1080', scale: 1 }],
      findings: [finding('no-overlap', 'fail', 'x'), finding('label-one-line', 'warn', 'x')],
    },
    { browser: 'chromium', setup: 'page', screen: 'gear', window: '960x700', setups: [], findings: [] },
    { browser: 'webkit', setup: 'page', screen: 'gear', window: '960x700', setups: [], findings: [] },
  ];
  const rows = windowRows(results, { browser: 'chromium', screen: 'gear', setup: 'page' });
  assert.deepEqual(
    rows.map((row: { window: string; fails: number; warns: number; rules: string[] }) => [row.window, row.fails, row.warns, row.rules]),
    [
      ['960x700', 0, 0, []],
      ['1905x925', 1, 1, ['label-one-line', 'no-overlap']],
    ],
  );
  assert.equal(rows[1].covers, '1920x1080 at 100%');
});

test('the report is one page with the findings, the windows, the breakpoints and what waits for the math bar', () => {
  const html = renderReport({
    options: { browsers: ['chromium'], quick: true },
    screens: [{ id: 'gear', label: 'Gear browser' }],
    waiting: [{ id: 'math-piece', label: 'Stat Allocation', waiting: 'waiting for the math bar port' }],
    setups: FONT_SETUPS.slice(0, 1),
    windows: [{ key: '960x700' }],
    heights: [700],
    findings: [finding('no-overlap', 'fail', '960x700', { detail: 'a <b> and c' })],
    knownLines: ['KNOWN FAILURE (x, gear): y'],
    staleLines: [],
    breakpoints: [
      {
        browser: 'chromium',
        setup: 'page',
        screen: 'gear',
        view: 'gear',
        height: 700,
        measured: 21,
        changes: [{ at: 1100, changes: ['strip: a -> a / b'] }],
      },
    ],
    windowResults: [{ browser: 'chromium', setup: 'page', screen: 'gear', window: '960x700', setups: [], findings: [] }],
    browserNotes: [],
    seconds: 5,
    pageFonts: false,
  });
  assert.match(html, /^<!doctype html>/);
  assert.match(html, /1 failure\(s\), 0 warning\(s\), 1 known failure\(s\)/);
  assert.match(html, /a &lt;b&gt; and c/);
  assert.match(html, /<b>1100 px<\/b>/);
  assert.match(html, /waiting for the math bar port/);
  assert.match(html, /did NOT load/);
  assert.match(html, /Customizable selects/);
  assert.doesNotMatch(html, /<script/);
});
