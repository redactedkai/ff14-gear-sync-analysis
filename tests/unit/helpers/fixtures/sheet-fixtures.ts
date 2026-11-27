/* Saved sheets for the sheet view tests (docs/engineering/sheets.md "Saved data"), made of real items: a Sage set of
   crafted item level 110 to 115 pieces (high quality, five materia slots on the armor), a Warrior set of item level 120
   pieces, and the raw (database) stat sums the tests compare the views' totals with, so the expected numbers do not come
   from the code under test. */
import { poolItemById } from '../../../../src/core/items.ts';
import { makeJobContext } from '../../../../src/core/job-context.ts';
import { placePiece } from '../../../../src/ui/sheets/set-edits.ts';
import type { ParsedSheet } from '../../../../src/ui/sheets/storage.ts';
import type { PlaceResult } from '../../../../src/ui/sheets/set-edits.ts';
import type { JobContext, SlotType, StatKey } from '../../../../src/core/types.ts';
import type { GearPins, SavedFillSettings, SavedGearSet, SavedRow, SavedSheet, SavedStone } from '../../../../src/ui/sheets/saved-types.ts';

export { fakeStorage, quotaError } from '../fakes/fakes.ts';

/* Real game ids. Sage: Rainbow Cap, Robe, Slops, Archaeoskin Gloves and Shoes of Healing, Mythrite Earrings, Rainbow
   Ribbon, Mythrite Bangle, Agate Ring (all crafted, item level 115). Warrior: Ironworks Magitek Axe and the Demon
   armor of Fending, Ironworks accessories (item level 120). */
export const SAGE_IDS: Record<Exclude<SlotType, 'weapon' | 'offhand'>, number> = {
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
export const WAR_IDS: Record<Exclude<SlotType, 'offhand'>, number> = {
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
export const piece = (slot: SlotType, gameId: number, stones: SavedStone[] = []): SavedRow => ({ slot, gameId, stones });

/* Three Critical Hit IV stones: the head's Critical Hit is 20 under a cap of 28, so they add 8 and cut 4. */
export const THREE_CRIT_IV: SavedStone[] = [
  { stat: 'crit', grade: 4 },
  { stat: 'crit', grade: 4 },
  { stat: 'crit', grade: 4 },
];

/* The 12 saved rows of a Sage set (weapon and off-hand empty, the head with THREE_CRIT_IV), then `meal`. */
export function sageSet({
  id = 'g_1',
  name = 'Set 1',
  meal = null,
  pinned = { pieces: [], meal: false },
  fillSettings = null,
}: {
  id?: string;
  name?: string;
  meal?: string | null;
  pinned?: GearPins;
  fillSettings?: SavedFillSettings | null;
} = {}): SavedGearSet {
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

/* The slot of each of a saved set's 12 rows (the off-hand row is empty for a two-handed job; two ring rows). */
export const SLOT_OF_ROW: SlotType[] = [
  'weapon',
  'offhand',
  'head',
  'body',
  'hands',
  'legs',
  'feet',
  'ear',
  'neck',
  'wrist',
  'ring',
  'ring',
];

/* A saved set made of `pieces` (every row empty when omitted), with `fields` over the defaults: no meal, nothing pinned. */
export function setOfRows(pieces: SavedRow[] = SLOT_OF_ROW.map(slot => ({ slot })), fields: Partial<SavedGearSet> = {}): SavedGearSet {
  return {
    id: 'g_1',
    name: 'Set 1',
    description: '',
    pieces,
    meal: null,
    pinned: { pieces: [], meal: false },
    createdAt: 1762700000000,
    updatedAt: 1762703600000,
    ...fields,
  };
}

/* The 12 saved rows of a Warrior set; the off-hand row holds the axe again, which a two-handed job does not count. */
export function warSet({ id = 'g_w', name = 'Tank 1' }: { id?: string; name?: string } = {}): SavedGearSet {
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
  job: string,
  sets: SavedGearSet[],
  {
    id = 's_1',
    name = `${job} sheet`,
    level = 100,
    sync = { on: true, cap: 123 },
    description = '',
  }: { id?: string; name?: string; level?: number; sync?: { on: boolean; cap: number }; description?: string } = {},
): SavedSheet {
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
export function rawGear(jobId: string, pieces: readonly SavedRow[]): Partial<Record<StatKey, number>> {
  const job = makeJobContext(jobId);
  const sum: Partial<Record<StatKey, number>> = Object.fromEntries(job.stats.map(s => [s, 0]));
  for (const p of pieces) {
    if (p.gameId == null || !job.activeSlotTypes.includes(p.slot)) {
      continue;
    }
    const item = poolItemById(job, p.gameId);
    if (!item) {
      throw new Error(`no item with game id ${p.gameId}`);
    }
    for (const s of job.stats) {
      sum[s] = (sum[s] ?? 0) + (item.stats[s] ?? 0);
    }
  }
  return sum;
}

/* A White Mage weapon: the Ironworks Magitek Cane (item level 120), which no other healer can wear. */
export const WHM_CANE = 8645;

/* `gearSet` with the piece `gameId` (null: none) placed in row `index` as the page's piece picker places it (placePiece); fails the
   test when the placement is refused. */
export function placed(job: JobContext, gearSet: SavedGearSet, index: number, gameId: number | null): SavedGearSet {
  const result = placePiece(job, gearSet, index, gameId);
  if (!result.ok) {
    throw new Error(`row ${index} refused the piece ${gameId}`);
  }
  return result.gearSet;
}

/* A placePiece result that placed the piece ({ok: true, gearSet, note, removedNote}); throws when it was refused. */
export function placedOk(result: PlaceResult): Extract<PlaceResult, { ok: true }> {
  if (!result.ok) {
    throw new Error('placePiece refused the piece');
  }
  return result;
}

/* The sheet a parseSheet result holds, which the test knows is readable (throws, with the cause, when it is not). */
export function readable(parsed: ParsedSheet): SavedSheet {
  if (!parsed.sheet) {
    throw new Error(`the record is unreadable: ${parsed.cause}`);
  }
  return parsed.sheet;
}

/* The cause a parseSheet result gives for a record it cannot read (throws when the record was readable). */
export function causeOf(parsed: ParsedSheet): string {
  if (parsed.sheet) {
    throw new Error('the record is readable');
  }
  return parsed.cause;
}
