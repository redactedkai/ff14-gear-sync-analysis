// The Sheets screens for the theme and viewport checks.

import { edgeSheet } from '../sheets/edges.ts';
import { FILL_SHEET, pieceSheet } from '../../lib/fixtures.ts';
import { openSet } from '../../lib/sheets.ts';
import type { Page } from 'playwright';

const VIEW_STONES = [
  { stat: 'crit', grade: 12 },
  { stat: 'crit', grade: 12 },
];

/** Three saved sheets, the manager's list in this order: a Sage sheet (level 100, no sync) whose set's earring row holds
 * Courtly Lover's Earrings (49309) with two stones, pinned, so an Auto-fill keeps it and the materia menu of its overmeld slot has the
 * odds row; a White Mage sheet with five empty sets; a Warrior sheet. Each has a description, so a list row has its note. */
export function viewSheets() {
  const sage = pieceSheet('s_view_sge', 'Sage with an earring', 'SGE', 7, 49309, VIEW_STONES);
  sage.description = 'Week 1 of the tier';
  sage.sets[0].pinned = { pieces: [7], meal: false };
  const five = {
    ...edgeSheet('s_view_five', 'Five sets', 'WHM', 100, { on: true, cap: 123 }),
    description: 'Five empty sets',
    sets: [1, 2, 3, 4, 5].map(n => ({
      ...FILL_SHEET.sets[0],
      id: `g_five_${n}`,
      name: `Set ${n}`,
      description: n === 1 ? 'first notes' : '',
    })),
  };
  const tank = { ...edgeSheet('s_view_war', 'Tank', 'WAR', 100, { on: false, cap: 795 }), description: 'A tank sheet' };
  return [sage, five, tank];
}

/** On the Sheets tab: open the sheet `sheetName`, then its set `setName`; the sheet manager first. */
export async function openViewSet(pg: Page, sheetName: string, setName: string) {
  await openSet(pg, sheetName, setName);
}
