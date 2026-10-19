/* Item queries (src/core/items.js): gear filtering per job, picked by properties, never by name; database rows to pool
   items; copies, HQ, "Gear from" routes, expansions and meld slots of real pieces; the materia table. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeJobContext } from '../../src/core/job-context.js';
import {
  browseItems,
  poolItemFromRow,
  parseRow,
  mkItem,
  itemRoutes,
  withActivities,
  emptyActivities,
  expansionOf,
  meldInfo,
  rowStats,
} from '../../src/core/items.js';
import { ACTIVITIES, ACTIVITY_MARKET_BIT, EXPANSIONS, ROW } from '../../src/core/constants.js';
import { DEFAULT_EXCLUDE } from '../../src/ui/state.js';
import { ITEMS, MATERIA } from '../../src/core/tables.js';
import { itemRow } from './helpers/common.js';

const pld = makeJobContext('PLD');
const war = makeJobContext('WAR');
const sge = makeJobContext('SGE');
const names = rows => rows.map(r => r.name);

/* Raw database stat order (CLAUDE.md, src/data/items.json):
   str,dex,int,mind,vit,piety,ten,dh,crit,det,sks,sps,mainAttr,secAttr */
const RAW = {
  str: 0,
  dex: 1,
  int: 2,
  mind: 3,
  vit: 4,
  piety: 5,
  ten: 6,
  dh: 7,
  crit: 8,
  det: 9,
  sks: 10,
  sps: 11,
  mainAttr: 12,
  secAttr: 13,
};
const rowKey = r => `${r.name}|${r.slotCode}|${r.ilvl}|${r.mask}`;
const rawKey = r => `${r[ROW.name]}|${r[ROW.slotCode]}|${r[ROW.ilvl]}|${r[ROW.jobMask]}`;
const lvl50 = { ilvlMin: 130, ilvlMax: 135, lvlMax: 50 };

test('weapon mode: Paladin sees one-handed weapons and shields, never two-handed weapons', () => {
  const all = browseItems(pld, { type: 'any' });
  const codes = new Set(all.map(r => r.slotCode));
  assert.ok(!codes.has(0), 'no 2H weapons');
  assert.ok(codes.has(1) && codes.has(2), '1H weapons and off-hands present');
  // also within one small window: a 1H weapon (type weapon) and a shield (type offhand)
  const win = browseItems(pld, lvl50);
  assert.ok(win.some(r => r.slotCode === 1 && r.type === 'weapon'));
  assert.ok(win.some(r => r.slotCode === 2 && r.type === 'offhand'));
});

test('weapon mode: Warrior sees two-handed weapons only, no one-handed weapons or off-hands', () => {
  const codes = new Set(browseItems(war, { type: 'any' }).map(r => r.slotCode));
  assert.ok(codes.has(0));
  assert.ok(!codes.has(1) && !codes.has(2));
  assert.ok(browseItems(war, lvl50).some(r => r.slotCode === 0 && r.type === 'weapon'));
});

test('job mask: only rows with the job bit are shown, even when they carry the main stat', () => {
  const shown = browseItems(war, {});
  const bit = 1 << war.jobIndex;
  assert.ok(shown.every(r => r.mask & bit));
  // Strength gear other jobs can wear but a Warrior cannot (e.g. Dragoon or Monk gear)
  const hidden = ITEMS.filter(r => !(r[ROW.jobMask] & bit) && rowStats(r)[RAW.str] > 0);
  assert.ok(hidden.length > 100);
  const keys = new Set(shown.map(rowKey));
  assert.ok(hidden.every(r => !keys.has(rawKey(r))));
});

test('job mask: a Warrior does not see healer (Mind) gear, a Sage does', () => {
  const healer = browseItems(sge, { type: 'head', ...lvl50 });
  assert.ok(healer.length >= 2);
  assert.ok(healer.every(r => r.st[RAW.mind] > 0 && r.mask & (1 << sge.jobIndex) && !(r.mask & (1 << war.jobIndex))));
  const warKeys = new Set(browseItems(war, { type: 'head', ...lvl50 }).map(rowKey));
  assert.ok(healer.every(r => !warKeys.has(rowKey(r))));
});

/* Pre-order earrings carry the game's generic "Main Attribute" and "Secondary Attribute" (BaseParam 55 and 56),
   which become the wearer's main stat and its secondary stat: Piety for healers, Tenacity for tanks, Direct Hit
   otherwise. Azeyma's Earrings (item level 560, all jobs): Main Attribute 115, Vitality 115, Secondary Attribute 111,
   Determination 111 (Item.csv). */
