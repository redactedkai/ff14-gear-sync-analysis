/* A solver session: the work kept between solves, so a new solve redoes only what its settings change. One per page
   today (the optimizer component's); one per sheet of sets later, so sets with their own recipes do not throw each
   other's work away.

   It holds, per kind, the last SESSION_SIZE entries used (least recently used dropped first):
     gear   each job's gear, every database piece it can wear as frozen pool items (~5-10 ms to build; the meld caps
            are cached per pool item object, core/meld.js, so the same objects keep them warm from solve to solve)
     prep   the candidate lists Target GCD searches over (optimizeGcd's prep)
     fast   the fastest GCD a pool reaches (fastestGcd)
     same   every piece of a pool as a candidate for the goal, unpruned (the rows' menus of pieces with the same result)
     tier   tier ranking's candidate lists (rankByTier's cache, a Map it fills itself)
   What each kind's key is made of, from a recipe, is written once: recipeKey in recipe.js. The session never reads a
   recipe itself; it only stores what it is handed under the key it is handed.

   Gear comes from one source for the whole session (`gear`, by default every piece the job can wear), so the keys
   need not name it: a test with its own pool makes its own session. */
import { jobGear } from './items.js';

/* How many entries each kind keeps (audit 16, R2: a small LRU). Four lets a sheet switch between a few sets, or the page
   go back to a previous setting, without solving again; one search's lists are a few MB at most. */
export const SESSION_SIZE = 4;

/* A new, empty session. `gear(job)` builds the pool items a job's solves search (`job` a JobContext; jobGear, every
   piece the job can wear, unless a test passes its own); `size` the entries kept per kind. Returns {gear, get, set,
   memo}:
   - gear(job): the job's gear (gear(job), built once and kept while it is among the last `size` jobs)
   - get(kind, key): the value kept under `key` (a string) for `kind`, or undefined; a hit becomes the most recently
     used
   - set(kind, key, value): keeps `value` there, dropping the least recently used entry past `size`
   - memo(kind, key, build): get, or build() kept with set. A null `key` means "do not keep": build() runs every time. */
export function makeSession({ gear = jobGear, size = SESSION_SIZE } = {}) {
  const kinds = new Map();
  const entriesOf = kind => {
    if (!kinds.has(kind)) kinds.set(kind, new Map());
    return kinds.get(kind);
  };
  const get = (kind, key) => {
    const entries = entriesOf(kind);
    if (!entries.has(key)) return undefined;
    const value = entries.get(key);
    entries.delete(key);
    entries.set(key, value);
    return value;
  };
  const set = (kind, key, value) => {
    const entries = entriesOf(kind);
    entries.delete(key);
    entries.set(key, value);
    if (entries.size > size) entries.delete(entries.keys().next().value);
  };
  const memo = (kind, key, build) => {
    if (key == null) return build();
    if (entriesOf(kind).has(key)) return get(kind, key);
    const value = build();
    set(kind, key, value);
    return value;
  };
  return Object.freeze({ gear: job => memo('gear', job.jobId, () => gear(job)), get, set, memo });
}
