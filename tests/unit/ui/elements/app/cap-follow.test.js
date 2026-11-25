/* What the item level field does after its inputs changed while it follows the level (src/ui/elements/app/cap-follow.ts): the rule the
   Gear browser's strip and Stat Allocation's Sync settings had as seven watchers, with the lowering itself (limitCapToLevel) checked in
   ui/level-cap.test.js. A hidden panel never lowers or flags the open one's cap; the cap the field lowered to is no reason to lower
   again; the level waits for its typing to settle. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { followPlan } from '../../../../../src/ui/elements/app/cap-follow.ts';

const NOTHING = { reset: false, dropTyped: false, lowerNow: false, lowerWhenLevelSettles: false };
const plan = (changed, { active = true, loweredTo = null, cap = 300 } = {}) => followPlan(new Set(changed), active, loweredTo, cap);

test('a hidden panel only resets when its tab changes; it never lowers or drops text', () => {
  assert.deepEqual(plan(['value', 'syncOn', 'level'], { active: false }), NOTHING);
  assert.deepEqual(plan(['active'], { active: false }), { ...NOTHING, reset: true });
  assert.deepEqual(plan(['scope']).reset, true);
});

test('a stored cap that changed ends the text typed and is lowered at once, unless it is the cap the field itself lowered to', () => {
  assert.deepEqual(plan(['value']), { ...NOTHING, dropTyped: true, lowerNow: true });
  assert.deepEqual(plan(['value'], { loweredTo: 300 }), { ...NOTHING, dropTyped: true });
  assert.equal(plan(['value'], { loweredTo: 135, cap: 400 }).lowerNow, true, 'a new cap after a lowering is checked again');
});

test('IL Sync switched is checked at once; a level that changed is checked once it settles', () => {
  assert.deepEqual(plan(['syncOn']), { ...NOTHING, lowerNow: true });
  assert.deepEqual(plan(['level']), { ...NOTHING, lowerWhenLevelSettles: true });
  assert.deepEqual(plan([]), NOTHING);
});

test('a tab that opens checks its cap against its level at once: a level or job change made just before the tab was left was not checked', () => {
  assert.deepEqual(plan(['active']), { ...NOTHING, reset: true, lowerNow: true });
});
