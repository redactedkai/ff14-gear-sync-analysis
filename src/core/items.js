/* Pool items and the real-item database (src/data/items.json).
   A pool item: {id, name, type, ilvl, stats (neutral keys), copies, src: 'game' | 'generated' | 'custom'}. */
import { SLOT_LABEL, ITEM_STAT_ORDER, DB_SLOT_TYPE, DB_SLOT_PCT, DB_SLOT_BLOCKS, SOURCES, EXPANSIONS } from './constants.js';
import { expansionBounds } from './speed.js';
import { ITEMS, MP } from './tables.js';
import { blankStats, buildPiece } from './formulas.js';

let nextId = 1;
export function newId() {
  return 'i' + nextId++;
}
/* After restoring saved items, make sure new ids never collide with theirs. */
export function reserveIds(ids) {
  let m = 0;
  ids.forEach(id => {
    const n = parseInt(String(id).slice(1), 10);
    if (n > m) m = n;
  });
  nextId = Math.max(nextId, m + 1);
}

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

export function statIdx(key) {
  return ITEM_STAT_ORDER.indexOf(key);
}

/* A database row's raw stats as this job's neutral keys. The game's generic Main Attribute adds to the job's main stat;
   Secondary Attribute adds to its secondary stat: Piety or Tenacity where the job has one (spec), Direct Hit otherwise
   (xivgear's mapping, with in-game values for a healer and a Ninja; inferred for tanks). */
