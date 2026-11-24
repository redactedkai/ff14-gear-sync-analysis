/* Select (src/ui/store/select.ts) over a fake host: it renders the host only when the selected value changes, and it follows
   the store only while the host is connected. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Select, shallowEq } from '../../../../src/ui/store/select.ts';
import type { SelectController, SelectHost } from '../../../../src/ui/store/select.ts';
import { Store } from '../../../../src/ui/store/store.ts';

interface DemoState extends Record<string, object> {
  settings: { count: number; other: number; pair: { a: number; b: number } };
}
const demoStore = () => new Store<DemoState>({ settings: { count: 0, other: 0, pair: { a: 1, b: 2 } } });
const tick = () => new Promise<void>(resolve => setTimeout(resolve, 0));

/* A stand-in for a Lit element: it keeps its controllers and counts its render requests. */
class FakeHost implements SelectHost {
  controllers: SelectController[] = [];
  renders = 0;
  addController(controller: SelectController): void {
    this.controllers.push(controller);
  }
  requestUpdate(): void {
    this.renders += 1;
  }
  connect(): void {
    for (const controller of this.controllers) controller.hostConnected?.();
  }
  disconnect(): void {
    for (const controller of this.controllers) controller.hostDisconnected?.();
  }
}

test('the host renders once for a change of what it selected, and not for a change of something else', async () => {
  const store = demoStore();
  const host = new FakeHost();
  const count = new Select(host, store, state => state.settings.count);
  host.connect();
  assert.equal(count.value, 0);
  store.update('settings/other', state => {
    state.settings.other += 1;
  });
  await tick();
  assert.equal(host.renders, 0);
  for (let i = 1; i <= 1000; i++)
    store.update('settings/count', state => {
      state.settings.count = i;
    });
  await tick();
  assert.equal(host.renders, 1, '1,000 changes in a tick are one render');
  assert.equal(count.value, 1000);
});

test('disconnecting unsubscribes, and 1,000 connect and disconnect cycles leave no listener behind', async () => {
  const store = demoStore();
  const host = new FakeHost();
  new Select(host, store, state => state.settings.count);
  for (let i = 0; i < 1000; i++) {
    host.connect();
    assert.equal(store.listenerCount, 1);
    host.disconnect();
    assert.equal(store.listenerCount, 0);
  }
  store.update('settings/count', state => {
    state.settings.count = 5;
  });
  await tick();
  assert.equal(host.renders, 0, 'a disconnected host is never asked to render');
});

test('connecting twice in a row does not subscribe twice', () => {
  const store = demoStore();
  const host = new FakeHost();
  new Select(host, store, state => state.settings.count);
  host.connect();
  host.connect();
  assert.equal(store.listenerCount, 1);
});

test('a host reconnected after the value changed renders at once; one reconnected with the same value does not', async () => {
  const store = demoStore();
  const host = new FakeHost();
  const count = new Select(host, store, state => state.settings.count);
  host.connect();
  host.disconnect();
  host.connect();
  assert.equal(host.renders, 0);
  host.disconnect();
  store.update('settings/count', state => {
    state.settings.count = 3;
  });
  await tick();
  assert.equal(count.value, 3, 'a disconnected controller still reads the live state');
  host.connect();
  assert.equal(host.renders, 1);
  assert.equal(count.value, 3);
});

test('a selector that builds a new object needs shallowEq: Object.is renders on every change, shallowEq only on a different value', async () => {
  const store = demoStore();
  const loose = new FakeHost();
  const tight = new FakeHost();
  new Select(loose, store, state => ({ ...state.settings.pair }));
  new Select(tight, store, state => ({ ...state.settings.pair }), shallowEq);
  loose.connect();
  tight.connect();
  store.update('settings/other', state => {
    state.settings.other += 1;
  });
  await tick();
  assert.deepEqual([loose.renders, tight.renders], [1, 0]);
  store.update('settings/pair', state => {
    state.settings.pair.a = 9;
  });
  await tick();
  assert.deepEqual([loose.renders, tight.renders], [2, 1]);
});

test('shallowEq: same keys with the same values; arrays too; nothing deeper', () => {
  assert.equal(shallowEq({ a: 1, b: 'x' }, { a: 1, b: 'x' }), true);
  assert.equal(shallowEq({ a: 1 }, { a: 1, b: undefined }), false);
  assert.equal(shallowEq({ a: 1, b: undefined }, { a: 1, c: undefined }), false);
  assert.equal(shallowEq([1, 2], [1, 2]), true);
  assert.equal(shallowEq([1, 2], [2, 1]), false);
  assert.equal(shallowEq({ list: [1] }, { list: [1] }), false);
  assert.equal(shallowEq(null, null), true);
  assert.equal(shallowEq(null, {}), false);
  assert.equal(shallowEq(NaN, NaN), true);
  assert.equal(shallowEq([], {}), false);
});
