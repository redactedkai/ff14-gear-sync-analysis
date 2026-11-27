/* The saved sheets the stress tool opens the page on, and the scripts that put them in the page's storage. A fixture is
   {sheets: [saved sheet records], open: {sheetId, setId}} (what the views open), built from the test sheets the page ships
   (src/ui/test-sheets.json, read only) plus made-up ones. The records have the shape src/ui/sheets/storage.ts reads. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from './build.ts';
import type { PoolItem, SlotType } from '../../src/core/types.ts';
import type { SavedGearSet, SavedSheet } from '../../src/ui/sheets/saved-types.ts';
import type { Fixture } from './types.ts';

/* The page's saved-data key (src/ui/store-key.ts) and the keys of the sheets' index and records. */
export const STORE_KEY = 'ilvl-stat-lab-v4';
const INDEX_KEY = `${STORE_KEY}:sheets`;
const RECORD_KEY = (id: string): string => `${STORE_KEY}:sheet:${id}`;

/* The longest name a sheet or a gear set takes (NAME_MAX_LENGTH in src/ui/sheets/ops.ts) and the longest description. */
export const NAME_MAX = 60;
export const DESCRIPTION_MAX = 400;

/* A name of `NAME_MAX` wide capitals with no space to break at, and one of words that fills the same length. */
export const LONGEST_NAME_NO_SPACES = 'W'.repeat(NAME_MAX);
export const LONGEST_NAME_WORDS = 'Extremely long name of a sheet that keeps going past sixty!'.slice(0, NAME_MAX);

/* How many gear sets the "many sets" sheet has. */
export const MANY_SETS = 40;

/* The test sheets the page ships, parsed. */
export function readTestSheets(root: string = REPO_ROOT): SavedSheet[] {
  return JSON.parse(readFileSync(join(root, 'src', 'ui', 'test-sheets.json'), 'utf8'));
}

/* The ids of the 23 combat jobs, from the page's own table (src/core/constants.ts JOBS). */
export async function readJobIds(root: string = REPO_ROOT): Promise<string[]> {
  const { JOBS }: typeof import('../../src/core/constants.ts') = await import(
    new URL(`file:///${join(root, 'src', 'core', 'constants.ts').replaceAll('\\', '/')}`).href
  );
  return JOBS.map(job => job.id);
}

/* A gear set of `slots` with no piece in any row, named `name`. `at` is the time in ms. */
function emptySet(id: string, name: string, slots: readonly SlotType[], at: number, description = ''): SavedGearSet {
  return {
    id,
    name,
    description,
    pieces: slots.map(slot => ({ slot })),
    meal: null,
    bestMeals: null,
    pinned: { pieces: [], meal: false },
    fillSettings: null,
    createdAt: at,
    updatedAt: at,
  };
}

/* An empty sheet record (no gear set yet, or the given ones). */
function sheetRecord({
  id,
  name,
  description = '',
  job,
  level,
  sync,
  sets = [],
  at,
  gameData,
}: {
  id: string;
  name: string;
  description?: string;
  job: string;
  level: number;
  sync: { on: boolean; cap: number };
  sets?: SavedGearSet[];
  at: number;
  gameData: SavedSheet['gameData'];
}): SavedSheet {
  return { v: 1, id, name, description, job, level, sync, clan: null, partyRoles: 0, sets, gameData, createdAt: at, updatedAt: at };
}

/* The test sheets as they ship: six sheets of different jobs, four gear sets each. The sheet and set the views open are
   the first sheet and its first set that holds pieces. */
export function standardFixture(testSheets: SavedSheet[]): Fixture {
  const first = testSheets[0];
  const set = first.sets.find(candidate => candidate.pieces.some(piece => piece.gameId)) ?? first.sets[0];
  return { sheets: structuredClone(testSheets), open: { sheetId: first.id, setId: set.id, fillSetId: first.sets[1]?.id ?? set.id } };
}

/* Content at its widest. `jobIds`: all the jobs, one sheet each (so the manager lists every job name and icon). `longest`:
   {slot: {gameId}} the longest-named piece each slot takes (see longestPieces). The made-up sheets:
   - the longest names with no space and with words, a 400-character description with line breaks;
   - one sheet with MANY_SETS gear sets, the first of them holding the longest-named pieces and the longest set name;
   - a sheet per job, its set with empty rows, level and item level at their widest in the real limits. */
