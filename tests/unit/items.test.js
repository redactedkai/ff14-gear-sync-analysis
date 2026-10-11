import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeJobContext } from '../../src/core/job-context.js';
import { browseItems, poolItemFromRow, parseRow } from '../../src/core/items.js';
import { ITEMS } from '../../src/core/tables.js';

const pld = makeJobContext('PLD');
const war = makeJobContext('WAR');
const sge = makeJobContext('SGE');
const names = rows => rows.map(r => r.name);

/* Raw database stat order (CLAUDE.md, src/data/items.js): str,dex,int,mind,vit,piety,ten,dh,crit,det,sks,sps */
const RAW = { str: 0, dex: 1, int: 2, mind: 3, vit: 4, piety: 5, ten: 6, dh: 7, crit: 8, det: 9, sks: 10, sps: 11 };
const rawStats = r => r[5].split(',').map(Number);
const rowKey = r => `${r.name}|${r.slotCode}|${r.ilvl}|${r.mask}`;
const rawKey = r => `${r[0]}|${r[1]}|${r[2]}|${r[4]}`;
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
  const hidden = ITEMS.filter(r => !(r[4] & bit) && rawStats(r)[RAW.str] > 0);
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

test('main-stat filter: gear the job can equip but without its main stat is hidden', () => {
  const bit = 1 << war.jobIndex;
  const noStr = ITEMS.filter(r => r[4] & bit && rawStats(r)[RAW.str] === 0);
  assert.ok(noStr.length > 0, 'the database has Warrior-equippable rows without Strength');
  const keys = new Set(browseItems(war, {}).map(rowKey));
  assert.ok(noStr.every(r => !keys.has(rawKey(r))));
  assert.ok(browseItems(war, { ilvlMin: 700 }).every(r => r.st[RAW.str] > 0));
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
