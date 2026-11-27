/* The layout stress tool's screens and views (scripts/layout-stress/targets.mjs): each view is complete and refers only to what exists. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SCREENS, defaultScreenIds, measureOf, probeConfig, subTabVisits } from '../../../../scripts/layout-stress/targets.mjs';

const FIXTURES = ['standard', 'extreme', 'empty', 'none', 'failing'];

test('the screens are the Sheets, set page and Gear browser screens and the three math sub-tabs', () => {
  assert.deepEqual(
    SCREENS.map(screen => screen.id),
    ['sheets', 'set', 'gear', 'math-piece', 'math-gcd', 'math-tiers'],
  );
  assert.deepEqual(defaultScreenIds(), ['sheets', 'set', 'gear', 'math-piece', 'math-gcd', 'math-tiers']);
  for (const screen of SCREENS.filter(item => item.waiting)) {
    assert.deepEqual(screen.views, [], screen.id); // a waiting screen is not visited
  }
});

test('every view has a known fixture, a reach function and scopes; ids are unique in a screen', () => {
  for (const screen of SCREENS.filter(item => !item.waiting)) {
    assert.equal(new Set(screen.views.map(view => view.id)).size, screen.views.length, screen.id);
    for (const view of screen.views) {
      assert.ok(FIXTURES.includes(view.fixture), `${view.id}: fixture ${view.fixture}`);
      assert.equal(typeof view.reach, 'function', view.id);
      assert.ok(Object.keys(view.measure.scopes).length > 0, view.id);
    }
  }
});

test("a view's twin is a view of the same screen, and its stable scopes exist in both", () => {
  for (const screen of SCREENS.filter(item => !item.waiting)) {
    for (const view of screen.views.filter(item => item.twin)) {
      const twin = screen.views.find(item => item.id === view.twin);
      assert.ok(twin, `${view.id} names a twin ${view.twin} that is not in ${screen.id}`);
      assert.ok(view.stable?.length > 0, `${view.id} has no stable scopes`);
      for (const scope of view.stable) {
        assert.ok(scope in view.measure.scopes, `${view.id} has no scope ${scope}`);
        assert.ok(scope in twin.measure.scopes, `${twin.id} has no scope ${scope}`);
      }
    }
  }
});

test("a view's menus and job picker are complete", () => {
  for (const screen of SCREENS.filter(item => !item.waiting)) {
    for (const view of screen.views) {
      for (const menu of view.menus ?? []) {
        assert.ok(menu.id && menu.selector && typeof menu.open === 'function', `${view.id}/${menu.id}`);
      }
      if (view.jobs) {
        assert.ok(view.jobs.scope in view.measure.scopes, `${view.id}: jobs scope`);
        assert.equal(typeof view.jobs.open, 'function');
        assert.equal(typeof view.jobs.pick, 'function');
      }
    }
  }
});

test('what is sent into the page is plain data: no function, and the measure starts from the common settings', () => {
  for (const screen of SCREENS.filter(item => !item.waiting)) {
    for (const view of screen.views) {
      const config = probeConfig(view);
      assert.deepEqual(JSON.parse(JSON.stringify(config)), config, view.id);
      assert.ok(config.controls.includes('button') && config.labels.length > 0, view.id);
      assert.deepEqual(Object.keys(measureOf(view)).includes('scopes'), true);
    }
  }
});

/* The tabs-start-at-top check expects the top after a click, but a click on the sub-tab that is already open keeps the scroll by
   design (nothing opens). So whichever sub-tab is open when the check starts, no click may go to the open one. */
test('the sub-tab check never clicks the sub-tab that is already open, and still measures all four steps in order', () => {
  for (const openSub of ['piece', 'tiers', 'gcd', null]) {
    let current = openSub;
    for (const { sub, step } of subTabVisits(openSub)) {
      assert.notEqual(sub, current, `from ${openSub}: the ${step} step clicks the sub-tab that is open`);
      current = sub;
    }
    const measured = subTabVisits(openSub)
      .map(visit => visit.step)
      .filter(step => step !== 'warm-up');
    assert.deepEqual(measured, ['start', 'tiers', 'gcd', 'end'], `from ${openSub}`);
  }
});
