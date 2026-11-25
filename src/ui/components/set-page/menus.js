/* The open menus of a set page (a piece picker, a materia menu, the Food menu): which one is open, the
   keys it takes, where it sits in the window, and the views of the picker and the materia menu.
   A part of the setPage component (components/set-page.js composes the parts). */
import { jobGear } from '../../../core/items.js';
import { drawInSteps } from '../../draw-in-steps.js';
import { FIRST_ROWS, limitRows, ROWS_PER_STEP } from '../../views/limit-rows.js';
import { overlays } from '../../overlays.js';
import { piecePickerView } from '../../views/piece-menu.js';
import { materiaMenuView } from '../../views/stone-menu.js';

/* A menu's gap to the window's bottom edge and to the pinned header (px). */
const MENU_MARGIN_PX = 12;
/* The gap kept between the pinned header and a menu's button when the page is scrolled to show the menu (px). */
const MENU_BUTTON_MARGIN_PX = 8;
/* The lowest a menu that does not fit is made before it scrolls inside (px). */
const MENU_MIN_PX = 160;

/* The ids of the set page's layers in the overlay manager (overlays.js): the one open menu (a picker, a materia menu, the Food
   menu), the Auto-fill settings popover and its "Spare points" note. */
export const SET_MENU_LAYER = 'setMenu';
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
    // the open menu: 'pick:<row>', 'meal', 'mat:<row>:<slot>', or null; the picker's search text
    open: null,
    query: '',
    // the materia menu shows every grade
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

    /* Open or close menu `id` (`box`: the element the menu opens in, whose first button opens it); an opened menu is a layer of
       the overlay manager (Escape, a press outside and Tab out close it, and the focus goes back to its button after Escape) and
       is scrolled into the window, below the pinned header. */
    toggleMenu(id, box) {
      if (this.locked) {
        return;
      }
      this.query = '';
      if (this.open === id) {
        return this.closeOpenMenu();
      }
      overlays.open({
        id: SET_MENU_LAYER,
        root: () => box,
        opener: () => box?.querySelector('button'),
        tabOut: true,
        close: () => {
          this.open = null;
        },
      });
      this.open = id;
      if (id.startsWith('pick:')) {
        this.drawPickerInSteps(Number(id.slice(5)));
      }
      this.$nextTick(() =>
        requestAnimationFrame(() => {
          const menu = box?.querySelector('.same-menu, .matpop');
          (menu?.querySelector('input[type=text]') ?? menu?.querySelector('.on, .cur, button:not(:disabled)'))?.focus({
            preventScroll: true,
          });
          this.keepMenuInView(menu);
        }),
      );
    },
    /* Close the open menu (a pick, the button again); the focus goes back to the menu's button unless `restoreFocus` is false. */
    closeOpenMenu(restoreFocus = true) {
      if (this.open === null) {
        return;
      }
      if (!overlays.close(SET_MENU_LAYER, { restoreFocus })) {
        this.open = null;
      }
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
       sight; and `room` the height left for the menu from there to the window's bottom. */
    menuRoom(menu) {
      const top = this.viewTop();
      let anchorTop = menu.getBoundingClientRect().top;
      let buttonGap = 0; // how far under `top` the page keeps the button: the room of a menu in the table starts there
      const names = this.$refs.table.querySelector('thead th');
      if (names) {
        anchorTop = menu.offsetParent?.getBoundingClientRect().top ?? anchorTop;
        buttonGap = MENU_BUTTON_MARGIN_PX;
      }
      // the menu opens `offset` px under its anchor's top (the button's height and the gap): that much of the room is the button's
      const offset = menu.getBoundingClientRect().top - anchorTop;
      return { top, room: innerHeight - top - buttonGap - offset - MENU_MARGIN_PX, anchorTop };
    },
    /* Scroll the page so an opened menu and its button sit between the pinned header and the window's bottom; a menu taller
       than the room gets a height that fits and scrolls inside. The button is what stays below the pinned parts (the page
       never scrolls it under them to show more of the menu). */
    keepMenuInView(menu) {
      if (!menu) {
        return;
      }
      const list = menu.querySelector('.menu-list') ?? menu;
      list.style.maxHeight = '';
      const { room } = this.menuRoom(menu);
      // the search box and the footer stay; the list takes what is left (their height is measured, not guessed)
      const whole = menu.getBoundingClientRect().height;
      if (whole > room) {
        list.style.maxHeight = `${Math.max(MENU_MIN_PX, room - (whole - list.getBoundingClientRect().height))}px`;
      }
      const { top, room: left, anchorTop } = this.menuRoom(menu);
      const box = menu.getBoundingClientRect();
      const under = anchorTop - top - MENU_BUTTON_MARGIN_PX; // negative: the button is under the pinned header
      const past = box.bottom - innerHeight + MENU_MARGIN_PX; // positive: the menu's bottom is past the window
      const dy = box.height > left || under < 0 ? under : Math.min(past, under);
      if (dy > 0 || under < 0) {
        scrollBy({ top: dy });
      }
    },
    /* Draw the pieces of the piece picker of row `index` in steps: the first ones at once, the rest one step per frame
       while the picker stays open. */
    drawPickerInSteps(index) {
      const id = `pick:${index}`;
      this.pickRows = FIRST_ROWS;
      drawInSteps(() => {
        if (this.open !== id) {
          return false;
        }
        this.pickRows += ROWS_PER_STEP;
        return this.pickRows < this.picker(index).count;
      });
    },
    /* The open piece picker of row `index` (piecePickerView), as many pieces as pickRows. Kept for the next read: the
       template reads it once per part of the menu, and it depends on the job, the pieces held (a Unique ring in the
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
    /* A click inside the open piece picker of row `index`: one handler on the list instead of one per row. The row clicked
       carries its piece's gameId (data-game-id); a disabled row (a Unique
       ring worn in the other ring row), the search box and the Clear search button do nothing here. */
    pickClick(event, index) {
      const row = event.target.closest?.('.same-item');
      if (!row || row.disabled) {
        return;
      }
      if (row.dataset.gameId !== undefined) {
        this.pick(index, Number(row.dataset.gameId));
      }
    },
    /* The open materia menu of row `index`, slot `slot` (materiaMenuView). */
    materia(index, slot) {
      return materiaMenuView(this.job, this.draft ?? this.saved, index, slot, this.matAll);
    },
  };
}
