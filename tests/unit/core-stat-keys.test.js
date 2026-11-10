/* Stat keys moved between jobs and read from older saves (src/core/stat-keys.js), and the rule that shared code names no
   job-specific stat: the game's names are keys in tables, and logic reads job.mainKey, job.speedKey and job.specKey. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeJobContext } from '../../src/core/job-context.js';
import { currentStatKey, remapStatKey } from '../../src/core/stat-keys.js';

const sge = makeJobContext('SGE');
const war = makeJobContext('WAR');
const nin = makeJobContext('NIN');
const blm = makeJobContext('BLM');

test("currentStatKey: an old position key is the job's stat at that position; every other value stays", () => {
  assert.deepEqual(
    ['main', 'spd', 'spec'].map(k => currentStatKey(sge, k)),
    ['mind', 'sps', 'piety'],
  );
  assert.deepEqual(
    ['main', 'spd', 'spec'].map(k => currentStatKey(war, k)),
    ['str', 'sks', 'ten'],
  );
  assert.deepEqual(
    ['main', 'spd'].map(k => currentStatKey(nin, k)),
    ['dex', 'sks'],
  );
  assert.deepEqual(
    ['main', 'spd'].map(k => currentStatKey(blm, k)),
    ['int', 'sps'],
  );
  // a job with no special substat has nothing at that position: the value stays, and every reader drops it
  assert.equal(currentStatKey(blm, 'spec'), 'spec');
  // the game's own keys, other stats and non-keys come back as they are
  for (const k of ['mind', 'str', 'sps', 'piety', 'crit', 'det', 'dh', 'vit', '', 'x', undefined, null, 7])
    assert.equal(currentStatKey(sge, k), k);
  // inherited object keys are no position keys
  assert.equal(currentStatKey(sge, 'constructor'), 'constructor');
  assert.equal(currentStatKey(sge, 'toString'), 'toString');
});

test('remapStatKey: the same position on the other job; stats with no position, and positions the target lacks, stay', () => {
  assert.equal(remapStatKey(sge, war, 'mind'), 'str');
  assert.equal(remapStatKey(sge, nin, 'mind'), 'dex');
  assert.equal(remapStatKey(war, blm, 'str'), 'int');
  assert.equal(remapStatKey(sge, war, 'sps'), 'sks');
  assert.equal(remapStatKey(war, sge, 'sks'), 'sps');
  assert.equal(remapStatKey(sge, war, 'piety'), 'ten');
  assert.equal(remapStatKey(war, sge, 'ten'), 'piety');
  // Piety on a job with no special substat stays Piety (the Fill settings drop a stat the job lacks)
  assert.equal(remapStatKey(sge, blm, 'piety'), 'piety');
  for (const k of ['crit', 'det', 'dh', 'vit', '', 'x']) assert.equal(remapStatKey(sge, war, k), k);
  // a stat of another job is no position of this one
  assert.equal(remapStatKey(sge, war, 'str'), 'str');
});

/* Shared code (src/core, src/ui/views) writes no job-specific stat in logic. The game's names appear only where they
   are table keys or names: constants.js (labels, profiles, the base table), job-context.js (what the main stat means
   for Vitality and weapon damage), core/tiers.js (each stat's effects) and views/tiers.js (what each substat does). */
const ALLOWED = new Set(['src/core/constants.js', 'src/core/job-context.js', 'src/core/tiers.js', 'src/ui/views/tiers.js']);
const GAME_KEYS = 'sks|sps|piety|ten|str|dex|int|mind';
/* A key as a quoted literal ('mind'), an object key (mind:) or a property (.mind) */
const KEY_USE = new RegExp(`(['"\`])(${GAME_KEYS})\\1|\\b(${GAME_KEYS}):|\\.(${GAME_KEYS})\\b`);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
function sourceFiles(dir) {
  return readdirSync(path.join(root, dir)).flatMap(name => {
    const rel = `${dir}/${name}`;
    if (statSync(path.join(root, rel)).isDirectory()) return sourceFiles(rel);
    return rel.endsWith('.js') ? [rel] : [];
  });
}
/* The code of a file with its comments taken out (block comments, then // to the end of a line, not after a colon so that
   https:// in a string stays whole), lines kept so a hit can be named. */
function codeOf(rel) {
  const text = readFileSync(path.join(root, rel), 'utf8');
  return text.replace(/\/\*[\s\S]*?\*\//g, match => match.replace(/[^\n]/g, '')).replace(/(^|[^:])\/\/.*$/gm, '$1');
}

test('shared code names no job-specific stat outside the allow-listed tables (core and views)', () => {
  const hits = [];
  for (const rel of [...sourceFiles('src/core'), ...sourceFiles('src/ui/views')]) {
    if (ALLOWED.has(rel)) continue;
    codeOf(rel)
      .split('\n')
      .forEach((line, i) => {
        if (KEY_USE.test(line)) hits.push(`${rel}:${i + 1}: ${line.trim()}`);
      });
  }
  assert.deepEqual(hits, []);
});

test('the guard sees a stray key (it would fail on one)', () => {
  for (const line of ["if (stat === 'sks') x();", 'const t = { mind: 1 };', 'return totals.piety;', 'f("ten")'])
    assert.ok(KEY_USE.test(line), line);
  for (const line of ['job.mainKey', "'minder'", 'const intent = 1;', 'Number.parseInt(x)', 'strict: true'])
    assert.ok(!KEY_USE.test(line), line);
});
