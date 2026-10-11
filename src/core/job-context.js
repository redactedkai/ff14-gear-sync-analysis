/* A JobContext is an immutable description of everything that depends on the selected job:
   which raw stats the neutral keys mean, labels, weapon mode and slot shares.
   Core functions take it as their first argument instead of reading shared globals. */
import {
  JOBS, DEFAULT_JOB, ONE_HANDED_JOBS, PROFILES, SLOT_TYPES, BASE_SLOT_PCT, WEAPON_PCT, BASE_SUBSTATS,
  MAIN_NAME, MAIN_SHORT, SPD_NAME, SPD_SHORT, SPEC_NAME, SPEC_SHORT,
} from './constants.js';
import { IL } from './tables.js';

const cache = new Map();

/** @param {string} jobId e.g. 'SGE'. Unknown ids fall back to DEFAULT_JOB. Results are cached and frozen. */
export function makeJobContext(jobId) {
  let jobIndex = JOBS.findIndex(j => j[0] === jobId);
  if (jobIndex < 0) jobIndex = JOBS.findIndex(j => j[0] === DEFAULT_JOB);
  const [id, jobName, profileId] = JOBS[jobIndex];
  if (cache.has(id)) return cache.get(id);

  const profile = PROFILES[profileId];
  const substats = BASE_SUBSTATS.concat(profile.spec ? ['spec'] : []);
  const stats = ['main', 'vit'].concat(substats);
  const weaponMode = ONE_HANDED_JOBS.includes(id) ? '1h+oh' : '2h';
  const ctx = {
    jobId: id, jobName, jobIndex, profileId, profile,
    stats, substats,
    label: {
      main: MAIN_NAME[profile.main], vit: 'Vitality', crit: 'Critical Hit', det: 'Determination', dh: 'Direct Hit',
      spd: SPD_NAME[profile.spd], spec: profile.spec ? SPEC_NAME[profile.spec] : '',
    },
    short: {
      main: MAIN_SHORT[profile.main], vit: 'Vit', crit: 'Crit', det: 'Det', dh: 'DH',
      spd: SPD_SHORT[profile.spd], spec: profile.spec ? SPEC_SHORT[profile.spec] : '',
    },
    weaponMode,
    slotPct: { ...BASE_SLOT_PCT, weapon: WEAPON_PCT[weaponMode] },
    activeSlotTypes: SLOT_TYPES.filter(t => t !== 'offhand' || weaponMode === '1h+oh'),
    /* Vitality for Int/Mind jobs is the Vit budget x 0.9 (rounded again) */
    vitFactor: (profile.main === 'mind' || profile.main === 'int') ? 0.9 : 1,
  };
  deepFreeze(ctx);
  cache.set(id, ctx);
  return ctx;
}

export function slotActive(job, type) { return type === 'offhand' ? job.weaponMode === '1h+oh' : true; }
/* weight of a slot in the average item level: a two-handed weapon counts twice */
export function ilWeight(job, type) { return (type === 'weapon' && job.weaponMode === '2h') ? 2 : 1; }

/* the ItemLevel budget column for a neutral stat key */
export function statColumn(job, stat) {
  if (stat === 'main') return IL[job.profile.main];
  if (stat === 'spd') return IL[job.profile.spd];
  if (stat === 'spec') return job.profile.spec ? IL[job.profile.spec] : IL.crit;
  return IL[stat];
}

function deepFreeze(o) {
  Object.values(o).forEach(v => { if (v && typeof v === 'object' && !Object.isFrozen(v)) deepFreeze(v); });
  return Object.freeze(o);
}
