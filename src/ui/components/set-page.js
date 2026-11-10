/* A set page (the Sheets tab's third level): the sticky header (breadcrumb with the set switcher, the sheet's
   settings read-only, the set bar with Fill, the goal and the gear icon, and the stat block), the gear table with its
   piece pickers, materia and meal menus and pins, the Fill settings dialog, a Fill and its suggestion with Take boxes,
   a manual draft, and the question before leaving. Nested inside the Sheets tab's component (components/sheets.js),
   whose dialogs it uses (Name and description, Delete) and whose store, $store.sheets (ui/sheet-store.js), holds the
   saved set. The template re-creates it for each set it shows (keyed by the set's id), so nothing here outlives a set.

   Nothing proposed is saved until Apply (docs/engineering/sheets.md, "Drafts and suggestions"): the manual draft
   (`draft`, a second GearSet) and a Fill suggestion (`suggestion`) live here only. A pin and the Fill settings are
   saved as soon as they change. While a Fill runs, $store.sheets.busy locks every edit on the Sheets tab (sheets.md,
   "The edit lock"); Cancel stays, and x is made of parts, one file each in components/set-page/ and each a function that returns its members:
   frame.js (start, stop, focus), view.js (the set and what the page draws), menus.js (the open menu), draft.js (edits by
   hand and pins), fill.js (Fill and its suggestion), settings.js (the Fill settings dialog and the Gear to search count)
   and leave.js (the question before leaving, the page's keys). They share `this`, so a part calls another's members. */
import { inProcessSolver } from '../solver.js';
import { draftPart } from './set-page/draft.js';
import { fillPart } from './set-page/fill.js';
import { framePart } from './set-page/frame.js';
import { leavePart, runningLeaveText } from './set-page/leave.js';
import { menusPart } from './set-page/menus.js';
import { SETTINGS_DROPPED_TEXT, settingsPart } from './set-page/settings.js';
import { LOCKED_TABLE_TEXT, viewPart } from './set-page/view.js';

export { LOCKED_TABLE_TEXT, SETTINGS_DROPPED_TEXT, runningLeaveText };

/* One object with every member of `parts`, getters kept as getters (a spread would read them once). */
function compose(...parts) {
  const component = {};
  for (const part of parts) Object.defineProperties(component, Object.getOwnPropertyDescriptors(part));
  return component;
}

/* The component. `alpine`: {raw} of Alpine (main.js passes Alpine; a test passes a stand-in); `solver`: ui/solver.js's,
   the page's worker solver in main.js, one on the page's thread by default (the tests). */
export function setPage(alpine, solver = inProcessSolver()) {
  const raw = value => alpine.raw?.(value) ?? value;
  // the page's own element and its refs, shared by the parts that move the focus (frame.js)
  const page = { el: null, refs: null };

  return compose(
    framePart(page),
    viewPart(raw),
    menusPart(raw),
    draftPart(raw),
    fillPart(solver, raw, page),
    settingsPart(solver, page),
    leavePart(page),
  );
}
