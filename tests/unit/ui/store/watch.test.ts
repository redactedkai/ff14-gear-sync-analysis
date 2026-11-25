/* watch (src/ui/store/watch.ts): a callback for a change of what a selector reads, once per tick. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shallowEq } from '../../../../src/ui/store/select.ts';
import { Store } from '../../../../src/ui/store/store.ts';
import { watch } from '../../../../src/ui/store/watch.ts';

interface DemoState extends Record<string, object> {
  screen: { tab: string; sub: string };
}
const demoStore = () => new Store<DemoState>({ screen: { tab: 'sheets', sub: 'piece' } });
const tick = () => new Promise<void>(resolve => setTimeout(resolve, 0));

test('the callback gets the new and the previous value, once per tick, and not for the first value', async () => {
  const store = demoStore();
  const calls: string[] = [];
  watch(
    store,
    state => state.screen.tab,
    (tab, previous) => calls.push(`${previous}>${tab}`),
  );
  await tick();
  assert.deepEqual(calls, []);
  store.update('screen/showTab', state => {
    state.screen.tab = 'browse';
  });
  store.update('screen/showTab', state => {
    state.screen.tab = 'math';
  });
  await tick();
  assert.deepEqual(calls, ['sheets>math'], 'two actions in a tick are one call, from the value before the tick');
});

test('a change of something else, or a change back to the same value within the tick, calls nothing', async () => {
  const store = demoStore();
  let calls = 0;
  watch(
    store,
    state => state.screen.tab,
    () => {
      calls += 1;
    },
  );
  store.update('screen/showSub', state => {
    state.screen.sub = 'gcd';
  });
  store.update('screen/showTab', state => {
    state.screen.tab = 'browse';
  });
  store.update('screen/showTab', state => {
    state.screen.tab = 'sheets';
  });
  await tick();
  assert.equal(calls, 0);
});

test('stop ends the watch; equals decides what differs', async () => {
  const store = demoStore();
  const seen: string[] = [];
  const stop = watch(
    store,
    state => ({ tab: state.screen.tab }),
    value => seen.push(value.tab),
    shallowEq,
  );
  store.update('screen/showSub', state => {
    state.screen.sub = 'gcd';
  });
  await tick();
  assert.deepEqual(seen, [], 'a new object with the same fields is no change under shallowEq');
  store.update('screen/showTab', state => {
    state.screen.tab = 'browse';
  });
  await tick();
  assert.deepEqual(seen, ['browse']);
  stop();
  store.update('screen/showTab', state => {
    state.screen.tab = 'math';
  });
  await tick();
  assert.deepEqual(seen, ['browse']);
  assert.equal(store.listenerCount, 0);
});

test('a change the callback makes is seen at the next tick', async () => {
  const store = demoStore();
  const tabs: string[] = [];
  watch(
    store,
    state => state.screen.tab,
    tab => {
      tabs.push(tab);
      if (tab === 'browse') {
        store.update('screen/showTab', state => {
          state.screen.tab = 'math';
        });
      }
    },
  );
  store.update('screen/showTab', state => {
    state.screen.tab = 'browse';
  });
  await tick();
  await tick();
  assert.deepEqual(tabs, ['browse', 'math']);
});
