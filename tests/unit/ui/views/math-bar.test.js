/* The math bar's Stat Allocation controls (src/ui/views/math-bar.js): what the Slot menu, the substat menus, the Materia slots menu and
   the Gear item level slider show, and the edits they make to the example piece. Sage under item level sync 123 is the example (the
   owner's job); the accessories and the armor give the two kinds of materia slot choices. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeJobContext } from '../../../../src/core/job-context.ts';
import { syncSettings } from '../../../../src/ui/job-sync-panel.ts';
import { MATH_TAB_LABEL } from '../../../../src/ui/router/routes.ts';
import { MATH_TABS } from '../../../../src/ui/state.ts';
import { MATH_SUB_TABS, ilvlEdit, ilvlFill, mathBarView, slotEdit, subsEdit } from '../../../../src/ui/views/math-bar.js';
import { NO_SUBSTAT_LABEL, explainerItemLevel, pieceChipView } from '../../../../src/ui/views/sync-explainer.js';

const sage = makeJobContext('SGE');
const sync = syncSettings({ cap: 123, sync: true, level: 85 });
const piece = { ilvl: null, slot: 'head', subs: ['crit', 'sps'], slots: null };

test('the bar offers the math views of the router, Stat Allocation first, each under the name the page title uses', () => {
  assert.deepEqual(
    MATH_SUB_TABS.map(tab => [tab.sub, tab.label]),
    MATH_TABS.map(view => [view, MATH_TAB_LABEL[view]]),
  );
  assert.equal(MATH_SUB_TABS[0].sub, 'piece');
});

test('Slot menu: a choice per group of slots that share a budget share, and the group of the open slot is the one shown', () => {
  const view = mathBarView(sage, sync, { ...piece, slot: 'hands' });
  assert.deepEqual(
    view.slotOptions.map(option => option.label),
    ['Weapon', 'Head / Hands / Feet', 'Body / Legs', 'Accessories'],
  );
  assert.equal(view.slotValue, 'head', 'the group is named by its first slot');
});

test('substat menus: the 1st offers every substat, the 2nd none and the others; the chip and the slider say the same piece', () => {
  const view = mathBarView(sage, sync, piece);
  assert.deepEqual(
    view.firstOptions.map(option => option.value),
    sage.substats,
  );
  assert.deepEqual(
    view.secondOptions.map(option => option.value),
    ['', ...sage.substats.filter(stat => stat !== 'crit')],
  );
  assert.equal(view.secondOptions[0].label, NO_SUBSTAT_LABEL);
  assert.deepEqual([view.firstValue, view.secondValue], ['crit', 'sps']);
  assert.deepEqual(view.chip, pieceChipView(sage, piece));
  const pick = explainerItemLevel(sage, sync, piece);
  assert.deepEqual([view.range, view.il], [pick.range, pick.il]);
  assert.equal(view.il, 123, 'with no item level chosen the slider sits at the cap');
  assert.equal(mathBarView(sage, sync, { ...piece, subs: ['crit', null] }).secondValue, '', 'no 2nd substat is the empty choice');
});

test('Materia slots menu: the totals the slot has, the usual one shown unless chosen', () => {
  const armor = mathBarView(sage, sync, piece);
  assert.deepEqual(
    armor.slotsOptions.map(option => option.value),
    ['0', '2', '5'],
  );
  assert.equal(armor.slotsValue, '2', 'the usual total of armor');
  const ring = mathBarView(sage, sync, { ...piece, slot: 'ring', slots: 5 });
  assert.equal(ring.slotsValue, '5');
});

test('a slot change keeps the materia slots chosen when the new slot has that total, else goes back to its usual one', () => {
  assert.deepEqual(slotEdit({ slots: 5 }, 'ring'), { slot: 'ring' }, '5 is fine on a ring');
  assert.deepEqual(slotEdit({ slots: 1 }, 'head'), { slot: 'head', slots: null }, 'no armor has 1');
  assert.deepEqual(slotEdit({ slots: null }, 'ear'), { slot: 'ear', slots: null });
});

test('a substat chosen as the other menu holds swaps the two; the 2nd can be emptied', () => {
  assert.deepEqual(subsEdit({ subs: ['crit', 'sps'] }, 0, 'sps', sage), { subs: ['sps', 'crit'] });
  assert.deepEqual(subsEdit({ subs: ['crit', 'sps'] }, 1, '', sage), { subs: ['crit', null] });
});

test('item level box: a value is held to the slider, a number with a fraction is rounded, text that is no number changes nothing', () => {
  const range = [100, 200];
  assert.deepEqual(ilvlEdit('250', range), { ilvl: 200 });
  assert.deepEqual(ilvlEdit('50', range), { ilvl: 100 });
  assert.deepEqual(ilvlEdit('150.6', range), { ilvl: 151 });
  assert.equal(ilvlEdit('abc', range), null);
  assert.equal(ilvlEdit(undefined, range), null);
});

test('the slider track is drawn filled up to the thumb: empty at the lowest item level, full at the highest, none with one level', () => {
  assert.equal(ilvlFill([100, 200], 100), 0);
  assert.equal(ilvlFill([100, 200], 150), 50);
  assert.equal(ilvlFill([100, 200], 200), 100);
  assert.equal(ilvlFill([100, 100], 100), 0);
});
