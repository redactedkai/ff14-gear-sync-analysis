/* The view a set page draws (src/ui/components/set-page/view.js) bound to a real sheet store, as Alpine binds it: built once
   per change, however often it is read; the Food menu only when read. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bind, twoToFill } from './helpers/set-page-bind.js';

const FEET = 6;

test('a Fill result builds the page view once, however often it is read; the Food menu is built only when read', async () => {
  const { c } = bind(twoToFill());
  let builds = 0;
  const build = c.buildView;
  c.buildView = (...args) => {
    builds++;
    return build.apply(c, args);
  };
  await c.fill();
  builds = 0;
  const first = c.view;
  for (let i = 0; i < 70; i++) assert.equal(c.view, first);
  assert.equal(builds, 1, 'one build for the result');
  assert.equal('mealMenu' in first, false, 'the Food menu is not part of the view');
  const menu = c.mealMenuView;
  assert.ok(menu.groups.length, 'the Food menu lists meals');
  assert.equal(c.mealMenuView, menu, 'and is kept until the view changes');

  // a Take box is a new suggestion: one more build, and the Food menu is built again for it
  c.setTake(FEET, false);
  for (let i = 0; i < 70; i++) c.view;
  assert.equal(builds, 2);
  assert.notEqual(c.mealMenuView, menu);
});