export function dbStats(job, raw) {
  const g = k => raw[statIdx(k)] || 0;
  const p = job.profile;
  const sec = g('secAttr');
  return {
    main: g(p.main) + g('mainAttr'),
    vit: g('vit'),
    crit: g('crit'),
    det: g('det'),
    dh: g('dh') + (p.spec ? 0 : sec),
    spd: g(p.spd),
    spec: p.spec ? g(p.spec) + sec : 0,
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
  let f = kindCache.get(key);
  if (!f) {
    const p = job.profile;
    const raw = { main: p.main, vit: 'vit', crit: 'crit', det: 'det', dh: 'dh', spd: p.spd, spec: p.spec };
    f = Object.freeze(Object.fromEntries(Object.entries(raw).map(([s, k]) => [s, k ? MP[k][kind] / 100 : 1])));
    kindCache.set(key, f);
  }
  return f;
}

export function parseRow(r) {
  return {
    name: r[0],
    slotCode: r[1],
    type: DB_SLOT_TYPE[r[1]],
    pct: DB_SLOT_PCT[r[1]], // slot share, thousandths
    blocks: DB_SLOT_BLOCKS[r[1]], // slot types it leaves empty
    ilvl: r[2],
    lvl: r[3],
    mask: r[4],
    st: r[5].split(',').map(Number),
    unique: !!r[6],
    hq: !!r[7], // can be high quality: the stats are the HQ ones
    sources: r[8] | 0, // bit mask over SOURCES
    kind: r[9], // item kind: the column of the stat factor table MP (kindFactors)
    meldSlots: r[10], // guaranteed materia slots
    overmeld: !!r[11], // overmelding allowed
  };
}

/* The expansion a database piece belongs to (an EXPANSIONS short name), from its equip level: each expansion raised the
   level cap (50, 60, ... 100), so the band its equip level falls in names it. Inferred, not a game column (items have
   no expansion or patch field); checked against item ids, which run roughly in release order: late ids in an old band
   are new jobs' weapons added to old content, which belong with it. Level-1 pieces (gift earrings and rings released
   later) use the item level band of expansionBounds instead. */
export function expansionOf(lvl, ilvl) {
  if (lvl > 1) return (EXPANSIONS.find(e => lvl <= e[2]) || EXPANSIONS[EXPANSIONS.length - 1])[0];
  const b = expansionBounds().find(x => (x.from == null || ilvl > x.from) && (x.to == null || ilvl <= x.to));
  return b.short;
}

/* Database rows this job can equip, matching the filter {q, type, expOff, ilvlMin, ilvlMax, lvlMax} (expOff: the
   EXPANSIONS short names to hide). Returns parsed rows.
   The job mask alone decides the weapon kind: Paladin has only one-handed weapons and shields, and White Mage also has
   an A Realm Reborn wand and shield (Tidal Wave, item level 100) besides its two-handed weapons. */
export function browseItems(job, f) {
  const bit = 1 << job.jobIndex,
    out = [];
  const q = (f.q || '').trim().toLowerCase();
  const mainIdx = statIdx(job.profile.main),
    attrIdx = statIdx('mainAttr');
  for (let k = 0; k < ITEMS.length; k++) {
    const r = ITEMS[k];
    if (!(r[4] & bit)) continue;
    if (f.type && f.type !== 'any' && DB_SLOT_TYPE[r[1]] !== f.type) continue;
    if (f.expOff?.length && f.expOff.includes(expansionOf(r[3], r[2]))) continue;
    if (f.ilvlMin && r[2] < f.ilvlMin) continue;
    if (f.ilvlMax && r[2] > f.ilvlMax) continue;
    if (f.lvlMax && r[3] > f.lvlMax) continue;
    if (q && r[0].toLowerCase().indexOf(q) < 0) continue;
    const p = parseRow(r);
    if (!p.st[mainIdx] && !p.st[attrIdx]) continue; // must carry this job's main stat, or Main Attribute
    out.push(p);
  }
  return out;
}

/* Non-unique rings can be worn twice. */
/* Identity of a piece in the pool: the same name, slot and item level is the same piece. */
export const poolKey = x => [x.name, x.type, x.ilvl].join('|');

let rowIndex = null;
/* The database facts about a pool item ({sources, slotCode, kind, lvl, slots, overmeld}), looked up by its pool key, so saved pools need no
   repair when a fact is added. Null for items not from the database (hand-made, generated). */
function rowFacts(item) {
  if (item.src !== 'game') return null;
  if (!rowIndex) {
    rowIndex = new Map();
    for (const r of ITEMS) {
      const k = poolKey({ name: r[0], type: DB_SLOT_TYPE[r[1]], ilvl: r[2] });
      const f = rowIndex.get(k);
      rowIndex.set(k, {
        sources: (f?.sources || 0) | (r[8] | 0),
        slotCode: f ? f.slotCode : r[1],
        kind: f ? f.kind : r[9],
        lvl: f ? f.lvl : r[3],
        slots: f ? f.slots : r[10],
        overmeld: f ? f.overmeld : !!r[11],
      });
    }
  }
  return rowIndex.get(poolKey(item)) || null;
}

/* The source bit mask (SOURCES) of a pool item. Items not from the database have none. */
export function sourceMask(item) {
  return rowFacts(item)?.sources || 0;
}

/* A pool item's equip level (the level a character needs to wear it), or null for items not from the database. */
export function equipLevel(item) {
  return rowFacts(item)?.lvl ?? null;
}

/* A pool item's materia slots: {slots, overmeld} (guaranteed slots; whether overmelding is allowed), or null for items
   not from the database (hand-made, generated) and saved items no database row matches any more. */
export function meldInfo(item) {
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
    blocks: item.type === 'weapon' && job.weaponMode === '2h' ? DB_SLOT_BLOCKS[0] : [],
    factors: null,
  };
}

/* "Body + Head" for a piece that also covers the head; the off-hand a two-handed weapon blocks is not named. */
export function slotLabel(type, blocks) {
  return [SLOT_LABEL[type], ...blocks.filter(t => t !== 'offhand').map(t => SLOT_LABEL[t])].join(' + ');
}

/* The source bit mask of a list of SOURCES keys. */
export function sourcesMask(keys) {
  return SOURCES.filter(s => keys.includes(s.key)).reduce((m, s) => m | s.bit, 0);
}

/* The pool without items from any excluded source (a list of SOURCES keys). */
export function withoutSources(pool, exclude) {
  const mask = sourcesMask(exclude);
  return mask ? pool.filter(i => !(sourceMask(i) & mask)) : pool;
}

export function poolItemFromRow(job, p) {
  return mkItem(p.name, p.type, p.ilvl, dbStats(job, p.st), { src: 'game', hq: !!p.hq, copies: p.type === 'ring' && !p.unique ? 2 : 1 });
}
