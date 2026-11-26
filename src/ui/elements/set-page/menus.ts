/* The open menus of a set page (a piece picker, a materia menu, the Food menu): which one is open, where it sits in the window, and the
   views of the picker and the materia menu. The picker, the materia menu and the Food menu are Lit elements; the page names the button
   they hang under and gives them their view. Part of the page's session (session.ts). */
import type { StatKey } from '../../../core/types.ts';
import { jobGear } from '../../../core/items.ts';
import { drawInSteps } from '../../draw-in-steps.ts';
import { FIRST_ROWS, limitRows, ROWS_PER_STEP } from '../../views/limit-rows.ts';
import { piecePickerView } from '../../views/piece-menu.js';
import { materiaMenuView } from '../../views/stone-menu.js';
import type { SwitchPick } from '../sheets/switch-menu.ts';
import type { PageSession } from './session.ts';
import type { JobContext } from './session-types.ts';

/* The piece picker's view as the views build it (views/piece-menu.js piecePickerView), whole or cut to the rows drawn so far. */
type PickerView = ReturnType<typeof piecePickerView>;

/* A menu's gap to the window's bottom edge and to the pinned header (px). */
const MENU_MARGIN_PX = 12;
/* The gap kept between the pinned header and a menu's button when the page is scrolled to show the menu (px). */
const MENU_BUTTON_MARGIN_PX = 8;
/* The lowest a menu that does not fit is made before it scrolls inside (px). */
const MENU_MIN_PX = 160;
/* The pinned header and the box of the gear table, which the page finds in its own markup. */
const HEADER_SELECTOR = '.shead';
const TABLE_SELECTOR = '.settable';

/* The job's wearable pieces (items.ts jobGear) for the piece picker, built once per job and kept out of the store
   (big data: CLAUDE.md). */
const gearByJob = new Map<string, ReturnType<typeof jobGear>>();
function gearOf(job: JobContext) {
  let gear = gearByJob.get(job.jobId);
  if (!gear) {
    gear = jobGear(job);
    gearByJob.set(job.jobId, gear);
  }
  return gear;
}

/* The page's open menus (`session.menus`): which piece picker, materia menu or Food menu is open and where it sits. */
export class PageMenus {
  private readonly session: PageSession;
  // the piece picker (<gsa-piece-picker>): the row it is open for (its index) and the button it hangs under, or null; the picker's
  // search text
  pickOpen: number | null;
  pickAnchor: HTMLElement | null;
  query: string;
  // the materia menu (<gsa-materia-menu>): the slot it is open for as {row, slot} and the chip it hangs under, or null; every menu
  // shows every grade while matAll is on
  matOpen: { row: number; slot: number } | null;
  matAnchor: HTMLElement | null;
  matAll: boolean;
  // the Food menu (<gsa-food-menu>) is open: the page builds its meals only then
  foodOpen: boolean;
  // how many pieces the open piece picker draws (it draws a long list in steps: views/limit-rows.ts)
  private pickRows: number;
  // the last whole piece picker view built, with what it was built from, and the last cut of it to pickRows rows (the pieces keep
  // their objects from one cut to the next, so the rows already drawn are not drawn again when more are added)
  private lastPicker: { key: string; view: PickerView } | null;
  private lastCut: { rows: number; whole: PickerView; view: PickerView } | null;

  /* `session`: the page's session (session.ts). */
  constructor(session: PageSession) {
    this.session = session;
    this.pickOpen = null;
    this.pickAnchor = null;
    this.query = '';
    this.matOpen = null;
    this.matAnchor = null;
    this.matAll = false;
    this.foodOpen = false;
    this.pickRows = Infinity;
    this.lastPicker = null;
    this.lastCut = null;
  }

  /* ---- the piece picker ---- */

  /* The piece button of row `index` (`button`) opens its picker, or closes it when it is open: the search starts empty and the list is
     drawn in steps. An open picker is a layer of the overlay manager (its element registers it: Escape, a press outside and a focus that
     leaves it close it, and the focus goes back to the button after Escape and a pick); it is scrolled into the window, below the
     pinned header, once it is placed (`picker-shown`, keepMenuInView). */
  togglePicker(index: number, button: HTMLElement): void {
    if (this.session.locked) {
      return;
    }
    this.query = '';
    if (this.pickOpen === index) {
      this.closePicker();
      return;
    }
    this.pickOpen = index;
    this.pickAnchor = button;
    this.drawPickerInSteps(index);
    this.session.changed();
  }

  /* A piece chosen in the picker (the element's `piece-pick` event; `gameId` null: Empty this slot) for the row it is open for. */
  pickPiece(gameId: number | null): void {
    const open = this.pickOpen;
    if (open !== null) {
      this.session.edits.pick(open, gameId);
    }
  }

