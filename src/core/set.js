/* A gear set as plain data, and what it adds up to (evaluateSet). The one place the rules that turn chosen pieces,
   stones and a meal into totals, tiers, defense and a GCD live: the optimizer's result is shown through it, and the
   planned sheet of sets (pieces and materia chosen by hand) will be too.

   A set (makeSet; frozen):
     pieces  one per row, in the character panel's order (SLOT_TYPES; 'ring' twice), each
             {slot, gameId, name, stones} for a database piece: its game id (itemById) and its name beside it, for a
               reader; the id is what counts (architecture.md, "Piece identity");
             {slot, custom, stones} for a piece not from the database: `custom` is the pool item itself (hand-made or
               generated; for now only tests and the optimizer's own pools make them);
             {slot} for an empty slot: covered by another piece (a cloak covers the head), or no copy left.
             `slot` is the slot type; `stones` one entry per meld slot ({stat, grade} or null), [] for no melds
             (applyStones in meld.js).
     meal    the meal's key (an allMeals key, HQ), or null for none.
   Job, level and sync are not part of a set: evaluateSet takes them, as a sheet holds them for all its sets.
   Custom pieces: the database's facts (equip level, meld slots, slot code, item kind, gear category) come from rowFacts
   in items.js, which has none for a custom piece. So one is never level-synced, takes stones only if it carries its own
   `meld` ({slots, overmeld}; meldInfo), uses the job's slot share and stat factors, and gets the item level table's
   weapon damage and defense (syncedValue in damage-defense.js). An editable custom piece will have to carry the rest
   itself (architecture.md, section 7). */
import { SLOT_LABEL } from './constants.js';
import { mitigationPct, setDefense } from './damage-defense.js';
import { allMeals, foodBonus, statBase, withFood } from './food.js';
import { categoryOf, equipLevel, expansionOf, poolItemById, slotInfo, slotLabel } from './items.js';
import { applyStones, meldStones, meldText } from './meld.js';
import { itemCaps, itemSyncIlvl } from './piece.js';
import { BASE_GCD_MS, dotMult, gcdFor, gcdTierAt, hasteFor } from './speed.js';
import { statTier } from './tiers.js';

/* A set (see above) from `pieces` and `meal`, frozen to the stones, so it can be kept and shared as it is. */
export function makeSet(pieces, meal = null) {
  const frozenPiece = p =>
    Object.freeze({ ...p, ...(p.stones ? { stones: Object.freeze(p.stones.map(s => s && Object.freeze({ ...s }))) } : {}) });
  return Object.freeze({ pieces: Object.freeze(pieces.map(frozenPiece)), meal: meal ?? null });
}

/* The set an optimizer result shows: its picks ({type, item, meld}, in panel order; item null for an empty slot, as
   solve and sameResult give them) and the meal's key (or null). A database piece is kept by its game id, any other as
   a custom piece; melds become their stones (meldStones). */
export function setFromPicks(picks, meal = null) {
  return makeSet(
    picks.map(p => {
      if (!p.item) return { slot: p.type };
      const stones = meldStones(p.item, p.meld ?? null);
      return p.item.gameId != null
        ? { slot: p.type, gameId: p.item.gameId, name: p.item.name, stones }
        : { slot: p.type, custom: p.item, stones };
    }),
    meal,
  );
}

/* The pool item a set's piece stands for, for `job`: its custom item, the database piece of its game id
   (poolItemById), or null for an empty slot or a game id no database row has. */
function pieceItem(job, piece) {
  if (piece.custom) return piece.custom;
  if (piece.gameId != null) return poolItemById(job, piece.gameId);
  return null;
}

/* What a set adds up to, for `job` (a JobContext) at character level `level` under `sync` ({cap, sync, level}, as for
   itemSyncIlvl). Returns (every stat map over job.stats, neutral keys):
   - rows: one per piece, in the set's order. A worn piece: {slot, label, item (its pool item), target (the item level it
     is synced to, or null), stats (after sync and stones), caps (itemCaps: the most each stat can be, for "at cap"
     marks), meld (applyStones' meld or null), meldText, lost and removed (applyStones), category ({key, label} or
     null), from ("HW · lvl 60", or null for a piece not from the database)}. An empty slot: {slot, label, item: null,
     blockedBy (the name of the worn piece that covers the slot, or ''), missing (the saved name of a game id no row
     has, or null)}. label: the slot's name, rings numbered ("Ring 2"), a piece covering more than one slot says so
     ("Body + Head").
   - gear: the gear's totals; meal: the allMeals entry or null; bonus: what it adds on this gear ({stat: {bonus,
     capped}}, foodBonus; {} without a meal); withFood: the totals with it (the gear's without one); base: the
     character's own points (statBase, without the clan's bonus); lost: points of the stones past the pieces' caps;
     melded: how many pieces have melds.
   - tiers: per stat (job.stats order) {effect, start, next, spare, toNext, zero} of its total with food, or null for a
     stat with no tiers. Speed with the job's haste counts its hasted GCD and steps; spare is the points above the
     tier's start, toNext to the next (null at the last).
   - defense: {phys, mag, physPct, magPct}: the set's defense after sync and the share of damage it removes, in whole
     percent.
   - gcd: {spd, haste (hasteFor, or null), gcd (seconds, with haste), unhasted (seconds), dot (percent DoT/HoT bonus)}
     from the speed with food. */
