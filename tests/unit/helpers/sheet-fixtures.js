/* Saved sheets for the sheet view tests (docs/engineering/sheets.md "Saved data"), made of real items: a Sage set of
   crafted item level 110 to 115 pieces (high quality, five materia slots on the armor), a Warrior set of item level 120
   pieces, and the raw (database) stat sums the tests compare the views' totals with, so the expected numbers do not come
   from the code under test. */
import { poolItemById } from '../../../src/core/items.js';
import { makeJobContext } from '../../../src/core/job-context.js';

/* Real game ids. Sage: Rainbow Cap, Robe, Slops, Archaeoskin Gloves and Shoes of Healing, Mythrite Earrings, Rainbow
   Ribbon, Mythrite Bangle, Agate Ring (all crafted, item level 115). Warrior: Ironworks Magitek Axe and the Demon
   armor of Fending, Ironworks accessories (item level 120). */
export const SAGE_IDS = {
  head: 10880,
  body: 10887,
  hands: 10894,
  legs: 10908,
  feet: 10915,
  ear: 11048,
  neck: 11036,
  wrist: 11042,
  ring: 11054,
};
export const WAR_IDS = {
  weapon: 8641,
  head: 9901,
  body: 9902,
  hands: 9903,
  legs: 9904,
  feet: 9905,
  ear: 8589,
  neck: 8590,
  wrist: 8588,
  ring: 8591,
};

/* A saved row: a piece, with stones `stones` ([] for none). */
export const piece = (slot, gameId, stones = []) => ({ slot, gameId, stones });

/* Three Critical Hit IV stones: the head's Critical Hit is 20 under a cap of 28, so they add 8 and cut 4. */
export const THREE_CRIT_IV = [
  { stat: 'crit', grade: 4 },
  { stat: 'crit', grade: 4 },
  { stat: 'crit', grade: 4 },
];

/* The 12 saved rows of a Sage set (weapon and off-hand empty, the head with THREE_CRIT_IV), then `meal`. */
export function sageSet({ id = 'g_1', name = 'Set 1', meal = null, pinned = { pieces: [], meal: false }, fillSettings = null } = {}) {
  const i = SAGE_IDS;
  return {
    id,
    name,
    description: '',
    pieces: [
      { slot: 'weapon' },
      { slot: 'offhand' },
      piece('head', i.head, THREE_CRIT_IV),
      piece('body', i.body),
      piece('hands', i.hands),
      piece('legs', i.legs),
      piece('feet', i.feet),
      piece('ear', i.ear),
      piece('neck', i.neck),
      piece('wrist', i.wrist),
      piece('ring', i.ring),
      piece('ring', i.ring),
    ],
    meal,
    pinned,
    fillSettings,
    createdAt: 1762700000000,
    updatedAt: 1762703600000,
  };
}

/* The 12 saved rows of a Warrior set; the off-hand row holds the axe again, which a two-handed job does not count. */
export function warSet({ id = 'g_w', name = 'Tank 1' } = {}) {
  const i = WAR_IDS;
  return {
    id,
    name,
    description: '',
    pieces: [
      piece('weapon', i.weapon),
      piece('offhand', i.weapon),
      piece('head', i.head),
      piece('body', i.body),
      piece('hands', i.hands),
      piece('legs', i.legs),
      piece('feet', i.feet),
      piece('ear', i.ear),
      piece('neck', i.neck),
      piece('wrist', i.wrist),
      piece('ring', i.ring),
      piece('ring', i.ring),
    ],
    meal: null,
    pinned: { pieces: [], meal: false },
    fillSettings: null,
    createdAt: 1762700000000,
    updatedAt: 1762703600000,
  };
}

/* A saved sheet around `sets`. */
export function sheetOf(
  job,
  sets,
  { id = 's_1', name = `${job} sheet`, level = 100, sync = { on: true, cap: 123 }, description = '' } = {},
) {
  return {
    v: 1,
    id,
    name,
    description,
    job,
    level,
    sync,
    sets,
    gameData: { commit: 'd9582a6', date: '2026-09-30' },
    createdAt: 1762690000000,
    updatedAt: 1762703600000,
  };
}

/* The gear points of the rows `pieces` of `jobId` straight from the item data (unsynced, no materia), per stat key, for
   the rows that hold a piece and whose slot the job uses. */
export function rawGear(jobId, pieces) {
  const job = makeJobContext(jobId);
  const sum = Object.fromEntries(job.stats.map(s => [s, 0]));
  for (const p of pieces) {
    if (p.gameId == null || !job.activeSlotTypes.includes(p.slot)) continue;
    const item = poolItemById(job, p.gameId);
    for (const s of job.stats) sum[s] += item.stats[s] || 0;
  }
  return sum;
}

/* A Storage stand-in (localStorage's methods over a Map). `failWith`: an error every setItem throws (a full storage:
   quotaError()). */
export function fakeStorage({ failWith = null } = {}) {
  const data = new Map();
  return {
    data,
    failWith,
    get length() {
      return data.size;
    },
    key: i => [...data.keys()][i] ?? null,
    getItem: k => (data.has(k) ? data.get(k) : null),
    setItem(k, v) {
      if (this.failWith) throw this.failWith;
      data.set(k, String(v));
    },
    removeItem: k => data.delete(k),
  };
}
/* The error a full browser storage throws. */
export const quotaError = () => Object.assign(new Error('full'), { name: 'QuotaExceededError', code: 22 });

/* A White Mage weapon: the Ironworks Magitek Cane (item level 120), which no other healer can wear. */
export const WHM_CANE = 8645;
