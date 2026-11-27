/* A solver session: the one thing kept between solves, each job's gear (every database piece the job can wear, as frozen
   pool items; ~5-10 ms to build). The meld caps are cached per pool item object (core/meld.ts), so keeping the same
   objects keeps them warm from solve to solve.

   Nothing else is kept: the search's candidate lists (tier ranking's, Target GCD's, the rows' menus, the fastest GCD)
   are built again by every solve. Measured against keeping them: a repeated Auto-fill saved 0.1 to 0.8 s for 8 to 50 MB per
   recipe, and a new Target GCD on the same set saved 0.2 to 1.5 s with tier ranking on, so it was dropped.

   Gear comes from one source for the whole session (`gear`, by default every piece the job can wear): a test with its
   own pool makes its own session. */
import { must } from './guards.ts';
import { jobGear } from './items.ts';
import type { JobContext, PoolItem } from './types.ts';

/* A solver session (makeSession): `gear(job)` is the job's gear, built once and kept while the job is among the last few. */
export interface SolverSession {
  readonly gear: (job: JobContext) => readonly PoolItem[];
}

/* How many jobs' gear the session keeps (least recently used dropped first). */
export const SESSION_SIZE = 4;

/* A new, empty session. `gear(job)` builds the pool items a job's solves search (`job` a JobContext; jobGear, every
   piece the job can wear, unless a test passes its own); `size` the jobs kept. Returns {gear}:
   - gear(job): the job's gear, built once and kept while it is among the last `size` jobs. */
export function makeSession({
  gear = jobGear,
  size = SESSION_SIZE,
}: {
  gear?: (job: JobContext) => readonly PoolItem[];
  size?: number;
} = {}): SolverSession {
  const kept = new Map<string, readonly PoolItem[]>();
  return Object.freeze({
    gear: (job: JobContext) => {
      if (kept.has(job.jobId)) {
        const items = must(kept, job.jobId, 'kept items');
        kept.delete(job.jobId);
        kept.set(job.jobId, items);
        return items;
      }
      const items = gear(job);
      kept.set(job.jobId, items);
      if (kept.size > size) {
        const oldest = kept.keys().next();
        if (!oldest.done) {
          kept.delete(oldest.value);
        }
      }
      return items;
    },
  });
}