  /* The page lets go of the picker (its element closes it; the element's `picker-close` event ends here too). */
  closePicker(): void {
    this.pickOpen = null;
    this.pickAnchor = null;
    this.session.changed();
  }

  /* The picker's search text changed (the element's `picker-query` event). */
  setQuery(text: string): void {
    this.query = text;
    this.session.changed();
  }

  /* Draw the pieces of the piece picker of row `index` in steps: the first ones at once, the rest one step per frame while the picker
     stays open. */
  drawPickerInSteps(index: number): void {
    this.pickRows = FIRST_ROWS;
    drawInSteps(() => {
      if (this.pickOpen !== index) {
        return false;
      }
      this.pickRows += ROWS_PER_STEP;
      this.session.changed();
      return this.pickRows < this.picker(index).count;
    });
  }

  /* The open piece picker of row `index` (piecePickerView), as many pieces as pickRows. Kept for the next read: the page reads it at
     every draw, and it depends on the job, the pieces held (a Unique ring in the other ring row), the search and the rows drawn only. */
  picker(index: number): PickerView {
    const { session } = this;
    const gearSet = session.draft ?? session.saved;
    const held = gearSet.pieces.map(row => row.gameId ?? '').join();
    const key = `${session.job.jobId}|${index}|${held}|${this.query}`;
    if (this.lastPicker?.key !== key) {
      this.lastPicker = { key, view: piecePickerView(session.job, gearOf(session.job), gearSet, index, this.query) };
      this.lastCut = null;
    }
    const rows = this.pickRows;
    if (this.lastCut?.rows !== rows || this.lastCut.whole !== this.lastPicker.view) {
      const whole = this.lastPicker.view;
      this.lastCut = { rows, whole, view: Object.freeze({ ...whole, groups: limitRows(whole.groups, rows) }) };
    }
    return this.lastCut.view;
  }

  /* The open row's picker (see `picker`), or null while none is open: what the piece picker element shows as `menu`. */
  get pickerMenu(): PickerView | null {
    return this.pickOpen === null ? null : this.picker(this.pickOpen);
  }

  /* ---- the materia menu ---- */

  /* The chip of slot `slot` of row `index` (`button`) opens its materia menu, or closes it when it is open. A menu of the table (the
     piece picker, the Food menu) that is open closes when the materia menu registers with the overlay manager. */
  toggleMateria(index: number, slot: number, button: HTMLElement): void {
    if (this.session.locked) {
      return;
    }
    if (this.chipOpen(index, slot)) {
      this.closeMateria();
      return;
    }
    this.matOpen = { row: index, slot };
    this.matAnchor = button;
    this.session.changed();
  }

  /* Whether the materia menu is open for slot `slot` of row `index`. */
  chipOpen(index: number, slot: number): boolean {
    return this.matOpen?.row === index && this.matOpen.slot === slot;
  }

  /* The page lets go of the materia menu: its element closes it (the element's `materia-close` event ends here too). */
  closeMateria(): void {
    this.matOpen = null;
    this.matAnchor = null;
    this.session.changed();
  }

  /* Every grade shown or the best ones only (the element's `grades-toggle` event). */
  toggleAllGrades(): void {
    this.matAll = !this.matAll;
    this.session.changed();
  }

  /* What the materia menu element shows as `menu` (materiaMenuView): the open slot's view, or null while none is open. */
  get materiaMenu() {
    const { session } = this;
    const open = this.matOpen;
    return open ? materiaMenuView(session.job, session.draft ?? session.saved, open.row, open.slot, this.matAll) : null;
  }

  /* A stone chosen in the materia menu (`pick`: {stat, grade}, the element's stone-pick event) for the slot it is open for. */
  pickStone(pick: { stat: StatKey; grade: number }): void {
    const open = this.matOpen;
    if (open) {
      this.session.edits.setStone(open.row, open.slot, pick.stat, pick.grade);
    }
  }

  /* "Remove" in the materia menu: the stone of the slot it is open for goes. */
  dropStone(): void {
    const open = this.matOpen;
    if (open) {
      this.session.edits.removeStone(open.row, open.slot);
    }
  }

  /* ---- the Food menu ---- */

  /* The Food menu opened or closed (the element's `food-open` event). */
  setFoodOpen(open: boolean): void {
    this.foodOpen = open;
    this.session.changed();
  }

  /* ---- all menus ---- */

  /* Close the open menu (a pick, an Apply or Discard, the button again): the elements put the focus back on a button after a choice of
     their own; for a close the page asks for, it stays where it is. */
  closeOpenMenu(): void {
    this.closeMateria();
    this.closePicker();
  }

