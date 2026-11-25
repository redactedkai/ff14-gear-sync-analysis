/* The inputs hash of the max-speed table (scripts/data/gen_max_speed.mjs): the table depends on the code under src/core as well
   as on the data, so a stale table must show whichever kind of module changed. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inputFiles, isCoreInput } from '../../../scripts/data/gen_max_speed.mjs';
import { listFiles } from '../../domains.mjs';

test('max-speed inputs: JavaScript, TypeScript and JSON files under src/core count, other files do not', () => {
  for (const path of ['src/core/sync-target.js', 'src/core/item-format.json', 'src/core/future-module.ts']) {
    assert.ok(isCoreInput(path), path);
  }
  for (const path of ['src/core/README.md', 'src/core/notes.txt', 'src/core/types.d.ts.map']) {
    assert.ok(!isCoreInput(path), path);
  }
});

test('max-speed inputs: every code and JSON file of src/core, the data files and the generator are hashed, in order', () => {
  const files = inputFiles();
  const core = listFiles('src/core').filter(path => /\.(js|ts|json)$/.test(path));
  assert.ok(core.length > 20, `only ${core.length} files under src/core`);
  for (const path of [...core, 'src/data/items.json', 'src/data/food.json', 'src/data/item-level.json', 'scripts/data/gen_max_speed.mjs']) {
    assert.ok(files.includes(path), `${path} is not hashed`);
  }
  assert.deepEqual(files, [...files].sort());
});