test("main and secondary attribute: Azeyma's Earrings give each job its own main stat and secondary stat", () => {
  const nin = makeJobContext('NIN');
  const expect = [
    ['SGE', sge, { main: 115, vit: 115, det: 111, spec: 111, dh: 0 }],
    ['WAR', war, { main: 115, vit: 115, det: 111, spec: 111, dh: 0 }],
    ['NIN', nin, { main: 115, vit: 115, det: 111, spec: 0, dh: 111 }],
  ];
  for (const [id, job, want] of expect) {
    const rows = browseItems(job, { q: "azeyma's earrings" });
    assert.equal(rows.length, 1, `${id} sees the earrings`);
    const st = poolItemFromRow(job, rows[0]).stats;
    for (const [k, v] of Object.entries(want)) assert.equal(st[k], v, `${id} ${k}`);
  }
});

test('main-stat filter: gear the job can equip but without its main stat is hidden', () => {
  const bit = 1 << war.jobIndex;
  const noStr = ITEMS.filter(r => r[ROW.jobMask] & bit && rowStats(r)[RAW.str] === 0 && !rowStats(r)[RAW.mainAttr]);
  assert.ok(noStr.length > 0, 'the database has Warrior-equippable rows without Strength');
  const keys = new Set(browseItems(war, {}).map(rowKey));
  assert.ok(noStr.every(r => !keys.has(rawKey(r))));
  assert.ok(browseItems(war, { ilvlMin: 700 }).every(r => r.st[RAW.str] > 0 || r.st[RAW.mainAttr] > 0));
});

test('item level and equip level bounds', () => {
  const all = browseItems(war, {});
  const same = (f, pred) => assert.deepEqual(browseItems(war, f).map(rowKey), all.filter(pred).map(rowKey), JSON.stringify(f));
  same({ ilvlMin: 131 }, r => r.ilvl >= 131);
  same({ ilvlMax: 130 }, r => r.ilvl <= 130);
  same({ ilvlMin: 135, ilvlMax: 135 }, r => r.ilvl === 135);
  same({ lvlMax: 50 }, r => r.lvl <= 50);
  same(lvl50, r => r.ilvl >= 130 && r.ilvl <= 135 && r.lvl <= 50);
  const win = browseItems(war, lvl50);
  assert.ok(win.length > 0 && win.some(r => r.ilvl === 135) && win.some(r => r.ilvl === 130));
  // everything in this window needs level 50, so one level lower hides it all
  assert.ok(win.every(r => r.lvl === 50));
  assert.equal(browseItems(war, { ...lvl50, lvlMax: 49 }).length, 0);
});

test('level cap: Beastmaster and Blue Mage never see gear above their cap, whatever the equip level filter says', () => {
  for (const [id, cap] of [
    ['BST', 50],
    ['BLU', 80],
  ]) {
    const job = makeJobContext(id);
    const bit = 1 << job.jobIndex;
    const above = ITEMS.filter(r => r[ROW.jobMask] & bit && r[ROW.equipLevel] > cap);
    assert.ok(above.length > 0, `${id} has database gear above its cap`); // so the filter is tested
    for (const f of [{}, { lvlMax: 100 }]) {
      const rows = browseItems(job, f);
      assert.ok(rows.length > 0 && rows.every(r => r.lvl <= cap), id);
      assert.ok(
        rows.some(r => r.lvl === cap),
        id,
      );
    }
    assert.ok(browseItems(job, { lvlMax: cap - 1 }).every(r => r.lvl <= cap - 1));
  }
  // a job without a cap of its own still sees level 100 gear
  assert.ok(browseItems(war, {}).some(r => r.lvl === 100));
});

