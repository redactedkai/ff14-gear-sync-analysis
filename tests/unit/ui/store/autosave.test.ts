/* Autosave (src/ui/store/autosave.ts) with a clock the test moves and a stand-in for the window: the write comes 150 ms after the last
   change, 1,000 changes make one write, 'pagehide' writes at once, and a storage that throws is ignored. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { restoreState } from '../../../../src/ui/state.js';
import { createAppActions } from '../../../../src/ui/store/app-actions.ts';
import { createAppStore } from '../../../../src/ui/store/app-state.ts';
import type { RestoredState } from '../../../../src/ui/store/app-state.ts';
import { AUTOSAVE_DEBOUNCE_MS, startAutosave } from '../../../../src/ui/store/autosave.ts';
import type { AutosaveTimers } from '../../../../src/ui/store/autosave.ts';

const NO_SHEETS = { available: false, sheets: [], unreadable: [], indexProblem: null };
const tick = () => new Promise<void>(resolve => setTimeout(resolve, 0));

/* A clock the test moves: timers wait for advance(ms) instead of real time. */
function fakeClock() {
  let now = 0;
  let nextHandle = 1;
  const waiting = new Map<number, { at: number; callback: () => void }>();
  const timers: AutosaveTimers = {
    setTimeout(callback, delayMs) {
      const handle = nextHandle++;
      waiting.set(handle, { at: now + delayMs, callback });
      return handle;
    },
    clearTimeout(handle) {
      waiting.delete(handle as number);
    },
  };
  return {
    timers,
    pending: () => waiting.size,
    advance(ms: number) {
      now += ms;
      for (const [handle, timer] of [...waiting]) {
        if (timer.at <= now) {
          waiting.delete(handle);
          timer.callback();
        }
      }
    },
  };
}

/* A stand-in for the window: it keeps the listeners and fires an event by name. */
function fakeWindow() {
  const listeners = new Map<string, Set<() => void>>();
  return {
    addEventListener(type: string, listener: () => void) {
      if (!listeners.has(type)) {
        listeners.set(type, new Set());
      }
      listeners.get(type)?.add(listener);
    },
    removeEventListener(type: string, listener: () => void) {
      listeners.get(type)?.delete(listener);
    },
    fire(type: string) {
      for (const listener of listeners.get(type) ?? []) {
        listener();
      }
    },
    count: (type: string) => listeners.get(type)?.size ?? 0,
  };
}

/* A store at the defaults with autosave on a fake clock and window; `writes` collects what was written. */
function setup(write?: (json: string) => void) {
  const store = createAppStore(restoreState(null) as RestoredState, NO_SHEETS);
  const actions = createAppActions(store);
  const clock = fakeClock();
  const pageEvents = fakeWindow();
  const writes: string[] = [];
  const autosave = startAutosave(store, { write: write ?? (json => void writes.push(json)), timers: clock.timers, pageEvents });
  return { store, actions, clock, pageEvents, writes, autosave };
}

test(`the first write is made ${AUTOSAVE_DEBOUNCE_MS} ms after the start (it repairs an older saved shape)`, () => {
  const { clock, writes } = setup();
  clock.advance(AUTOSAVE_DEBOUNCE_MS - 1);
  assert.equal(writes.length, 0);
  clock.advance(1);
  assert.equal(writes.length, 1);
  assert.equal(JSON.parse(writes[0]).browse.job, 'PLD');
});

test('1,000 changes in a tick are one write, made 150 ms after the last, holding the last value', async () => {
  const { actions, clock, writes } = setup();
  clock.advance(AUTOSAVE_DEBOUNCE_MS);
  writes.length = 0;
  for (let i = 1; i <= 1000; i++) {
    actions.editBrowse({ q: `axe ${i}` });
  }
  await tick();
  assert.equal(clock.pending(), 1);
  clock.advance(AUTOSAVE_DEBOUNCE_MS - 1);
  assert.equal(writes.length, 0);
  clock.advance(1);
  assert.equal(writes.length, 1);
  assert.equal(JSON.parse(writes[0]).browse.q, 'axe 1000');
});

test('a change inside the wait restarts it', async () => {
  const { actions, clock, writes } = setup();
  clock.advance(AUTOSAVE_DEBOUNCE_MS);
  writes.length = 0;
  actions.editBrowse({ q: 'a' });
  await tick();
  clock.advance(100);
  actions.editBrowse({ q: 'ab' });
  await tick();
  clock.advance(100);
  assert.equal(writes.length, 0, '200 ms after the first change, 100 after the second');
  clock.advance(50);
  assert.deepEqual(
    writes.map(json => JSON.parse(json).browse.q),
    ['ab'],
  );
});

test('only the settings are saved: a change of the screen or of a sheet writes nothing, and the same JSON is not written twice', async () => {
  const { actions, store, clock, writes } = setup();
  clock.advance(AUTOSAVE_DEBOUNCE_MS);
  writes.length = 0;
  actions.showTab('math');
  store.update('sheets/setNote', state => {
    state.sheets.noteText = 'x';
  });
  await tick();
  assert.equal(clock.pending(), 0);
  actions.editBrowse({ q: 'axe' });
  await tick();
  actions.editBrowse({ q: '' }); // back to what was written
  await tick();
  clock.advance(AUTOSAVE_DEBOUNCE_MS);
  assert.equal(writes.length, 0);
});

