/* Which jobs share gear, for Copy sheet: the gear groups of src/data/gear-groups.json (made by scripts/data/gen_gear_groups.py
   from the item data: jobs that can wear 80 percent or more of the same head, body, hands, legs and feet pieces, with
   the same level cap), and the pieces a job cannot wear. A set's pieces are as set.js keeps them. */
import GEAR_GROUPS_FILE from '../data/gear-groups.json' with { type: 'json' };
import { JOB_ROWS, ROW } from './constants.ts';
import { itemById } from './items.js';
import type { JobContext, SetPiece, SlotType } from './types.ts';

/* GEAR_GROUPS: [[job id, ...], ...], every job in exactly one group. */
export const GEAR_GROUPS: readonly (readonly string[])[] = Object.freeze(GEAR_GROUPS_FILE.groups.map(group => Object.freeze([...group])));

/* The role name of the gear group of `jobId` ("Healers"), for the Copy sheet note: the job picker's row label
   (constants.ts JOB_ROWS) when every job of the group is in that one row, else null (a group that spans rows, or a job
   alone in its group, Blue Mage and Beastmaster, takes no name). */
export function gearGroupName(jobId: string): string | null {
  const group = GEAR_GROUPS.find(g => g.includes(jobId));
  if (!group || group.length < 2) {
    return null;
  }
  const row = JOB_ROWS.find(([, jobs]) => group.every(id => jobs.includes(id)));
  return row ? row[0] : null;
}

/* The pieces of `pieces` (a set's pieces, set.js) that `job` (a JobContext) cannot wear, by the job mask of the piece's
   database row: [{index (in `pieces`), slot, gameId, name (the database row's)}], in order. The mask only: the equip level is not checked
   (`wearable` in items.js does that), since a level-synced piece stays wearable. Pieces not from the database (custom,
   empty slots, or a game id no row has any more) are never listed. */
export function piecesJobCannotWear(
  job: JobContext,
  pieces: readonly SetPiece[],
): { index: number; slot: SlotType; gameId: number; name: string }[] {
  const bit = 1 << job.jobIndex;
  const out: { index: number; slot: SlotType; gameId: number; name: string }[] = [];
  pieces.forEach((piece, index) => {
    const row = piece.gameId == null ? null : itemById(piece.gameId);
    if (row && !(row[ROW.jobMask] & bit)) {
      // a row was found by the piece's game id, so the piece has one
      out.push({ index, slot: piece.slot, gameId: piece.gameId as number, name: row[ROW.name] });
    }
  });
  return out;
}
