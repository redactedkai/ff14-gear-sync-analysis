/* Pool items and the real-item database (src/data/items.json).
   A pool item: {id, name, type, ilvl, stats (neutral keys), copies, src: 'game' | 'generated' | 'custom'}. */
import {
  SLOT_LABEL,
  ITEM_STAT_ORDER,
  DB_SLOT_TYPE,
  DB_SLOT_PCT,
  DB_SLOT_BLOCKS,
  ACTIVITIES,
  ACTIVITY_MARKET_BIT,
  EXPANSIONS,
  ROW,
  GEAR_CATEGORIES,
  DAMAGE_DEFENSE_KEYS,
} from './constants.js';
import { levelParams } from './level-params.js';
import { ITEMS, MP } from './tables.js';
import { blankStats, buildPiece } from './formulas.js';

let nextId = 1;
function newId() {
  return 'i' + nextId++;
}

/* A pool item with defaults (one copy, hand-made); `stats` may leave stats out (0), `extra` overrides any field. */
export function mkItem(name, type, ilvl, stats, extra) {
  return Object.assign({ id: newId(), name, type, ilvl, stats: Object.assign(blankStats(), stats), copies: 1, src: 'custom' }, extra || {});
}

/* Generic pieces: every ordered pair (A, B) of allowed substats per slot type. */
export function genericItems(job, ilvl, subsAllowed, types) {
  const items = [];
  types.forEach(t => {
    subsAllowed.forEach(a => {
      subsAllowed.forEach(b => {
        if (a === b) return;
        const st = buildPiece(job, ilvl, t, [a, b]);
        const nm = SLOT_LABEL[t] + ' ilvl ' + ilvl + ' · ' + job.short[a] + '/' + job.short[b];
        items.push(mkItem(nm, t, ilvl, st, { src: 'generated', copies: 2 }));
      });
    });
  });
  return items;
}

/* The position of a raw stat key ('crit', 'sps', 'mainAttr', ...) in a row's stats (ITEM_STAT_ORDER). */
export function statIdx(key) {
  return ITEM_STAT_ORDER.indexOf(key);
}

/* A database row's raw stats as numbers, in ITEM_STAT_ORDER (the row stores them comma-joined). */
export function rowStats(row) {
  return row[ROW.stats].split(',').map(Number);
}

/* A database row's raw stats as this job's neutral keys. The game's generic Main Attribute adds to the job's main stat;
   Secondary Attribute adds to its secondary stat: Piety or Tenacity where the job has one (spec), Direct Hit otherwise
   (xivgear's mapping, with in-game values for a healer and a Ninja). A tank's main stat here is Strength (verified: patch
   5.0 notes changed it from Vitality; ClassJob.PrimaryStat); its Tenacity from Secondary Attribute is inferred. */
export function dbStats(job, raw) {
  const rawOf = k => raw[statIdx(k)] || 0;
  const profile = job.profile; // which raw stat each neutral key means for this job
  const secAttr = rawOf('secAttr');
  return {
    main: rawOf(profile.main) + rawOf('mainAttr'),
    vit: rawOf('vit'),
    crit: rawOf('crit'),
    det: rawOf('det'),
    dh: rawOf('dh') + (profile.spec ? 0 : secAttr),
    spd: rawOf(profile.spd),
    spec: profile.spec ? rawOf(profile.spec) + secAttr : 0,
  };
}

const kindCache = new Map();
/* The stat factors of a database item kind (a row's statFactor) as this job's neutral keys: MP[raw stat][kind] / 100
   (Vitality 0.9 on Int/Mind gear; every main stat 0.9 on pieces that carry all four). Null for an unknown kind, which
   means the job's own factors (jobFactor in formulas.js). Frozen and cached per job and kind. A piece whose main stat is
   the generic Main Attribute still takes its kind's factor for the job's main stat under sync: Azeyma's Earrings
   (kind 0) synced to item level 430 show main 71 in game (xivgear's test notes), the 0.9 cap, not the full 78. */
export function kindFactors(job, kind) {
  if (kind == null || MP.vit[kind] == null) return null;
  const key = job.jobId + '|' + kind;
  let factors = kindCache.get(key);
  if (!factors) {
    const profile = job.profile;
    // the raw stat each neutral key reads for this job; MP holds percents, the factors here are fractions
    const rawKeyOf = { main: profile.main, vit: 'vit', crit: 'crit', det: 'det', dh: 'dh', spd: profile.spd, spec: profile.spec };
    factors = Object.freeze(Object.fromEntries(Object.entries(rawKeyOf).map(([s, k]) => [s, k ? MP[k][kind] / 100 : 1])));
    kindCache.set(key, factors);
  }
  return factors;
}

