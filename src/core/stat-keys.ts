/* Stat keys moved between jobs, and keys saved by an older build. Pure; no DOM.
   Today's stat keys are the game's own (constants.ts STAT_LABEL). Saved data from before that holds position keys, which
   named a place in the job's stat list: `main` (the main stat), `spd` (the speed stat), `spec` (the special substat). */

import { fromKeys } from './guards.ts';
import type { JobContext, PerStat, StatKey } from './types.ts';

/* The old position keys and the JobContext field that holds the game key at that position. */
const OLD_POSITION_KEY_FIELDS = Object.freeze({ main: 'mainKey', spd: 'speedKey', spec: 'specKey' } as const);

/* A JobContext field that holds the game key at a position of the job's stat list. */
type PositionField = (typeof OLD_POSITION_KEY_FIELDS)[keyof typeof OLD_POSITION_KEY_FIELDS];

/* The position of `key` in `job`'s stat list as a JobContext field name ('mainKey', 'speedKey' or 'specKey'), or null
   for a key that fills none of them (Vitality, Critical Hit, ...). */
function positionOf(job: JobContext, key: string): PositionField | null {
  return Object.values(OLD_POSITION_KEY_FIELDS).find(field => job[field] === key) ?? null;
}

/* `key`, a saved stat key, as a key of `job` (a JobContext): an old position key (main, spd, spec) becomes the game key
   at that position for the job, and any other value comes back as it is. `spec` on a job without a special substat
   comes back unchanged (a key the job lacks, which every reader already drops). Reading is tolerant: the old names
   never equal a game key, so a saved value of either kind is understood. */
export function currentStatKey(job: JobContext, key: string): string {
  const field = Object.hasOwn(OLD_POSITION_KEY_FIELDS, key) ? OLD_POSITION_KEY_FIELDS[key as keyof typeof OLD_POSITION_KEY_FIELDS] : null;
  return field && job[field] ? job[field] : key;
}

/* `key`, a stat key of job `from`, as the stat at the same position of job `to`: the main stat to the main stat (Mind
   to Intelligence), the speed stat to the speed stat, the special substat to the special substat. A key with no
   position (Vitality, Critical Hit, Determination, Direct Hit) comes back as it is, and so does one whose position the
   target job lacks (Piety on a job without one): the reader that checks the key against the job's stats drops it. */
export function remapStatKey(from: JobContext, to: JobContext, key: string): string {
  const field = positionOf(from, key);
  return field && to[field] ? to[field] : key;
}

/* One value per stat key the job has (`job.stats`, in that order): `valueFor(stat)` for each. For a table that the page and
   the optimizer index by the job's own keys. */
export function statTable<T>(job: JobContext, valueFor: (stat: StatKey) => T): PerStat<T> {
  return fromKeys(job.stats, valueFor);
}
