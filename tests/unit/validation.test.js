import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bandAccuracy, wikiChecks } from '../../src/core/validation.js';
import { MAX_REAL, MAX_ILVL } from '../../src/core/tables.js';

test('formula reproduces the Wiki sync caps at item level 475', () => {
  for (const c of wikiChecks()) assert.equal(c.computed, c.published, c.label);
});

test('formula accuracy against every real piece, by item level band', t => {
  for (const b of bandAccuracy()) {
    const exact = b.exact / b.n,
      within1 = b.within1 / b.n;
    t.diagnostic(`band ${b.label} n=${b.n} exact ${(exact * 100).toFixed(1)}% within1 ${(within1 * 100).toFixed(1)}%`);
    assert.ok(exact >= 0.95, `exact share in band ${b.label}: ${exact}`);
    assert.ok(within1 >= 0.96, `within-1 share in band ${b.label}: ${within1}`);
  }
});

test('highest real item level is inside the ItemLevel table', () => {
  assert.ok(MAX_REAL <= MAX_ILVL);
});
