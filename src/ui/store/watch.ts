/* A watch on the store for code that is not an element: the router (the address follows the screen) and the overlay manager
   (a change of screen closes every menu). Pure: no DOM. */
import { sameValue } from './select.ts';
import type { Store } from './store.ts';

/* Call `callback(value, previous)` after a store change that makes `select(state)` differ from what it gave before (by
   `equals`, default `Object.is`; the first value is read now, and the callback is not called for it). The callback runs once
   per tick at most, whatever the number of actions in it, and a change it makes to the store is seen at the next tick.
   Returns the function that stops the watch. */
export function watch<State extends Record<string, object>, Value>(
  store: Store<State>,
  select: (state: State) => Value,
  callback: (value: Value, previous: Value) => void,
  equals: (a: Value, b: Value) => boolean = sameValue,
): () => void {
  let previous = select(store.state);
  return store.subscribe(() => {
    const next = select(store.state);
    if (equals(next, previous)) {
      return;
    }
    const before = previous;
    previous = next;
    callback(next, before);
  });
}
