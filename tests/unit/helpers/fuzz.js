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

/* A deep copy through JSON (undefined becomes null). */
export const clone = value => {
  const text = JSON.stringify(value);
  return text === undefined ? null : JSON.parse(text);
};

/* Every path (list of keys and indexes) to a value inside `value`. */
function pathsIn(value, at = []) {
  const own = at.length ? [at] : [];
  if (value === null || typeof value !== 'object') {
    return own;
  }
  return [...own, ...Object.keys(value).flatMap(key => pathsIn(value[key], [...at, Array.isArray(value) ? Number(key) : key]))];
}

/* A damaged copy of `good`: `count` random fields each deleted, replaced by a value found elsewhere in it, or replaced by
   one of WRONG. `rand` is a seeded number generator (rng). */
export function damage(good, count, rand) {
  const int = n => Math.floor(rand() * n);
  const pick = list => list[int(list.length)];
  const copy = clone(good);
  const all = pathsIn(copy);
  const valueAt = path => path.reduce((value, key) => (value == null ? value : value[key]), copy);
  for (let n = 0; n < count; n++) {
    const path = pick(all);
    let parent = copy;
    for (const key of path.slice(0, -1)) {
      if (parent == null || typeof parent !== 'object') {
        parent = null;
        break;
      }
      parent = parent[key];
    }
    if (parent == null || typeof parent !== 'object') {
      continue;
    }
    const last = path.at(-1);
    const how = int(6);
    if (how === 0) {
      if (Array.isArray(parent)) {
        parent.splice(last, 1);
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
