/* Performance workloads for the gear optimizer (docs/engineering/optimizer.md, section 8).
   Every pool is built fresh from the item database, so a new pool means new item objects (cold caches keyed by item). */
import { ACTIVITIES, JOBS } from '../../src/core/constants.js';
import { DEFAULT_EXCLUDE } from '../../src/ui/state.js';
import { makeJobContext } from '../../src/core/job-context.js';
import { browseItems, poolItemFromRow } from '../../src/core/items.js';

export const JOB_IDS = JOBS.map(j => j.id);

/* The job's full pool: every database piece it can equip (what "add all" gives with no filter). */
export function fullPool(job) {
  return browseItems(job, {}).map(r => poolItemFromRow(job, r));
}

/* Sync settings {cap, sync, level, label}: off; item level caps at level 100 (incl. the materia gate edges 290, 690);
   level sync alone; and real duty pairs of level and item level cap. */
export const SYNCS = [
  { label: 'off', cap: null, sync: false, level: 100 },
  ...[123, 290, 400, 530, 660, 690, 795].map(cap => ({ label: `cap ${cap}`, cap, sync: true, level: 100 })),
  ...[50, 60, 70, 80, 90].map(level => ({ label: `lvl ${level}`, cap: null, sync: false, level })),
  ...[
    [50, 123],
    [60, 290],
    [70, 345],
    [80, 475],
    [90, 635],
  ].map(([level, cap]) => ({ label: `lvl ${level} cap ${cap}`, cap, sync: true, level })),
];

/* A small seeded generator, so every run of a script draws the same objectives. */
export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 2 ** 32;
  };
}

/* O-lite: every single target; every target > tiebreak pair of substats; 12 three-key tuples; 2 with a repeated key. */
export function objectivesLite(job, seed = 7) {
  const out = job.stats.map(t => ({ target: t, tiebreak: [] }));
  const subs = job.substats;
  subs.forEach(a => {
    subs.forEach(b => {
      if (a !== b) out.push({ target: a, tiebreak: [b] });
    });
  });
  const r = rng(seed);
  const pick = list => list[Math.floor(r() * list.length)];
  for (let i = 0; i < 12; i++) {
    const a = pick(job.stats);
    const rest = job.stats.filter(s => s !== a);
    const b = pick(rest);
    out.push({ target: a, tiebreak: [b, pick(rest.filter(s => s !== b))] });
  }
  out.push({ target: subs[0], tiebreak: [subs[0]] });
  out.push({ target: subs[1], tiebreak: [subs[2], subs[2]] });
  return out;
}

/* O-full: every target x tiebreak 1 x tiebreak 2 (none included). */
export function objectivesFull(job) {
  const opt = [null, ...job.stats];
  const out = [];
  job.stats.forEach(t => {
    opt.forEach(a => {
      opt.forEach(b => {
        out.push({ target: t, tiebreak: [a, b].filter(Boolean) });
      });
    });
  });
  return out;
}

/* "Gear from" settings to time, {off: ACTIVITIES keys left out, market}: every box, the defaults with and without the
   market board, the defaults plus each box they leave out (one at a time), and the defaults minus each big box. Every
   subset of 20 boxes would be a million runs; these cover the pool sizes a player meets. */
export function excludeMasks() {
  const keys = ACTIVITIES.map(a => a.key);
  const out = [
    { off: [], market: true },
    { off: [...DEFAULT_EXCLUDE], market: true },
    { off: [...DEFAULT_EXCLUDE], market: false },
  ];
  for (const k of DEFAULT_EXCLUDE) out.push({ off: DEFAULT_EXCLUDE.filter(x => x !== k), market: true });
  for (const k of ['crafted', 'normal_duties', 'tomes_legacy', 'relics']) out.push({ off: [...DEFAULT_EXCLUDE, k], market: false });
  out.push({ off: keys, market: true }); // the market board only
  return out;
}

export const job = id => makeJobContext(id);
