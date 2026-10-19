/* A JobContext is an immutable description of everything that depends on the selected job:
   which raw stats the neutral keys mean, labels, weapon mode and slot shares.
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
  BASE_SUBSTATS,
  MAIN_NAME,
  MAIN_SHORT,
  SPD_NAME,
  SPD_SHORT,
  SPEC_NAME,
  SPEC_SHORT,
} from './constants.js';
import { IL, JOB_MODS, MAX_LEVEL } from './tables.js';

const cache = new Map();

/* The special substat's raw key (PROFILES' spec) to what it does: JobContext.specKind. */
const SPEC_KIND = Object.freeze({ piety: 'mp', ten: 'mitigation' });

/** @param {string} jobId e.g. 'SGE'. Unknown ids fall back to DEFAULT_JOB. Results are cached and frozen. */
export function makeJobContext(jobId) {
  let jobIndex = JOBS.findIndex(([id]) => id === jobId);
  if (jobIndex < 0) jobIndex = JOBS.findIndex(([id]) => id === DEFAULT_JOB);
  const [id, jobName, profileId] = JOBS[jobIndex];
  if (cache.has(id)) return cache.get(id);

  const profile = PROFILES[profileId];
  const substats = BASE_SUBSTATS.concat(profile.spec ? ['spec'] : []);
  const stats = ['main', 'vit'].concat(substats);
  const weaponMode = ONE_HANDED_JOBS.includes(id) ? '1h+oh' : '2h';
  const ctx = {
    jobId: id,
    jobName,
    jobIndex,
    profileId,
    profile,
    stats,
    substats,
    label: {
      main: MAIN_NAME[profile.main],
      vit: 'Vitality',
      crit: 'Critical Hit',
      det: 'Determination',
      dh: 'Direct Hit',
      spd: SPD_NAME[profile.spd],
      spec: profile.spec ? SPEC_NAME[profile.spec] : '',
    },
    short: {
      main: MAIN_SHORT[profile.main],
      vit: 'VIT',
      crit: 'CRT',
      det: 'DET',
      dh: 'DHT',
      spd: SPD_SHORT[profile.spd],
      spec: profile.spec ? SPEC_SHORT[profile.spec] : '',
    },
    weaponMode,
    slotPct: { ...BASE_SLOT_PCT, weapon: WEAPON_PCT[weaponMode] },
    activeSlotTypes: SLOT_TYPES.filter(t => t !== 'offhand' || weaponMode === '1h+oh'),
    /* the job's modifiers of its main stat and Vitality, in percent (ClassJob): its base is the level's main stat base x
       the modifier (food.js statBase) */
    attributeMods: Object.freeze({ main: JOB_MODS[id][profile.main], vit: JOB_MODS[id].vit }),
    /* what the job's special substat (`spec`) does, so shared code never names the job keys: 'mp' for Piety (healers:
       MP per tick; it starts from the level's main stat base, like Determination), 'mitigation' for Tenacity (tanks:
       damage and healing done, and a cut to damage taken), null for jobs without one */
    specKind: profile.spec ? SPEC_KIND[profile.spec] : null,
    /* Vitality for Int/Mind jobs is the Vit budget x 0.9 (rounded again) */
    vitFactor: profile.main === 'mind' || profile.main === 'int' ? 0.9 : 1,
    /* the job's level cap: limited jobs stop below the game's (JOB_LEVEL_CAPS); it cannot wear gear of a higher equip level */
    maxLevel: JOB_LEVEL_CAPS[id] ?? MAX_LEVEL,
    // the weapon damage the job's damage uses (damage-defense.js): physical for Strength and Dexterity jobs, magic for
    // Intelligence and Mind jobs; null for a job whose weapons carry none (NO_WEAPON_DAMAGE_JOBS), which the optimizer
    // then does not rank
    damageKey: NO_WEAPON_DAMAGE_JOBS.includes(id) ? null : profile.main === 'str' || profile.main === 'dex' ? 'damagePhys' : 'damageMag',
  };
  deepFreeze(ctx);
  cache.set(id, ctx);
  return ctx;
}

/* the ItemLevel budget column for a neutral stat key */
export function statColumn(job, stat) {
  if (stat === 'main') return IL[job.profile.main];
  if (stat === 'spd') return IL[job.profile.spd];
  if (stat === 'spec') return job.profile.spec ? IL[job.profile.spec] : IL.crit;
  return IL[stat];
}

function deepFreeze(o) {
  Object.values(o).forEach(v => {
    if (v && typeof v === 'object' && !Object.isFrozen(v)) deepFreeze(v);
  });
  return Object.freeze(o);
}
