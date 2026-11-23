/* The ESLint config for Lit templates (eslint.config.js): linting the fixture must report a class field that shadows a
   reactive property and an <img> without alt, so the test fails when the config stops loading either plugin. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ESLint } from 'eslint';

const FIXTURE_DIR = 'tests/unit/scripts/fixtures/lit-lint';

/* The rule ids ESLint reports for one fixture file. */
async function ruleIdsOf(fileName) {
  const eslint = new ESLint();
  const [result] = await eslint.lintFiles([`${FIXTURE_DIR}/${fileName}`]);
  return result.messages.map(message => message.ruleId);
}

test('the config reports a class field next to static properties', async () => {
  assert.ok((await ruleIdsOf('bad-element.js')).includes('lit/no-classfield-shadowing'));
});

test('the config reports an <img> without alt', async () => {
  assert.ok((await ruleIdsOf('bad-element.js')).includes('lit-a11y/alt-text'));
});

test('a clean element has no findings', async () => {
  assert.deepEqual(await ruleIdsOf('good-element.js'), []);
});
