/* Small checks that let the compiler follow what the code already knows, in place of a type assertion (`as`). No state, no
   DOM. Each one throws or filters; none hides a wrong value. */

/* `value` when it is neither null nor undefined; throws `Missing <what>` otherwise. For a value that must be there. */
export function mustHave<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) {
    throw new Error(`Missing ${what}`);
  }
  return value;
}

/* The value of `key` in `map` (a Map or WeakMap). Throws `Missing <what>` when there is none: a map built for every key that lacks one is a
   bug, and a thrown error shows it where a default would give a wrong score. */
export function must<K, V>(map: { get(key: K): V | undefined }, key: K, what: string): V {
  return mustHave(map.get(key), what);
}

/* The last element of `list`. Throws `Empty <what>` for an empty list: for a list that is never empty. */
export function last<T>(list: readonly T[], what: string): T {
  if (list.length === 0) {
    throw new Error(`Empty ${what}`);
  }
  return list[list.length - 1];
}

/* The elements of `list` that are not '' , null, undefined or false, typed without them (`.filter(Boolean)` keeps the
   type of the whole list). */
export function present<T>(list: readonly (T | '' | null | undefined | false)[]): T[] {
  return list.filter((item): item is T => item !== '' && item !== null && item !== undefined && item !== false);
}

/* The text of a caught value: an Error's message, else the value as text. */
export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/* True when `key` is one of `keys`, and then types it as one of them: `includes` alone wants an argument already of the
   list's type, which is what a cast was for. */
export function isOneOf<K extends string>(keys: readonly K[], key: string | null | undefined): key is K {
  return key !== null && key !== undefined && (keys as readonly string[]).includes(key);
}

/* An object with one entry for each of `keys`, in that order, each the value `valueFor` gives for its key. The compiler cannot
   see that a loop over a list of keys fills exactly those keys, so this is the one place that says so (the cast below;
   tests/unit/core/guards.test.ts checks the keys and their order). */
export function fromKeys<K extends string, V>(keys: readonly K[], valueFor: (key: K) => V): Record<K, V> {
  const out: Partial<Record<K, V>> = {};
  for (const key of keys) {
    out[key] = valueFor(key);
  }
  return out as Record<K, V>;
}

/* The entries of `record` as [key, value] pairs, the keys typed as `K`. `Object.entries` types its keys as text; for an object
   built from the keys `K` (fromKeys, a literal) they are those keys. The one cast below says so. */
export function entriesOf<K extends string, V>(record: Partial<Record<K, V>>): [K, V][] {
  return Object.entries(record) as [K, V][];
}

/* The keys of `record` as a list typed `K`: `Object.keys` types them as text. The one cast below says a record's own keys
   are its key type; use it for a record written out in the code (a table of labels), not for one read from a file. */
export function keysOf<K extends string>(record: Record<K, unknown>): K[] {
  return Object.keys(record) as K[];
}

/* `values` (text read from a data file) as a frozen list typed `K`: each must be one of `allowed`, else this throws
   `Unknown <what> "<value>"` when the module loads, so a generator change that adds a key shows up as an error. */
export function checkedKeys<K extends string>(values: readonly string[], allowed: readonly K[], what: string): readonly K[] {
  return Object.freeze(
    values.map(value => {
      if (!isOneOf(allowed, value)) {
        throw new Error(`Unknown ${what} "${value}"`);
      }
      return value;
    }),
  );
}
