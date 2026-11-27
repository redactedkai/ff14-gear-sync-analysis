/* A gear set as plain data, and what it adds up to (evaluateSet). The one place the rules that turn chosen pieces,
   stones and a meal into totals, tiers, defense and a GCD live: the optimizer's result is shown through it, and the
   planned sheet of sets (pieces and materia chosen by hand) will be too.

   A set (makeSet; frozen):
     pieces  one per row, in the character panel's order (SLOT_TYPES; 'ring' twice), each
             {slot, gameId, stones} for a database piece: its game id (itemById); no name is kept (architecture.md, "Piece
               identity");
             {slot, custom, stones} for a piece not from the database: `custom` is the pool item itself (hand-made or
               generated; for now only tests and the optimizer's own pools make them);
             {slot} for an empty slot: covered by another piece (a cloak covers the head), or no copy left.
             `slot` is the slot type; `stones` one entry per meld slot ({stat, grade} or null), [] for no melds
             (applyStones in meld.ts).
     meal    the meal's key (an allMeals key, HQ), or null for none.
   Job, level and sync are not part of a set: evaluateSet takes them, as a sheet holds them for all its sets.
   Custom pieces: the database's facts (equip level, meld slots, slot code, item kind, gear category) come from rowFacts
   in items.ts, which has none for a custom piece. So one is never level-synced, takes stones only if it carries its own
   `meld` ({slots, overmeld}; meldInfo), uses the job's slot share and stat factors, and gets the item level table's
   weapon damage and defense (syncedValue in damage-defense.ts). An editable custom piece will have to carry the rest
   itself (architecture.md, section 7). */
import { statTable } from './stat-keys.ts';
import { SLOT_LABEL } from './constants.ts';
import { mitigationPct, setDefense } from './damage-defense.ts';
import { statBase } from './base-stats.ts';
import { bonusStats, characterStat, clanOffset, isClan, partyRoles } from './clan-bonus.ts';
import { allMeals, foodBonus, withFood } from './food.ts';
import { categoryOf, equipLevel, expansionOf, poolItemById, slotInfo, slotLabel } from './items.ts';
import { applyStones, meldStones, meldText } from './meld.ts';
import { itemCaps, itemSyncIlvl } from './piece.ts';
import { BASE_GCD_MS, dotMult, gcdFor, gcdTierAt, hasteFor } from './speed.ts';
import { statTier } from './tiers.ts';
import type { GearSet, JobContext, Meld, PerStat, PoolItem, SetPiece, SlotType, StatMap, Sync, Totals } from './types.ts';
import type { FoodBonus, Meal } from './food.ts';
import type { AppliedStones, RemovedStone } from './meld.ts';
import type { GearCategory } from './items.ts';
import type { Haste } from './speed.ts';

/* One row of evaluateSet for a worn piece: see evaluateSet. */
export interface WornRow {
  slot: SlotType;
  label: string;
  item: PoolItem;
  target: number | null;
  stats: StatMap;
  caps: PerStat<number>;
  meld: Meld | null;
  meldText: string;
  lost: StatMap;
  removed: RemovedStone[];
  category: GearCategory | null;
  from: string | null;
}
/* One row of evaluateSet for an empty slot: the name of the worn piece that covers it, or ''. */
export interface EmptyRow {
  slot: SlotType;
  label: string;
  item: null;
  blockedBy: string;
}
/* A row of evaluateSet's `rows`. */
export type SetRow = WornRow | EmptyRow;
/* One stat's tier in evaluateSet: its effect text, the tier's start and the next one's (null at the last), the points above
   the start and to the next (null at the last), and whether the total is 0. */
export interface SetTier {
  effect: string;
  start: number;
  next: number | null;
  spare: number;
  toNext: number | null;
  zero: boolean;
}
/* What a set adds up to (evaluateSet). */
export interface SetEvaluation {
  readonly rows: SetRow[];
  readonly gear: PerStat<number>;
  readonly meal: Meal | null;
  readonly bonus: FoodBonus;
  readonly withFood: Totals;
  readonly base: PerStat<number>;
  readonly panel: PerStat<number>;
  readonly panelGear: PerStat<number>;
  readonly bonuses: { clan: string | null; partyRoles: number };
  readonly lost: PerStat<number>;
  readonly melded: number;
  readonly tiers: (SetTier | null)[];
  readonly defense: { phys: number; mag: number; physPct: number; magPct: number };
  readonly gcd: { spd: number; haste: Haste | null; gcd: number; unhasted: number; dot: number };
}
/* A worn piece of a set while it is evaluated: the piece, its pool item and what its stones do (applyStones). */
type WornPiece = { piece: SetPiece; item: PoolItem } & AppliedStones;
/* A set's piece while it is evaluated: worn (WornPiece) or an empty slot. */
type Worn = WornPiece | { piece: SetPiece; item: null; meld?: undefined };
/* A pick of an optimizer result as setFromPicks reads it: the slot type and the pool item (null for an empty slot), with
   the melds it was given (null or missing for none). */
export interface PickInput {
  type: SlotType;
  item?: PoolItem | null;
  meld?: Meld | null;
}

