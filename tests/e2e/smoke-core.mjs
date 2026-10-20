/* What the page must show, computed from src/core directly (the core is checked against a brute force over every
loadout in tests/unit). Run in a worker thread by smoke.mjs: each call takes up to a second of synchronous work, which
would otherwise stall every page the smoke test is driving. */

import { isMainThread, parentPort } from 'node:worker_threads';
import { allocatedRelic, allowedActivities, browseItems, poolItemFromRow, routesAllow, withActivities } from '../../src/core/items.js';
import { makeJobContext } from '../../src/core/job-context.js';
import { optimize } from '../../src/core/optimizer/index.js';
import { DEFAULT_EXCLUDE } from '../../src/ui/settings.js';
import { statBase } from '../../src/core/food.js';

// "Gear from" boxes left out by default, in the optimizer and the browser (owner's decision); smoke.mjs uses them too.
export { DEFAULT_EXCLUDE };

// The optimizer searches every piece the job can wear that "Gear from" lets through (the default boxes, market board on)
// minus the relics whose substats the player allocates (allocatedRelic). Totals are character panel numbers as the page
// shows them: the level's base added for a substat (statBase; its values are checked against AkhMorning in
// tests/unit/core-food.test.js).

/** The core's best `target` over every piece `jobId` can wear that the boxes left out (`def`) and the market board
 * switch (`market`) let through, with materia on (on) and off (off), and with the `extra` boxes left out too (without);
 * plus the piece counts. */
export function coreGear(jobId, sync, target, extra = [], def = DEFAULT_EXCLUDE, market = true) {
  const job = makeJobContext(jobId);
  const gear = browseItems(job, {}).map(r => poolItemFromRow(job, r));
  const searched = off => withActivities(gear, off, market).filter(i => !allocatedRelic(job, i));
  const pool = searched(def);
  const base = statBase(job, target, sync.level ?? 100);
  const best = (p, melds) => optimize(job, p, sync, { target, melds }).totals[target] + base;
  return {
    all: gear.length,
    searched: pool.length,
    on: best(pool, true),
    off: best(pool, false),
    without: best(searched([...def, ...extra]), true),
  };
}

/** The optimizer's gear filters (Gear to search): the pieces browseItems keeps with the same filters that the default
 * "Gear from" boxes let through, minus the allocated relics. */
export function coreFiltered(jobId, sync, target, f) {
  const job = makeJobContext(jobId);
  const all = browseItems(job, {}).length;
  const pool = withActivities(
    browseItems(job, f).map(r => poolItemFromRow(job, r)),
    DEFAULT_EXCLUDE,
    true,
  ).filter(i => !allocatedRelic(job, i));
  const on = optimize(job, pool, sync, { target, melds: true }).totals[target] + statBase(job, target, sync.level ?? 100);
  return { all, searched: pool.length, on };
}

export function coreRings(jobId, ilvlMin, ilvlMax, lvlMax) {
  const job = makeJobContext(jobId);
  const allowed = allowedActivities(DEFAULT_EXCLUDE, true);
  const rows = browseItems(job, { type: 'ring', ilvlMin, ilvlMax, lvlMax }).filter(r => routesAllow(r.routes, allowed));
  return { count: rows.length, x2: rows.filter(r => !r.unique).length };
}

const FUNCTIONS = { coreGear, coreFiltered, coreRings };

if (!isMainThread) {
  parentPort.on('message', ({ id, fn, args }) => {
    try {
      parentPort.postMessage({ id, result: FUNCTIONS[fn](...args) });
    } catch (e) {
      parentPort.postMessage({ id, error: String(e.stack ?? e) });
    }
  });
}
