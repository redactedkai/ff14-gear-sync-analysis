/* What the page must show, computed from src/core directly (the core is checked against a brute force over every
loadout in tests/unit). Run in a worker thread by smoke.mjs: each call takes up to a second of synchronous work, which
would otherwise stall every page the smoke test is driving. */

import { isMainThread, parentPort } from 'node:worker_threads';
import { browseItems, poolItemFromRow, sourcesMask, withoutSources } from '../../src/core/items.js';
import { makeJobContext } from '../../src/core/job-context.js';
import { optimize } from '../../src/core/optimizer/index.js';
import { panelBase } from '../../src/ui/views/optimizer.js';

// Gear groups left out by default, in the optimizer and the browser (owner's decision; DEFAULT_EXCLUDE in
// src/ui/state.js).
export const DEFAULT_EXCLUDE = ['savage', 'ultimate', 'pvp'];

// The optimizer searches every piece the job can wear, minus the gear groups unticked under Gear to search (Current
// Savage, Ultimate and PvP by default). Totals are character panel numbers as the page shows them: the level's base
// added for a substat (panelBase; its values are checked against AkhMorning in tests/unit/views.test.js).

/** The core's best `target` over every piece `jobId` can wear minus the default left-out groups, with materia on
 * (on) and off (off), and with the `extra` groups left out too (without); plus the piece counts. */
export function coreGear(jobId, sync, target, extra = [], def = DEFAULT_EXCLUDE) {
  const job = makeJobContext(jobId);
  const gear = browseItems(job, {}).map(r => poolItemFromRow(job, r));
  const pool = withoutSources(gear, def);
  const base = panelBase(job, target, sync.level ?? 100);
  const best = (p, melds) => optimize(job, p, sync, { target, melds }).totals[target] + base;
  return {
    all: gear.length,
    searched: pool.length,
    on: best(pool, true),
    off: best(pool, false),
    without: best(withoutSources(pool, extra), true),
  };
}

/** The optimizer's gear filters (Gear to search): the pieces browseItems keeps with the same filters, minus the default
 * left-out groups. */
export function coreFiltered(jobId, sync, target, f) {
  const job = makeJobContext(jobId);
  const all = browseItems(job, {}).length;
  const pool = withoutSources(
    browseItems(job, f).map(r => poolItemFromRow(job, r)),
    DEFAULT_EXCLUDE,
  );
  const on = optimize(job, pool, sync, { target, melds: true }).totals[target] + panelBase(job, target, sync.level ?? 100);
  return { all, searched: pool.length, on };
}

export function coreRings(jobId, ilvlMin, ilvlMax, lvlMax) {
  const job = makeJobContext(jobId);
  const mask = sourcesMask(DEFAULT_EXCLUDE);
  const rows = browseItems(job, { type: 'ring', ilvlMin, ilvlMax, lvlMax }).filter(r => !(r.sources & mask));
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
