/* A JobContext is an immutable description of everything that depends on the selected job:
   which raw stats the stat keys mean, labels, weapon mode and slot shares.
   Core functions take it as their first argument instead of reading shared globals. */
import {
  JOBS,
  DEFAULT_JOB,
  ONE_HANDED_JOBS,
  NO_WEAPON_DAMAGE_JOBS,
  JOB_LEVEL_CAPS,
  PROFILES,
  SLOT_TYPES,
  BASE_SLOT_PCT,
  WEAPON_PCT,
  SHARED_SUBSTATS,
  STAT_LABEL,
  STAT_SHORT,
} from './constants.js';
import { JOB_MODS, MAX_LEVEL } from './tables.js';

const cache = new Map();

/* The jobs whose main stat is Intelligence or Mind: their Vitality is 0.9 of the budget (vitFactor), and their weapons
   carry magic damage; Strength and Dexterity jobs have physical (damageKey). */
const CASTER_MAIN_KEYS = Object.freeze(['int', 'mind']);

/** @param {string} jobId e.g. 'SGE'. Unknown ids fall back to DEFAULT_JOB. Results are cached and frozen.
 *  Stat keys are the game's own (constants.js STAT_LABEL). The job's: mainKey (str, dex, int or mind), speedKey (sks or
 *  sps), specKey (piety or ten; null for a job without a special substat); stats = [mainKey, 'vit', 'crit', 'det',
 *  'dh', speedKey, specKey?], substats = the stats after the first two. */
export function makeJobContext(jobId) {
  let jobIndex = JOBS.findIndex(j => j.id === jobId);
  if (jobIndex < 0) jobIndex = JOBS.findIndex(j => j.id === DEFAULT_JOB);
  const { id, name: jobName, profile: profileId } = JOBS[jobIndex];
  if (cache.has(id)) return cache.get(id);

  const { mainKey, speedKey, specKey } = PROFILES[profileId];
  const substats = [...SHARED_SUBSTATS, speedKey, ...(specKey ? [specKey] : [])];
  const stats = [mainKey, 'vit', ...substats];
  const weaponMode = ONE_HANDED_JOBS.includes(id) ? '1h+oh' : '2h';
  const ctx = {
    jobId: id,
    jobName,
    jobIndex,
    profileId,
    mainKey,
    speedKey,
    specKey,
    stats,
    substats,
    // the names of the job's own stats, from the global tables
    label: Object.fromEntries(stats.map(s => [s, STAT_LABEL[s]])),
    short: Object.fromEntries(stats.map(s => [s, STAT_SHORT[s]])),
    weaponMode,
    slotPct: { ...BASE_SLOT_PCT, weapon: WEAPON_PCT[weaponMode] },
    activeSlotTypes: SLOT_TYPES.filter(t => t !== 'offhand' || weaponMode === '1h+oh'),
    /* the job's modifiers of its main stat and Vitality, in percent (ClassJob), by stat key: its base is the level's
       main stat base x the modifier (food.js statBase) */
    attributeMods: Object.freeze({ [mainKey]: JOB_MODS[id][mainKey], vit: JOB_MODS[id].vit }),
    /* Vitality for Int/Mind jobs is the Vit budget x 0.9 (rounded again) */
    vitFactor: CASTER_MAIN_KEYS.includes(mainKey) ? 0.9 : 1,
    /* the job's level cap: limited jobs stop below the game's (JOB_LEVEL_CAPS); it cannot wear gear of a higher equip level */
    maxLevel: JOB_LEVEL_CAPS[id] ?? MAX_LEVEL,
    // the weapon damage the job's damage uses (damage-defense.js): physical for Strength and Dexterity jobs, magic for
    // Intelligence and Mind jobs; null for a job whose weapons carry none (NO_WEAPON_DAMAGE_JOBS), which the optimizer
    // then does not rank
    damageKey: NO_WEAPON_DAMAGE_JOBS.includes(id) ? null : CASTER_MAIN_KEYS.includes(mainKey) ? 'damageMag' : 'damagePhys',
  };
  deepFreeze(ctx);
  cache.set(id, ctx);
  return ctx;
}

function deepFreeze(o) {
  Object.values(o).forEach(v => {
    if (v && typeof v === 'object' && !Object.isFrozen(v)) deepFreeze(v);
  });
  return Object.freeze(o);
}
