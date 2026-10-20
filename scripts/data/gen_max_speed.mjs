/* The most total speed (base + gear + food) any job can have at each level from 1 to the level cap (MAX_LEVEL, the
   highest equip level in the item database, as the page uses), for the speed slider on How the math works, GCD:
   src/data/max-speed.json. Run by regen.py after the item and food tables (it reads them through src/core).
   Usage: node scripts/data/gen_max_speed.mjs <out.json>
          node scripts/data/gen_max_speed.mjs --check <file.json>   (is the file's `inputs` hash still current?)

   For each job, at each level up to its cap, the most gear speed is the best of three searches, with melds (the
   optimizer, target speed, weapon damage not first):
   - gear made for the level (equip level at most the level), no sync;
   - every piece, level synced;
   - every piece, synced to the highest item level cap the level allows (capCeiling), from level 15. Below that the
     cap case comes only from Ala Mhigan Earrings (equip level 1, item level 50, so the model allows a cap of 50 at
     level 1), and no duty syncs that low.
   Then the HQ meal that adds the most speed: speed with food grows with the speed it starts from, so the most gear
   speed plus the best meal is the most total. Jobs that wear the same pieces with the same speed and meals give the
   same answer, so each such group is searched once.

   A search that stops at NODE_LIMIT may miss the true most speed, so the generator then writes nothing and exits with
   status 1, naming the searches; raise NODE_LIMIT and run it again.

   The answer depends on code as well as data (the optimizer, sync, food), so the file records `inputs`, a sha256 over
   the data files and the code it is computed from (inputsHash). --check recomputes it without searching, and exits 1
   when the file is stale: run regen.py (or this script) again. */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { JOBS } from '../../src/core/constants.js';
import { allMeals, foodBonus, statBase } from '../../src/core/food.js';
import { browseItems, equipLevel, poolItemFromRow } from '../../src/core/items.js';
import { makeJobContext } from '../../src/core/job-context.js';
import { optimize } from '../../src/core/optimizer/index.js';
import { capCeiling } from '../../src/core/sync-target.js';
import { MAX_LEVEL } from '../../src/core/tables.js';
import ITEM_FORMAT from '../../src/core/item-format.json' with { type: 'json' };

/* the cap case starts here (see above) */
const CAP_FROM_LEVEL = 15;
const NODE_LIMIT = 2e6;

/* The files the table is computed from, relative to the repo root, sorted: the item, food and item level data, the
   shared format, every module under src/core and this script. */
export function inputFiles() {
  const root = new URL('../../', import.meta.url);
  const core = readdirSync(new URL('src/core/', root), { recursive: true })
    .map(path => `src/core/${String(path).replaceAll('\\', '/')}`)
    .filter(path => path.endsWith('.js') || path.endsWith('.json'));
  const data = ['src/data/items.json', 'src/data/food.json', 'src/data/item-level.json'];
  return [...data, ...core, 'scripts/data/gen_max_speed.mjs'].sort();
}

/* 'sha256:<hex>' over each input file's path and text (line endings as LF, so a Windows checkout hashes the same). */
export function inputsHash(files = inputFiles()) {
  const hash = createHash('sha256');
  for (const path of files) {
    const text = readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8').replaceAll('\r\n', '\n');
    hash.update(`${path}\0${text}\0`);
  }
  return `sha256:${hash.digest('hex')}`;
}

/* Jobs grouped by what decides their answer: [{jobs: [id], job (the first one's JobContext), pool, meals}]. */
export function jobGroups() {
  const groups = new Map();
  for (const { id } of JOBS) {
    const job = makeJobContext(id);
    const pool = browseItems(job, {}).map(r => poolItemFromRow(job, r));
    const meals = allMeals(job).filter(m => m.stats.some(s => s.stat === 'spd'));
    const key = createHash('sha1')
      .update(JSON.stringify([job.maxLevel, pool.map(i => [i.name, i.ilvl, i.type, i.stats]), meals.map(m => m.key)]))
      .digest('hex');
    if (groups.has(key)) groups.get(key).jobs.push(id);
    else groups.set(key, { jobs: [id], job, pool, meals });
  }
  return [...groups.values()];
}

/* The most total speed a group can have at `level`, or null above its jobs' level cap. Each search that stopped at
   NODE_LIMIT is added to `truncated` as {jobs, level, case} (case: 'native', 'level sync' or 'cap'). */
export function groupMaxSpeed({ jobs, job, pool, meals }, level, truncated = []) {
  if (level > job.maxLevel) return null;
  const native = pool.filter(i => (equipLevel(i) ?? 0) <= level);
  const cases = [
    ['native', native, { cap: null, sync: false, level }],
    ['level sync', pool, { cap: null, sync: false, level }],
    ...(level >= CAP_FROM_LEVEL ? [['cap', pool, { cap: capCeiling(level), sync: true, level }]] : []),
  ];
  const runs = cases.map(([name, items, sync]) => {
    const run = optimize(job, items, sync, { target: 'spd', melds: true, weaponFirst: false, nodeLimit: NODE_LIMIT });
    if (run.truncated) truncated.push({ jobs: jobs ?? [job.jobId], level, case: name });
    return run;
  });
  const best = runs.filter(r => r.ok).reduce((a, r) => (r.totals.spd > (a?.totals.spd ?? -1) ? r : a), null);
  const gear = best?.totals.spd ?? 0;
  const food = Math.max(0, ...meals.map(m => foodBonus(job, m, { ...(best?.totals ?? {}), spd: gear }, level).spd?.bonus ?? 0));
  return statBase(job, 'spd', level) + gear + food;
}

/* Every level's most total speed over all groups: [level 1, ..., level `levels`]. Searches that stopped at NODE_LIMIT
   are added to `truncated` (see groupMaxSpeed). */
export function maxSpeedTable(groups = jobGroups(), levels = MAX_LEVEL, truncated = []) {
  const out = [];
  for (let level = 1; level <= levels; level++) {
    out.push(Math.max(...groups.map(g => groupMaxSpeed(g, level, truncated) ?? 0)));
  }
  return out;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const check = process.argv[2] === '--check';
  const out = process.argv[check ? 3 : 2];
  if (!out) {
    console.error('Usage: node scripts/data/gen_max_speed.mjs <out.json> | --check <file.json>');
    process.exit(2);
  }
  if (check) {
    const current = JSON.parse(readFileSync(out, 'utf8')).inputs === inputsHash();
    console.log(current ? `${out} is current.` : `${out} is stale: its data or code changed. Run python scripts/data/regen.py.`);
    process.exit(current ? 0 : 1);
  }
  // the data source the item tables were made from, so the file says which game data it describes
  const levelFile = JSON.parse(readFileSync(new URL('../../src/data/item-level.json', import.meta.url), 'utf8'));
  const truncated = [];
  const total = maxSpeedTable(jobGroups(), MAX_LEVEL, truncated);
  if (truncated.length) {
    const list = truncated.map(t => `${t.jobs.join('/')} level ${t.level} (${t.case})`).join(', ');
    console.error(
      `error: ${truncated.length} search(es) stopped at NODE_LIMIT ${NODE_LIMIT}, so their most speed may be too low: ${list}.`,
    );
    console.error('Raise NODE_LIMIT in scripts/data/gen_max_speed.mjs and run it again. Nothing was written.');
    process.exit(1);
  }
  const doc = { source: levelFile.source ?? null, formatVersion: ITEM_FORMAT.formatVersion, inputs: inputsHash(), total };
  writeFileSync(out, `${JSON.stringify(doc)}\n`);
}