/* A set (see above) from `pieces` and `meal`, frozen to the stones, so it can be kept and shared as it is. */
export function makeSet(pieces: readonly SetPiece[], meal: string | null = null): GearSet {
  const frozenPiece = (p: SetPiece): SetPiece =>
    Object.freeze({ ...p, ...(p.stones ? { stones: Object.freeze(p.stones.map(s => s && Object.freeze({ ...s }))) } : {}) });
  return Object.freeze({ pieces: Object.freeze(pieces.map(frozenPiece)), meal: meal ?? null });
}

/* The set an optimizer result shows: its picks ({type, item, meld}, in panel order; item null for an empty slot, as
   solve and sameResult give them) and the meal's key (or null). A database piece is kept by its game id, any other as
   a custom piece; melds become their stones (meldStones). */
export function setFromPicks(picks: readonly PickInput[], meal: string | null = null): GearSet {
  return makeSet(
    picks.map(p => {
      if (!p.item) {
        return { slot: p.type };
      }
      const stones = meldStones(p.item, p.meld ?? null);
      return p.item.gameId != null ? { slot: p.type, gameId: p.item.gameId, stones } : { slot: p.type, custom: p.item, stones };
    }),
    meal,
  );
}

/* The pool item a set's piece stands for, for `job`: its custom item, the database piece of its game id
   (poolItemById), or null for an empty slot or a game id no database row has. */
function pieceItem(job: JobContext, piece: SetPiece): PoolItem | null {
  if (piece.custom) {
    return piece.custom;
  }
  if (piece.gameId != null) {
    return poolItemById(job, piece.gameId);
  }
  return null;
}

/* What a set adds up to, for `job` (a JobContext) at character level `level` under `sync` ({cap, sync, level}, as for
   itemSyncIlvl). Returns (every stat map over job.stats, stat keys):
   - rows: one per piece, in the set's order. A worn piece: {slot, label, item (its pool item), target (the item level it
     is synced to, or null), stats (after sync and stones), caps (itemCaps: the most each stat can be, for "at cap"
     marks), meld (applyStones' meld or null), meldText, lost and removed (applyStones), category ({key, label} or
     null), from ("HW · lvl 60", or null for a piece not from the database)}. An empty slot: {slot, label, item: null,
     blockedBy (the name of the worn piece that covers the slot, or '')}. label: the slot's name, rings numbered ("Ring 2"), a piece covering more than one slot says so
     ("Body + Head").
   - gear: the gear's totals; meal: the allMeals entry or null; bonus: what it adds on this gear ({stat: {bonus,
     capped}}, foodBonus; {} without a meal, worked out on the base + the clan's offset + the gear); withFood: the totals
     with it (the gear's without one); base: the character's own points (statBase, without the clan's bonus); lost:
     points of the stones past the pieces' caps; melded: how many pieces have melds.
   - panel: the character panel's number of every stat, with the meal (clan-bonus.ts characterStat): base + gear + meal,
     and for the main stat and Vitality floor((base + clan + gear) x party bonus) + meal. panelGear: the same without the
     meal. With no bonuses they are base + withFood and base + gear. bonuses: {clan (a clan name or null), partyRoles
     (0 to 5)} as counted. The searches and Auto-fill never pass bonuses (they rank on gear points).
   - tiers: per stat (job.stats order) {effect, start, next, spare, toNext, zero} of its total with food, or null for a
     stat with no tiers. Speed with the job's haste counts its hasted GCD and steps; spare is the points above the
     tier's start, toNext to the next (null at the last).
   - defense: {phys, mag, physPct, magPct}: the set's defense after sync and the share of damage it removes, in whole
     percent.
   - gcd: {spd, haste (hasteFor, or null), gcd (seconds, with haste), unhasted (seconds), dot (percent DoT/HoT bonus)}
     from the speed with food.
   `bonuses` ({clan, partyRoles}, optional) is what a saved sheet sets on top of its gear: the clan's name (null or an
   unknown name: none) and the unique party roles (a whole number 0 to 5). They change only panel, panelGear and the
   meal's Vitality (the clan's offset is part of the base the meal's percent is taken of); gear, withFood and the rest
   are the gear's own. */
