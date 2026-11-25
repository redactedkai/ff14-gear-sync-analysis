/* The logic of one set page, with no DOM of its own: what the page reads from the store (the saved set, its sheet, the draft, the
   Auto-fill result and status), and the five parts that change it (each a class in its own file, made here): menus.js (the open
   menu), edits.js (edits by hand and pins), fill-run.js (Auto-fill and its suggestion), fill-settings-edit.js (the Auto-fill settings
   popover and the Gear to search count) and leave-guard.js (the question before leaving, the page's key). The element
   (set-page.ts) makes one session when it has its ports and its set's id, and stops it when it leaves the page; the parts reach one
   another through the session.

   Nothing proposed is saved until Apply (docs/engineering/sheets.md, "Drafts and suggestions"): the manual draft (a second GearSet) and
   an Auto-fill suggestion live in the store (the `setPages` slice, one entry per open page: store/set-page-actions.ts). A pin and the
   Auto-fill settings are saved as soon as they change. While an Auto-fill runs, `sheets.busy` locks every edit on the Sheets tab
   (sheets.md, "The edit lock"); Cancel stays.

   `ports`: {sheets (the store's Sheets facade, ui/store/sheets-facade.ts), solver (ui/solver.js's), maxReal (the highest real item
   level)}. `host`, what the session needs of the element it serves: {isConnected, query(selector) (an element of the page, or null),
   afterDraw(callback) (runs `callback` once the page has drawn the change just made, unless the page is gone by then),
   requestUpdate() (the page draws again: called after a change of what the parts keep, as the open menu), dialogOpen (a dialog of the
   Sheets tab is open)}. */
import { makeJobContext } from '../../../core/job-context.js';
import { fillSettingsOf } from '../../sheets/fill-settings.js';
import { PageEdits } from './edits.js';
import { PageFill } from './fill-run.js';
import { PageFillSettings } from './fill-settings-edit.js';
import { PageLeave } from './leave-guard.js';
import { PageMenus } from './menus.js';

/* The state and the parts of one open set page: `ports` (the store, the Sheets facade, the solver), the set's id, the element as `host`, and
   the five parts (`menus`, `edits`, `fill`, `settings`, `leave`) that reach one another through it. It holds no DOM and no Lit. */
export class PageSession {
  /* A session for the page of gear set `setId`, kept from the page's start: the store's open set follows the screen, which can move
     on before the page is taken away. */
  constructor(ports, setId, host) {
    this.ports = ports;
    this.setId = setId;
    this.host = host;
    // the set and job the last Auto-fill settings were made for, and them (fillSettings)
    this.settingsMade = null;
    this.menus = new PageMenus(this);
    this.edits = new PageEdits(this);
    this.fill = new PageFill(this);
    this.settings = new PageFillSettings(this);
    this.leave = new PageLeave(this);
  }

  /* The page starts: its entry in the store, the leave guard, the first Gear to search count. */
  start() {
    this.pages.openPage(this.setId);
    this.sheets.setLeaveGuard(move => this.leave.guardLeave(move));
    this.settings.refreshCount();
  }

  /* The page goes away: the leave guard, the Auto-fill still running, the page's entry in the store (its draft and result go with it;
     an answer that comes later finds no page and is ignored). */
  stop() {
    this.sheets.setLeaveGuard(null);
    if (this.running) {
      this.fill.stopFill();
    }
    this.pages.closePage(this.setId);
  }

  /* What the parts keep has changed (an open menu, the question): the page draws again. */
  changed() {
    this.host.requestUpdate();
  }

  /* ---- what the page reads ---- */

  get sheets() {
    return this.ports.sheets;
  }
  get solver() {
    return this.ports.solver;
  }
  /* The sheet of the open set. */
  get sheet() {
    return this.sheets.currentSheet;
  }
  /* The saved gear set the page shows. */
  get saved() {
    return this.sheets.currentSet;
  }
  get job() {
    return makeJobContext(this.sheet.job);
  }
  /* The page's entry in the store; a page not open reads as one at rest. */
  get pageState() {
    return this.sheets.page(this.setId);
  }
  /* The store's actions on this page: each takes the set's id first. */
  get pages() {
    return this.sheets.pages;
  }
  /* The manual draft (a frozen GearSet in memory from the first edit by hand to Apply or Discard), or null. */
  get draft() {
    return this.pageState.draft;
  }
  /* The Auto-fill result waiting for Apply or Discard, {suggested ({pieces, meal}), declined: {rows, meal}}, or null. */
  get suggestion() {
    return this.pageState.suggestion;
  }
  /* This page's Auto-fill is running. */
  get running() {
    return this.pageState.fill === 'running';
  }
  /* The line after an Auto-fill that gave no suggestion (no set found, a pin dropped), '' for none. */
  get fillLine() {
    return this.pageState.fillLine;
  }
  /* How many pieces Gear to search leaves in the pool (null until the first count lands); 0 turns the Auto-fill button off. */
  get searchedCount() {
    return this.pageState.gearToSearch.searched;
  }
  /* Every edit is off: an Auto-fill runs (anywhere on the tab) or its result waits. */
  get locked() {
    return this.sheets.busy || Boolean(this.suggestion);
  }
  /* The set's Auto-fill settings (fillSettingsOf: its own or the defaults). The same object until the set or the job changes, so what
     the popover hands its elements (the filters' lists) is not new at every draw. */
  get fillSettings() {
    const saved = this.saved;
    const job = this.job;
    if (this.settingsMade?.saved !== saved || this.settingsMade.job !== job) {
      this.settingsMade = { saved, job, value: fillSettingsOf(job, saved) };
    }
    return this.settingsMade.value;
  }

  /* ---- after a draw ---- */

  /* Runs `callback` once the page has drawn the change just made, unless the page is gone by then (an Auto-fill cancelled or a result
     discarded by leaving the page): its elements are gone with it. */
  afterDraw(callback) {
    this.host.afterDraw(callback);
  }
  /* The focus goes to the Auto-fill button (or the gear when it is off) once the bar is drawn: after Apply, Discard and Cancel. */
  focusFill() {
    this.afterDraw(() => {
      // a click made right after the one that asked can already have changed the bar again
      const fill = this.host.query('#sh-fill');
      const gear = this.host.query('.gearbtn');
      (fill?.disabled ? gear : fill)?.focus({ preventScroll: true });
    });
  }
}
