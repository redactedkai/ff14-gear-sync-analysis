/* The generated data must match src/core/item-format.json, the format shared by the page and the generators. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ITEM_FORMAT from '../../src/core/item-format.json' with { type: 'json' };
import {
  JOBS,
  JOB_ROWS,
  ITEM_STAT_ORDER,
  DB_SLOT_TYPE,
  DB_SLOT_PCT,
  SLOT_TYPES,
  WEAPON_PCT,
  BASE_SLOT_PCT,
  ROW,
  GEAR_CATEGORIES,
  DAMAGE_DEFENSE_KEYS,
} from '../../src/core/constants.js';
import { IL, PG, ITEMS, MP, MATERIA, SHARES, MAX_ILVL } from '../../src/core/tables.js';
import { JOB_ICONS } from '../../src/data/job-icons.js';
import { makeJobContext } from '../../src/core/job-context.js';

test('job bit order, stat order and slot codes come from item-format.json', () => {
  assert.deepEqual(
    JOBS.map(j => j[0]),
    ITEM_FORMAT.jobs,
  );
  assert.deepEqual(
    ITEM_STAT_ORDER,
    ITEM_FORMAT.stats.map(s => s.key),
  );
  assert.deepEqual(
    ITEM_FORMAT.slots.map(s => s.code),
    ITEM_FORMAT.slots.map((_, i) => i),
  );
  DB_SLOT_TYPE.forEach(t => {
    assert.ok(SLOT_TYPES.includes(t), t);
  });
});

test('ROW names the item row fields at the positions of itemRow.fields in item-format.json (the generators build rows by it)', () => {
  assert.deepEqual(ROW, Object.fromEntries(ITEM_FORMAT.itemRow.fields.map((name, i) => [name, i])));
});

test('every generated data file names the format version of item-format.json', () => {
  for (const name of ['items.json', 'item-level.json', 'food.json', 'max-speed.json', 'summary.json']) {
    const doc = JSON.parse(readFileSync(new URL(`../../src/data/${name}`, import.meta.url), 'utf8'));
    assert.equal(doc.formatVersion, ITEM_FORMAT.formatVersion, `${name} formatVersion`);
  }
});

test('ItemLevel table has one column per stat and per weapon damage and defense value, all the same length', () => {
  assert.deepEqual(Object.keys(IL).sort(), [...ITEM_STAT_ORDER, ...DAMAGE_DEFENSE_KEYS].sort());
  const lengths = new Set(Object.values(IL).map(c => c.length));
  assert.equal(lengths.size, 1);
  // PG's length follows the level cap: level-tables.test.js holds it to MAX_LEVEL
  assert.ok(PG.every(row => row.length === 3));
});

test('every item row has the documented shape', () => {
  const maxMask = 2 ** ITEM_FORMAT.jobs.length;
  for (const r of ITEMS) {
    const where = JSON.stringify(r).slice(0, 80);
    assert.equal(r.length, 20, where);
    assert.ok(
      Number.isInteger(r[ROW.slotCode]) && r[ROW.slotCode] >= 0 && r[ROW.slotCode] < ITEM_FORMAT.slots.length,
      'slot code ' + where,
    );
    assert.ok(r[ROW.jobMask] > 0 && r[ROW.jobMask] < maxMask, 'job mask ' + where);
    // the page reads IL[stat][ilvl] directly: an item above the item level table would give NaN
    assert.ok(
      Number.isInteger(r[ROW.ilvl]) && r[ROW.ilvl] >= 0 && r[ROW.ilvl] <= MAX_ILVL,
      'item level within the ItemLevel table ' + where,
    );
    assert.equal(r[ROW.stats].split(',').length, ITEM_STAT_ORDER.length, 'stat count ' + where);
    assert.ok(r[ROW.unique] === 0 || r[ROW.unique] === 1, 'unique flag ' + where);
    assert.ok(r[ROW.hq] === 0 || r[ROW.hq] === 1, 'HQ flag ' + where);
    const routes = r[ROW.routes];
    assert.ok(
      Array.isArray(routes) && routes.every(m => Number.isInteger(m) && m > 0 && m < 2 ** (ITEM_FORMAT.activities.length + 1)),
      'routes ' + where,
    );
    assert.ok(Number.isInteger(r[ROW.kind]) && r[ROW.kind] >= 0 && r[ROW.kind] < ITEM_FORMAT.statFactor.count, 'stat factor kind ' + where);
    assert.ok(
      Number.isInteger(r[ROW.meldSlots]) && r[ROW.meldSlots] >= 0 && r[ROW.meldSlots] <= ITEM_FORMAT.materia.maxSlots,
      'meld slots ' + where,
    );
    assert.ok(r[ROW.overmeld] === 0 || r[ROW.overmeld] === 1, 'overmeld flag ' + where);
    assert.ok(Number.isInteger(r[ROW.rarity]) && r[ROW.rarity] >= 0, 'rarity ' + where);
    assert.ok(Number.isInteger(r[ROW.gameId]) && r[ROW.gameId] > 0, 'game id ' + where);
    assert.ok(r[ROW.scales] === 0 || r[ROW.scales] === 1, 'level-scaled flag ' + where);
    assert.ok(Number.isInteger(r[ROW.category]) && r[ROW.category] >= 0 && r[ROW.category] < GEAR_CATEGORIES.length, 'category ' + where);
    for (const k of DAMAGE_DEFENSE_KEYS) assert.ok(Number.isInteger(r[ROW[k]]) && r[ROW[k]] >= 0, `${k} ${where}`);
  }
  assert.equal(new Set(ITEMS.map(r => r[ROW.gameId])).size, ITEMS.length, 'game ids are unique');
});

/* BaseParam's slot shares for weapon damage (rows 12, 13) and defense (21, 24) in slot code order (2H, 1H, off-hand,
   head, body, hands, legs, feet, ear, neck, wrist, ring, body + head, legs + feet, body + hands + legs + feet), as of
   patch 7.50, typed in from BaseParam.csv: weapon damage on weapons only, defense on armor only. */
