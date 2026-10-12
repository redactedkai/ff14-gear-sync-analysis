/* Shared test helpers: an exhaustive reference for the optimizer, and real-gear pools from the item database.
   The reference tries every legal loadout, so it is independent of the optimizer's pruning and scoring. */
import { SLOT_TYPES } from '../../../src/core/constants.js';
import { capsFor } from '../../../src/core/formulas.js';
import { browseItems, meldInfo, poolItemFromRow, slotInfo } from '../../../src/core/items.js';
import { effStats, itemSyncIlvl } from '../../../src/core/optimizer/index.js';
import { MATERIA } from '../../../src/core/tables.js';

/* Pool items for every database row this job can equip that matches the browse filter
   {q, type, ilvlMin, ilvlMax, lvlMax}, optionally narrowed by keep(row). */
export function gamePool(job, filter, keep = () => true) {
  return browseItems(job, filter)
    .filter(keep)
    .map(r => poolItemFromRow(job, r));
}

/* How many loadouts exhaustive() will try for this pool (one item per slot that has items, ring pairs, plus "empty"
   for a slot some item can block). */
export function loadoutCount(job, pool) {
  const blockable = blockableTypes(job, pool);
  return SLOT_TYPES.reduce((n, t) => n * Math.max(1, choicesFor(pool, t).length + (blockable.has(t) ? 1 : 0)), 1);
}

function blockableTypes(job, pool) {
  return new Set(pool.flatMap(i => slotInfo(job, i).blocks));
}

function choicesFor(pool, t) {
  const items = pool.filter(i => i.type === t);
  if (t !== 'ring') return items.map(i => [i]);
  const pairs = [];
  items.forEach((a, x) => {
    items.forEach((b, y) => {
      if (y < x || (x === y && (a.copies || 1) < 2)) return;
      pairs.push([a, b]);
    });
  });
  return pairs.length ? pairs : items.map(i => [i]);
}

/* Every effective stat vector a piece can reach with melds, written independently of src/core/meld.js: each slot gets
   one of the job's substats or nothing, holding the most valuable grade that slot allows (guaranteed slots and the
   first overmeld slot any grade the item level gate allows, later overmeld slots no high grade; a bigger stone never
   lowers a stat, so smaller ones are never needed), and every stat is capped at the piece's own cap (capsFor at its item
   level, share and factors) without lowering a stat already above it. Only vectors no other one beats on every `keys`
   stat are kept: the objective adds keys across the loadout, so a beaten one never helps. A synced piece, or one with no
   slot data, has only its own vector. */
export function meldVectors(job, item, sync, keys) {
  const base = effStats(job, item, sync);
  const info = meldInfo(item);
  if (itemSyncIlvl(item, sync) != null || !info || !info.slots) return [base];
  const best = high => {
    let v = 0;
    MATERIA.values.forEach((x, i) => {
      if (MATERIA.gate[i] <= item.ilvl && (high || !MATERIA.high.includes(i + 1))) v = Math.max(v, x);
    });
    return v;
  };
  const total = info.overmeld ? 5 : info.slots;
  const slotValue = [...Array(total)].map((_, i) => best(i <= info.slots)); // index slots = the first overmeld slot
  const s = slotInfo(job, item);
  const caps = capsFor(job, item.type, item.ilvl, s.pct, s.factors);
  const choices = [...job.substats, null];
  const out = [];
  const add = new Array(total).fill(null);
  const rec = i => {
    if (i === total) {
      const v = { ...base };
      for (const st of job.substats) {
        const stones = add.reduce((n, a, k) => n + (a === st ? slotValue[k] : 0), 0);
        if (stones) v[st] = Math.max(base[st] || 0, Math.min((base[st] || 0) + stones, caps[st]));
      }
      out.push(v);
      return;
    }
    for (const c of choices) {
      add[i] = c;
      rec(i + 1);
    }
  };
  rec(0);
  const key = v => keys.map(k => v[k] || 0);
  const ks = out.map(key);
  const beaten = (a, b) => b.every((x, j) => x >= a[j]) && b.some((x, j) => x > a[j]);
  const seen = new Set();
  return out.filter((_v, i) => {
    const id = ks[i].join();
    if (seen.has(id) || ks.some(b => beaten(ks[i], b))) return false;
    seen.add(id);
    return true;
  });
}

/* Best [target, tiebreak1, tiebreak2] totals over every legal loadout, or null if none meets the constraints.
   One item per slot that has items; two rings (the same item twice only if it has 2 copies).

   Two engine policies are copied here on purpose, not derived independently (docs/optimizer.md, section 5,
   "Empty slot"; each has a direct test in optimizer-exhaustive.test.js, "policy:"):
   - a single ring only when no pair exists: if any legal pair exists, a loadout with one ring is not considered,
     even when a pair breaks a maximum and one ring alone would not;
   - a slot is never left empty to satisfy a maximum (or any other constraint): every slot that has items gets one.
   Changing either rule means changing the engine, this oracle and those policy tests together.

   Blocked slots are checked on the whole loadout, independently of the engine's slot order: a slot is empty exactly
   when a chosen piece blocks it (a two-handed weapon blocks the off-hand, a cloak the head).

   Effective (synced) stats come from the optimizer's own effStats, so this reference does not check the sync
   clamp; that is covered by sync.test.js, the Wiki item level 475 caps and the caps at 123 (docs/testing.md). */
export function exhaustive(job, pool, sync, { target, tiebreak = [], spdMin = null, spdMax = null, melds = false }) {
  const keys = [target, ...tiebreak.filter(Boolean)];
  const stats = job.stats;
  const slots = SLOT_TYPES.filter(t => pool.some(i => i.type === t));
  const blockable = blockableTypes(job, pool);
  /* each choice (an item, a ring pair, or empty) as its effective stat totals in job.stats order and what it blocks */
  // with melds every piece brings each of its meld vectors (meldVectors); two copies of a ring may take different ones
  const vectorsOf = i => (melds ? meldVectors(job, i, sync, keys) : [effStats(job, i, sync)]);
  const choices = slots.map(t => {
    const list = choicesFor(pool, t).flatMap(items => {
      const blocks = items.flatMap(i => slotInfo(job, i).blocks);
      let sums = [stats.map(() => 0)];
      items.forEach(i => {
        sums = sums.flatMap(v => vectorsOf(i).map(e => v.map((x, k) => x + (e[stats[k]] || 0))));
      });
      return sums.map(v => ({ v, blocks, empty: false }));
    });
    if (blockable.has(t)) list.push({ v: stats.map(() => 0), blocks: [], empty: true });
    return list;
  });
  const tot = stats.map(() => 0);
  const picked = [];
  let best = null;
  const rec = k => {
    if (k === choices.length) {
      const blocked = new Set(picked.flatMap(c => c.blocks));
      if (picked.some((c, i) => c.empty !== blocked.has(slots[i]))) return;
      const get = s => tot[stats.indexOf(s)] || 0;
      if (spdMin != null && get('spd') < spdMin) return;
      if (spdMax != null && get('spd') > spdMax) return;
      const v = keys.map(get);
      if (!best || lexGreater(v, best)) best = v;
      return;
    }
    for (const c of choices[k]) {
      c.v.forEach((x, j) => {
        tot[j] += x;
      });
      picked.push(c);
      rec(k + 1);
      picked.pop();
      c.v.forEach((x, j) => {
        tot[j] -= x;
      });
    }
  };
  rec(0);
  return best;
}

function lexGreater(a, b) {
  const i = a.findIndex((x, k) => x !== b[k]);
  return i >= 0 && a[i] > b[i];
}