test("'pagehide' writes at once what waits, and writes nothing when nothing waits", async () => {
  const { actions, clock, pageEvents, writes } = setup();
  clock.advance(AUTOSAVE_DEBOUNCE_MS);
  writes.length = 0;
  pageEvents.fire('pagehide');
  assert.equal(writes.length, 0);
  actions.editBrowse({ q: 'Dread' });
  await tick();
  pageEvents.fire('pagehide');
  assert.deepEqual(
    writes.map(json => JSON.parse(json).browse.q),
    ['Dread'],
  );
  assert.equal(clock.pending(), 0, 'the wait is over');
  clock.advance(AUTOSAVE_DEBOUNCE_MS);
  assert.equal(writes.length, 1, 'and the timer does not write it again');
});

test('a storage that throws is ignored, and the next change tries again', async () => {
  let failing = true;
  const written: string[] = [];
  const { actions, clock } = setup(json => {
    if (failing) {
      throw new DOMException('full', 'QuotaExceededError');
    }
    written.push(json);
  });
  clock.advance(AUTOSAVE_DEBOUNCE_MS);
  failing = false;
  actions.editBrowse({ q: 'x' });
  await tick();
  clock.advance(AUTOSAVE_DEBOUNCE_MS);
  assert.equal(written.length, 1);
  assert.equal(JSON.parse(written[0]).browse.q, 'x');
});

test('a write that failed is tried again at a change of the screen, at a later write and at pagehide, until storage works', async () => {
  let failing = true;
  const attempts: string[] = [];
  const written: string[] = [];
  const { actions, clock, pageEvents } = setup(json => {
    attempts.push(json);
    if (failing) {
      throw new DOMException('full', 'QuotaExceededError');
    }
    written.push(json);
  });
  clock.advance(AUTOSAVE_DEBOUNCE_MS);
  assert.deepEqual([attempts.length, written.length], [1, 0], 'the first write failed');
  clock.advance(10 * AUTOSAVE_DEBOUNCE_MS);
  assert.equal(attempts.length, 1, 'nothing changed: no attempt of its own, and no timer left running');
  assert.equal(clock.pending(), 0);

  actions.editBrowse({ q: 'ring' }); // a settings change: written after the wait, and fails
  await tick();
  clock.advance(AUTOSAVE_DEBOUNCE_MS);
  assert.equal(attempts.length, 2);
  failing = false;
  actions.showTab('math'); // not a settings change: the screen changed, and the failed settings are tried again
  await tick();
  assert.equal(written.length, 0, 'after the wait, not at once');
  clock.advance(AUTOSAVE_DEBOUNCE_MS);
  assert.equal(written.length, 1);
  assert.equal(JSON.parse(written[0]).browse.q, 'ring', 'the last settings are the ones saved');
  actions.showTab('browse');
  await tick();
  clock.advance(AUTOSAVE_DEBOUNCE_MS);
  assert.equal(written.length, 1, 'saved: a later change of the screen writes nothing');

  failing = true;
  actions.editBrowse({ q: 'ringed' });
  await tick();
  clock.advance(AUTOSAVE_DEBOUNCE_MS);
  failing = false;
  pageEvents.fire('pagehide'); // the page goes away before another change: the failed settings are written at once
  assert.equal(JSON.parse(written.at(-1) as string).browse.q, 'ringed');
});

test('a write that returns false counts as failed, like one that throws (the page writes through state.js save, which does not throw)', async () => {
  let storageWorks = false;
  const written: string[] = [];
  const { actions, clock } = setup(json => {
    if (storageWorks) {
      written.push(json);
    }
    return storageWorks;
  });
  clock.advance(AUTOSAVE_DEBOUNCE_MS);
  actions.editBrowse({ q: 'ring' });
  await tick();
  clock.advance(AUTOSAVE_DEBOUNCE_MS);
  storageWorks = true;
  actions.showTab('math');
  await tick();
  clock.advance(AUTOSAVE_DEBOUNCE_MS);
  assert.equal(written.length, 1);
  assert.equal(JSON.parse(written[0]).browse.q, 'ring');
});

test('stop removes the subscription and the listener, and writes what waits', async () => {
  const { actions, store, clock, pageEvents, writes, autosave } = setup();
  clock.advance(AUTOSAVE_DEBOUNCE_MS);
  writes.length = 0;
  actions.editBrowse({ q: 'last' });
  await tick();
  autosave.stop();
  assert.equal(writes.length, 1);
  assert.equal(store.listenerCount, 0);
  assert.equal(pageEvents.count('pagehide'), 0);
  actions.editBrowse({ q: 'after' });
  await tick();
  clock.advance(AUTOSAVE_DEBOUNCE_MS);
  assert.equal(writes.length, 1);
});
