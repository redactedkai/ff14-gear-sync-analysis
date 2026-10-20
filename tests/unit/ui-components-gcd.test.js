/* How the math works, GCD's components (src/ui/components/gcd.js), bound to a plain store as Alpine binds them: the
   level the tab shows, the speed held to the level's range, the Level and speed boxes after typing stops, and the
   chart and step table clicks. What the tab shows is checked in ui-views-gcd.test.js. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gcdControls, gcdTab } from '../../src/ui/components/gcd.js';
import { TYPING_DEBOUNCE_MS } from '../../src/ui/helpers.js';
import { restoreState } from '../../src/ui/state.js';
import { createAppStore } from '../../src/ui/store.js';
import { GCD_LEVELS, speedRange } from '../../src/ui/views/gcd.js';

/* A component bound to the store of a Sage at level 50, as Alpine binds it ($store.app). */
function bound(members, saved = { job: 'SGE', level: 50 }) {
  const app = createAppStore(restoreState(saved));
  return { app, c: Object.assign(members, { $store: { app } }) };
}

test('GCD controls: the level follows the synced level until one is typed; the speed is held to that level’s range', () => {
  const { app, c } = bound(gcdControls());
  assert.equal(c.level, 50);
  const { base, most } = speedRange(50);
  // no speed asked: the base, the slider's thumb at its start
  assert.equal(c.speed, base);
  assert.equal(c.speedFill, 0);
  app.gcd.speed = most + 100;
  assert.equal(c.speed, most);
  assert.equal(c.speedFill, 100);
  app.gcd.speed = base - 1;
  assert.equal(c.speed, base);
  app.gcd.speed = Math.round((base + most) / 2);
  assert.ok(Math.abs(c.speedFill - 50) < 1);
  // a typed level wins over the synced one, and the range follows it
  app.gcd.level = 90;
  assert.equal(c.level, 90);
  assert.deepEqual(c.speedRange, speedRange(90));
  c.slide('700');
  assert.equal(app.gcd.speed, 700);
  c.resetSpeed();
  assert.equal(app.gcd.speed, null);
});

test('GCD Level box: counted once typing stops; out of range corrected with a note, other text an error, empty follows the synced level', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { app, c } = bound(gcdControls());
  const el = { value: '7' };
  c.typeLevel(el);
  el.value = '70';
  c.typeLevel(el);
  t.mock.timers.tick(TYPING_DEBOUNCE_MS - 1);
  assert.equal(app.gcd.level, null);
  t.mock.timers.tick(1);
  assert.equal(app.gcd.level, 70);
  // Enter or leaving the box: at once
  el.value = '250';
  c.typeLevel(el, true);
  assert.deepEqual([app.gcd.level, el.value, c.levelNote], [GCD_LEVELS, GCD_LEVELS, `Lowered to ${GCD_LEVELS}, the highest level.`]);
  el.value = '0';
  c.typeLevel(el, true);
  assert.deepEqual([app.gcd.level, c.levelNote], [1, 'Raised to 1, the lowest level.']);
  el.value = '4.5';
  c.typeLevel(el, true);
  assert.equal(c.levelError, `Enter a whole level from 1 to ${GCD_LEVELS}`);
  assert.equal(app.gcd.level, 1, 'text that is no level changes nothing');
  // the synced level itself, or an empty box: the tab follows the synced level again
  el.value = '50';
  c.typeLevel(el, true);
  assert.deepEqual([app.gcd.level, c.levelError, c.levelNote], [null, '', '']);
  app.gcd.level = 80;
  el.value = '';
  c.typeLevel(el, true);
  assert.deepEqual([app.gcd.level, el.value], [null, 50]);
});

test('GCD speed box: a number is kept as asked and the box shows the speed used; other text changes nothing', () => {
  const { app, c } = bound(gcdControls());
  const { most } = speedRange(50);
  const el = { value: `${most + 50}` };
  c.typeSpeed(el, true);
  assert.equal(app.gcd.speed, most + 50);
  assert.equal(el.value, most, 'the box shows the speed held to the range');
  el.value = 'fast';
  c.typeSpeed(el, true);
  assert.equal(app.gcd.speed, most + 50);
  el.value = '';
  c.typeSpeed(el, true);
  assert.equal(app.gcd.speed, most + 50);
});

test('GCD tab: the view is built once per setting and width; a bar sets the level, a step its speed, none past the most', () => {
  const { app, c } = bound(gcdTab());
  const first = c.view;
  assert.equal(c.view, first, 'the same settings: the same view');
  c.width = 700;
  assert.notEqual(c.view, first);
  const atWidth = c.view;
  app.gcd.level = 60;
  assert.notEqual(c.view, atWidth);
  // a click inside a bar of the chart: the bar's level
  c.pickLevel({ target: { closest: () => ({ dataset: { level: '70' } }) } });
  assert.equal(app.gcd.level, 70);
  c.pickLevel({ target: { closest: () => null } });
  assert.equal(app.gcd.level, 70);
  c.pickSpeed({ speed: 500, out: false });
  assert.equal(app.gcd.speed, 500);
  c.pickSpeed({ speed: 9999, out: true });
  assert.equal(app.gcd.speed, 500);
});
