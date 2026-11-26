/* Level sync on the page's views (src/ui/views/): the Piece stats panels, the gear browser and a set's Auto-fill under a
   synced level, and a cap far above it held to the level (shownSync, src/ui/job-sync-panel.js). Which pieces level sync
   reaches is checked in core/sync-target.test.js. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeJobContext } from '../../../../src/core/job-context.js';
import { MAX_REAL } from '../../../../src/core/tables.ts';
import { shownSync, syncSettings } from '../../../../src/ui/job-sync-panel.js';
import { appState } from '../../helpers/common.js';
import { exhaustive, gamePool } from '../../helpers/exhaustive.js';
import { explainerViewOf, gearViewOf, makeApp, pieceViewOf, solveOf } from '../../helpers/views.js';

/* Level sync (synced level 90, item level sync off) in the views. Real gear at item level 663 to 666: the equip level
   94 and 95 pieces are synced to 660 at level 90, the level 90 ones are not (core/sync-target.test.js). */
const sge = makeJobContext('SGE');
const sgeApp = patch => appState({ job: 'SGE' }, patch);
const LEVEL_SYNC_WINDOW = { ilvlMin: 663, ilvlMax: 666, lvlMax: 100 };

test('views: level sync with item level sync off shows the level item level as the cap', () => {
  const app = sgeApp({ sync: false, cap: null, level: 90 });
  const v = explainerViewOf(app);
  assert.equal(v.cap, 660);
  assert.equal(v.byLevel, true);
  const p = pieceViewOf(Object.assign(app, { piece: { ilvl: 790, slot: 'head', subs: ['sps', null, null] } }));
  assert.equal(p.cap, 660);
  assert.equal(p.status, 'above');
  // at the level cap with item level sync off nothing applies
  assert.equal(explainerViewOf(sgeApp({ sync: false, cap: null, level: 100 })), null);
  assert.equal(pieceViewOf(sgeApp({ sync: false, cap: null, level: 100 })).status, 'off');
  // item level sync on: its cap is shown, whatever the level
  assert.equal(explainerViewOf(sgeApp({ sync: true, cap: 123, level: 50 })).cap, 123);
});

test('views: the gear browser and an Auto-fill apply level sync per piece', () => {
  const app = sgeApp({ sync: false, cap: null, level: 90 });
  Object.assign(app.browse, { q: '', type: 'head', min: 780, max: '', lvl: 100 });
  const g = gearViewOf(app);
  const lv100 = g.shown.filter(x => x.lvl === 100);
  assert.ok(lv100.length >= 2);
  for (const x of lv100) {
    assert.ok(x.eff.mind === 248 && x.raw.mind > 248, x.name);
  }
  const pool = gamePool(sge, LEVEL_SYNC_WINDOW);
  Object.assign(app.recipe, { target: 'sps', tb: 'mind', tb2: 'vit', melds: true, byTier: false });
  const sync = { cap: null, sync: false, level: 90 };
  const o = solveOf(app, pool);
  assert.equal(o.run.status, 'ok');
  assert.equal(o.run.found.synced, true);
  // the total is the character panel's: level 90 base speed 400 (AkhMorning) plus gear. With melds, as the page: the
  // most weapon damage is the item level 665 weapon (132) the level does not sync, which keeps its melds
  assert.equal(o.gearPanel('sps'), 400 + exhaustive(sge, pool, sync, { target: 'sps', tiebreak: ['mind', 'vit'], melds: true })[0]);
  // gear no piece of which is synced at this level is not marked synced
  assert.equal(solveOf(app, gamePool(sge, { ilvlMin: 660, ilvlMax: 665, lvlMax: 90 })).run.found.synced, false);
});

/* A cap far above the synced level's item level (a screenshot: level 50 with cap 500 showed a 1.50 s
   GCD for item level 470 to 540 sets). Gear made for a higher level goes no higher than the best gear made for the
   level (capCeiling, 135), so every view computes what a level 50 duty can. */
test('a cap far above the synced level: gear made for a higher level is held to the level, and every view computes', () => {
  const high = makeApp('SGE', { cap: 500, sync: true, level: 50 });
  assert.deepEqual(shownSync(high.jobCtx, syncSettings(high)), { cap: 130, level: 50, byLevel: true }); // as with sync off at level 50
  const v = solveOf(high, gamePool(high.jobCtx, { ilvlMin: 120, ilvlMax: 540 }));
  assert.equal(v.run.status, 'ok');
  assert.ok(v.set.gcd.gcd >= 2.1, `GCD ${v.set.gcd.gcd}`); // 1.50 s before the fix
  assert.notEqual(explainerViewOf(high), null);
  assert.equal(pieceViewOf(high).cap, 130);
  // a cap at or under the ceiling, and level 100, keep the cap as typed
  const shownSyncOf = app => shownSync(app.jobCtx, syncSettings(app));
  assert.deepEqual(shownSyncOf(makeApp('SGE', { cap: 135, sync: true, level: 50 })), { cap: 135, level: 50, byLevel: false });
  assert.deepEqual(shownSyncOf(makeApp('SGE', { cap: MAX_REAL, sync: true, level: 100 })), { cap: MAX_REAL, level: 100, byLevel: false });
});
