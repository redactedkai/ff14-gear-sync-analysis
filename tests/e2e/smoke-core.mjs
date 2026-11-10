/* What the page must show, computed from src/core directly (the core is checked against a brute force over every
loadout in tests/unit). Run in a worker thread by smoke.mjs: each call takes up to a second of synchronous work, which
would otherwise stall every page the smoke test is driving. */

import { isMainThread, parentPort } from 'node:worker_threads';
import { allocatedRelic, allowedActivities, browseItems, poolItemFromRow, routesAllow, withActivities } from '../../src/core/items.js';
import { makeJobContext } from '../../src/core/job-context.js';
import { optimize } from '../../src/core/optimizer/index.js';
import { DEFAULT_EXCLUDE } from '../../src/ui/settings.js';
import { statBase } from '../../src/core/food.js';
import { runRecipe } from '../../src/core/recipe.js';
import { makeSession } from '../../src/core/session.js';
import { evaluateSet } from '../../src/core/set.js';

// "Gear from" boxes left out by default, in a set's Fill settings and the browser (owner's decision); smoke.mjs uses them too.
export { DEFAULT_EXCLUDE };

// A set's Fill searches every piece the job can wear that "Gear from" lets through (the default boxes, market board on)
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

/** The core's best `target` over the pieces the browser's own filters keep (`f`: browseItems', so a different route to
 * the pool than the Fill's), through the default "Gear from" boxes, minus the allocated relics, with materia on; plus the
 * piece counts. For the Fill settings' Expansion, item level and equip level boxes. */
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

// A set's default Fill settings as a recipe (ui/views/set-page.js defaultFillSettings, typed in here): the main stat, no
// tiebreak, materia on, food off, any GCD, spare points to tiebreaks on, every expansion, the default "Gear from" boxes
// and the market board, no item level range, the equip level filter at the level cap.
const DEFAULT_RECIPE = {
  target: 'main',
  tb: '',
  tb2: '',
  melds: true,
  food: false,
  gcd: '',
  gcdMode: 'exact',
  byTier: true,
  expOff: [],
  exclude: DEFAULT_EXCLUDE,
  market: true,
  min: '',
  max: '',
  lvl: 100,
};

/** What a Fill with the settings `fields` (a recipe's, over the defaults) finds for `jobId` under `sync` ({cap, sync,
 * level}): the character panel's totals of the set it suggests (gear, meal and the level's base, as the Total row shows
 * them), the meal's bonus per stat, its GCD text ("2.48s"), the meal's key, or only {status} when there is no set. */
export function coreRecipe(jobId, sync, fields) {
  const job = makeJobContext(jobId);
  const level = sync.level ?? 100;
  const run = runRecipe(job, sync, level, { ...DEFAULT_RECIPE, ...fields }, makeSession());
  if (run.status !== 'ok') return { status: run.status };
  const evaluated = evaluateSet(job, run.set, sync, level);
  const totals = Object.fromEntries(job.stats.map(s => [s, evaluated.withFood[s] + evaluated.base[s]]));
  const bonus = Object.fromEntries(job.stats.map(s => [s, evaluated.bonus[s]?.bonus ?? 0]));
  return { status: 'ok', totals, bonus, gcd: `${evaluated.gcd.gcd.toFixed(2)}s`, meal: evaluated.meal?.key ?? null };
}

/** The stat keys `jobId` has (job.stats), for a step that needs to know whether a job has a special substat. */
export function coreStats(jobId) {
  return [...makeJobContext(jobId).stats];
}

export function coreRings(jobId, ilvlMin, ilvlMax, lvlMax) {
  const job = makeJobContext(jobId);
  const allowed = allowedActivities(DEFAULT_EXCLUDE, true);
  const rows = browseItems(job, { type: 'ring', ilvlMin, ilvlMax, lvlMax }).filter(r => routesAllow(r.routes, allowed));
  return { count: rows.length, x2: rows.filter(r => !r.unique).length };
}

const FUNCTIONS = { coreGear, coreFiltered, coreRecipe, coreRings, coreStats };

if (!isMainThread) {
  parentPort.on('message', ({ id, fn, args }) => {
    try {
      parentPort.postMessage({ id, result: FUNCTIONS[fn](...args) });
    } catch (e) {
      parentPort.postMessage({ id, error: String(e.stack ?? e) });
    }
  });
}
