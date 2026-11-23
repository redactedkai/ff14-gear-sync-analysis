// Saved sheets the checks seed into localStorage.

import { edgeSheet } from '../checks/sheets/edges.mjs';
import { DEFAULT_EXCLUDE } from './core-worker.mjs';

export const FILL_SHEET = {
  v: 1,
  id: 's_fill',
  name: 'Auto-fill check',
  description: '',
  job: 'SGE',
  level: 50,
  sync: { on: true, cap: 123 },
  sets: [
    {
      id: 'g_empty',
      name: 'Empty',
      description: '',
      pieces: ['weapon', 'offhand', 'head', 'body', 'hands', 'legs', 'feet', 'ear', 'neck', 'wrist', 'ring', 'ring'].map(slot => ({
        slot,
      })),
      meal: null,
      pinned: { pieces: [], meal: false },
      fillSettings: null,
      createdAt: 0,
      updatedAt: 0,
    },
  ],
  gameData: { commit: 'd9582a6', date: '2026-09-30' },
  createdAt: 0,
  updatedAt: 0,
};

/* A Warrior sheet (level 100, no sync) whose set's Auto-fill takes long: Determination > Critical Hit > Direct Hit with a
   Target GCD of 2.30, food and tier ranking (about 1.3 s on the owner's PC), so Cancel can stop it mid-search. */

export const SLOW_FILL_SHEET = {
  ...FILL_SHEET,
  id: 's_slow',
  name: 'Slow fill',
  job: 'WAR',
  level: 100,
  sync: { on: false, cap: 123 },
  sets: [
    {
      ...FILL_SHEET.sets[0],
      fillSettings: {
        goal: { target: 'det', tb: 'crit', tb2: 'dh', gcd: 2.3, gcdMode: 'exact', byTier: true, melds: true, food: true },
        searchCriteria: { expOff: [], exclude: [...DEFAULT_EXCLUDE], market: true, min: '', max: '', lvl: 100 },
      },
    },
  ],
};

/* A saved sheet of one set whose row `row` holds the piece `gameId` with `stones`, for `job` (level 100, no sync). */
export const pieceSheet = (id, name, job, row, gameId, stones) => ({
  ...edgeSheet(id, name, job, 100, { on: false, cap: 795 }),
  sets: [
    {
      ...FILL_SHEET.sets[0],
      id: `g_${id}`,
      name: 'Mine',
      pieces: FILL_SHEET.sets[0].pieces.map((piece, i) => (i === row ? { slot: piece.slot, gameId, stones } : piece)),
    },
  ],
});

const SAGE_ROWS = [
  ['weapon'],
  ['offhand'],
  ['head', 10880],
  ['body', 10887],
  ['hands'],
  ['legs', 10908],
  ['feet'],
  ['ear', 11048],
  ['neck', 11036],
  ['wrist', 11042],
  ['ring', 11054],
  ['ring', 11054],
];

export const SET_SHEET = {
  v: 1,
  id: 's_sage',
  name: 'Bahamut T13 Healer',
  description: '',
  job: 'SGE',
  level: 100,
  sync: { on: true, cap: 123 },
  sets: [
    {
      id: 'g_mine',
      name: 'Mine',
      description: 'Week 1: crafted body\nsecond line',
      pieces: SAGE_ROWS.map(([slot, gameId]) => (gameId ? { slot, gameId, stones: [] } : { slot })),
      meal: null,
      pinned: { pieces: [2, 3, 5, 7, 8, 9, 10, 11], meal: false },
      fillSettings: null,
      createdAt: 0,
      updatedAt: 0,
    },
  ],
  gameData: { commit: 'd9582a6', date: '2026-09-30' },
  createdAt: 0,
  updatedAt: 0,
};
