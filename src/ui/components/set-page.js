/* A set page (the Sheets tab's third level): the sticky header (breadcrumb with the set switcher, the sheet's
   settings read-only, the set bar with Auto-fill, the goal and the gear icon, and the stat block), the gear table with its
   piece pickers, materia and meal menus and pins, the Auto-fill settings popover, an Auto-fill and its suggestion with Take boxes,
   a manual draft, and the question before leaving. Nested inside the Sheets tab's component (components/sheets.js),
   whose dialogs it uses (Edit gear set, Delete) and whose store, $store.sheets (ui/store/sheets-facade.ts), holds the
   saved set. The template re-creates it for each set it shows (keyed by the set's id), so nothing here outlives a set.

   Nothing proposed is saved until Apply (docs/engineering/sheets.md, "Drafts and suggestions"): the manual draft
   (`draft`, a second GearSet) and an Auto-fill suggestion (`suggestion`) live in the store (the `setPages` slice, one entry per
   open page: store/set-page-actions.ts) and the component reads them through page-state.js; it keeps the menus, the question
   before leaving and the functions that are not state. A pin and the Auto-fill settings are saved as soon as they change. While an Auto-fill runs, $store.sheets.busy locks every edit on the Sheets tab (sheets.md,
   "The edit lock"); Cancel stays. The component is made of parts, one file each in components/set-page/ and each a function that returns its members:
   frame.js (start, stop, focus), page-state.js (what the store holds of this page), view.js (the set and what the page draws), menus.js (the open menu), draft.js (edits by
   hand and pins), fill.js (Auto-fill and its suggestion), auto-fill-settings.js (the Auto-fill settings popover and the Gear to search count)
   and leave.js (the question before leaving, the page's keys). They share `this`, so a part calls another's members. */
import { inProcessSolver } from '../solver.js';
import { compose } from './compose.js';
import { draftPart } from './set-page/draft.js';
import { fillPart } from './set-page/fill.js';
import { framePart } from './set-page/frame.js';
import { leavePart } from './set-page/leave.js';
import { menusPart } from './set-page/menus.js';
import { pageStatePart } from './set-page/page-state.js';
import { settingsPart } from './set-page/auto-fill-settings.js';
import { viewPart } from './set-page/view.js';

/* The component. `solver`: ui/solver.js's, the page's worker solver in main.js, one on the page's thread by default (the
   tests). */
export function setPage(solver = inProcessSolver()) {
  // the page's own element, its refs and its set's id, shared by the parts (frame.js, page-state.js)
  const page = { el: null, refs: null, setId: null };

  return compose(
    framePart(page),
    pageStatePart(page),
    viewPart(),
    menusPart(),
    draftPart(),
    fillPart(solver, page),
    settingsPart(solver),
    leavePart(page),
  );
}
