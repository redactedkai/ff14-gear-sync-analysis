/* The open menus of a set page (a piece picker, a materia menu, the Food menu): which one is open, where it sits in the
   window, and the views of the picker and the materia menu. The picker and the materia menu are Lit elements (islands); the page
   names the button they hang under and gives them their view.
   A part of the setPage component (components/set-page.js composes the parts). */
import { jobGear } from '../../../core/items.js';
import { drawInSteps } from '../../draw-in-steps.js';
import { FIRST_ROWS, limitRows, ROWS_PER_STEP } from '../../views/limit-rows.js';
import { piecePickerView } from '../../views/piece-menu.js';
import { materiaMenuView } from '../../views/stone-menu.js';

/* A menu's gap to the window's bottom edge and to the pinned header (px). */
const MENU_MARGIN_PX = 12;
/* The gap kept between the pinned header and a menu's button when the page is scrolled to show the menu (px). */
const MENU_BUTTON_MARGIN_PX = 8;
/* The lowest a menu that does not fit is made before it scrolls inside (px). */
const MENU_MIN_PX = 160;

/* The ids of the set page's layers in the overlay manager (overlays.js) that the page itself opens: the Auto-fill settings popover
   and its "Spare points" note. (The menus of the table are Zag layers their elements register.) */
export const SETTINGS_LAYER = 'settings';
export const RANK_NOTE_LAYER = 'rankNote';

/* The job's wearable pieces (items.js jobGear) for the piece picker, built once per job and kept out of reactive state
   (big data: CLAUDE.md). */
const gearByJob = new Map();
function gearOf(job) {
  if (!gearByJob.has(job.jobId)) {
    gearByJob.set(job.jobId, jobGear(job));
  }
  return gearByJob.get(job.jobId);
}