  /* The window's line (px from its top) that menus stay under: the bottom of the pinned header and, in the table, of the stuck column
     names. The Food menu (<gsa-food-menu>) takes it as its boundary. */
  viewTop(): number {
    const names = this.session.host.query(`${TABLE_SELECTOR} thead th`);
    // the pinned header is in the page's own markup while the page is drawn; 0 is the window's top, for a page not drawn yet
    const header = this.session.host.query(HEADER_SELECTOR);
    return Math.max(header ? header.getBoundingClientRect().bottom : 0, names ? names.getBoundingClientRect().bottom : 0);
  }

  /* Where an open menu sits in the window, as {top, room, anchorTop}: `top` is the window's line the menu must stay under (the pinned
     header and, for a menu in the table, the stuck column names); `anchorTop` the top of the box its button is in (the menu hangs under
     it: .same and .pop in the table), which the page keeps under that line too, so the button stays in sight; and `room` the height
     left for the menu from there to the window's bottom. A menu a library places (the piece picker, the materia menu) hangs under its
     button `anchor`, whose top is `anchorTop` (the menu's offset parent is then the library's positioner). */
  menuRoom(menu: HTMLElement, anchor: HTMLElement | null = null): { top: number; room: number; anchorTop: number } {
    const top = this.viewTop();
    let anchorTop = menu.getBoundingClientRect().top;
    let buttonGap = 0; // how far under `top` the page keeps the button: the room of a menu in the table starts there
    const names = this.session.host.query(`${TABLE_SELECTOR} thead th`);
    if (names) {
      anchorTop = (anchor ?? menu.offsetParent)?.getBoundingClientRect().top ?? anchorTop;
      buttonGap = MENU_BUTTON_MARGIN_PX;
    }
    // the menu opens `offset` px under its anchor's top (the button's height and the gap): that much of the room is the button's
    const offset = menu.getBoundingClientRect().top - anchorTop;
    return { top, room: innerHeight - top - buttonGap - offset - MENU_MARGIN_PX, anchorTop };
  }

  /* Scroll the page so an opened menu and its button sit between the pinned header and the window's bottom; a menu taller than the
     room gets a height that fits and scrolls inside. The button is what stays below the pinned parts (the page never scrolls it under
     them to show more of the menu). */
  keepMenuInView(menu: HTMLElement | null, anchor: HTMLElement | null = null): void {
    if (!menu) {
      return;
    }
    const list = menu.querySelector<HTMLElement>('.menu-list') ?? menu;
    list.style.maxHeight = '';
    const { room } = this.menuRoom(menu, anchor);
    // the search box and the footer stay; the list takes what is left (their height is measured, not guessed)
    const whole = menu.getBoundingClientRect().height;
    if (whole > room) {
      list.style.maxHeight = `${Math.max(MENU_MIN_PX, room - (whole - list.getBoundingClientRect().height))}px`;
    }
    const { top, room: left, anchorTop } = this.menuRoom(menu, anchor);
    const box = menu.getBoundingClientRect();
    const under = anchorTop - top - MENU_BUTTON_MARGIN_PX; // negative: the button is under the pinned header
    const past = box.bottom - innerHeight + MENU_MARGIN_PX; // positive: the menu's bottom is past the window
    const dy = box.height > left || under < 0 ? under : Math.min(past, under);
    if (dy > 0 || under < 0) {
      scrollBy({ top: dy });
    }
  }

  /* ---- the set switcher ---- */

  /* What the caret menu after the set's name (<gsa-switch-menu>) shows: a link to the sheet's page, one link per gear set of the sheet
     (the open one marked) and "+ New set", off while an Auto-fill runs. */
  get setSwitcher() {
    const { sheets, sheet, saved } = this.session;
    return {
      items: sheet.sets.map(set => ({
        id: set.id,
        name: set.name,
        href: sheets.href(sheets.sheetId, set.id),
        current: set.id === saved.id,
      })),
      allLabel: `All gear sets (${sheet.sets.length})`,
      allHref: sheets.href(sheets.sheetId),
      newLabel: '+ New set',
      newDisabled: sheets.busy,
    };
  }

  /* A pick in the caret menu (`pick`: {kind, id, opener}, the element's switch-pick event): the sheet's page, another gear set (the
     store asks first when this one has a draft or an Auto-fill running), or a new set. */
  pickSet(pick: SwitchPick): void {
    const { sheets, saved, leave } = this.session;
    if (pick.kind === 'all') {
      sheets.closeSet();
    } else if (pick.kind === 'item') {
      if (pick.id !== null && pick.id !== saved.id) {
        sheets.openSet(pick.id);
      }
    } else {
      leave.newSet();
    }
  }
}
