/* A gear set (src/core/set.js): plain frozen data and evaluateSet, what it adds up to.
   The main guard is helpers/optimizer-view-sets.json: 14 real optimizer results (12 jobs; no sync, item level caps 123
   and 660, level sync to 90 and to 50 with cap 123; Food on and off, a picked meal, a piece picked from a row's menu;
   melds, tier ranking and Target GCD), recorded from the optimizer view before it went through evaluateSet: each row's
   piece (game id, name, melds as the page showed them) and every number the page showed. evaluateSet of those pieces
   must show the same. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { browseItems, mkItem, poolItemById } from '../../src/core/items.js';
import { makeJobContext } from '../../src/core/job-context.js';
import { meldText } from '../../src/core/meld.js';
import { optimize } from '../../src/core/optimizer/index.js';
import { evaluateSet, makeSet, setFromPicks } from '../../src/core/set.js';
import CASES from './helpers/optimizer-view-sets.json' with { type: 'json' };

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

/* A meld as the page shows it ("CRT XII ×2, DET XI, 2 slots empty") as one entry per slot: {stat, grade} or null;
   '' is no melds ([]). */
function stonesOf(job, text) {
  if (!text) return [];
  const statOf = short => job.stats.find(s => job.short[s] === short);
  return text.split(', ').flatMap(part => {
    const empty = part.match(/^(\d+) slots? empty$/);
    if (empty) return Array(+empty[1]).fill(null);
    const [, short, roman, n] = part.match(/^(\S+) (\S+?)(?: ×(\d+))?$/);
    return Array(+(n || 1)).fill({ stat: statOf(short), grade: ROMAN.indexOf(roman) + 1 });
  });
}

/* A recorded case's set: its pieces by game id with their stones, and its meal. */
function caseSet(job, c) {
  return makeSet(
    c.pieces.map(([slot, gameId, name, meld]) => (gameId == null ? { slot } : { slot, gameId, name, stones: stonesOf(job, meld) })),
    c.meal,
  );
}

test('evaluateSet shows what the optimizer view showed for 14 real results, number for number', () => {
  for (const c of CASES) {
    const job = makeJobContext(c.job);
    const set = evaluateSet(job, caseSet(job, c), c.sync, c.sync.level);
    const want = c.expect;
    const at = what => `${c.key}: ${what}`;
    const filled = set.rows.filter(r => r.item);
    assert.deepEqual(
      set.rows.map(r => r.label),
      want.labels,
      at('row labels'),
    );
    // the covered slots name the piece that covers them; in one case the page named the search's own weapon though the
    // row showed another with the same result (fixed by evaluateSet: the name of the piece worn)
    assert.deepEqual(
      set.rows.map(r => (r.item ? null : r.blockedBy)),
      want.blockedBy,
      at('covered by'),
    );
    assert.deepEqual(
      set.rows.map(r => (r.item ? job.stats.map(s => r.stats[s]) : null)),
      want.cells,
      at('row stats'),
    );
    assert.deepEqual(
      set.rows.map(r => (r.item ? job.stats.map(s => +(c.scored.includes(s) && !!r.stats[s] && r.stats[s] >= r.caps[s])).join('') : null)),
      want.atCap,
      at('at cap marks'),
    );
    assert.deepEqual(
      filled.map(r => r.meldText),
      c.pieces.filter(p => p[1] != null).map(p => p[3]),
      at('melds'),
    );
    assert.deepEqual(
      job.stats.map(s => set.gear[s] + set.base[s]),
      want.panel,
      at('Total row'),
    );
    if (c.meal) {
      assert.equal(set.meal.name, c.meal, at('meal'));
      assert.deepEqual(
        job.stats.map(s => set.withFood[s] + set.base[s]),
        want.withFood,
        at('With food row'),
      );
      assert.deepEqual(
        job.stats.map(s => (set.bonus[s] ? [set.bonus[s].bonus, set.bonus[s].capped] : null)),
        want.bonus,
        at('Food row'),
      );
    } else assert.deepEqual([set.meal, set.bonus, set.withFood], [null, {}, set.gear], at('no meal'));
    assert.deepEqual(
      set.tiers.map(t => t && [t.effect, t.spare, t.toNext]),
      want.tiers,
      at('Effect and Tier rows'),
    );
    const d = set.defense;
    assert.deepEqual([d.phys, d.mag, d.physPct, d.magPct], want.defense, at('Defense row'));
    assert.equal(set.gcd.gcd.toFixed(2), want.gcd, at('GCD'));
    assert.equal(set.gcd.dot.toFixed(1), want.dot, at('DoT/HoT'));
    const h = set.gcd.haste;
    assert.equal(h ? ` (${h.name} ${h.pct}%; ${set.gcd.unhasted.toFixed(2)} without)` : '', want.hasteText, at('haste'));
    assert.equal(set.melded, want.melded, at('melded pieces'));
  }
});