test("Beastmaster's own gear (job mask 1 << 22): Guttler and Kornago Hoplon, its one-handed weapon and shield", () => {
  const bst = makeJobContext('BST');
  const rows = browseItems(bst, { ilvlMin: 135, ilvlMax: 135 });
  const guttler = rows.find(r => r.name === 'Guttler');
  const hoplon = rows.find(r => r.name === 'Kornago Hoplon');
  assert.ok(guttler && hoplon);
  assert.equal(guttler.mask, 1 << 22);
  assert.deepEqual([guttler.type, guttler.slotCode, guttler.lvl], ['weapon', 1, 50]);
  assert.deepEqual([hoplon.type, hoplon.slotCode, hoplon.lvl], ['offhand', 2, 50]);
  // Item.csv: Strength 39, Vitality 42, Direct Hit 39, Determination 27; its Crucible bonus (+9 / +9, ItemSpecialBonus 11,
  // not HQ-able) is not carried
  assert.deepEqual(poolItemFromRow(bst, guttler).stats, { main: 39, vit: 42, crit: 0, det: 27, dh: 39, spd: 0, spec: 0 });
  // a Monk cannot equip it
  assert.ok(!browseItems(makeJobContext('MNK'), { ilvlMin: 135, ilvlMax: 135 }).some(r => r.name === 'Guttler'));
});

test('name query is case-insensitive and trimmed', () => {
  const word = browseItems(war, lvl50)[0].name.split(' ').pop().toLowerCase(); // a word from a real item name
  const a = names(browseItems(war, { q: word }));
  assert.ok(a.length > 1);
  assert.deepEqual(a, names(browseItems(war, {}).filter(r => r.name.toLowerCase().includes(word))));
  assert.deepEqual(names(browseItems(war, { q: `  ${word.toUpperCase()} ` })), a);
  const mixed = [...word].map((c, i) => (i % 2 ? c.toUpperCase() : c)).join('');
  assert.deepEqual(names(browseItems(war, { q: mixed })), a);
});

test('slot type filter', () => {
  const win = browseItems(war, lvl50);
  const rings = browseItems(war, { ...lvl50, type: 'ring' });
  assert.ok(rings.length >= 2);
  assert.deepEqual(rings.map(rowKey), win.filter(r => r.slotCode === 11).map(rowKey));
  assert.ok(rings.every(r => r.type === 'ring' && r.slotCode === 11));
  assert.equal(browseItems(war, { ...lvl50, type: 'any' }).length, win.length);
  assert.equal(browseItems(war, { type: 'offhand' }).length, 0);
});

test('poolItemFromRow maps raw stats to neutral keys (healer and tank)', () => {
  // a real item level 130 Sage head piece with three substats
  const row = browseItems(sge, { type: 'head', ilvlMin: 130, ilvlMax: 130, lvlMax: 50 }).find(r => r.st[RAW.sps] > 0);
  const it = poolItemFromRow(sge, row);
  assert.equal(it.src, 'game');
  assert.equal(it.type, 'head');
  assert.equal(it.ilvl, 130);
  assert.equal(it.copies, 1);
  const st = row.st;
  assert.deepEqual(it.stats, {
    main: st[RAW.mind],
    vit: st[RAW.vit],
    crit: st[RAW.crit],
    det: st[RAW.det],
    dh: st[RAW.dh],
    spd: st[RAW.sps],
    spec: st[RAW.piety],
  });
  assert.equal(Object.values(it.stats).filter(v => v > 0).length, 5); // main, vit and three substats

  const tank = browseItems(war, { type: 'weapon', ...lvl50 }).find(r => r.st[RAW.ten] > 0);
  const t = poolItemFromRow(war, tank).stats;
  assert.deepEqual([t.main, t.spd, t.spec], [tank.st[RAW.str], tank.st[RAW.sks], tank.st[RAW.ten]]);
});

test('poolItemFromRow copies: a Unique ring once, a non-unique ring twice', () => {
  const rings = browseItems(war, { type: 'ring', ...lvl50 });
  const unique = rings.find(r => r.unique);
  assert.ok(unique, 'a Unique ring');
  assert.equal(poolItemFromRow(war, unique).copies, 1);

  const plain = rings.find(r => !r.unique);
  assert.ok(plain, 'a non-unique ring');
  assert.equal(poolItemFromRow(war, plain).copies, 2);

  // non-ring, non-unique pieces are still a single copy
  const synthetic = parseRow(['Test Earring', 8, 130, 50, 1 << war.jobIndex, '26,0,0,0,28,0,24,0,0,17,0,0', 0]);
  assert.equal(poolItemFromRow(war, synthetic).copies, 1);
});

test('HQ flag: a pool item keeps whether its database row is HQ-capable', () => {
  const job = makeJobContext('SGE');
  const rows = browseItems(job, { q: '', type: 'any', ilvlMin: 0, ilvlMax: 0, lvlMax: 0 });
  const hq = rows.find(r => r.hq),
    nq = rows.find(r => !r.hq);
  assert.ok(hq && nq);
  const items = [poolItemFromRow(job, hq), poolItemFromRow(job, nq)];
  assert.deepEqual(
    items.map(i => i.hq),
    [true, false],
  );
});

