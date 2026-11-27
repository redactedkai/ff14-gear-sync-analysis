/* A JobContext is an immutable description of everything that depends on the selected job:
   which raw stats the stat keys mean, labels, weapon mode and slot shares.
   Core functions take it as their first argument instead of reading shared globals. */
import { fromKeys, must } from './guards.ts';
import {
  JOBS,
  DEFAULT_JOB,
  ONE_HANDED_JOBS,
  MIXED_WEAPON_JOBS,
  NO_WEAPON_DAMAGE_JOBS,
  JOB_LEVEL_CAPS,
  PROFILES,
  SLOT_TYPES,
  BASE_SLOT_PCT,
  WEAPON_PCT,
  SHARED_SUBSTATS,
  STAT_LABEL,
  STAT_SHORT,
} from './constants.ts';
import { JOB_MODS, MAX_LEVEL } from './tables.ts';
import type { DamageKey, JobContext, MainStatKey, PerStat, StatKey, WeaponMode } from './types.ts';

const cache = new Map<string, JobContext>();

/* The jobs whose main stat is Intelligence or Mind: their Vitality is 0.9 of the budget (vitFactor), and their weapons
   carry magic damage; Strength and Dexterity jobs have physical (damageKey). */
const CASTER_MAIN_KEYS: readonly MainStatKey[] = Object.freeze(['int', 'mind']);

/* The weapon damage key of job `id` with main stat `mainKey`: null for a job whose weapons carry none, else 'damageMag'
   (caster main stat) or 'damagePhys'. */
function damageKeyOf(id: string, mainKey: MainStatKey): DamageKey | null {
  if (NO_WEAPON_DAMAGE_JOBS.includes(id)) {
    return null;
  }
  return CASTER_MAIN_KEYS.includes(mainKey) ? 'damageMag' : 'damagePhys';
}

/** @param jobId e.g. 'SGE'. Unknown ids fall back to DEFAULT_JOB. Results are cached and frozen.
 *  Stat keys are the game's own (constants.ts STAT_LABEL). The job's: mainKey (str, dex, int or mind), speedKey (sks or
 *  sps), specKey (piety or ten; null for a job without a special substat); stats = [mainKey, 'vit', 'crit', 'det',
 *  'dh', speedKey, specKey?], substats = the stats after the first two.
 *  weaponMode: '2h' (no shield; no Off-hand row), '1h+oh' (1H weapon and shield only: ONE_HANDED_JOBS) or 'mixed' (2H
 *  weapons, or 1H weapons with a shield, at every level: MIXED_WEAPON_JOBS). activeSlotTypes holds 'offhand' unless the
 *  mode is '2h'; slotPct.weapon is the 1H share for the two modes with a shield (what a hand-made weapon takes). */
export function makeJobContext(jobId: string | null | undefined): JobContext {
  let jobIndex = JOBS.findIndex(j => j.id === jobId);
  if (jobIndex < 0) {
    jobIndex = JOBS.findIndex(j => j.id === DEFAULT_JOB);
  }
  const { id, name: jobName, profile: profileId } = JOBS[jobIndex];
  if (cache.has(id)) {
    return must(cache, id, 'cached job context');
  }

  const { mainKey, speedKey, specKey } = PROFILES[profileId];
  const substats: StatKey[] = [...SHARED_SUBSTATS, speedKey, ...(specKey ? [specKey] : [])];
  const stats: StatKey[] = [mainKey, 'vit', ...substats];
  let weaponMode: WeaponMode = '2h';
  if (ONE_HANDED_JOBS.includes(id)) {
    weaponMode = '1h+oh';
  } else if (MIXED_WEAPON_JOBS.includes(id)) {
    weaponMode = 'mixed';
  }
  // a job with a shield uses the Off-hand row; a mixed job's generic weapon (Stat Allocation) is the 1H one beside it
  const hasOffhand = weaponMode !== '2h';
  const ctx: JobContext = {
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
    label: fromKeys(stats, s => STAT_LABEL[s]),
    short: fromKeys(stats, s => STAT_SHORT[s]),
    weaponMode,
    slotPct: { ...BASE_SLOT_PCT, weapon: WEAPON_PCT[hasOffhand ? '1h+oh' : '2h'] },
    activeSlotTypes: SLOT_TYPES.filter(t => t !== 'offhand' || hasOffhand),
    /* the job's modifiers of its main stat and Vitality, in percent (ClassJob), by stat key: its base is the level's
       main stat base x the modifier (base-stats.ts statBase) */
    // biome-ignore lint/plugin: PerStat is typed with every stat key, but a job holds only its own: this table has the main stat and Vitality, which are all statBase reads (tests/unit/core/job-context.keys.test.ts)
    attributeMods: Object.freeze({ [mainKey]: JOB_MODS[id][mainKey], vit: JOB_MODS[id].vit }) as PerStat<number>,
    /* Vitality for Int/Mind jobs is the Vit budget x 0.9 (rounded again) */
    vitFactor: CASTER_MAIN_KEYS.includes(mainKey) ? 0.9 : 1,
    /* the job's level cap: limited jobs stop below the game's (JOB_LEVEL_CAPS); it cannot wear gear of a higher equip level */
    maxLevel: JOB_LEVEL_CAPS[id] ?? MAX_LEVEL,
    // the weapon damage the job's damage uses (damage-defense.ts): physical for Strength and Dexterity jobs, magic for
    // Intelligence and Mind jobs; null for a job whose weapons carry none (NO_WEAPON_DAMAGE_JOBS), which the optimizer
    // then does not rank
    damageKey: damageKeyOf(id, mainKey),
  };
  deepFreeze(ctx);
  cache.set(id, ctx);
  return ctx;
}

function deepFreeze(o: object): object {
  Object.values(o).forEach(v => {
    if (v && typeof v === 'object' && !Object.isFrozen(v)) {
      deepFreeze(v);
    }
  });
  return Object.freeze(o);
}