export function extremeFixture(testSheets: SavedSheet[], jobIds: readonly string[], longest: Record<string, number | undefined>): Fixture {
  const at = 1793188800000;
  const gameData = testSheets[0].gameData;
  const slots = testSheets[0].sets[0].pieces.map(piece => piece.slot);
  const description = Array.from(
    { length: 8 },
    (_, line) => `Line ${line + 1} of a long description that has to stay inside its box ${'w'.repeat(30)}`,
  )
    .join('\n')
    .slice(0, DESCRIPTION_MAX);
  const longPieces = slots.map(slot => (longest[slot] ? { slot, gameId: longest[slot], stones: [] } : { slot }));
  const manySets = Array.from({ length: MANY_SETS }, (_, index) => ({
    ...emptySet(
      `g_many_${index}`,
      index === 0 ? LONGEST_NAME_WORDS : `Gear set number ${index + 1} ${'x'.repeat(index % 7)}`,
      slots,
      at,
      index % 3 ? '' : description,
    ),
    pieces: index === 0 ? longPieces : slots.map(slot => ({ slot })),
  }));
  const wide = sheetRecord({
    id: 's_wide',
    name: LONGEST_NAME_NO_SPACES,
    description,
    job: 'SGE',
    level: 100,
    sync: { on: true, cap: 795 },
    sets: manySets,
    at,
    gameData,
  });
  wide.sets[1] = { ...wide.sets[1], name: LONGEST_NAME_NO_SPACES };
  const words = sheetRecord({
    id: 's_words',
    name: LONGEST_NAME_WORDS,
    description,
    job: 'WHM',
    level: 100,
    sync: { on: false, cap: 795 },
    sets: [emptySet('g_w1', LONGEST_NAME_WORDS, slots, at, description)],
    at,
    gameData,
  });
  const perJob = jobIds.map((job, index) =>
    sheetRecord({
      id: `s_job_${job}`,
      name: `${job} sheet ${index + 1}`,
      job,
      level: 100,
      sync: { on: true, cap: 795 },
      sets: [emptySet(`g_${job}`, `${job} set`, slots, at)],
      at,
      gameData,
    }),
  );
  return {
    sheets: [wide, words, ...structuredClone(testSheets), ...perJob],
    open: { sheetId: 's_wide', setId: 'g_many_0', fillSetId: 'g_many_0' },
  };
}

/* A sheet with no gear set and a sheet whose one set has empty rows (sync off, so no cap applies): the empty states. */
export function emptyFixture(testSheets: SavedSheet[]): Fixture {
  const at = 1793188800000;
  const gameData = testSheets[0].gameData;
  const slots = testSheets[0].sets[0].pieces.map(piece => piece.slot);
  const noSets = sheetRecord({
    id: 's_none',
    name: 'Sheet with no gear sets',
    job: 'PLD',
    level: 100,
    sync: { on: false, cap: 795 },
    at,
    gameData,
  });
  const noPieces = sheetRecord({
    id: 's_empty',
    name: 'Sheet with an empty set',
    job: 'SGE',
    level: 90,
    sync: { on: false, cap: 795 },
    sets: [emptySet('g_empty', 'Empty set', slots, at)],
    at,
    gameData,
  });
  return { sheets: [noSets, noPieces], open: { sheetId: 's_none', setId: 'g_empty', emptySheetId: 's_none', emptySetSheetId: 's_empty' } };
}

/* No sheets at all. */
export function noSheetsFixture(): Fixture {
  return { sheets: [], open: {} };
}

/* The script (for Playwright's addInitScript) that fills the page's storage with `sheets` before the page starts, once
   per context (a reload keeps what the page saved since), and with `failWrites` makes every write fail with a
   full-storage error, as the browser does when the quota is used up. It takes one argument, the plain data below, and is
   serialised into the page: it uses nothing outside itself. */
export function seedStorage({
  indexKey,
  recordKeyPrefix,
  sheets,
  failWrites,
}: {
  indexKey: string;
  recordKeyPrefix: string;
  sheets: { id: string }[];
  failWrites: boolean;
}): void {
  const SEEDED_KEY = 'layout-stress:seeded'; // not under the page's own key, so the page never reads it as its data
  try {
    if (!localStorage.getItem(SEEDED_KEY)) {
      for (const sheet of sheets) {
        localStorage.setItem(`${recordKeyPrefix}${sheet.id}`, JSON.stringify(sheet));
      }
      if (sheets.length) {
        localStorage.setItem(indexKey, JSON.stringify({ v: 1, order: sheets.map(sheet => sheet.id) }));
      }
      localStorage.setItem(SEEDED_KEY, '1');
    }
  } catch {
    // storage blocked: the page runs without saved sheets
  }
  if (failWrites) {
    Storage.prototype.setItem = () => {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    };
  }
}

/* The argument `seedStorage` takes for a fixture. */
export function seedArgument(
  fixture: Fixture,
  failWrites = false,
): { indexKey: string; recordKeyPrefix: string; sheets: SavedSheet[]; failWrites: boolean } {
  return { indexKey: INDEX_KEY, recordKeyPrefix: RECORD_KEY(''), sheets: fixture.sheets, failWrites };
}

/* The id of the longest-named piece each slot takes, for the Sage: {slot: gameId}, read from the page's own item
   database through its job context (read only). Used to fill the longest set. */
export async function longestPieces(root: string = REPO_ROOT): Promise<Record<string, number | undefined>> {
  const url = (file: string): URL => new URL(`file:///${join(root, file).replaceAll('\\', '/')}`);
  const { jobGear }: typeof import('../../src/core/items.ts') = await import(url('src/core/items.ts').href);
  const { makeJobContext }: typeof import('../../src/core/job-context.ts') = await import(url('src/core/job-context.ts').href);
  const longest: Record<string, PoolItem> = {};
  for (const item of jobGear(makeJobContext('SGE'))) {
    if (!longest[item.type] || item.name.length > longest[item.type].name.length) {
      longest[item.type] = item;
    }
  }
  return Object.fromEntries(Object.entries(longest).map(([slot, item]) => [slot, item.gameId]));
}

/* `fixture` with every sheet at the widest level and item level (the stress build's limits), sync on. */
export function withStressNumbers(fixture: Fixture, level: number, itemLevel: number): Fixture {
  const sheets = structuredClone(fixture.sheets).map(sheet => ({ ...sheet, level, sync: { on: true, cap: itemLevel } }));
  return { ...fixture, sheets };
}
