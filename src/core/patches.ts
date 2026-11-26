/* The game's patches and the day each came out (generated: src/data/patches.json, from the patch list of
   xivapi/ffxiv-datamining-patches). Pure: no DOM, runs in Node. */
import PATCHES_FILE from '../data/patches.json' with { type: 'json' };

/* {repo, commit, date} of the patch list's commit the table was generated from, or null when unknown. It is not DATA_SOURCE
   (tables.ts): the patch list is a different repository with its own commits. */
export const PATCHES_SOURCE = PATCHES_FILE.source ?? null;

/* PATCHES: every patch, oldest first, [[version, release day]]: the version as the game names it ("7.56", "2.1b") and
   the day it was released, "YYYY-MM-DD" in UTC. */
export const PATCHES = Object.freeze(PATCHES_FILE.PATCHES.map(entry => Object.freeze([...entry]))) as readonly (readonly [
  version: string,
  day: string,
])[];

/* The patch that game data of the day `day` ("YYYY-MM-DD") belongs to: the version of the newest patch released on or
   before that day ("7.56" for "2026-09-30", after 7.56 (2026-09-08) and before 7.57 (2026-10-13)), or '' when `day` is
   not such a date or is before the first patch. Days compare as text, which orders ISO dates by date. Patches released on
   one day (2.1 and 2.1b) give the last of them. `patches`: a table in the shape of PATCHES. This is a guess in one
   respect: a data commit made before a patch's release day (a pre-release extraction) names the patch before it. */
export function patchOnDay(day: unknown, patches: readonly (readonly [string, string])[] = PATCHES): string {
  if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    return '';
  }
  for (let index = patches.length - 1; index >= 0; index--) {
    if (patches[index][1] <= day) {
      return patches[index][0];
    }
  }
  return '';
}
