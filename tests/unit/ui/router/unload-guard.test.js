/* The reload and close guard (src/ui/router/unload-guard.js): it asks only while work is held, and the dev flag turns it off. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { UNLOAD_GUARD_OFF_KEY, installUnloadGuard, unloadGuardDisabled } from '../../../../src/ui/router/unload-guard.js';
import { fakeStorage } from '../../helpers/sheet-fixtures.js';

/* A window stand-in that keeps the listener, and an unload event as the browser hands it. */
function fakeWindow() {
  const listeners = [];
  return {
    addEventListener: (type, fn) => type === 'beforeunload' && listeners.push(fn),
    unload() {
      const event = {
        prevented: false,
        returnValue: undefined,
        preventDefault() {
          this.prevented = true;
        },
      };
      for (const fn of listeners) fn(event);
      return event;
    },
  };
}

test('unload guard: asks while work is held, stays quiet with none', () => {
  const win = fakeWindow();
  let held = false;
  installUnloadGuard({ target: win, hasUnsettled: () => held, storage: fakeStorage() });
  assert.equal(win.unload().prevented, false);
  held = true;
  const event = win.unload();
  assert.deepEqual([event.prevented, event.returnValue], [true, '']);
});

test('unload guard: the dev flag turns it off, any other value or a throwing storage leaves it on', () => {
  const storage = fakeStorage();
  const win = fakeWindow();
  installUnloadGuard({ target: win, hasUnsettled: () => true, storage });
  storage.setItem(UNLOAD_GUARD_OFF_KEY, '1');
  assert.equal(win.unload().prevented, false);
  storage.setItem(UNLOAD_GUARD_OFF_KEY, '0');
  assert.equal(win.unload().prevented, true);

  const broken = {
    getItem() {
      throw new Error('storage disabled');
    },
  };
  assert.equal(unloadGuardDisabled(broken), false);
  assert.equal(unloadGuardDisabled(null), false);
});
