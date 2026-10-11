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

test('both generated files carry the same source commit in their header', () => {
  for (const f of ['item-level.js', 'items.js']) {
    const head = readFileSync(new URL(`../../src/data/${f}`, import.meta.url), 'utf8').split('\n', 1)[0];
    assert.ok(head.includes(DATA_SOURCE.commit), `${f} header names ${DATA_SOURCE.commit}`);
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
