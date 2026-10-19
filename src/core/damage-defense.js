/* Weapon damage and defense (docs/mechanics/math.md, "Weapon damage and defense"; docs/engineering/optimizer.md section 1).
   - Weapon damage: the optimizer ranks it before the goal (owner's decision 2026-10-18), so no set gives it up for more
     of the goal's stats. A job uses physical or magic damage (JobContext damageKey); Blue Mage none.
   - Defense: shown under the result table with the share of damage it removes; never ranked.
   Both are synced like a stat: min(own, the cap at the synced item level), the cap from the ItemLevel budget, the
   piece's factor (MP) and its slot share (SHARES), capFromBudget's steps. Defense under sync is verified in-instance by
   xivgear's tests (item level 663 chests at 660: 842 → 837 and 481 → 478 Defense); weapon damage under sync is a
   guess (the tools clamp it the same way; no in-game measurement was found). */
import { DB_SLOT_TYPE } from './constants.js';
import { capFromBudget, clampIlvl } from './formulas.js';
import { damageDefenseFacts } from './items.js';
import { levelParams } from './level-params.js';
import { IL, MP, SHARES } from './tables.js';

/* The weapon damage key on candidates and totals (optimizer): one of the job's weapon damage, on the weapon only. */
export const WD_KEY = 'wd';

/* Defense points per percent of damage removed is level-dependent: mitigation % = floor(15 x defense / DIV), DIV the
   level's ParamGrow LevelModifier (2780 at level 100). AkhMorning, Allagan Studies, Defense (community reference). */
const MITIGATION_PER_DIV = 15;

/* The cap of `key` (a DAMAGE_DEFENSE_KEYS entry) on a piece of slot code `slotCode` and item kind `kind` at item level
   `ilvl` (capFromBudget: budget x factor, x slot share). */
function damageDefenseCap(key, slotCode, ilvl, kind) {
  return capFromBudget(IL[key][clampIlvl(ilvl)], MP[key][kind], SHARES[key][slotCode]).value;
}

/* A pool item's `key` value after sync. `target`: the item level it is synced to (itemSyncIlvl), null when untouched.
   A database piece has its own value (with the HQ bonus when it can be HQ), capped at the target; a piece not from the
   database (hand-made, generated) has the ItemLevel table's value at its item level (exact for weapon damage on 5,566 of
   the 5,579 combat weapons in Item.csv and 5,412 of the 5,425 in the database; docs/mechanics/math.md), at the target
   when synced, scaled by the slot share of its type's first slot code. */
export function syncedValue(item, key, target) {
  const f = damageDefenseFacts(item);
  if (f) {
    const own = f.values[key] || 0;
    return target == null ? own : Math.min(own, damageDefenseCap(key, f.slotCode, target, f.kind));
  }
  const code = DB_SLOT_TYPE.findIndex((type, c) => type === item.type && SHARES[key][c] > 0);
  if (code < 0) return 0;
  return Math.floor((IL[key][clampIlvl(target ?? item.ilvl)] * SHARES[key][code]) / 1000);
}

/* The weapon damage the optimizer ranks for a pool item: the job's weapon damage (job.damageKey) after sync, on a
   main-hand weapon; 0 on anything else and for a job with no damageKey (Blue Mage). `target` as for syncedValue. */
export function weaponDamage(job, item, target) {
  if (!job.damageKey || item.type !== 'weapon') return 0;
  return syncedValue(item, job.damageKey, target);
}

/* A set's total physical and magic defense after sync: {phys, mag}. `pieces`: [{item, target}], each worn piece with
   the item level it is synced to (null when untouched). */
export function setDefense(pieces) {
  let phys = 0,
    mag = 0;
  for (const { item, target } of pieces) {
    phys += syncedValue(item, 'defensePhys', target);
    mag += syncedValue(item, 'defenseMag', target);
  }
  return { phys, mag };
}

/* The share of damage taken that `defense` removes at character `level`, in whole percent (before cooldowns, which
   multiply with it). */
export function mitigationPct(defense, level) {
  return Math.floor((MITIGATION_PER_DIV * defense) / levelParams(level).div);
}
