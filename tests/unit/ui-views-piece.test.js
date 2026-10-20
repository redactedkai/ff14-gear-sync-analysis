/* How the math works, Piece stats' step by step (src/ui/views/piece.js): each stat of a piece against its ceiling,
   with the sentences and arithmetic, the slot share slices and the ranked substats; computed from store-shaped state
   without Alpine. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeJobContext } from '../../src/core/job-context.js';
import { withSub } from '../../src/ui/views/piece.js';
import { gamePool } from './helpers/exhaustive.js';
import { makeApp, pieceViewOf } from './helpers/views.js';

test('Piece stats view: the default two substats both reach the cap; the healer note only for Mind jobs; shares in percent', () => {
  const rpr = pieceViewOf(makeApp('RPR', { cap: 123, sync: true, level: 50 }));
  assert.deepEqual(
    rpr.rows.map(r => [r.stat, r.w, r.syn]),
    [
      ['main', 100, 30],
      ['vit', 100, 32],
      ['crit', 100, 29],
      ['spd', 70, 29], // the 70% line is cut to the full-share head cap, not to 70% of it
    ],
  );
  assert.equal(rpr.evenSubs, true);
  assert.equal(rpr.healerNote, false);
  assert.match(rpr.rows[0].ownFormula, /^6050 × 8\.5% = 514\.3 → 514/);
  assert.equal(pieceViewOf(makeApp('SGE', { cap: 123, sync: true, level: 50 })).healerNote, true);
  // no sync, or a piece at the cap: nothing is cut
  assert.equal(pieceViewOf(makeApp('RPR', { sync: false, cap: null, level: 100 })).evenSubs, false);
  const atCap = makeApp('RPR', { level: 50 });
  atCap.piece = { ...atCap.piece, ilvl: 123 };
  assert.equal(pieceViewOf(atCap).evenSubs, false);
});

test('Piece stats view: every real item level 130 Sage head piece with three substats, its two ranked ones from the formula, synced to 123', () => {
  const app = makeApp('SGE', { cap: 123, sync: true });
  const job = app.jobCtx;
  const heads = gamePool(job, { type: 'head', ilvlMin: 130, ilvlMax: 130, lvlMax: 50 }).filter(
    i => job.substats.filter(s => i.stats[s] > 0).length === 3,
  );
  assert.ok(heads.length >= 2);
  const CAP = { main: 30, vit: 29, sub: 29 }; // head caps at item level 123: main stat 30, everything else 29
  for (const head of heads) {
    // the third line is the fixed Direct Hit of Mind-only gear, which Piece stats does not model
    const subs = job.substats
      .filter(s => head.stats[s] > 0)
      .sort((a, b) => head.stats[b] - head.stats[a])
      .slice(0, 2);
    assert.ok(!subs.includes('dh'), head.name);
    app.piece = { ilvl: 130, slot: 'head', subs };
    const v = pieceViewOf(app);
    const want = ['main', 'vit', ...subs].map(s => [s, head.stats[s], Math.min(head.stats[s], CAP[s] ?? CAP.sub)]);
    assert.deepEqual(
      v.rows.map(r => [r.stat, r.raw, r.syn]),
      want,
      head.name,
    );
    assert.equal(v.status, 'above');
    assert.equal(
      v.lost,
      want.reduce((a, [, raw, syn]) => a + raw - syn, 0),
    );
  }
  // the numbers themselves, for the reader: 33 main / 32 Vitality / 31, 22, 6 substats
  assert.deepEqual(
    heads.map(h => [
      h.stats.main,
      h.stats.vit,
      ...job.substats
        .map(s => h.stats[s])
        .filter(Boolean)
        .sort((a, b) => b - a),
    ]),
    heads.map(() => [33, 32, 31, 22, 6]),
  );
});

test('sync off: Piece stats leaves stats as they are and shows no ceiling', () => {
  const app = makeApp('SGE', { cap: 123, sync: false });
  app.piece = { ilvl: 130, slot: 'head', subs: ['spd', 'spec'] };
  const v = pieceViewOf(app);
  assert.equal(v.status, 'off');
  assert.ok(v.rows.every(r => r.syn === r.raw && r.cap == null && r.ownKept));
  assert.match(v.summary, /^No sync applies/);
  assert.deepEqual(
    pieceViewOf({ ...app, sync: true }).rows.map(r => r.cap),
    [30, 29, 29, 29],
  );
});

/* Piece stats' step by step, the example the layout was designed on: a Sage head at item level 170 with Critical Hit
   and Spell Speed, synced to 130. Each line is the lower of the head's own value and the item level 130 head's (its
   ceiling); the ceiling's arithmetic is capValue's own order (the factor first, the slot share floored in tenths). */
