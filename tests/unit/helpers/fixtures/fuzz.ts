/* Damaging saved data on purpose, for the saved-state fuzz tests (ui/state.fuzz, ui/sheets/storage.fuzz): a copy of a good
   value with a few fields deleted, swapped for a value from elsewhere in it or replaced by a wrong one. */

/* Wrong values of every type a field could hold after a hand edit or another build's save. */
export const WRONG = [
  null,
  'x',
  '',
  ' ',
  -1,
  0,
  1,
  0.5,
  100,
  101,
  1e308,
  -1e308,
  true,
  false,
  [],
  {},
  ['x'],
  [null],
  { a: 1 },
  'constructor',
  '__proto__',
  'sks',
  'sps',
  'ten',
  'main',
  'spec',
  'spd',
  795,
  796,
  5e5,
  '123',
  'NaN',
  'PLD',
  'WAR',
  'BLU',
  'BST',
  'ilvl',
  'name',
  'desc',
  'head',
  'ring',
];

/* One step of a path into a value: an object's key or an array's index. */
type Step = string | number;

/* A value that holds others (an object or an array). */
type Container = Record<Step, unknown>;
const isContainer = (value: unknown): value is Container => value !== null && typeof value === 'object';

/* A deep copy through JSON (undefined becomes null). */
export const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value) ?? 'null');

/* Every path (list of keys and indexes) to a value inside `value`. */
function pathsIn(value: unknown, at: Step[] = []): Step[][] {
  const own = at.length ? [at] : [];
  if (!isContainer(value)) {
    return own;
  }
  return [...own, ...Object.entries(value).flatMap(([key, child]) => pathsIn(child, [...at, Array.isArray(value) ? Number(key) : key]))];
}

/* A damaged copy of `good`: `count` random fields each deleted, replaced by a value found elsewhere in it, or replaced by
   one of WRONG. `rand` is a seeded number generator (rng). */
export function damage<T>(good: T, count: number, rand: () => number): T {
  const int = (n: number): number => Math.floor(rand() * n);
  const pick = <Item>(list: readonly Item[]): Item => list[int(list.length)];
  const copy = clone(good);
  const all = pathsIn(copy);
  const valueAt = (path: Step[]): unknown => path.reduce((value: unknown, key) => (isContainer(value) ? value[key] : value), copy);
  for (let n = 0; n < count; n++) {
    const path = pick(all);
    let parent: unknown = copy;
    for (const key of path.slice(0, -1)) {
      if (!isContainer(parent)) {
        parent = null;
        break;
      }
      parent = parent[key];
    }
    if (!isContainer(parent)) {
      continue;
    }
    const last = path[path.length - 1];
    const how = int(6);
    if (how === 0) {
      if (Array.isArray(parent)) {
        parent.splice(Number(last), 1);
      } else {
        delete parent[last];
      }
    } else if (how === 1) {
      parent[last] = clone(pick(all.map(valueAt).filter(value => value !== undefined)) ?? null);
    } else {
      parent[last] = clone(pick(WRONG));
    }
  }
  return copy;
}
