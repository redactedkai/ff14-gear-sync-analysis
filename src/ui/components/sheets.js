/* The Sheets tab: the frame of the Sheets screens and the dialogs (New sheet, Copy sheet, "Edit sheet", "Edit gear set", Delete). The
   sheet manager, a sheet's page and a set's page are Lit elements, islands in this component's template (elements/sheets/sheet-manager.ts,
   sheet-page.ts, elements/set-page/set-page.ts): the component gives them their views (the set page its ports, the store and the solver)
   and answers their events. The sheets and the screen live in Alpine.store('sheets')
   (ui/store/sheets-facade.ts); this component builds the views from it (views/sheet-manager.js, sheet-sets.js, sheet-forms.js)
   and keeps only what is on screen: the open dialog's fields. Rules: docs/engineering/sheets.md.

   The component is made of parts, one file each in components/sheets/ and each a function that returns its members:
   frame.js (start, the screen, afterDraw), view.js (the views and the properties of the three elements, the set page's header),
   actions.js (the answers to the elements' events) and dialog.js (the five dialogs). They share `this`, so a part calls another's
   members; the closure variables of one part (a view cache, the element to focus again) stay in that part. */
import { compose } from './compose.js';
import { actionsPart } from './sheets/actions.js';
import { dialogPart } from './sheets/dialog.js';
import { framePart } from './sheets/frame.js';
import { viewPart } from './sheets/view.js';

/* The component. Reads $store.sheets (the sheets and the screen) and nothing of the Job and sync panel. `setPagePorts`: what a set
   page's element needs (elements/set-page/session-types.ts SetPagePorts), frozen; main.js makes it. */
export function sheetsTab(setPagePorts = null) {
  return compose(framePart(), viewPart(setPagePorts), actionsPart(), dialogPart());
}