/* Returns the part's members. */
export function menusPart() {
  // the last whole piece picker view built, with what it was built from, and the last cut of it to pickRows rows (plain
  // variables: writing reactive state inside the view that reads it would run it again). The pieces keep their
  // objects from one cut to the next, so the rows already drawn are not drawn again when more are added.
  let lastPicker = null;
  let lastCut = null;
  return {
    // the piece picker (<gsa-piece-picker>, an island): the row it is open for (its index) and the button it hangs under, or null;
    // the picker's search text
    pickOpen: null,
    pickAnchor: null,
    query: '',
    // the materia menu (<gsa-materia-menu>, an island): the slot it is open for as {row, slot} and the chip it hangs under, or null;
    // every menu shows every grade while matAll is on
    matOpen: null,
    matAnchor: null,
    matAll: false,
    // how many pieces the open piece picker draws (it draws a long list in steps: views/limit-rows.js)
    pickRows: Infinity,

    /* ---- the set switcher ---- */

    /* What the caret menu after the set's name (<gsa-switch-menu>, an island) shows: a link to the sheet's page, one link per gear
       set of the sheet (the open one marked) and "+ New set", off while an Auto-fill runs. */
    get setSwitcher() {
      const store = this.$store.sheets;
      const sets = this.sheet.sets;
      return {
        items: sets.map(set => ({
          id: set.id,
          name: set.name,
          href: store.href(store.sheetId, set.id),
          current: set.id === this.saved.id,
        })),
        allLabel: `All gear sets (${sets.length})`,
        allHref: store.href(store.sheetId),
        newLabel: '+ New set',
        newDisabled: store.busy,
      };
    },
    /* A pick in the caret menu (`pick`: {kind, id, opener}, the element's switch-pick event): the sheet's page, another gear set
       (the store asks first when this one has a draft or an Auto-fill running), or a new set. */
    pickSet(pick) {
      if (pick.kind === 'all') {
        this.$store.sheets.closeSet();
      } else if (pick.kind === 'item') {
        if (pick.id !== this.saved.id) {
          this.$store.sheets.openSet(pick.id);
        }
      } else {
        this.newSet();
      }
    },

    /* ---- menus ---- */

    /* The piece button of row `index` (`button`) opens its picker, or closes it when it is open: the search starts empty and the
       list is drawn in steps. An open picker is a layer of the overlay manager (its element registers it: Escape, a press outside
       and a focus that leaves it close it, and the focus goes back to the button after Escape and a pick); it is scrolled into the
       window, below the pinned header, once it is placed (`picker-shown`, keepMenuInView). */
    togglePicker(index, button) {
      if (this.locked) {
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
    },
    /* The page lets go of the picker (its element closes it; the element's `picker-close` event ends here too). */
    closePicker() {
      this.pickOpen = null;
      this.pickAnchor = null;
    },
    /* Close the open menu (a pick, an Apply or Discard, the button again): the elements put the focus back on a button after a
       choice of their own; for a close the page asks for, it stays where it is. */
    closeOpenMenu() {
      this.closeMateria();
      this.closePicker();
    },
    /* The window's line (px from its top) that menus stay under: the bottom of the pinned header and, in the table, of the stuck
       column names. The Food menu (<gsa-food-menu>) takes it as its boundary. */
    viewTop() {
      const names = this.$refs.table.querySelector('thead th');
      return Math.max(this.$refs.head.getBoundingClientRect().bottom, names ? names.getBoundingClientRect().bottom : 0);
    },
    /* Where an open menu sits in the window, as {top, room, anchorTop}: `top` is the window's line the menu must stay under (the
       pinned header and, for a menu in the table, the stuck column names); `anchorTop` the top of the box its button is in
       (the menu hangs under it: .same and .pop in the table), which the page keeps under that line too, so the button stays in
       sight; and `room` the height left for the menu from there to the window's bottom. A menu a library places (the piece picker,
       the materia menu) hangs under its button `anchor`, whose top is `anchorTop` (the menu's offset parent is then the library's
       positioner). */
    menuRoom(menu, anchor = null) {
      const top = this.viewTop();
      let anchorTop = menu.getBoundingClientRect().top;
      let buttonGap = 0; // how far under `top` the page keeps the button: the room of a menu in the table starts there
      const names = this.$refs.table.querySelector('thead th');
      if (names) {
        anchorTop = (anchor ?? menu.offsetParent)?.getBoundingClientRect().top ?? anchorTop;
        buttonGap = MENU_BUTTON_MARGIN_PX;
      }
      // the menu opens `offset` px under its anchor's top (the button's height and the gap): that much of the room is the button's
      const offset = menu.getBoundingClientRect().top - anchorTop;
      return { top, room: innerHeight - top - buttonGap - offset - MENU_MARGIN_PX, anchorTop };
    },
    /* Scroll the page so an opened menu and its button sit between the pinned header and the window's bottom; a menu taller
       than the room gets a height that fits and scrolls inside. The button is what stays below the pinned parts (the page
       never scrolls it under them to show more of the menu). */
    keepMenuInView(menu, anchor = null) {
      if (!menu) {
        return;
      }
      const list = menu.querySelector('.menu-list') ?? menu;
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
    },
    /* Draw the pieces of the piece picker of row `index` in steps: the first ones at once, the rest one step per frame
       while the picker stays open. TODO: the page keeps the picker's search text, its cut to `pickRows` and this stepping while
       the set page is an Alpine component; they move to the set page's Lit screen (R40). */
    drawPickerInSteps(index) {
      this.pickRows = FIRST_ROWS;
      drawInSteps(() => {
        if (this.pickOpen !== index) {
          return false;
        }
        this.pickRows += ROWS_PER_STEP;
        return this.pickRows < this.picker(index).count;
      });
    },
    /* The open piece picker of row `index` (piecePickerView), as many pieces as pickRows. Kept for the next read: the
       page's effect reads it again at every redraw, and it depends on the job, the pieces held (a Unique ring in the
       other ring row), the search and the rows drawn only. */
    picker(index) {
      const gearSet = this.draft ?? this.saved;
      const held = gearSet.pieces.map(row => row.gameId ?? '').join();
      const key = `${this.job.jobId}|${index}|${held}|${this.query}`;
      if (lastPicker?.key !== key) {
        lastPicker = { key, view: piecePickerView(this.job, gearOf(this.job), gearSet, index, this.query) };
        lastCut = null;
      }
      const rows = this.pickRows;
      if (lastCut?.rows !== rows || lastCut.whole !== lastPicker.view) {
        const whole = lastPicker.view;
        lastCut = { rows, whole, view: Object.freeze({ ...whole, groups: limitRows(whole.groups, rows) }) };
      }
      return lastCut.view;
    },
    /* What the piece picker element shows: {menu, anchor, query}; `menu` is the open row's picker (see `picker`) or null. */
    get pickerPanel() {
      const index = this.pickOpen;
      return { menu: index === null ? null : this.picker(index), anchor: this.pickAnchor, query: this.query };
    },
    /* The chip of slot `slot` of row `index` (`button`) opens its materia menu, or closes it when it is open. A menu of the table (the
       piece picker, the Food menu) that is open closes when the materia menu registers with the overlay manager. */
    toggleMateria(index, slot, button) {
      if (this.locked) {
        return;
      }
      if (this.chipOpen(index, slot)) {
        this.closeMateria();
        return;
      }
      this.matOpen = { row: index, slot };
      this.matAnchor = button;
    },
    /* Whether the materia menu is open for slot `slot` of row `index`. */
    chipOpen(index, slot) {
      return this.matOpen?.row === index && this.matOpen.slot === slot;
    },
    /* The page lets go of the materia menu: its element closes it (the element's `materia-close` event ends here too). */
    closeMateria() {
      this.matOpen = null;
      this.matAnchor = null;
    },
    /* What the materia menu element shows: {menu, anchor, all}; `menu` is the open slot's view (materiaMenuView) or null. */
    get materiaPanel() {
      const open = this.matOpen;
      const menu = open ? materiaMenuView(this.job, this.draft ?? this.saved, open.row, open.slot, this.matAll) : null;
      return { menu, anchor: this.matAnchor, all: this.matAll };
    },
    /* A stone chosen in the materia menu (`pick`: {stat, grade}, the element's stone-pick event) for the slot it is open for. */
    pickStone(pick) {
      const open = this.matOpen;
      if (open) {
        this.setStone(open.row, open.slot, pick.stat, pick.grade);
      }
    },
    /* "Remove" in the materia menu: the stone of the slot it is open for goes. */
    dropStone() {
      const open = this.matOpen;
      if (open) {
        this.removeStone(open.row, open.slot);
      }
    },
  };
}
