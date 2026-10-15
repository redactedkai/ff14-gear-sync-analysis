/* Sync limits view: the special substat (Piety, Tenacity) has its own ItemLevel column, which
   differs from the shared substat column at a few rows. The view must show its cap where it differs, and only then. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeJobContext } from '../../src/core/job-context.js';
import { IL, MAX_REAL } from '../../src/core/tables.js';
import { restoreState } from '../../src/ui/state.js';
import { syncView } from '../../src/ui/views/sync-caps.js';

function makeApp(job, patch = {}) {
  const s = restoreState({ job, sync: true });
  return Object.assign(s, { jobCtx: makeJobContext(s.job), maxReal: MAX_REAL }, patch);
}

/* Slot shares in per mille, from the BaseParam sheet (see CLAUDE.md), and an independent round half up. */
const PERMILLE = {
  weapon2h: 140,
  weapon1h: 100,
  offhand: 40,
  head: 85,
  body: 135,
  hands: 85,
  legs: 135,
  feet: 85,
  ear: 67,
  neck: 67,
  wrist: 67,
  ring: 67,
};
const roundHalfUp = x => Math.floor(x + 0.5 + 1e-9);
const expectedCap = (column, ilvl, type, oneHanded) => {
  const pm = type === 'weapon' ? (oneHanded ? PERMILLE.weapon1h : PERMILLE.weapon2h) : PERMILLE[type];
  return roundHalfUp((IL[column][ilvl] * pm) / 1000);
};
const ARMOR = ['head', 'body', 'hands', 'legs', 'feet', 'ear', 'neck', 'wrist', 'ring'];

for (const [job, column, short, oneHanded] of [
  ['SGE', 'piety', 'PIE', false],
  ['PLD', 'ten', 'TNC', true],
]) {
  test(`${job} at cap 540 shows the ${short} cap from its own ItemLevel column`, () => {
    const v = syncView(makeApp(job, { cap: 540 }));
    assert.equal(v.specLabel, short, 'the extra column is shown');
    for (const r of v.rows) {
      assert.equal(r.spec, expectedCap(column, 540, r.type, oneHanded), `${r.type} ${short} cap`);
      assert.equal(r.sub, expectedCap('crit', 540, r.type, oneHanded), `${r.type} substat cap`);
    }
    const ring = v.rows.find(r => r.type === 'ring');
    assert.equal(ring.spec, 102); // 1518 x 67 / 1000 = 101.7
    assert.equal(ring.sub, 101); // 1514 x 67 / 1000 = 101.4
    const specTotal = ARMOR.reduce((n, t) => n + expectedCap(column, 540, t) * (t === 'ring' ? 2 : 1), 0);
    const subTotal = ARMOR.reduce((n, t) => n + expectedCap('crit', 540, t) * (t === 'ring' ? 2 : 1), 0);
    assert.ok(specTotal > subTotal);
    assert.equal(v.tot.spec, specTotal);
    assert.equal(v.tot.c, subTotal);
    assert.equal(v.best, specTotal, 'the readout uses the larger of the two totals');
    assert.equal(v.spd, subTotal, 'speed is still the shared substat column');
  });

  test(`${job} at cap 123 has no extra column`, () => {
    const v = syncView(makeApp(job, { cap: 123 }));
    assert.equal(v.specLabel, '');
    assert.equal(IL[column][123], IL.crit[123]);
    assert.equal(v.best, v.tot.c);
    assert.equal(v.rows.find(r => r.type === 'head').sub, 29);
  });
}

test('a job with no special substat never shows the extra column, even at cap 540', () => {
  const v = syncView(makeApp('BLM', { cap: 540 }));
  assert.equal(v.specLabel, '');
  assert.equal(v.best, v.tot.c);
});
