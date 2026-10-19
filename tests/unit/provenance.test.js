/* The committed game data records which xivapi/ffxiv-datamining commit it was generated from. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DATA_SOURCE, dataSourceLabel } from '../../src/core/tables.js';

test('DATA_SOURCE names the datamining repo, a full commit sha and an ISO date', () => {
  assert.equal(DATA_SOURCE.repo, 'xivapi/ffxiv-datamining');
  assert.match(DATA_SOURCE.commit, /^[0-9a-f]{40}$/);
  assert.match(DATA_SOURCE.date, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(Z|[+-]\d{2}:\d{2})$/);
  assert.ok(!Number.isNaN(Date.parse(DATA_SOURCE.date)));
});

test('every generated data file names the same source commit', () => {
  // max-speed.json (written by Node) carries the source record but no "do not edit" notice; a partial regeneration
  // that skipped a file shows up here as an older commit
  for (const name of ['item-level.json', 'items.json', 'food.json', 'max-speed.json']) {
    const doc = JSON.parse(readFileSync(new URL(`../../src/data/${name}`, import.meta.url), 'utf8'));
    assert.deepEqual(doc.source, DATA_SOURCE, `${name} source`);
    if (name !== 'max-speed.json') assert.ok(doc._generated.includes(DATA_SOURCE.commit), `${name} notice names ${DATA_SOURCE.commit}`);
  }
});

test('footer label is short, and empty when provenance is missing', () => {
  assert.equal(dataSourceLabel(), `Game data: ffxiv-datamining ${DATA_SOURCE.commit.slice(0, 7)}, ${DATA_SOURCE.date.slice(0, 10)}`);
  assert.equal(dataSourceLabel(null), '');
  assert.equal(
    dataSourceLabel({ repo: 'xivapi/ffxiv-datamining', commit: 'abcdef0123456789abcdef0123456789abcdef01', date: null }),
    'Game data: ffxiv-datamining abcdef0',
  );
});
