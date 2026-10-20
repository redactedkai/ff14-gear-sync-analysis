/* Level sync on the page's views (src/ui/views/): the Piece stats panels, the gear browser and the optimizer under a
   synced level, and a cap far above it held to the level (shownSync, src/ui/settings.js). Which pieces level sync
   reaches is checked in core-sync-target.test.js. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeJobContext } from '../../src/core/job-context.js';
import { MAX_REAL } from '../../src/core/tables.js';
import { shownSync, syncSettings } from '../../src/ui/settings.js';
import { appState } from './helpers/common.js';
import { exhaustive, gamePool } from './helpers/exhaustive.js';
import { explainerViewOf, gearViewOf, makeApp, pieceViewOf, viewOf } from './helpers/views.js';

/* Level sync (synced level 90, item level sync off) in the views. Real gear at item level 663 to 666: the equip level
   94 and 95 pieces are synced to 660 at level 90, the level 90 ones are not (core-sync-target.test.js). */
const sge = makeJobContext('SGE');
const sgeApp = patch => appState({ job: 'SGE' }, patch);
const LEVEL_SYNC_WINDOW = { ilvlMin: 663, ilvlMax: 666, lvlMax: 100 };

test('views: level sync with item level sync off shows the level item level as the cap', () => {
  const app = sgeApp({ sync: false, cap: null, level: 90 });
  const v = explainerViewOf(app);
  assert.equal(v.cap, 660);
  assert.equal(v.byLevel, true);
  const p = pieceViewOf(Object.assign(app, { piece: { ilvl: 790, slot: 'head', subs: ['spd', null, null] } }));
  assert.equal(p.cap, 660);
  assert.equal(p.status, 'above');
  // at the level cap with item level sync off nothing applies
  assert.equal(explainerViewOf(sgeApp({ sync: false, cap: null, level: 100 })), null);
  assert.equal(pieceViewOf(sgeApp({ sync: false, cap: null, level: 100 })).status, 'off');
  // item level sync on: its cap is shown, whatever the level
  assert.equal(explainerViewOf(sgeApp({ sync: true, cap: 123, level: 50 })).cap, 123);
});

test('views: the gear browser and the optimizer apply level sync per piece', () => {
  const app = sgeApp({ sync: false, cap: null, level: 90 });
  Object.assign(app.browse, { q: '', type: 'head', min: 780, max: '', lvl: 100 });
  const g = gearViewOf(app);
  const lv100 = g.shown.filter(x => x.lvl === 100);
  assert.ok(lv100.length >= 2);
  for (const x of lv100) assert.ok(x.eff.main === 248 && x.raw.main > 248, x.name);
  const pool = gamePool(sge, LEVEL_SYNC_WINDOW);
  Object.assign(app.opt, { target: 'spd', tb: 'main', tb2: 'vit' });
  const sync = { cap: null, sync: false, level: 90 };
  const o = viewOf(app, pool);
  assert.equal(o.kind, 'ok');
  assert.equal(o.synced, true);
  // the total is the character panel's: level 90 base speed 400 (AkhMorning) plus gear. With melds, as the page: the
  // most weapon damage is the item level 665 weapon (132) the level does not sync, which keeps its melds
  assert.equal(o.total, 400 + exhaustive(sge, pool, sync, { target: 'spd', tiebreak: ['main', 'vit'], melds: true })[0]);
  // the item level column: a synced piece shows 660 with its own under it, an unsynced one its own alone (audit 11 #5)
  const worn = o.rows.filter(r => r.item);
  for (const r of worn) {
    if (r.ilvlWas != null) assert.deepEqual([r.ilvl, r.ilvlWas], [660, r.item.ilvl], r.item.name);
    else assert.equal(r.ilvl, r.item.ilvl, r.item.name);
  }
  assert.ok(
    worn.some(r => r.ilvlWas != null),
    'some piece is synced',
  );
  // gear no piece of which is synced at this level is not marked synced
  assert.equal(viewOf(app, gamePool(sge, { ilvlMin: 660, ilvlMax: 665, lvlMax: 90 })).synced, false);
});

/* A cap far above the synced level's item level (owner's screenshot, 2026-10-18: level 50 with cap 500 showed a 1.50 s
   GCD for item level 470 to 540 sets). Gear made for a higher level goes no higher than the best gear made for the
   level (capCeiling, 135), so every view computes what a level 50 duty can. */
test('a cap far above the synced level: gear made for a higher level is held to the level, and every view computes', () => {
  const high = makeApp('SGE', { cap: 500, sync: true, level: 50 });
  assert.deepEqual(shownSync(high.jobCtx, syncSettings(high)), { cap: 130, level: 50, byLevel: true }); // as with sync off at level 50
  const v = viewOf(high, gamePool(high.jobCtx, { ilvlMin: 120, ilvlMax: 540 }));
  assert.equal(v.kind, 'ok');
  assert.ok(Number(v.gcd) >= 2.1, `GCD ${v.gcd}`); // 1.50 s before the fix
  assert.notEqual(explainerViewOf(high), null);
  assert.equal(pieceViewOf(high).cap, 130);
  // a cap at or under the ceiling, and level 100, keep the cap as typed
  const shownSyncOf = app => shownSync(app.jobCtx, syncSettings(app));
  assert.deepEqual(shownSyncOf(makeApp('SGE', { cap: 135, sync: true, level: 50 })), { cap: 135, level: 50, byLevel: false });
  assert.deepEqual(shownSyncOf(makeApp('SGE', { cap: MAX_REAL, sync: true, level: 100 })), { cap: MAX_REAL, level: 100, byLevel: false });
});
