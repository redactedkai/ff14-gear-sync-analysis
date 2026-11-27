/* The layout stress tool's rules (scripts/layout-stress/rules.ts) on small made-up measures. Boxes are {l, t, r, b} in px. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  RULES,
  compareScopes,
  describeKeyChange,
  findBoxRowProblems,
  findOutside,
  findOverlaps,
  findWrappedLabels,
  groupRows,
  judgeDialog,
  judgeMenu,
  judgeRowsVisible,
  layoutKey,
  makeFindings,
  rowCount,
  rowShape,
  rowsIncreaseWhenWidening,
  rulesMarkdown,
  severityOf,
} from '../../../../scripts/layout-stress/rules.ts';

const control = (id: string, l: number, t: number, r: number, b: number, extra: Record<string, unknown> = {}) => ({
  id,
  l,
  t,
  r,
  b,
  c: -1,
  up: -1,
  ...extra,
});

test('every rule has a severity of fail or warn, an unknown rule throws, and the table lists every rule', () => {
  for (const [id, [severity, text]] of Object.entries(RULES)) {
    assert.ok(['fail', 'warn'].includes(severity), id);
    assert.ok(text.length > 10, id);
  }
  assert.throws(() => severityOf('no-such-rule'), /unknown rule/);
  assert.equal(
    rulesMarkdown()
      .split('\n')
      .filter(line => line.startsWith('| ')).length,
    Object.keys(RULES).length + 2,
  );
  const found = makeFindings();
  found.add('no-overlap', 'a and b', 'head');
  assert.deepEqual(found.list, [{ rule: 'no-overlap', severity: 'fail', detail: 'a and b', where: 'head' }]);
});

test('controls whose tops are within 3 px share a row; rows run top to bottom, left to right', () => {
  const controls = [control('c', 200, 52, 260, 80), control('a', 0, 10, 50, 40), control('b', 60, 12, 120, 40)];
  assert.deepEqual(
    groupRows(controls).map(row => row.map(item => item.id)),
    [['a', 'b'], ['c']],
  );
  assert.equal(rowCount(controls), 2);
  assert.equal(rowShape(controls), 'a+b / c');
});

test('a control past its container by more than 1 px is outside; a scrolling container is skipped', () => {
  const containers = [
    { id: 'panel', l: 0, t: 0, r: 100, b: 50, scrolls: false },
    { id: 'wrap', l: 0, t: 0, r: 100, b: 50, scrolls: true },
  ];
  const controls = [
    control('in', 10, 10, 100.5, 40, { c: 0 }),
    control('out', 10, 10, 130, 40, { c: 0 }),
    control('scrolled', 10, 10, 300, 40, { c: 1 }),
    control('none', 0, 0, 999, 9, { c: -1 }),
  ];
  assert.deepEqual(findOutside(controls, containers), [{ id: 'out', container: 'panel', by: 30 }]);
});

test('overlap: two boxes that cross by more than 2 px both ways; touching boxes and a control inside another do not', () => {
  const controls = [
    control('a', 0, 0, 100, 30),
    control('b', 99, 0, 200, 30), // touches a by 1 px
    control('c', 50, 10, 150, 40), // crosses a and b
    control('outer', 300, 0, 400, 30),
    control('inner', 310, 5, 340, 25, { up: 3 }), // a control inside a control
  ];
  assert.deepEqual(findOverlaps(controls), [
    ['a', 'c'],
    ['b', 'c'],
  ]);
});

test('a label with more than one line wraps', () => {
  assert.deepEqual(
    findWrappedLabels([
      { id: 'ok', lines: 1 },
      { id: 'wraps', lines: 2 },
    ]),
    ['wraps'],
  );
});

test('boxes in a row: a different height or top is a problem, boxes in other rows are not compared', () => {
  const row = [
    { id: 'a', l: 0, t: 0, r: 50, b: 40 },
    { id: 'b', l: 60, t: 0, r: 110, b: 44 },
    { id: 'c', l: 120, t: 5, r: 170, b: 45 },
    { id: 'below', l: 0, t: 100, r: 50, b: 150 },
  ];
  const problems = findBoxRowProblems(row);
  assert.deepEqual(
    problems.map(problem => [problem.kind, problem.spread]),
    [
      ['height', 4],
      ['top', 5],
    ],
  );
  assert.deepEqual(problems[0].ids, ['a', 'b', 'c']);
  assert.deepEqual(findBoxRowProblems([row[0], { id: 'same', l: 60, t: 0.5, r: 110, b: 40.5 }]), []);
});

test('widening that gives a scope more rows is found, going the other way is not', () => {
  const series = [
    { width: 1000, rows: { bar: 2, list: 1 } },
    { width: 1200, rows: { bar: 1, list: 1 } },
    { width: 1300, rows: { bar: 2, list: 1 } }, // more rows at a larger width
    { width: 1100, rows: { bar: 1, list: 1 } }, // out of order: sorted first
  ];
  assert.deepEqual(rowsIncreaseWhenWidening(series), [{ scope: 'bar', from: { width: 1200, rows: 1 }, to: { width: 1300, rows: 2 } }]);
});

test('two measures of one scope: the same shape and sizes match; a moved control, another height and another shape are found', () => {
  const first = { rect: { t: 100 }, height: 50, controls: [control('a', 0, 100, 60, 130), control('b', 70, 100, 130, 130)] };
  const sameDown = { rect: { t: 160 }, height: 50, controls: [control('a', 0, 160, 60, 190), control('b', 70, 160, 130, 190)] };
  assert.deepEqual(compareScopes(first, sameDown), []); // the scope moved down as a whole
  const moved = { rect: { t: 100 }, height: 50, controls: [control('a', 0, 100, 60, 130), control('b', 80, 100, 140, 130)] };
  assert.deepEqual(compareScopes(first, moved), ['b moved 10 px']);
  const taller = { ...first, height: 70 };
  assert.deepEqual(compareScopes(first, taller), ['height 50 against 70 px']);
  const wrapped = { rect: { t: 100 }, height: 80, controls: [control('a', 0, 100, 60, 130), control('b', 0, 140, 60, 170)] };
  assert.deepEqual(compareScopes(first, wrapped), ['rows "a+b" against "a / b"']);
});

test("the layout key changes with a scope's rows, sideways scroll and wrapped labels, and the change is described", () => {
  const probe = (rows: ReturnType<typeof control>[], extra: Record<string, unknown> = {}) => ({
    scopes: { bar: { controls: rows } },
    hscroll: false,
    wrapped: [],
    clipped: [],
    ...extra,
  });
  const one = probe([control('a', 0, 0, 10, 10), control('b', 20, 0, 30, 10)]);
  const two = probe([control('a', 0, 0, 10, 10), control('b', 0, 20, 10, 30)]);
  assert.notEqual(layoutKey(one), layoutKey(two));
  assert.deepEqual(describeKeyChange(one, two), ['bar: a+b -> a / b']);
  const scrolls = probe(one.scopes.bar.controls, { hscroll: true });
  assert.notEqual(layoutKey(one), layoutKey(scrolls));
  assert.deepEqual(describeKeyChange(one, scrolls), ['hscroll: false -> true']);
});

test('rows under the pinned header: fewer than 2 fail, 2 warn, and a pinned share over 40% warns', () => {
  assert.deepEqual(
    judgeRowsVisible({ visible: 1, stack: 200, windowHeight: 700 }).map(item => item.rule),
    ['rows-visible'],
  );
  assert.equal(severityOf('rows-visible'), 'fail');
  assert.equal(judgeRowsVisible({ visible: 2, stack: 200, windowHeight: 700 }).length, 1);
  assert.deepEqual(judgeRowsVisible({ visible: 5, stack: 200, windowHeight: 700 }), []);
  assert.deepEqual(
    judgeRowsVisible({ visible: 5, stack: 300, windowHeight: 700 }).map(item => item.rule),
    ['pinned-share'],
  );
});

test('a menu must end inside the window, stay between its sides, start under the pinned header and not be covered', () => {
  const ok = { top: 100, bottom: 400, left: 10, right: 300, windowWidth: 960, windowHeight: 700, stack: 90, coveredPoints: 0 };
  assert.deepEqual(judgeMenu(ok), []);
  assert.deepEqual(
    judgeMenu({ ...ok, bottom: 720 }).map(item => item.rule),
    ['menu-inside-window'],
  );
  assert.deepEqual(
    judgeMenu({ ...ok, right: 980 }).map(item => item.rule),
    ['menu-inside-window'],
  );
  assert.deepEqual(
    judgeMenu({ ...ok, top: 60 }).map(item => item.rule),
    ['menu-below-pinned-header'],
  );
  assert.deepEqual(
    judgeMenu({ ...ok, coveredPoints: 2 }).map(item => item.rule),
    ['menu-not-clipped'],
  );
});

test('a dialog taller than the window fails unless it scrolls inside itself', () => {
  assert.deepEqual(
    judgeDialog({ top: -20, bottom: 720, height: 740, windowHeight: 700, scrolls: false }).map(item => item.rule),
    ['dialog-fits'],
  );
  assert.deepEqual(judgeDialog({ top: -20, bottom: 720, height: 740, windowHeight: 700, scrolls: true }), []);
  assert.deepEqual(judgeDialog({ top: 50, bottom: 400, height: 350, windowHeight: 700, scrolls: false }), []);
});

test('a control placed over its field on purpose is not an overlap, and a finding can carry a lesser severity than its rule', () => {
  const controls = [control('input', 0, 0, 200, 40), control('clear', 170, 8, 190, 32, { overlay: true })];
  assert.deepEqual(findOverlaps(controls), []);
  assert.deepEqual(
    judgeRowsVisible({ visible: 2, stack: 100, windowHeight: 700 }).map(item => item.severity),
    ['warn'],
  );
  assert.deepEqual(
    judgeRowsVisible({ visible: 1, stack: 100, windowHeight: 700 }).map(item => item.severity),
    ['fail'],
  );
  const found = makeFindings();
  found.add('rows-visible', '2 rows', 'set', 'warn');
  assert.equal(found.list[0].severity, 'warn');
});

test('with commonOnly, controls only one measure has (a menu opened inside the scope) are left out of the comparison', () => {
  const closed = { rect: { t: 0 }, height: 50, controls: [control('a', 0, 0, 60, 30), control('b', 70, 0, 130, 30)] };
  const open = { ...closed, controls: [...closed.controls, control('menu-item', 0, 40, 60, 70)] };
  assert.deepEqual(compareScopes(closed, open, 1.5, true), []);
  assert.deepEqual(compareScopes(closed, open), ['rows "a+b" against "a+b / menu-item"']);
  const moved = { ...open, controls: [control('a', 0, 0, 60, 30), control('b', 90, 0, 150, 30), control('menu-item', 0, 40, 60, 70)] };
  assert.deepEqual(compareScopes(closed, moved, 1.5, true), ['b moved 20 px']);
});
