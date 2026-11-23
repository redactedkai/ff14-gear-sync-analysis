/* Substat tiers' components (src/ui/components/tiers.js), bound to a plain store as Alpine binds them: the sub-tab's
   own job and level, the values typed or clicked and when they are dropped, and the math bar's Level box. Substat tiers has
   its own job (store.tiers.job) and its level is the job's level cap until one is typed; Stat Allocation's job and level do
   not reach it. What the cards show is checked in ui/views/tiers.test.js. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { statBase } from '../../../../src/core/base-stats.js';
import { tierControls, tierTable } from '../../../../src/ui/components/tiers.js';

import { createAppStore } from '../../../../src/ui/store.js';
import { watched, restoreOpen } from '../../helpers/common.js';

/* A component bound to the store of `saved`, as Alpine binds it ($store.app). */
function bound(members, saved) {
  const app = createAppStore(restoreOpen(saved));
  return { app, c: Object.assign(members, { $store: { app } }) };
}
const card = (view, stat) => view.cards.find(x => x.stat === stat);

test('tiers table: each value starts at its base; a typed or clicked value is kept until the job or a level changes', () => {
  const { app, c } = bound(tierTable(), { job: 'SGE', level: 50, tab: 'math' });
  const job = app.jobCtx;
  assert.equal(c.level, 100, "the job's level cap: the math panel's level 50 is not Substat tiers'");
  assert.equal(card(c.view, 'crit').value, statBase(job, 'crit', 100));
  // a typed value, held to the base; text that is no number is ignored
  const el = { value: '1' };
  c.type('crit', el);
  assert.deepEqual([card(c.view, 'crit').value, el.value], [statBase(job, 'crit', 100), statBase(job, 'crit', 100)]);
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
  assert.equal(card(c.view, 'crit').value, statBase(job, 'crit', 100));
  // and Substat tiers' own job
  c.pick('crit:500');
  app.setJob('WHM', 'tiers');
  assert.equal(card(c.view, 'crit').value, statBase(app.panel('tiers').jobCtx, 'crit', 100));
});

test('tiers table: a typed value asks its card to center its row, even the same value again; a click on a row does not', () => {
  const { c } = bound(tierTable(), { job: 'SGE', level: 50, tab: 'math' });
  const el = { value: '600' };
  c.type('crit', el);
  c.type('crit', el);
  assert.deepEqual(c.typed, { crit: 2 });
  // a click, text that is no number and a value for another substat leave the Critical Hit count alone
  c.pick('crit:500');
  c.type('crit', { value: 'abc' });
  c.type('det', { value: '600' });
  assert.deepEqual(c.typed, { crit: 2, det: 1 });
});

/* Found by wave C (2026-10-19): values typed at one level were only hidden while the level differed, so going back to
   it brought them back (if nothing was typed in between). The comment above tierTable says they are dropped. */
test('tiers table: values dropped by a level change stay dropped when the level comes back', () => {
  const { app, c } = bound(tierTable(), { job: 'SGE', level: 50, tab: 'math' });
  const settle = watched(c);
  c.pick('det:420');
  assert.equal(card(c.view, 'det').value, 420);
  app.tiers.level = 60;
  settle();
  app.tiers.level = null;
  settle();
  assert.equal(card(c.view, 'det').value, statBase(app.jobCtx, 'det', 100));
  // Stat Allocation's synced level and job are not Substat tiers': the values stay
  c.pick('det:420');
  app.level = 60;
  settle();
  app.setJob('WHM');
  settle();
  assert.equal(card(c.view, 'det').value, 420);
  // Substat tiers' own job drops them, and going back does not bring them back
  app.setJob('WAR', 'tiers');
  settle();
  app.setJob('SGE', 'tiers');
  settle();
  assert.equal(card(c.view, 'det').value, statBase(app.panel('tiers').jobCtx, 'det', 100));
});

test("tiers table: the sub-tab's level is held to the job's cap; a tab always has a job (Paladin by default); the ? note is the open substat's", () => {
  const { app, c } = bound(tierTable(), { job: 'BLU', level: 70 });
  app.tiers.level = 95;
  assert.equal(c.level, 80); // Blue Mage's level cap
  const view = c.view;
  assert.equal(c.view, view, 'built once for the same settings');
  assert.equal(c.help, null);
  c.helpFor = 'crit';
  assert.equal(c.help, card(view, 'crit').help);
  // nothing saved: the default job, Paladin, so the tab has a view (a job is always chosen; the old default was none)
  const fresh = bound(tierTable(), {});
  assert.equal(fresh.app.job, 'PLD');
  assert.ok(fresh.c.view, 'the default job has cards');
  // a panel with no job (not reachable from the page now) still gives no view
  const noJob = Object.assign(tierTable(), { $store: { app: { panel: () => ({ job: null }), tiers: { level: null } } } });
  assert.equal(noJob.view, null);
});

test("tiers Level box: each valid level counts as typed; the job's level cap, or an empty box, is the default level again", () => {
  const { app, c } = bound(tierControls(), { job: 'BST', level: 40 });
  assert.equal(c.level, 50, "Beastmaster's level cap, not the math panel's level 40");
  const field = c.levelField;
  const leave = value => field['@change']({ target: { value } });
  const typeLive = value => field['@input']({ target: { value } });
  typeLive('45');
  assert.equal(app.tiers.level, 45);
  typeLive('60'); // above Beastmaster's level cap of 50: not taken
  assert.equal(app.tiers.level, 45);
  leave('50');
  assert.equal(app.tiers.level, null);
  app.tiers.level = 30;
  const input = { value: '' };
  field['@change']({ target: input });
  assert.equal(app.tiers.level, null);
  assert.equal(input.value, 50, "the box shows the job's level cap again");
});

test("tiers components: the job is Substat tiers' own; the math panel's job and level do not reach them", () => {
  const saved = { tab: 'math', piece: { job: 'SGE', level: 60 }, tiers: { job: 'WAR' } };
  const { app, table, controls } = (() => {
    const made = bound(tierTable(), saved);
    return { app: made.app, table: made.c, controls: Object.assign(tierControls(), { $store: { app: made.app } }) };
  })();
  for (const c of [table, controls]) {
    assert.equal(c.panel.job, 'WAR');
    assert.equal(c.level, 100);
  }
  app.setJob('BLM', 'math');
  app.level = 70;
  assert.deepEqual([table.panel.job, table.level, controls.panel.job, controls.level], ['WAR', 100, 'WAR', 100]);
  app.setJob('NIN', 'tiers');
  assert.deepEqual([table.panel.job, controls.panel.job, app.job], ['NIN', 'NIN', 'BLM']);
});
