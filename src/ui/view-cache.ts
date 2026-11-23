/* How a component keeps its derived view (architecture.md, section 3): a cache keyed by the view's inputs, and the freeze
   that keeps Alpine from wrapping the view. Pure: no DOM, no Alpine. */

/* The page's one way for a component to build a view (architecture.md, section 3): a getter reads the view's inputs
   from the store, which makes every binding that shows the view track them, and asks this cache for the view of their
   key. A new key builds the view (a pure view builder in src/ui/views); the same key returns the last one, so a
   template that reads the view many times a render builds it once. Kept in the component's closure, not its reactive
   state. Returns {get(key, build): the view for `key` (a string), last(): the last view built, or null}. */
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

/* `value` frozen with every object and array inside it, and returned. For a view stored on a component: Alpine leaves a
   frozen object as it is, but freezing only the top would still let x-for wrap each row it hands a template (and each
   object read from a row) in a reactive proxy that tracks every read. An object already frozen is taken as frozen all
   through and not walked again. */
export function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const inner of Object.values(value)) deepFreeze(inner);
  return value;
}