/* A route as box keys joined by "+" in ACTIVITIES order, 'market' for the market board route; the routes sorted. */
/* "Gear from" routes of real pieces whose Lodestone pages agree: a recipe (Ra'Kaznar, tradeable: also the market board),
   the current tomestones (Bygone Brass), Mad Harlequin's Totem (Palazzo Diamond, Ultimate), a Savage raid book (Dark Horse
   Champion's, Dawntrail: Savage (Current); Genji, Stormblood: Savage (Legacy)), the Bozja and Occult Crescent field
   operations (Bozjan, Phantom Vision) and a relic weapon (Phantom Gunblade), a dungeon drop (Mistwake), Wolf Marks
   (Lionsmane Armet). Augmented Bygone Brass is the tomestone piece plus Thundersteeped Twine, which drops in Savage or is
   sold for Sacks of Nuts (Hunts; game files). The base Radiant's set (item level 590) can no longer be obtained. */
const routeKeys = routes =>
  routes
    .map(m =>
      m === ACTIVITY_MARKET_BIT
        ? 'market'
        : ACTIVITIES.filter(a => m & a.bit)
            .map(a => a.key)
            .join('+'),
    )
    .sort();

test('"Gear from" routes of real items, and filtering a pool by them', () => {
  const cases = {
    "Ra'Kaznar Helm of Fending": [['crafted', 'market'], 'WAR'],
    'Bygone Brass Earrings of Casting': [['tomes_current'], 'BLM'],
    'Palazzo Diamond Codex': [['ultimate'], 'SCH'],
    "Dark Horse Champion's Gloves of Scouting": [['savage_current'], 'NIN'],
    'Genji Ring of Aiming': [['savage_legacy'], 'BRD'],
    'Bozjan Trousers of Casting': [['relics'], 'BLM'],
    'Phantom Vision Boots of Scouting': [['relics'], 'NIN'],
    'Phantom Gunblade Obscurum': [['relics'], 'GNB'],
    'Mistwake Visor of Fending': [['normal_duties'], 'WAR'],
    'Lionsmane Armet': [['pvp'], 'PLD'],
    'Augmented Bygone Brass Earrings of Casting': [['tomes_current+hunts', 'tomes_current+savage_current'], 'BLM'],
    "Radiant's Helm of Fending": [[], 'PLD'],
  };
  const pool = [];
  for (const [name, [want, jobId]] of Object.entries(cases)) {
    const row = parseRow(itemRow(name));
    assert.deepEqual(routeKeys(row.routes), want, name);
    const it = poolItemFromRow(makeJobContext(jobId), row);
    assert.deepEqual(routeKeys(itemRoutes(it)), want, name);
    pool.push(it);
  }
  const hand = mkItem('Hand-made', 'head', 700, { spd: 10 });
  pool.push(hand);
  assert.equal(itemRoutes(hand), null);
  const names = (off, market) => withActivities(pool, off, market).map(i => i.name);

  // every box and the market board: all but the retired piece; hand-made pieces always pass
  assert.deepEqual(names([], true), [...Object.keys(cases).filter(n => n !== "Radiant's Helm of Fending"), 'Hand-made']);
  // the defaults leave out Ultimate, Savage (Current) and PvP among others
  const hiddenByDefault = ['Palazzo Diamond Codex', "Dark Horse Champion's Gloves of Scouting", 'Lionsmane Armet'];
  assert.deepEqual(
    names([...DEFAULT_EXCLUDE], true),
    names([], true).filter(n => !hiddenByDefault.includes(n)),
  );
  // a tradeable crafted piece stays while the market board is on, whatever the Crafted box says
  assert.ok(names(['crafted'], true).includes("Ra'Kaznar Helm of Fending"));
  assert.ok(!names(['crafted'], false).includes("Ra'Kaznar Helm of Fending"));
  // a piece with two routes stays while either is open
  assert.ok(names(['hunts'], true).includes('Augmented Bygone Brass Earrings of Casting'));
  assert.ok(!names(['hunts', 'savage_current'], true).includes('Augmented Bygone Brass Earrings of Casting'));
  // every box off and no market board: only what is not from the database
  assert.deepEqual(
    names(
      ACTIVITIES.map(a => a.key),
      false,
    ),
    ['Hand-made'],
  );
  // boxes no piece comes from
  const empty = emptyActivities(pool.map(itemRoutes).filter(Boolean));
  assert.ok(empty.includes('gold_saucer') && !empty.includes('relics') && !empty.includes('hunts'), empty.join());
});

