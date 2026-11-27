/* The view a set page draws (src/ui/views/set-page.ts) over a real sheet store: built once per change, however often it is read;
   the Food menu only when read. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bind, twoToFill } from '../../helpers/set-page-bind.ts';

const FEET = 6;

test('an Auto-fill result builds the page view once, however often it is read; the Food menu is built only when read', async () => {
  const { session, view, mealMenu } = bind(twoToFill());
  await session.fill.fill();
  const first = view();
  for (let i = 0; i < 70; i++) {
    assert.equal(view(), first);
  }
  assert.equal('mealMenu' in first, false, 'the Food menu is not part of the view');
  const menu = mealMenu();
  assert.ok(menu.groups.length, 'the Food menu lists meals');
  assert.equal(mealMenu(), menu, 'and is kept until the view changes');

  // a Take box is a new suggestion: a new view, and the Food menu is built again for it
  session.fill.setTake(FEET, false);
  assert.notEqual(view(), first);
  assert.notEqual(mealMenu(), menu);
});
