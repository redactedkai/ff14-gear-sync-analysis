/* The events the math bar element sends and the shapes it takes, written once. A `.ts` module with no import, so Node tests can read
   it. The page's template listens with `@math-sub` and `@piece-edit`, which cannot import these constants. */

/* The `math-sub` event: a plain click on a sub-tab link. `detail` is the sub-tab's id ('piece', 'gcd' or 'tiers'); the page shows it
   (any other click on the link is the browser's: a new tab, copy link). */
export const SUB_TAB_EVENT = 'math-sub';

/* The `piece-edit` event: a Stat Allocation control changed the example piece. `detail` is the patch for the page's `editPiece`: any
   of `{slot, slots, subs, ilvl}` (`slots` or `ilvl` null: back to the slot's usual total, or to the cap). */
export const PIECE_EDIT_EVENT = 'piece-edit';

/* The `sync-change` event: the IL Sync switch in the Sync settings popover changed. `detail` is the switch's state (a boolean). */
export const SYNC_CHANGE_EVENT = 'sync-change';

/* The example piece, as the page gives it to the elements: the item level (null: the cap), the slot, the two substats (null for none)
   and the materia slots chosen (null: the slot's usual total). */
export interface ExamplePiece {
  ilvl: number | null;
  slot: string;
  subs: (string | null)[];
  slots: number | null;
}

/* The sync settings of the math tab (job-sync-panel.ts syncSettings). */
export type { SyncSettings } from '../../job-sync-panel.ts';

/* The panel the Sync settings popover edits (the math tab's own): its stored cap and level (null for none) and the IL Sync switch. */
export interface SyncPanel {
  cap: number | null;
  level: number | null;
  on: boolean;
}

/* The GCD Scaling sub-tab's settings, with Stat Allocation's synced level (`syncedLevel`) that the tab follows until a level is typed. */
export interface GcdState {
  level: number | null;
  haste: string;
  speed: number | null;
  syncedLevel: number;
}

/* Substat tiers' own job (an id) and the level typed into its box (null: the job's level cap). */
export interface TiersState {
  job: string;
  level: number | null;
}