/* The expansion of a piece is its equip level band (the level caps 50, 60 ... 100). Real pieces on each side of a band
   edge, and a level-1 gift earring that falls back to its item level band. */
test('expansion of real pieces, and the browse filter by expansion', () => {
  const lvl = name => {
    const r = itemRow(name);
    return expansionOf(r[ROW.equipLevel], r[ROW.ilvl]);
  };
  assert.equal(lvl('Dreadwyrm Cane'), 'ARR'); // equip level 50
  assert.equal(lvl('Martial Codex'), 'HW'); // 51
  assert.equal(lvl('Bardiche of Ascension'), 'EW'); // 90
  assert.equal(lvl('Riversbreath Cane'), 'DT'); // 91
  assert.equal(lvl("Halone's Earring"), 'DT'); // level 1, item level 690
  assert.equal(lvl("Menphina's Earring"), 'ShB'); // level 1, item level 430
  const whm = makeJobContext('WHM');
  const all = browseItems(whm, { type: 'any' });
  const only = short => browseItems(whm, { type: 'any', expOff: EXPANSIONS.map(e => e[0]).filter(k => k !== short) });
  const ew = only('EW');
  // level-1 pieces (pre-order earrings) go by item level, like Halone's and Menphina's above
  assert.ok(ew.length > 0 && ew.every(r => (r.lvl > 80 && r.lvl <= 90) || (r.lvl === 1 && expansionOf(1, r.ilvl) === 'EW')));
  assert.equal(browseItems(whm, { type: 'any', expOff: [] }).length, all.length);
  const sum = EXPANSIONS.reduce((n, [s]) => n + only(s).length, 0);
  assert.equal(sum, all.length); // every piece lands in exactly one expansion
  const noEw = browseItems(whm, { type: 'any', expOff: ['EW'] });
  assert.equal(noEw.length, all.length - ew.length);
});

/* Materia slots of real pieces (Item.MateriaSlotCount, Item.IsAdvancedMeldingPermitted), read through a pool item. */
test('meld slots and overmelding of real pieces; none for hand-made pieces', () => {
  const meld = (name, job) => {
    const r = ITEMS.filter(x => x[ROW.name] === name);
    assert.equal(r.length, 1, name);
    const p = parseRow(r[0]);
    const info = meldInfo(poolItemFromRow(makeJobContext(job), p));
    assert.deepEqual(info, { slots: p.meldSlots, overmeld: p.overmeld }, name);
    return info;
  };
  assert.deepEqual(meld("Kirin's Osode of Fending", 'PLD'), { slots: 5, overmeld: false }); // Ornate gear: 5, no overmeld
  assert.deepEqual(meld("Courtly Lover's Pendulums", 'SGE'), { slots: 2, overmeld: true }); // crafted
  assert.deepEqual(meld('Rainbow Robe of Healing', 'WHM'), { slots: 2, overmeld: true }); // crafted
  assert.deepEqual(meld('Dwarven Mythril Shield', 'PLD'), { slots: 0, overmeld: true }); // 0 slots, flagged anyway
  assert.equal(meldInfo(mkItem('Hand-made', 'head', 700, { crit: 100 })), null);
  assert.equal(meldInfo(mkItem('Generated', 'head', 700, {}, { src: 'generated' })), null);
  assert.equal(meldInfo(mkItem('No such piece', 'head', 700, {}, { src: 'game' })), null);
});

/* The materia table against the game files' values (Materia sheet) and the Lodestone's item level requirements
   (docs/scratchpad/materia/report.md sections 1 to 3). */
test('materia table: values, item level gates and the grades limited to the first overmeld slot', () => {
  assert.deepEqual(MATERIA.values, [1, 2, 3, 4, 6, 16, 8, 24, 12, 36, 18, 54]);
  assert.deepEqual(MATERIA.gate, [15, 30, 45, 70, 160, 290, 420, 420, 560, 560, 690, 690]);
  assert.deepEqual(MATERIA.high, [6, 8, 10, 12]); // VI, VIII, X, XII
});
