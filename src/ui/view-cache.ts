/* How a component keeps its derived view (architecture.md, section 3): a cache keyed by the view's inputs, and the freeze
   that keeps a view from being changed. Pure: no DOM. */
import { clone } from './text.ts';

/* The page's one way for a component to build a view (architecture.md, section 3): a getter reads the view's inputs
   from the store (or an element's properties) and asks this cache for the view of their
   key. A new key builds the view (a pure view builder in src/ui/views); the same key returns the last one, so a
   template that reads the view many times a render builds it once. Kept in the component's closure, not in the store. Returns {get(key, build): the view for `key` (a string), last(): the last view built, or null}. */
export function viewCache<View>() {
  let key: string | null = null;
  let view: View | null = null;
  return {
    get(newKey: string, build: () => View): View {
      if (newKey !== key) {
        view = build();
        key = newKey;
      }
      return view as View;
    },
    last: (): View | null => view,
  };
}

/* `value` frozen with every object and array inside it, and returned. For a view an element keeps: freezing only the
   top would still leave each row (and each object inside a row) open to a change. An object already frozen is taken as
   frozen all through and not walked again. */
export function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const inner of Object.values(value)) {
    deepFreeze(inner);
  }
  return value;
}

/* A deep copy of plain JSON-safe data (a gear set), frozen all through: what a set page puts in the store as its draft or its
   suggestion. The copy shares nothing with the saved set it came from, so freezing it leaves that alone (text.ts clone). */
export function frozenCopy<T>(value: T): T {
  return deepFreeze(clone(value));
}