/* A database row as an object, named as below (the fields of ROW, plus the slot code's type, share and blocks). */
export function parseRow(r) {
  return {
    name: r[ROW.name],
    slotCode: r[ROW.slotCode],
    type: DB_SLOT_TYPE[r[ROW.slotCode]],
    pct: DB_SLOT_PCT[r[ROW.slotCode]], // slot share, thousandths
    blocks: DB_SLOT_BLOCKS[r[ROW.slotCode]], // slot types it leaves empty
    ilvl: r[ROW.ilvl],
    lvl: r[ROW.equipLevel],
    mask: r[ROW.jobMask],
    st: rowStats(r),
    unique: !!r[ROW.unique],
    hq: !!r[ROW.hq], // can be high quality: the stats are the HQ ones
    routes: r[ROW.routes], // ways to get it: bit masks over ACTIVITIES (routesAllow)
    kind: r[ROW.kind], // item kind: the column of the stat factor table MP (kindFactors)
    meldSlots: r[ROW.meldSlots], // guaranteed materia slots
    overmeld: !!r[ROW.overmeld], // overmelding allowed
    gameId: r[ROW.gameId], // the game's item id (Item.csv row), for links to and checks against other tools
    scales: !!r[ROW.scales], // item level follows the wearer's level (Item.SubStatCategory 2; syncTarget)
  };
}

/* Item level span of each expansion: from the previous expansion's level-cap sync item level to its own (the last
   one is open-ended). [{short, name, from, to}], `from` of the first and `to` of the last are null. */
export function expansionBounds() {
  // the item level gear is synced to at each expansion's level cap
  const capSync = EXPANSIONS.map(([, , levelCap]) => levelParams(levelCap).sync);
  return EXPANSIONS.map(([short, name], i) => ({
    short,
    name,
    from: i ? capSync[i - 1] : null,
    to: i < EXPANSIONS.length - 1 ? capSync[i] : null,
  }));
}

/* The expansion a database piece belongs to (an EXPANSIONS short name), from its equip level: each expansion raised the
   level cap (50, 60, ... 100), so the band its equip level falls in names it. Inferred, not a game column (items have
   no expansion or patch field); checked against item ids, which run roughly in release order: late ids in an old band
   are new jobs' weapons added to old content, which belong with it. Level-1 pieces (gift earrings and rings released
   later) use the item level band of expansionBounds instead. */
export function expansionOf(lvl, ilvl) {
  if (lvl > 1) {
    const [short] = EXPANSIONS.find(([, , levelCap]) => lvl <= levelCap) ?? EXPANSIONS.at(-1);
    return short;
  }
  const b = expansionBounds().find(x => (x.from == null || ilvl > x.from) && (x.to == null || ilvl <= x.to));
  return b.short;
}

/* Whether `text` passes a search box: every word of `query` is in it, ignoring case; an empty search passes
   everything. The rule of every search on the page (the gear browser, the Food menu, pieces with the same result). */
export function searchMatches(text, query) {
  const lower = text.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every(w => lower.includes(w));
}

/* Database rows this job can equip, matching the filter {q, type, expOff, ilvlMin, ilvlMax, lvlMax} (expOff: the
   EXPANSIONS short names to hide). Returns parsed rows. Rows above the job's level cap (job.maxLevel) are left out
   whatever lvlMax says: the job can never wear them.
   The job mask alone decides the weapon kind: Paladin has only one-handed weapons and shields, and White Mage also has
   an A Realm Reborn wand and shield (Tidal Wave, item level 100) besides its two-handed weapons. */
export function browseItems(job, f) {
  const bit = 1 << job.jobIndex,
    out = [];
  const q = (f.q || '').trim();
  const mainIdx = statIdx(job.profile.main),
    attrIdx = statIdx('mainAttr');
  for (let k = 0; k < ITEMS.length; k++) {
    const r = ITEMS[k];
    // cheap checks on the raw row first; parseRow (which splits the stats) runs only for rows that pass
    if (!(r[ROW.jobMask] & bit)) continue;
    if (f.type && f.type !== 'any' && DB_SLOT_TYPE[r[ROW.slotCode]] !== f.type) continue;
    if (f.expOff?.length && f.expOff.includes(expansionOf(r[ROW.equipLevel], r[ROW.ilvl]))) continue;
    if (f.ilvlMin && r[ROW.ilvl] < f.ilvlMin) continue;
    if (f.ilvlMax && r[ROW.ilvl] > f.ilvlMax) continue;
    if (r[ROW.equipLevel] > job.maxLevel || (f.lvlMax && r[ROW.equipLevel] > f.lvlMax)) continue;
    if (q && !searchMatches(r[ROW.name], q)) continue;
    const p = parseRow(r);
    if (!p.st[mainIdx] && !p.st[attrIdx]) continue; // must carry this job's main stat, or Main Attribute
    out.push(p);
  }
  return out;
}

