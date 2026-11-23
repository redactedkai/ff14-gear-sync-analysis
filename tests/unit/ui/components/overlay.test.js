/* The overlay part of a component (src/ui/components/overlay.js): the members it gives, and how they use the manager. The
   manager is a real one with no document; the component has `$nextTick` as Alpine gives it. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createOverlays } from '../../../../src/ui/overlays.js';
import { compose } from '../../../../src/ui/components/compose.js';
import { overlay } from '../../../../src/ui/components/overlay.js';

/* A component with two overlays, `menu` and `other`, and a record of what happened. */
function made() {
  const manager = createOverlays(() => null);
  const calls = [];
  const button = { focus: () => calls.push('button focused') };
  const input = { focus: () => calls.push('input focused') };
  const component = compose(
    { $nextTick: run => run() },
    overlay('menu', {
      manager,
      root: () => ({}),
      opener: () => button,
      focusIn: () => input,
      onOpen: (...args) => calls.push(['opened', ...args]),
      onClose: () => calls.push('closed'),
    }),
    overlay('other', { manager, root: () => ({}), opener: () => button }),
  );
  return { manager, component, calls };
}

test('overlay: gives the flag and the three actions named after it', () => {
  const { component } = made();
  assert.deepEqual(
    ['menuOpen', 'openMenu', 'closeMenu', 'toggleMenu', 'otherOpen'].map(name => name in component),
    [true, true, true, true, true],
  );
  assert.equal(component.menuOpen, false);
});

test('overlay: open sets the flag, runs onOpen with the arguments and puts the focus in; close clears it', () => {
  const { component, calls, manager } = made();
  component.openMenu('a', 2);
  assert.deepEqual([component.menuOpen, manager.openIds], [true, ['menu']]);
  assert.deepEqual(calls, [['opened', 'a', 2], 'input focused']);
  component.closeMenu();
  assert.deepEqual([component.menuOpen, calls.at(-1), manager.openIds], [false, 'closed', []]);
});

test('overlay: toggle closes with the focus back on the opener, and opening another overlay closes this one', () => {
  const { component, calls } = made();
  component.toggleMenu();
  component.toggleMenu();
  assert.deepEqual([component.menuOpen, calls.at(-1)], [false, 'button focused']);
  component.openMenu();
  component.openOther();
  assert.deepEqual([component.menuOpen, component.otherOpen], [false, true]);
});

test('overlay: closing a flag the manager does not hold still clears it and runs onClose', () => {
  const { component, calls } = made();
  component.menuOpen = true; // set from outside (not through openMenu)
  component.closeMenu();
  assert.deepEqual([component.menuOpen, calls], [false, ['closed']]);
  component.closeMenu();
  assert.deepEqual(calls, ['closed'], 'closed already: nothing more');
});

test('overlay: closed before it was drawn (a quick Escape), the focus does not go into it', () => {
  const calls = [];
  const manager = createOverlays(() => null);
  let draw = null;
  const component = compose(
    { $nextTick: run => (draw = run) },
    overlay('menu', { manager, root: () => ({}), opener: () => null, focusIn: () => ({ focus: () => calls.push('focused') }) }),
  );
  component.openMenu();
  component.closeMenu();
  draw();
  assert.deepEqual(calls, []);
});
