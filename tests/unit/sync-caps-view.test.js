/* Sync limits view: the special substat (Piety, Tenacity) has its own ItemLevel column, which
   differs from the shared substat column at a few rows. The view must show its cap where it differs, and only then. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IL } from '../../src/core/tables.js';
import { syncView } from '../../src/ui/views/sync-caps.js';
import { SLOT_PERMILLE, appState, roundHalfUp } from './helpers/common.js';

const makeApp = (job, patch = {}) => appState({ job, sync: true }, patch);

/* An independent cap: the ItemLevel column times the slot share (BaseParam, typed in), rounded half up. */
const expectedCap = (column, ilvl, type, oneHanded) => {
  const pm = type === 'weapon' ? (oneHanded ? SLOT_PERMILLE.weapon1h : SLOT_PERMILLE.weapon2h) : SLOT_PERMILLE[type];
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