test('weapon damage and defense slot shares: weapons only, armor only', () => {
  const damage = [1000, 1000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  const defense = [0, 0, 0, 176, 236, 176, 236, 176, 0, 0, 0, 0, 412, 412, 824];
  assert.deepEqual(SHARES, { damagePhys: damage, damageMag: damage, defensePhys: defense, defenseMag: defense });
});

test('the materia table has one entry per grade', () => {
  const n = ITEM_FORMAT.materia.grades;
  assert.equal(MATERIA.values.length, n);
  assert.equal(MATERIA.gate.length, n);
  assert.ok(MATERIA.values.every(v => Number.isInteger(v) && v > 0));
  assert.ok(MATERIA.gate.every((g, i) => Number.isInteger(g) && (i === 0 || g >= MATERIA.gate[i - 1])));
  assert.ok(MATERIA.high.every(g => Number.isInteger(g) && g >= 1 && g <= n));
});

test('the stat factor table has one row of percents per stat and weapon damage and defense value, one column per item kind', () => {
  assert.deepEqual(Object.keys(MP), [...ITEM_STAT_ORDER, ...DAMAGE_DEFENSE_KEYS]);
  for (const k of Object.keys(MP)) {
    assert.equal(MP[k].length, ITEM_FORMAT.statFactor.count, k);
    assert.ok(
      MP[k].every(v => Number.isInteger(v) && v >= 1 && v <= 100),
      k,
    );
  }
});

test('slot shares used by the page are the item-format.json percents (checked against BaseParam by the generator)', () => {
  assert.deepEqual(
    DB_SLOT_PCT,
    ITEM_FORMAT.slots.map(s => s.percent),
  );
  // BaseParam values for every combat stat as of patch 7.50 (docs/mechanics/math.md): 2H 140, 1H 100, off-hand 40, ...
  assert.deepEqual(WEAPON_PCT, { '2h': 140, '1h+oh': 100 });
  assert.deepEqual(BASE_SLOT_PCT, {
    weapon: 140,
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
  });
  for (const [id] of JOBS) {
    const job = makeJobContext(id);
    for (const t of SLOT_TYPES) {
      const code = t === 'weapon' ? (job.weaponMode === '2h' ? 0 : 1) : DB_SLOT_TYPE.indexOf(t);
      assert.equal(job.slotPct[t], ITEM_FORMAT.slots[code].percent, `${id} ${t}`);
    }
  }
});

/* Known gaps in the game data, not pipeline faults: Blue Mage weapons exist in Item.csv (10 rows) but carry no stats,
   so the generator drops them. */
const NO_ITEMS_EXPECTED = { BLU: ['weapon'] };

test('every job has at least one item for each of its active slots (a renamed job column would leave none)', () => {
  JOBS.forEach(([id], bit) => {
    const job = makeJobContext(id);
    const codes = new Set(ITEMS.filter(r => r[ROW.jobMask] & (1 << bit)).map(r => r[ROW.slotCode]));
    for (const t of job.activeSlotTypes) {
      if (NO_ITEMS_EXPECTED[id]?.includes(t)) {
        assert.ok(!ITEMS.some(r => r[ROW.jobMask] & (1 << bit) && DB_SLOT_TYPE[r[ROW.slotCode]] === t), `${id} ${t}: remove the exception`);
        continue;
      }
      const want = t === 'weapon' ? [job.weaponMode === '2h' ? 0 : 1] : [DB_SLOT_TYPE.indexOf(t)];
      assert.ok(
        want.some(c => codes.has(c)),
        `${id} has no ${t} item`,
      );
    }
  });
});

test('job picker: every job appears exactly once, each with an embedded 64 x 64 PNG icon', () => {
  const picked = JOB_ROWS.flatMap(([, ids]) => ids);
  assert.deepEqual([...picked].sort(), JOBS.map(j => j[0]).sort());
  for (const id of picked) {
    const png = Buffer.from(JOB_ICONS[id].replace(/^data:image\/png;base64,/, ''), 'base64');
    assert.equal(png.subarray(1, 4).toString('latin1'), 'PNG', id);
    assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [64, 64], id);
  }
});

/* ROW names the positions of itemRow.fields, and every section's rowField points at its own name there. */
test('ROW agrees with itemRow.fields and the sections that name a rowField', () => {
  const fields = ITEM_FORMAT.itemRow.fields;
  assert.deepEqual(Object.keys(ROW), fields);
  for (const [name, position] of Object.entries(ROW)) assert.equal(fields[position], name);
  const sectionFields = {
    ...ITEM_FORMAT.materia.rowFields,
    rarity: ITEM_FORMAT.rarity.rowField,
    gameId: ITEM_FORMAT.gameId.rowField,
    scales: ITEM_FORMAT.levelScaled.rowField,
    category: ITEM_FORMAT.category.rowField,
    ...Object.fromEntries(ITEM_FORMAT.damageDefense.entries.map(e => [e.key, e.rowField])),
  };
  for (const [name, position] of Object.entries(sectionFields)) assert.equal(ROW[name], position, name);
  assert.equal(ITEMS[0].length, fields.length);
});
