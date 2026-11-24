/* The store (src/ui/store/store.ts): batching, revisions per slice, the action log and listeners. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACTION_LOG_LIMIT, Store, sliceOf } from '../../../../src/ui/store/store.ts';

interface DemoState extends Record<string, object> {
  settings: { count: number };
  screen: { tab: string };
}

const demoStore = () => new Store<DemoState>({ settings: { count: 0 }, screen: { tab: 'sheets' } });
/* Wait until the microtask that notifies has run. */
const tick = () => new Promise<void>(resolve => setTimeout(resolve, 0));

test('1,000 updates in one tick notify the listener once', async () => {
  const store = demoStore();
  let notified = 0;
  store.subscribe(() => {
    notified += 1;
  });
  for (let i = 0; i < 1000; i++)
    store.update('settings/count', state => {
      state.settings.count = i;
    });
  assert.equal(notified, 0, 'nothing is announced inside the tick');
  await tick();
  assert.equal(notified, 1);
  assert.equal(store.state.settings.count, 999);
  store.update('settings/count', state => {
    state.settings.count = 5;
  });
  await tick();
  assert.equal(notified, 2, 'the next tick notifies again');
});

test('onUpdate hears each action as it counts: the slice and its new revision, before the tick ends', () => {
  const heard: [string, number][] = [];
  const store = new Store<DemoState>(
    { settings: { count: 0 }, screen: { tab: 'sheets' } },
    { onUpdate: (slice, revision) => heard.push([slice, revision]) },
  );
  store.update('settings/count', () => {});
  store.update('screen/tab', () => {});
  store.update('settings/count', () => {});
  assert.deepEqual(heard, [
    ['settings', 1],
    ['screen', 1],
    ['settings', 2],
  ]);
});

test('a revision per slice: an action bumps the slice its name starts with and no other', () => {
  const store = demoStore();
  store.update('settings/count', state => {
    state.settings.count += 1;
  });
  store.update('settings/count', state => {
    state.settings.count += 1;
  });
  store.update('screen/showTab', state => {
    state.screen.tab = 'browse';
  });
  assert.deepEqual({ ...store.revs }, { settings: 2, screen: 1 });
  assert.equal(store.rev, 3);
  assert.equal(sliceOf('browse/setType'), 'browse');
  assert.equal(sliceOf('noslash'), '');
});

test('an action name that names no slice is refused, and changes nothing', () => {
  const store = demoStore();
  assert.throws(
    () =>
      store.update('nothing/here', state => {
        state.settings.count = 9;
      }),
    /names no slice/,
  );
  assert.throws(() => store.update('settings', () => {}), /names no slice/);
  assert.equal(store.state.settings.count, 0);
  assert.equal(store.rev, 0);
});

test('update hands back what the change returns; an action that throws is still counted', () => {
  const store = demoStore();
  assert.deepEqual(
    store.update('settings/read', state => ({ ok: true, count: state.settings.count })),
    { ok: true, count: 0 },
  );
  assert.throws(
    () =>
      store.update('settings/broken', state => {
        state.settings.count = 7;
        throw new Error('half done');
      }),
    /half done/,
  );
  assert.equal(store.revs.settings, 2, 'the part that ran changed the state, so readers must look again');
  assert.equal(store.log.at(-1), 'settings/broken');
});

test(`the log keeps the last ${ACTION_LOG_LIMIT} action names, newest last`, () => {
  const store = demoStore();
  for (let i = 0; i < 120; i++) store.update(`settings/step${i}`, () => {});
  assert.equal(store.log.length, ACTION_LOG_LIMIT);
  assert.equal(store.log[0], 'settings/step70');
  assert.equal(store.log.at(-1), 'settings/step119');
});

test('unsubscribe stops the calls; a listener that unsubscribes another during a notification stops it too', async () => {
  const store = demoStore();
  const calls: string[] = [];
  let offSecond = () => {};
  store.subscribe(() => {
    calls.push('first');
    offSecond();
  });
  offSecond = store.subscribe(() => {
    calls.push('second');
  });
  const offThird = store.subscribe(() => {
    calls.push('third');
  });
  offThird();
  assert.equal(store.listenerCount, 2);
  store.update('screen/showTab', () => {});
  await tick();
  assert.deepEqual(calls, ['first']);
  assert.equal(store.listenerCount, 1);
});

