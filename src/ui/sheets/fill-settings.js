/* A set's Auto-fill settings (the settings popover behind the gear button of a set page): the defaults, the settings a set uses
   now, the recipe they make for the solver, and the goal as one line. Takes plain data and returns plain data; pure: no
   Alpine, no store. The data format is in docs/engineering/sheets.md, "Saved data". */
import { uniqueRanks } from '../ranks.js';
import { DEFAULT_EXCLUDE } from '../job-sync-panel.js';

/* A set's Auto-fill settings at their defaults for `job` (a JobContext): the main stat with no tiebreaks, materia on, food
   on, any GCD (exactly, when one is typed), spare points to tiebreaks on; every expansion, the default "Gear categories"
   boxes (DEFAULT_EXCLUDE), the market board switch on, no item level range and the equip level filter at the job's
   level cap. {goal, searchCriteria}. */
export function defaultFillSettings(job) {
  return {
    goal: { target: job.mainKey, tb: '', tb2: '', gcd: '', gcdMode: 'exact', byTier: true, melds: true, food: true },
    searchCriteria: { expOff: [], exclude: [...DEFAULT_EXCLUDE], market: true, min: '', max: '', lvl: job.maxLevel },
  };
}

/* The Auto-fill settings of `gearSet` as the set page uses them: its own (`fillSettings`), with a stat the job lacks put back
   to its default and the ranks kept distinct, or the defaults while it has none. `job`: a JobContext. Returns
   {goal, searchCriteria}, new data. */
export function fillSettingsOf(job, gearSet) {
  const base = defaultFillSettings(job);
  const own = gearSet.fillSettings;
  if (!own) {
    return base;
  }
  const goal = { ...base.goal, ...own.goal };
  const ranks = [goal.target, goal.tb, goal.tb2].map((k, i) => {
    if (k && job.stats.includes(k)) {
      return k;
    }
    return i === 0 ? job.mainKey : '';
  });
  [goal.target, goal.tb, goal.tb2] = uniqueRanks(ranks).map(r => r ?? '');
  const searchCriteria = { ...base.searchCriteria, ...own.searchCriteria };
  if (searchCriteria.lvl !== '' && searchCriteria.lvl > job.maxLevel) {
    searchCriteria.lvl = job.maxLevel;
  }
  return { goal, searchCriteria };
}

/* The recipe core/recipe.js runRecipe takes (its fields flat: the goal's, then Gear to search's), from Auto-fill settings
   ({goal, searchCriteria}: fillSettingsOf). */
export function fillRecipe(settings) {
  const { goal, searchCriteria } = settings;
  return {
    target: goal.target,
    tb: goal.tb,
    tb2: goal.tb2,
    melds: goal.melds,
    food: goal.food,
    gcd: goal.gcd,
    gcdMode: goal.gcdMode,
    byTier: goal.byTier,
    expOff: [...searchCriteria.expOff],
    exclude: [...searchCriteria.exclude],
    market: searchCriteria.market,
    min: searchCriteria.min,
    max: searchCriteria.max,
    lvl: searchCriteria.lvl,
  };
}

/* The goal as one line of stat names, "MND › CRT › DET, GCD 2.45 or faster". `goal`: Auto-fill settings'. */
export function goalText(job, goal) {
  const chain = [goal.target, goal.tb, goal.tb2]
    .filter(Boolean)
    .map(stat => job.short[stat])
    .join(' › ');
  const gcd = Number.parseFloat(goal.gcd);
  return gcd > 0 ? `${chain}, GCD ${gcd.toFixed(2)}${goal.gcdMode === 'min' ? ' or faster' : ''}` : chain;
}
