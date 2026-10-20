/* Substat tiers' components (src/ui/components/tiers.js), bound to a plain store as Alpine binds them: the sub-tab's
   level, the values typed or clicked and when they are dropped, and the math bar's Level box. What the cards show is
   checked in ui-views-tiers.test.js. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { statBase } from '../../src/core/food.js';
import { tierControls, tierTable } from '../../src/ui/components/tiers.js';
import { restoreState } from '../../src/ui/state.js';
import { createAppStore } from '../../src/ui/store.js';
import { watched } from './helpers/common.js';

/* A component bound to the store of `saved`, as Alpine binds it ($store.app). */
function bound(members, saved) {
  const app = createAppStore(restoreState(saved));
  return { app, c: Object.assign(members, { $store: { app } }) };
}
const card = (view, stat) => view.cards.find(x => x.stat === stat);

test('tiers table: each value starts at its base; a typed or clicked value is kept until the job or a level changes', () => {
  const { app, c } = bound(tierTable(), { job: 'SGE', level: 50 });
  const job = app.jobCtx;
  assert.equal(c.level, 50);
  assert.equal(card(c.view, 'crit').value, statBase(job, 'crit', 50));
  // a typed value, held to the base; text that is no number is ignored
  const el = { value: '1' };
  c.type('crit', el);
  assert.deepEqual([card(c.view, 'crit').value, el.value], [statBase(job, 'crit', 50), statBase(job, 'crit', 50)]);
  el.value = '600';
  c.type('crit', el);
  assert.equal(card(c.view, 'crit').value, 600);
  el.value = 'abc';
  c.type('crit', el);
  assert.equal(card(c.view, 'crit').value, 600);
  // a tier clicked: its start
  c.pick('det:420');
  assert.deepEqual([card(c.view, 'crit').value, card(c.view, 'det').value], [600, 420]);
  // the sub-tab's own level changed: the values made at the old one are dropped
  app.tiers.level = 60;
  assert.equal(c.level, 60);
  assert.equal(card(c.view, 'crit').value, statBase(job, 'crit', 60));
  // a value set at the new level replaces them: back at the old level, the bases again
  c.pick('det:300');
  app.tiers.level = null;
  assert.equal(card(c.view, 'crit').value, statBase(job, 'crit', 50));
  // and the job
  c.pick('crit:500');
  app.setJob('WHM');
  assert.equal(card(c.view, 'crit').value, statBase(app.jobCtx, 'crit', 50));
});

/* Found by wave C (2026-10-19): values typed at one level were only hidden while the level differed, so going back to
   it brought them back (if nothing was typed in between). The comment above tierTable says they are dropped. */
test('tiers table: values dropped by a level change stay dropped when the level comes back', () => {
  const { app, c } = bound(tierTable(), { job: 'SGE', level: 50 });
  const settle = watched(c);
  c.pick('det:420');
  assert.equal(card(c.view, 'det').value, 420);
  app.tiers.level = 60;
  settle();
  app.tiers.level = null;
  settle();
  assert.equal(card(c.view, 'det').value, statBase(app.jobCtx, 'det', 50));
  // the same through the synced level, and the job
  c.pick('det:420');
  app.level = 60;
  settle();
  app.level = 50;
  settle();
  assert.equal(card(c.view, 'det').value, statBase(app.jobCtx, 'det', 50));
  c.pick('det:420');
  app.setJob('WHM');
  settle();
  app.setJob('SGE');
  settle();
  assert.equal(card(c.view, 'det').value, statBase(app.jobCtx, 'det', 50));
});

test("tiers table: the sub-tab's level is held to the job's cap; no job, no view; the ? note is the open substat's", () => {
  const { app, c } = bound(tierTable(), { job: 'BLU', level: 70 });
  app.tiers.level = 95;
  assert.equal(c.level, 80); // Blue Mage's level cap
  const view = c.view;
  assert.equal(c.view, view, 'built once for the same settings');
  assert.equal(c.help, null);
  c.helpFor = 'crit';
  assert.equal(c.help, card(view, 'crit').help);
  assert.equal(bound(tierTable(), {}).c.view, null);
});

test('tiers Level box: each valid level counts as typed; the synced level, or an empty box, follows the synced level again', () => {
  const { app, c } = bound(tierControls(), { job: 'BST', level: 40 });
  const field = c.levelField;
  const leave = value => field['@change']({ target: { value } });
  const typeLive = value => field['@input']({ target: { value } });
  typeLive('45');
  assert.equal(app.tiers.level, 45);
  typeLive('60'); // above Beastmaster's level cap of 50: not taken
  assert.equal(app.tiers.level, 45);
  leave('40');
  assert.equal(app.tiers.level, null);
  app.tiers.level = 30;
  const input = { value: '' };
  field['@change']({ target: input });
  assert.equal(app.tiers.level, null);
  assert.equal(input.value, 40, 'the box shows the synced level again');
});