test('Piece stats: each stat against its ceiling, with the sentences and the arithmetic', () => {
  const app = makeApp('SGE', { cap: 130, sync: true, level: 100 });
  app.piece = { ilvl: 170, slot: 'head', subs: ['crit', 'spd'] };
  const v = pieceViewOf(app);
  assert.equal(v.status, 'above');
  assert.deepEqual(
    v.rows.map(r => [r.stat, r.raw, r.cap, r.syn, r.ownKept]),
    [
      ['main', 40, 33, 33, false],
      ['vit', 35, 32, 32, false],
      ['crit', 47, 31, 31, false],
      ['spd', 33, 31, 31, false],
    ],
  );
  assert.equal(
    v.summary,
    'Synced to 130, this item level 170 head keeps 62 of its 80 substat points. Critical Hit, its 100% stat, loses the most (−16).',
  );
  const vit = v.rows[1],
    spd = v.rows[3];
  assert.equal(vit.ownFormula, '460 × 8.5% = 39.1 → 39; × 0.9 = 35.1 → 35');
  assert.equal(vit.capFormula, '414 × 90% = 372; × 8.5% = 31.6 → 32');
  assert.match(vit.ownText, /then 90% on Mind gear\.$/);
  assert.match(spd.ownText, /then 70% for the 2nd substat\.$/);
  assert.match(spd.capText, /\(363\), with no 70% for the 2nd substat\.$/);
  assert.match(vit.capText, /\(414\), with 90% on Mind gear\.$/);
  assert.equal(spd.capFormula, '363 × 8.5% = 30.8 → 31');
  // the slices: the job's slots with both rings make up the whole budget, the head marked
  assert.equal(
    v.slices.reduce((a, s) => a + s.width, 0),
    1000,
  );
  assert.deepEqual(
    v.slices.filter(s => s.on).map(s => [s.label, s.share]),
    [['Head', '8.5%']],
  );
  assert.equal(v.slotShare, '8.5%');
  // at the cap: nothing is cut, the head's own numbers are kept
  app.piece = { ...app.piece, ilvl: 130 };
  const at = pieceViewOf(app);
  assert.equal(at.status, 'below');
  assert.ok(at.rows.every(r => r.ownKept && r.lost === 0));
});

test('Piece stats: an off-hand is the two-handed value minus the one-handed one, its ceiling too', () => {
  const app = makeApp('PLD', { cap: 130, sync: true, level: 100 });
  app.piece = { ilvl: 170, slot: 'offhand', subs: ['crit', 'det'] };
  const v = pieceViewOf(app);
  const crit = v.rows.find(r => r.stat === 'crit');
  assert.match(crit.ownText, /^The two-handed weapon's \d+ minus the one-handed weapon's \d+\.$/);
  assert.match(crit.capText, /^The two-handed cap \d+ minus the one-handed cap \d+\.$/);
  assert.equal(v.slotShare, null);
  assert.deepEqual(
    v.slices.filter(s => s.on).map(s => s.label),
    ['Off-hand'],
  );
  assert.equal(
    v.slices.reduce((a, s) => a + s.width, 0),
    1000,
  );
});

test('Piece stats steps: the sentences and headings of the section', () => {
  const body = makeApp('SGE', { level: 100 });
  body.piece = { ...body.piece, slot: 'body' };
  const sync = pieceViewOf(body, 300);
  assert.equal(sync.shareText, `The body takes ${sync.slotShare}`);
  assert.equal(sync.ruleText, 'what this body has, and what a body at the synced item level has (its ceiling).');
  assert.equal(sync.ownHead, 'This body (item level 300)');
  assert.equal(sync.capHead, 'A body at item level 123 (the ceiling)');
  assert.equal(sync.byLevelText, '');
  const app = makeApp('PLD', { sync: false, cap: null, level: 90 });
  app.piece = { ...app.piece, slot: 'offhand' };
  const byLevel = pieceViewOf(app);
  assert.equal(byLevel.shareText, 'An off-hand is the two-handed weapon’s value minus the one-handed weapon’s');
  assert.equal(
    byLevel.byLevelText,
    `Level sync: at level 90, gear with a higher equip level is synced to item level ${byLevel.cap}, used as the cap here.`,
  );
});

/* The math bar's 1st and 2nd substat menus (withSub): a substat holds at most one rank. */
const healer = makeJobContext('WHM').substats; // crit, det, dh, spd, spec

test('substat ranks: choosing an unused substat just sets that rank', () => {
  assert.deepEqual(withSub(['spd', 'spec'], 1, 'crit', healer), ['spd', 'crit']);
});

test('substat ranks: choosing a substat used in another rank swaps the two', () => {
  assert.deepEqual(withSub(['spd', 'spec'], 1, 'spd', healer), ['spec', 'spd']);
  assert.deepEqual(withSub(['spd', 'spec'], 0, 'spec', healer), ['spec', 'spd']);
});

test('substat ranks: rank 2 can be cleared, and a swap never empties rank 1', () => {
  assert.deepEqual(withSub(['spd', 'spec'], 1, '', healer), ['spd', null]);
  // rank 2 is empty; moving rank 1's substat there would leave rank 1 empty, so rank 1 takes the first free one
  assert.deepEqual(withSub(['spd', null], 1, 'spd', healer), ['crit', 'spd']);
});

test('substat ranks: an older three-rank list is cut to two', () => {
  assert.deepEqual(withSub(['spd', 'spec', 'dh'], 1, 'crit', healer), ['spd', 'crit']);
});

test('substat ranks: no substat ever appears twice', () => {
  const opts = ['', ...healer];
  for (const a of healer)
    for (const b of [null, ...healer]) {
      if (a === b) continue;
      for (let i = 0; i < 2; i++)
        for (const v of opts) {
          if (i === 0 && v === '') continue; // rank 1 offers no "none"
          const out = withSub([a, b], i, v, healer).filter(Boolean);
          assert.equal(new Set(out).size, out.length, JSON.stringify([[a, b], i, v]));
        }
    }
});