export function evaluateSet(
  job: JobContext,
  set: GearSet,
  sync: Sync,
  level: number,
  bonuses: { clan?: string | null; partyRoles?: unknown } = {},
): SetEvaluation {
  // 1. each piece: its pool item and its stats with the stones that stay
  const worn = set.pieces.map((piece): Worn => {
    const item = pieceItem(job, piece);
    return item ? { piece, item, ...applyStones(job, item, piece.stones ?? [], sync) } : { piece, item: null };
  });
  const sumOver = (pick: (w: WornPiece) => StatMap): PerStat<number> =>
    statTable(job, s => worn.reduce((sum, w) => sum + (w.item ? pick(w)[s] || 0 : 0), 0));
  const gear = sumOver(w => w.stats);
  const lost = sumOver(w => w.lost);

  // 2. the meal and the totals with it; the character's base for the panel's numbers
  const clan = isClan(bonuses.clan) ? bonuses.clan : null;
  const roles = partyRoles(bonuses.partyRoles);
  const clanBase = Object.fromEntries(bonusStats(job).map(s => [s, clanOffset(clan, s)]));
  const meal = (set.meal != null && allMeals(job).find(m => m.key === set.meal)) || null;
  const bonus = meal ? foodBonus(job, meal, gear, level, clanBase) : {};
  const totals = withFood(gear, bonus);
  const base = statTable(job, s => statBase(job, s, level));

  // the character panel's numbers, one rule for every reader (clan-bonus.ts): without and with the meal
  const panelOf = (withMeal: boolean): PerStat<number> =>
    statTable(job, s => characterStat(job, s, { base: base[s], gear: gear[s], meal: withMeal ? (bonus[s]?.bonus ?? 0) : 0, clan, roles }));
  const panelGear = panelOf(false);
  const panel = panelOf(true);

  // 3. one row per piece; rings numbered
  let ringN = 0;
  const rows = worn.map((w): SetRow => {
    let label: string = SLOT_LABEL[w.piece.slot];
    if (w.piece.slot === 'ring') {
      ringN++;
      label = 'Ring ' + ringN;
    }
    if (!w.item) {
      const cover = worn.find((o): o is WornPiece => o.item !== null && slotInfo(job, o.item).blocks.includes(w.piece.slot));
      return {
        slot: w.piece.slot,
        label,
        item: null,
        blockedBy: cover?.item.name ?? '',
      };
    }
    if (w.piece.slot !== 'ring') {
      label = slotLabel(w.piece.slot, slotInfo(job, w.item).blocks);
    }
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
    const value = totals[s] ?? 0;
    const g = s === job.speedKey && hastePct ? gcdTierAt(value || 0, level, BASE_GCD_MS, hastePct) : null;
    const tier = g ? { effect: `${g.gcd.toFixed(2)}s`, start: g.start, next: g.next } : statTier(job, s, value, level);
    if (!tier) {
      return null;
    }
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
  const def = setDefense(rows.filter((r): r is WornRow => r.item !== null).map(r => ({ item: r.item, target: r.target })));
  const defense = { phys: def.phys, mag: def.mag, physPct: mitigationPct(def.phys, level), magPct: mitigationPct(def.mag, level) };

  // 6. the GCD and DoT/HoT bonus of the speed with food
  const spd = totals[job.speedKey] ?? 0;
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
    panel,
    panelGear,
    bonuses: { clan, partyRoles: roles },
    lost,
    melded: worn.filter(w => w.meld).length,
    tiers,
    defense,
    gcd,
  });
}

/* The set's average item level, as the character panel shows it, for `job` (a JobContext) and `rows` (evaluateSet's
   rows): {value (the exact quotient, in item levels), slots (what it is divided by), worn (pieces counted)}, or null when
   no piece is worn. Each piece counts its own item level (not the synced one). Rules (docs/mechanics/math.md, "Average item
   level"; xivgear's avgIlvl, gear.ts at commit 6c3c878, and the Wiki's Item Level page):
   - the sum of the slots' item levels over the slots: 12 for a job with an off-hand row (weapon, off-hand, head, body, hands,
     legs, feet, ears, neck, wrists, two rings), the weapon counting twice for a two-handed job;
   - an empty slot, or one a worn piece covers (a robe over the head), counts 0 (the panel divides by every slot);
   - a two-handed weapon counts twice, in place of the off-hand; a one-handed weapon counts once and an empty off-hand 0
     (xivgear; whether the game does the same for a one-handed weapon without a shield is a guess);
   - a job whose weapons carry no damage (job.damageKey null, Blue Mage) leaves the weapon and off-hand out: 10 slots
     (xivgear);
   - the meal is not counted. */
export function averageItemLevel(job: JobContext, rows: readonly SetRow[]): { value: number; slots: number; worn: number } | null {
  const used = rows.filter(row => job.activeSlotTypes.includes(row.slot));
  const levelOf = (row: SetRow | undefined) => row?.item?.ilvl ?? 0;

  // 1. the slots other than the weapon and off-hand
  const values = used.filter(row => row.slot !== 'weapon' && row.slot !== 'offhand').map(levelOf);

  // 2. the weapon and off-hand (none for a job without weapon damage); a two-handed weapon fills the off-hand's place
  if (job.damageKey) {
    const weapon = used.find(row => row.slot === 'weapon');
    const offhand = used.find(row => row.slot === 'offhand');
    const twoHanded = !offhand || (weapon?.item && slotInfo(job, weapon.item).blocks.includes('offhand'));
    values.push(levelOf(weapon), twoHanded ? levelOf(weapon) : levelOf(offhand));
  }

  // 3. nothing worn in the counted slots: no average
  const isHandSlot = (row: SetRow) => row.slot === 'weapon' || row.slot === 'offhand';
  const worn = used.filter(row => row.item && (job.damageKey || !isHandSlot(row))).length;
  if (!worn) {
    return null;
  }
  return { value: values.reduce((sum, level) => sum + level, 0) / values.length, slots: values.length, worn };
}