test('a listener that throws does not stop the others', async () => {
  const store = demoStore();
  const seen: string[] = [];
  store.subscribe(() => {
    throw new Error('listener failed');
  });
  store.subscribe(() => {
    seen.push('second');
  });
  const uncaught: Error[] = [];
  const onUncaught = (error: Error) => uncaught.push(error);
  const handlers = process.listeners('uncaughtException');
  process.removeAllListeners('uncaughtException');
  process.on('uncaughtException', onUncaught);
  try {
    store.update('screen/showTab', () => {});
    await tick();
  } finally {
    process.off('uncaughtException', onUncaught);
    for (const handler of handlers) process.on('uncaughtException', handler);
  }
  assert.deepEqual(seen, ['second']);
  assert.equal(uncaught.length, 1);
  assert.match(uncaught[0].message, /listener failed/);
});

test('big data goes in by reference: a frozen list stays the same object', () => {
  const rows = Object.freeze(Array.from({ length: 200_000 }, (_, index) => Object.freeze([index, index * 2])));
  const store = new Store<{ results: { rows: readonly (readonly number[])[] } }>({ results: { rows: [] } });
  store.update('results/set', state => {
    state.results.rows = rows;
  });
  assert.equal(store.state.results.rows, rows);
  assert.ok(Object.isFrozen(store.state.results.rows));
});

test('a part has a revision that counts only the actions that changed it, found by comparing it before and after', () => {
  interface PartState extends Record<string, object> {
    settings: { filters: { q: string; kinds: string[] }; panels: { a: { level: number }; b: { level: number } }; title: string };
  }
  const heard: [string, number][] = [];
  const store = new Store<PartState>(
    { settings: { filters: { q: '', kinds: [] }, panels: { a: { level: 1 }, b: { level: 1 } }, title: 'x' } },
    {
      parts: { settings: ['filters', 'panels.a', 'panels.b', 'title'] },
      onUpdate: (key, revision) => heard.push([key, revision]),
    },
  );
  assert.deepEqual(store.revisionKeys(), ['settings', 'settings.filters', 'settings.panels.a', 'settings.panels.b', 'settings.title']);
  store.update('settings/q', state => {
    state.settings.filters.q = 'ring';
  });
  store.update('settings/same', state => {
    state.settings.filters.q = 'ring';
    state.settings.title = 'x';
  });
  store.update('settings/b', state => {
    state.settings.panels.b.level = 2;
  });
  store.update('settings/kinds', state => {
    state.settings.filters.kinds = [];
  });
  assert.deepEqual(
    [
      store.revs.settings,
      store.revs['settings.filters'],
      store.revs['settings.panels.a'],
      store.revs['settings.panels.b'],
      store.revs['settings.title'],
    ],
    [4, 2, 0, 1, 0],
    'an equal value is no change; a new array is one',
  );
  assert.deepEqual(heard.slice(0, 3), [
    ['settings', 1],
    ['settings.filters', 1],
    ['settings', 2],
  ]);
});

test('a part is counted even when the action throws after changing it', () => {
  const store = new Store<{ screen: { tab: string } } & Record<string, object>>({ screen: { tab: 'a' } }, { parts: { screen: ['tab'] } });
  assert.throws(() =>
    store.update('screen/open', state => {
      state.screen.tab = 'b';
      throw new Error('stop');
    }),
  );
  assert.deepEqual([store.revs.screen, store.revs['screen.tab']], [1, 1]);
});

test('a key of a slice with parts that is in no part stops the store from being made', () => {
  assert.throws(
    () => new Store<DemoState>({ settings: { count: 0 }, screen: { tab: 'a' } }, { parts: { screen: [] } }),
    /screen\.tab is in no part/,
  );
  assert.throws(
    () => new Store({ settings: { panels: { a: 1, b: 2 } } }, { parts: { settings: ['panels.a'] } }),
    /settings\.panels is in no part/,
  );
});