/* Identity of a piece in the pool: the same name, slot and item level is the same piece. */
export const poolKey = x => [x.name, x.type, x.ilvl].join('|');

let rowIndex = null;
/* The database facts about a pool item ({routes, slotCode, kind, lvl, scales, slots, overmeld, category}), looked up by its pool key, so saved pools need no
   repair when a fact is added. Null for items not from the database (hand-made, generated). */
function rowFacts(item) {
  if (item.src !== 'game') return null;
  if (!rowIndex) {
    // built once: several rows can share a pool key (the same piece from two sources); their routes are joined (any
    // one gets it), every other fact comes from the first such row
    rowIndex = new Map();
    for (const r of ITEMS) {
      const k = poolKey({ name: r[ROW.name], type: DB_SLOT_TYPE[r[ROW.slotCode]], ilvl: r[ROW.ilvl] });
      const f = rowIndex.get(k);
      rowIndex.set(k, {
        routes: f ? [...new Set([...f.routes, ...r[ROW.routes]])] : r[ROW.routes],
        slotCode: f ? f.slotCode : r[ROW.slotCode],
        kind: f ? f.kind : r[ROW.kind],
        lvl: f ? f.lvl : r[ROW.equipLevel],
        scales: f ? f.scales : !!r[ROW.scales],
        slots: f ? f.slots : r[ROW.meldSlots],
        overmeld: f ? f.overmeld : !!r[ROW.overmeld],
        category: f ? f.category : r[ROW.category],
        damageDefense: f ? f.damageDefense : Object.fromEntries(DAMAGE_DEFENSE_KEYS.map(k => [k, r[ROW[k]]])),
      });
    }
  }
  return rowIndex.get(poolKey(item)) || null;
}

/* A pool item's weapon damage and defense facts: {slotCode, kind, values: {damagePhys, damageMag, defensePhys,
   defenseMag}} (with the HQ bonus when it can be HQ), or null for items not from the database. */
export function damageDefenseFacts(item) {
  const f = rowFacts(item);
  return f ? { slotCode: f.slotCode, kind: f.kind, values: f.damageDefense } : null;
}

/* A pool item's routes (bit masks over ACTIVITIES, see routesAllow), or null for items not from the database. */
export function itemRoutes(item) {
  return rowFacts(item)?.routes ?? null;
}

/* A pool item's gear category ({key, label} of GEAR_CATEGORIES: where it comes from), or null for items not from the
   database. */
export function categoryOf(item) {
  const f = rowFacts(item);
  return f ? GEAR_CATEGORIES[f.category] : null;
}

/* True for a relic whose substats the player allocates in game (Zodiac Zeta, Anima, Eureka, Resistance, Manderville,
   Phantom Occultum, ...): a database piece of the Relic category with no substat and no materia slot, as the game files
   list them. The optimizer cannot model the allocation, so its search leaves them out (owner's decision 2026-10-18;
   docs/engineering/optimizer.md section 7): as listed, with main stat only, they would win on main stat or
   weapon damage while giving up every substat. */
export function allocatedRelic(job, item) {
  return categoryOf(item)?.key === 'relic' && meldInfo(item)?.slots === 0 && job.substats.every(s => !item.stats[s]);
}

/* A pool item's equip level (the level a character needs to wear it), or null for items not from the database. */
export function equipLevel(item) {
  return rowFacts(item)?.lvl ?? null;
}

/* True when a pool item's item level follows the wearer's level (Item.SubStatCategory 2: level 89 and 99 boost gear,
   gift earrings and rings), so level sync lowers it whatever its equip level (syncTarget). False for items not from
   the database. */
export function scalesWithLevel(item) {
  return rowFacts(item)?.scales ?? false;
}

/* The job can wear the pool item: its equip level is at most the job's level cap. Items not from the database (no
   equip level) count as wearable. */
