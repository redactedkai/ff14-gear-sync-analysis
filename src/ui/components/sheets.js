/* The Sheets tab: the sheet manager, a sheet's page with its breadcrumb menu of sheets, and the frame of a set page (the
   set page itself is components/set-page.js, nested inside this one), with the dialogs (New sheet, Copy sheet, "Edit sheet",
   "Edit gear set", Delete) and reordering rows by drag or by the keyboard. The sheets and the screen live in
   Alpine.store('sheets') (ui/sheets/store.js); this component builds the views from it (views/sheet-manager.js,
   sheet-sets.js, sheet-forms.js) and keeps only what is on screen: the open dialog's fields, a row being dragged. Rules:
   docs/engineering/sheets.md.

   The component is made of parts, one file each in components/sheets/ and each a function that returns its members:
   frame.js (start, the screen, afterDraw), view.js (the manager, the sheet's page and the set page's header, the list's
   sort), settings.js (the sheet page's breadcrumb menu, level, cap and sync), dialog.js (the five dialogs), reorder.js
   (drag and keyboard moves) and open-row.js (a click anywhere on a row opens it). They share `this`, so a part calls another's members; the closure variables of one part
   (a view cache, the timer of the note, the element to focus again) stay in that part. */
import { compose } from './compose.js';
import { dialogPart } from './sheets/dialog.js';
import { framePart } from './sheets/frame.js';
import { openRowPart } from './sheets/open-row.js';
import { reorderPart } from './sheets/reorder.js';
import { settingsPart } from './sheets/settings.js';
import { viewPart } from './sheets/view.js';

/* The component. Reads $store.sheets (the sheets and the screen) and nothing of the Job and sync panel. */
export function sheetsTab() {
  return compose(framePart(), viewPart(), settingsPart(), dialogPart(), reorderPart(), openRowPart());
}
