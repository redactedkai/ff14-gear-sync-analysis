/* A level box's rules (src/ui/level-cap.js): which typed text is no level, and the texts of its range and its error.
   The caps are real jobs': Paladin 100, Blue Mage 80, Beastmaster 50. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeJobContext } from '../../../src/core/job-context.ts';
import { LEVEL_TEXT, capFlag, levelTextBad, rangeOnly, rangeText } from '../../../src/ui/level-cap.js';

const maxLevelOf = jobId => makeJobContext(jobId).maxLevel;

test("the job's level caps used here are the game's: Paladin 100, Blue Mage 80, Beastmaster 50", () => {
  assert.deepEqual(['PLD', 'BLU', 'BST'].map(maxLevelOf), [100, 80, 50]);
});

test("levelTextBad: a whole number from 1 to the job's level cap is a level, anything else is not", () => {
  for (const jobId of ['PLD', 'BLU', 'BST']) {
    const max = maxLevelOf(jobId);
    for (const text of ['1', '2', String(max - 1), String(max)]) {
      assert.equal(levelTextBad(text, max), false, `${text} at ${jobId}`);
    }
    for (const text of ['0', String(max + 1), '-5', '-1', '12.5', '1.5', '', 'abc', '1e', '--', ' ', '1,5']) {
      assert.equal(levelTextBad(text, max), true, `'${text}' at ${jobId}`);
    }
  }
});

test("levelTextBad: the cap is the job's own: 90 is a level for Paladin and not for Blue Mage or Beastmaster", () => {
  assert.deepEqual(
    ['PLD', 'BLU', 'BST'].map(jobId => levelTextBad('90', maxLevelOf(jobId))),
    [false, true, true],
  );
  assert.equal(levelTextBad('80', maxLevelOf('BLU')), false);
  assert.equal(levelTextBad('81', maxLevelOf('BLU')), true);
  assert.equal(levelTextBad('50', maxLevelOf('BST')), false);
  assert.equal(levelTextBad('51', maxLevelOf('BST')), true);
});

test('LEVEL_TEXT: the range and the error name the job\'s level cap; the flag says the range and "only"', () => {
  for (const jobId of ['PLD', 'BLU', 'BST']) {
    const max = maxLevelOf(jobId);
    const range = LEVEL_TEXT.range(max);
    assert.ok(range.endsWith(String(max)), range);
    assert.ok(LEVEL_TEXT.typedBad(max).includes(String(max)), LEVEL_TEXT.typedBad(max));
    // the flag in the label line, built as the cap field's is (capFlag): an error replaces the range, with the sentence as its tooltip
    assert.deepEqual(capFlag({ error: LEVEL_TEXT.typedBad(max), range }), {
      kind: 'error',
      short: rangeOnly(range),
      full: LEVEL_TEXT.typedBad(max),
    });
  }
  assert.equal(LEVEL_TEXT.range, rangeText);
});