export function wearable(job, item) {
  return (equipLevel(item) ?? 0) <= job.maxLevel;
}

/* A pool item's materia slots: {slots, overmeld} (guaranteed slots; whether overmelding is allowed), or null for items
   not from the database (hand-made, generated) and saved items no database row matches any more. A hand-made piece
   may carry its own `meld` ({slots, overmeld}): the sync explainer's generic pieces take 2 slots, as most gear does. */
export function meldInfo(item) {
  if (item.meld) return item.meld;
  const f = rowFacts(item);
  return f ? { slots: f.slots, overmeld: f.overmeld } : null;
}

/* A pool item's slot share (pct, thousandths), the slot types it leaves empty (blocks) and its stat factors (factors,
   kindFactors). A database piece has those of its slot code and item kind; any other piece those of the job: a weapon
   on a two-handed job blocks the off-hand, and factors null means the job's own (jobFactor in formulas.js). */
export function slotInfo(job, item) {
  const f = rowFacts(item);
  if (f) return { pct: DB_SLOT_PCT[f.slotCode], blocks: DB_SLOT_BLOCKS[f.slotCode], factors: kindFactors(job, f.kind) };
  return {
    pct: job.slotPct[item.type],
    // slot code 0 is the two-handed weapon, which blocks the off-hand
    blocks: item.type === 'weapon' && job.weaponMode === '2h' ? DB_SLOT_BLOCKS[0] : [],
    factors: null,
  };
}

/* "Body + Head" for a piece that also covers the head; the off-hand a two-handed weapon blocks is not named. */
export function slotLabel(type, blocks) {
  return [SLOT_LABEL[type], ...blocks.filter(t => t !== 'offhand').map(t => SLOT_LABEL[t])].join(' + ');
}

/* The route bits the "Gear from" filter allows: every ACTIVITIES box not in `off` (a list of keys), plus the market
   board when `market` is on. */
export function allowedActivities(off, market) {
  const boxes = ACTIVITIES.filter(a => !off.includes(a.key)).reduce((m, a) => m | a.bit, 0);
  return market ? boxes | ACTIVITY_MARKET_BIT : boxes;
}

/* True when one of the routes needs only allowed bits (allowedActivities): that way of getting the piece is open. */
export function routesAllow(routes, allowed) {
  return routes.some(m => (m & ~allowed) === 0);
}

/* The ACTIVITIES keys no piece in `routeLists` can come from (an array of route lists): boxes with nothing for the
   current job and filters, which the menu greys out. */
export function emptyActivities(routeLists) {
  let seen = 0;
  for (const routes of routeLists) for (const m of routes) seen |= m;
  return ACTIVITIES.filter(a => !(seen & a.bit)).map(a => a.key);
}

/* Pool items matching the gear filters {expOff, ilvlMin, ilvlMax, lvlMax}: browseItems' filters, for pool items (the
   optimizer's Gear to search). An item with no equip level (not from the database) passes the equip level filter and
   takes its expansion from its item level. */
export function filterGear(pool, f) {
  const expOff = f.expOff?.length ? f.expOff : null;
  if (!expOff && !f.ilvlMin && !f.ilvlMax && !f.lvlMax) return pool;
  return pool.filter(i => {
    if ((f.ilvlMin && i.ilvl < f.ilvlMin) || (f.ilvlMax && i.ilvl > f.ilvlMax)) return false;
    const lvl = equipLevel(i);
    if (f.lvlMax && lvl != null && lvl > f.lvlMax) return false;
    return !expOff?.includes(expansionOf(lvl ?? 0, i.ilvl));
  });
}

/* The pool items the "Gear from" filter lets through: `off` is the list of ACTIVITIES keys left out, `market` the market
   board switch. Items not from the database (hand-made, generated) always pass. */
export function withActivities(pool, off, market) {
  const allowed = allowedActivities(off, market);
  return pool.filter(i => {
    const routes = itemRoutes(i);
    return routes === null || routesAllow(routes, allowed);
  });
}

/* How many of a piece can be worn at once: a ring that is not Unique twice, anything else once. */
export function copiesOf(type, unique) {
  return type === 'ring' && !unique ? 2 : 1;
}

/* A parsed database row (parseRow) as a pool item, with its stats as this job's neutral keys. */
export function poolItemFromRow(job, row) {
  return mkItem(row.name, row.type, row.ilvl, dbStats(job, row.st), { src: 'game', hq: !!row.hq, copies: copiesOf(row.type, row.unique) });
}