export function evaluateSet(job, set, sync, level) {
  // 1. each piece: its pool item and its stats with the stones that stay
  const worn = set.pieces.map(piece => {
    const item = pieceItem(job, piece);
    return item ? { piece, item, ...applyStones(job, item, piece.stones ?? [], sync) } : { piece, item: null };
  });
  const sumOver = pick => Object.fromEntries(job.stats.map(s => [s, worn.reduce((sum, w) => sum + (w.item ? pick(w)[s] || 0 : 0), 0)]));
  const gear = sumOver(w => w.stats);
  const lost = sumOver(w => w.lost);

  // 2. the meal and the totals with it; the character's base for the panel's numbers
  const meal = (set.meal != null && allMeals(job).find(m => m.key === set.meal)) || null;
  const bonus = meal ? foodBonus(job, meal, gear, level) : {};
  const totals = withFood(gear, bonus);
  const base = Object.fromEntries(job.stats.map(s => [s, statBase(job, s, level)]));

  // 3. one row per piece; rings numbered
  let ringN = 0;
  const rows = worn.map(w => {
    let label = SLOT_LABEL[w.piece.slot];
    if (w.piece.slot === 'ring') {
      ringN++;
      label = 'Ring ' + ringN;
    }
    if (!w.item) {
      const cover = worn.find(o => o.item && slotInfo(job, o.item).blocks.includes(w.piece.slot));
      return {
        slot: w.piece.slot,
        label,
        item: null,
        blockedBy: cover?.item.name ?? '',
        missing: w.piece.gameId != null ? (w.piece.name ?? null) : null,
      };
    }
    if (w.piece.slot !== 'ring') label = slotLabel(w.piece.slot, slotInfo(job, w.item).blocks);
    const lvl = equipLevel(w.item);
    return {
      slot: w.piece.slot,
      label,
      item: w.item,
      target: itemSyncIlvl(w.item, sync),
      stats: w.stats,
      caps: itemCaps(job, w.item, sync),
      meld: w.meld,
      meldText: meldText(job, w.meld),
      lost: w.lost,
      removed: w.removed,
      category: categoryOf(w.item),
      from: lvl == null ? null : `${expansionOf(lvl, w.item.ilvl)} · lvl ${lvl}`,
    };
  });

  // 4. each stat's tier, from its total with food; speed with the job's haste counts the hasted GCD's steps
  const haste = hasteFor(job.jobId, level);
  const hastePct = haste?.pct ?? 0;
  const tiers = job.stats.map(s => {
    const value = totals[s];
    const g = s === 'spd' && hastePct ? gcdTierAt(value || 0, level, BASE_GCD_MS, hastePct) : null;
    const tier = g ? { effect: `${g.gcd.toFixed(2)}s`, start: g.start, next: g.next } : statTier(job, s, value, level);
    if (!tier) return null;
    return {
      effect: tier.effect,
      start: tier.start,
      next: tier.next,
      spare: value - tier.start,
      toNext: tier.next == null ? null : tier.next - value,
      zero: !value,
    };
  });

  // 5. defense after sync, and the share of damage it removes at this level (shown, never ranked)
  const def = setDefense(rows.filter(r => r.item).map(r => ({ item: r.item, target: r.target })));
  const defense = { phys: def.phys, mag: def.mag, physPct: mitigationPct(def.phys, level), magPct: mitigationPct(def.mag, level) };

  // 6. the GCD and DoT/HoT bonus of the speed with food
  const spd = totals.spd;
  const gcd = {
    spd,
    haste,
    gcd: gcdFor(spd, level, BASE_GCD_MS, hastePct),
    unhasted: gcdFor(spd, level),
    dot: (dotMult(spd, level) - 1) * 100,
  };

  return Object.freeze({
    rows,
    gear,
    meal,
    bonus,
    withFood: totals,
    base,
    lost,
    melded: worn.filter(w => w.meld).length,
    tiers,
    defense,
    gcd,
  });
}
