/* The view cache and deepFreeze (src/ui/view-cache.ts). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deepFreeze, viewCache } from '../../../src/ui/view-cache.ts';

test('viewCache: a view is built once per key; last() is the last one built, null before any', () => {
  const views = viewCache<{ value: number } | null>();
  let builds = 0;
  const build = (value: number) => () => {
    builds++;
    return { value };
  };
  assert.equal(views.last(), null);
  const a = views.get('a', build(1));
  assert.equal(views.get('a', build(2)), a);
  assert.equal(builds, 1);
  const b = views.get('b', build(3));
  assert.deepEqual([b?.value, views.last()], [3, b]);
  assert.notEqual(views.get('a', build(4)), a, 'only the last key is kept');
  // a view of null counts as built
  const none = () => {
    builds++;
    return null;
  };
  views.get('none', none);
  views.get('none', none);
  assert.equal(builds, 4);
});

test('deepFreeze: freezes every object and array inside, returns the same value, leaves others as they are', () => {
  const view = { rows: [{ cells: [{ value: 48 }] }], label: 'x', none: null };
  assert.equal(deepFreeze(view), view);
  assert.ok(Object.isFrozen(view) && Object.isFrozen(view.rows) && Object.isFrozen(view.rows[0].cells[0]));
  assert.throws(() => {
    view.rows[0].cells[0].value = 1;
  }, TypeError);
  assert.equal(deepFreeze(null), null);
  assert.equal(deepFreeze(7), 7);
});
