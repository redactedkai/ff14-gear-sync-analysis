/* Stat keys moved between jobs and read from older saves (src/core/stat-keys.js), and the rule that shared code names no
   job-specific stat: the game's names are keys in tables, and logic reads job.mainKey, job.speedKey and job.specKey. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeJobContext } from '../../../src/core/job-context.js';
import { currentStatKey, remapStatKey } from '../../../src/core/stat-keys.js';

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
  // Piety on a job with no special substat stays Piety (the Auto-fill settings drop a stat the job lacks)
  assert.equal(remapStatKey(sge, blm, 'piety'), 'piety');
  for (const k of ['crit', 'det', 'dh', 'vit', '', 'x']) assert.equal(remapStatKey(sge, war, k), k);
  // a stat of another job is no position of this one
  assert.equal(remapStatKey(sge, war, 'str'), 'str');
});

/* Shared code (src/core, src/ui/views) writes no job-specific stat in logic. The game's names appear only where they
   are table keys or names: constants.js (labels, profiles), base-stats.js (the substats based on the main stat), job-context.js (what the main stat means
   for Vitality and weapon damage), core/tiers.js (each stat's effects) and views/tiers.js (what each substat does). */
const ALLOWED = new Set([
  'src/core/base-stats.js',
  'src/core/constants.js',
  'src/core/job-context.js',
  'src/core/tiers.js',
  'src/ui/views/tiers.js',
]);
const GAME_KEYS = 'sks|sps|piety|ten|str|dex|int|mind';
/* A key as a quoted literal ('mind'), an object key (mind:) or a property (.mind) */
const KEY_USE = new RegExp(`(['"\`])(${GAME_KEYS})\\1|\\b(${GAME_KEYS}):|\\.(${GAME_KEYS})\\b`);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
/* The .js and .ts files under `dir` (relative to `base`: the repo root, or a tree a test plants). */
function sourceFiles(dir, base = root) {
  return readdirSync(path.join(base, dir)).flatMap(name => {
    const rel = `${dir}/${name}`;
    if (statSync(path.join(base, rel)).isDirectory()) return sourceFiles(rel, base);
    return /\.(js|ts)$/.test(rel) ? [rel] : [];
  });
}
/* The code of a file with its comments taken out (block comments, then // to the end of a line, not after a colon so that
   https:// in a string stays whole), lines kept so a hit can be named. */
function codeOf(rel, base = root) {
  const text = readFileSync(path.join(base, rel), 'utf8');
  return text.replace(/\/\*[\s\S]*?\*\//g, match => match.replace(/[^\n]/g, '')).replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/* The lines of shared code (src/core, src/ui/views) under `base` that name a job-specific stat, as "file:line: text". */
function keyHits(base = root) {
  const hits = [];
  for (const rel of [...sourceFiles('src/core', base), ...sourceFiles('src/ui/views', base)]) {
    if (ALLOWED.has(rel)) continue;
    codeOf(rel, base)
      .split('\n')
      .forEach((line, i) => {
        if (KEY_USE.test(line)) hits.push(`${rel}:${i + 1}: ${line.trim()}`);
      });
  }
  return hits;
}

test('shared code names no job-specific stat outside the allow-listed tables (core and views)', () => {
  assert.deepEqual(keyHits(), []);
});

/* R8: the scan reads .ts files too: a planted .ts stray in each scanned folder is found, and a .js one beside it. */
test('the scan sees a .ts stray in src/core and src/ui/views (and still a .js one)', () => {
  const base = mkdtempSync(path.join(tmpdir(), 'stat-keys-ts-'));
  const line = 'export const t: Record<string, number> = { mind: 1 };';
  try {
    for (const file of ['src/core/stray.ts', 'src/ui/views/stray.ts', 'src/core/stray.js']) {
      mkdirSync(path.dirname(path.join(base, file)), { recursive: true });
      writeFileSync(path.join(base, file), `${line}\n`);
    }
    assert.deepEqual(keyHits(base), [`src/core/stray.js:1: ${line}`, `src/core/stray.ts:1: ${line}`, `src/ui/views/stray.ts:1: ${line}`]);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('the guard sees a stray key (it would fail on one)', () => {
  for (const line of ["if (stat === 'sks') x();", 'const t = { mind: 1 };', 'return totals.piety;', 'f("ten")'])
    assert.ok(KEY_USE.test(line), line);
  for (const line of ['job.mainKey', "'minder'", 'const intent = 1;', 'Number.parseInt(x)', 'strict: true'])
    assert.ok(!KEY_USE.test(line), line);
});