test("evaluateSet of an optimizer result's picks: the optimizer's own totals, across jobs and sync", () => {
  const syncs = [
    { cap: null, sync: false, level: 100 },
    { cap: 660, sync: true, level: 100 },
    { cap: null, sync: false, level: 70 },
  ];
  for (const id of ['SGE', 'GNB', 'VPR', 'PCT', 'BST']) {
    const job = makeJobContext(id);
    const pool = browseItems(job, { ilvlMin: 15 })
      .filter(r => r.ilvl >= 400)
      .map(r => poolItemById(job, r.gameId));
    for (const sync of syncs) {
      const res = optimize(job, pool, sync, { target: job.substats[0], tiebreak: [job.substats[1]], melds: true });
      assert.ok(res.ok, id);
      const set = evaluateSet(job, setFromPicks(res.picks), sync, Math.min(sync.level, job.maxLevel));
      for (const s of job.stats) assert.equal(set.gear[s], res.totals[s], `${id} ${JSON.stringify(sync)} ${s}`);
      // each row: the pick's stats and melds
      res.picks.forEach((p, i) => {
        if (!p.item) {
          assert.equal(set.rows[i].item, null);
          return;
        }
        for (const s of job.stats) assert.equal(set.rows[i].stats[s], p.eff[s], `${id} ${p.item.name} ${s}`);
        assert.equal(set.rows[i].meldText, meldText(job, p.meld), p.item.name);
      });
    }
  }
});

test('a set is frozen plain data: pieces by game id with the name beside it, a custom piece, empty slots', () => {
  const sge = makeJobContext('SGE');
  const set = makeSet(
    [
      { slot: 'head', gameId: 49628, name: 'Augmented Bygone Brass Calot of Healing', stones: [{ stat: 'det', grade: 12 }, null] },
      { slot: 'body', custom: mkItem('Hand-made robe', 'body', 700, { main: 500, crit: 300 }), stones: [] },
      { slot: 'ring' },
    ],
    'Popoto Potage',
  );
  assert.ok(
    Object.isFrozen(set) &&
      Object.isFrozen(set.pieces) &&
      Object.isFrozen(set.pieces[0].stones) &&
      Object.isFrozen(set.pieces[0].stones[0]),
  );
  assert.deepEqual(JSON.parse(JSON.stringify(set.pieces[0])), {
    slot: 'head',
    gameId: 49628,
    name: 'Augmented Bygone Brass Calot of Healing',
    stones: [{ stat: 'det', grade: 12 }, null],
  });
  const ev = evaluateSet(sge, set, { cap: null, sync: false, level: 100 }, 100);
  assert.equal(ev.rows[0].item.name, 'Augmented Bygone Brass Calot of Healing');
  assert.equal(ev.rows[0].meldText, 'DET XII'); // the empty slot is not named (audit 11 #8)
  // a custom piece counts its own stats; it has no database facts (no melds, no equip level, no gear category)
  assert.deepEqual([ev.rows[1].stats.crit, ev.rows[1].from, ev.rows[1].category, ev.rows[1].meld], [300, null, null, null]);
  assert.deepEqual([ev.rows[2].label, ev.rows[2].item, ev.rows[2].blockedBy], ['Ring 1', null, '']);
  assert.equal(ev.meal.name, 'Popoto Potage');
});

test('evaluateSet: stones a piece cannot keep, points past the cap, a game id the data no longer has', () => {
  const war = makeJobContext('WAR');
  // Kirin's Osode of Fending (24850): Determination 77 under a cap of 110; synced at cap 290, it keeps no stones
  const set = makeSet([
    {
      slot: 'body',
      gameId: 24850,
      name: "Kirin's Osode of Fending",
      stones: [
        { stat: 'det', grade: 6 },
        { stat: 'det', grade: 6 },
        { stat: 'det', grade: 5 },
      ],
    },
    { slot: 'head', gameId: 999999999, name: 'A piece from an older patch', stones: [] },
  ]);
  const free = evaluateSet(war, set, { cap: null, sync: false, level: 100 }, 100);
  assert.deepEqual([free.rows[0].stats.det, free.rows[0].lost, free.lost.det], [110, { det: 5 }, 5]);
  assert.deepEqual([free.rows[1].item, free.rows[1].missing], [null, 'A piece from an older patch']);
  const synced = evaluateSet(war, set, { cap: 290, sync: true, level: 100 }, 100);
  assert.deepEqual(
    synced.rows[0].removed.map(x => x.reason),
    ['sync', 'sync', 'sync'],
  );
  assert.equal(synced.rows[0].target, 290);
  assert.equal(synced.melded, 0);
});
