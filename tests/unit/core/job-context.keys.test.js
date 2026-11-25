/* The job's stat keys (src/core/job-context.js): the keys are the game's own stats, and a JobContext says which of them
   the job has: mainKey, speedKey, specKey (null for none), stats and substats in that order. The expected keys for every
   job are written out here from the game (docs/mechanics/math.md section 1), not read from PROFILES. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JOBS, STAT_LABEL, STAT_SHORT } from '../../../src/core/constants.js';
import { makeJobContext } from '../../../src/core/job-context.js';

/* job id: [main stat, speed stat, special substat or null] */
const EXPECTED = {
  PLD: ['str', 'sks', 'ten'],
  WAR: ['str', 'sks', 'ten'],
  DRK: ['str', 'sks', 'ten'],
  GNB: ['str', 'sks', 'ten'],
  WHM: ['mind', 'sps', 'piety'],
  SCH: ['mind', 'sps', 'piety'],
  AST: ['mind', 'sps', 'piety'],
  SGE: ['mind', 'sps', 'piety'],
  MNK: ['str', 'sks', null],
  DRG: ['str', 'sks', null],
  SAM: ['str', 'sks', null],
  RPR: ['str', 'sks', null],
  BST: ['str', 'sks', null],
  NIN: ['dex', 'sks', null],
  VPR: ['dex', 'sks', null],
  BRD: ['dex', 'sks', null],
  MCH: ['dex', 'sks', null],
  DNC: ['dex', 'sks', null],
  BLM: ['int', 'sps', null],
  SMN: ['int', 'sps', null],
  RDM: ['int', 'sps', null],
  PCT: ['int', 'sps', null],
  BLU: ['int', 'sps', null],
};

test('all 23 jobs: main, speed and special key, and the stats in order (a job without a special substat has six)', () => {
  assert.deepEqual(JOBS.map(j => j.id).sort(), Object.keys(EXPECTED).sort());
  for (const { id } of JOBS) {
    const [main, speed, special] = EXPECTED[id];
    const job = makeJobContext(id);
    assert.deepEqual([job.mainKey, job.speedKey, job.specKey], [main, speed, special], id);
    assert.deepEqual(job.substats, ['crit', 'det', 'dh', speed, ...(special ? [special] : [])], id);
    assert.deepEqual(job.stats, [main, 'vit', ...job.substats], id);
    assert.equal(job.stats.length, special ? 7 : 6, id);
  }
});

test('labels and short names are one table by key, and a job has an entry for each of its own stats only', () => {
  assert.deepEqual(STAT_LABEL, {
    str: 'Strength',
    dex: 'Dexterity',
    int: 'Intelligence',
    mind: 'Mind',
    vit: 'Vitality',
    crit: 'Critical Hit',
    det: 'Determination',
    dh: 'Direct Hit',
    sks: 'Skill Speed',
    sps: 'Spell Speed',
    piety: 'Piety',
    ten: 'Tenacity',
  });
  assert.deepEqual(STAT_SHORT, {
    str: 'STR',
    dex: 'DEX',
    int: 'INT',
    mind: 'MND',
    vit: 'VIT',
    crit: 'CRT',
    det: 'DET',
    dh: 'DHT',
    sks: 'SkS',
    sps: 'SpS',
    piety: 'PIE',
    ten: 'TNC',
  });
  for (const { id } of JOBS) {
    const job = makeJobContext(id);
    assert.deepEqual(Object.keys(job.label), job.stats, id);
    assert.deepEqual(Object.keys(job.short), job.stats, id);
    for (const s of job.stats) {
      assert.deepEqual([job.label[s], job.short[s]], [STAT_LABEL[s], STAT_SHORT[s]], `${id} ${s}`);
    }
  }
  // the names the page shows for a Sage, a Warrior and a Black Mage
  assert.deepEqual(Object.values(makeJobContext('SGE').label), [
    'Mind',
    'Vitality',
    'Critical Hit',
    'Determination',
    'Direct Hit',
    'Spell Speed',
    'Piety',
  ]);
  assert.deepEqual(Object.values(makeJobContext('WAR').short), ['STR', 'VIT', 'CRT', 'DET', 'DHT', 'SkS', 'TNC']);
  assert.deepEqual(Object.values(makeJobContext('BLM').short), ['INT', 'VIT', 'CRT', 'DET', 'DHT', 'SpS']);
});

test("the main stat's modifier is keyed by the main stat, and Vitality's factor and the weapon damage follow the main stat", () => {
  const sge = makeJobContext('SGE');
  assert.deepEqual(sge.attributeMods, { mind: 115, vit: 100 }); // ClassJob.csv: Sage Mind 115, Vitality 100
  assert.deepEqual(makeJobContext('WAR').attributeMods, { str: 105, vit: 110 });
  assert.deepEqual(makeJobContext('BLM').attributeMods, { int: 115, vit: 100 });
  for (const [id, [main]] of Object.entries(EXPECTED)) {
    const job = makeJobContext(id);
    const caster = main === 'int' || main === 'mind';
    assert.equal(job.vitFactor, caster ? 0.9 : 1, id);
    let expectedDamageKey = caster ? 'damageMag' : 'damagePhys';
    if (id === 'BLU') {
      expectedDamageKey = null;
    }
    assert.equal(job.damageKey, expectedDamageKey, id);
  }
});
