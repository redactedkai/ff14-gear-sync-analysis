/* The open menus of a set page (a piece picker, a materia menu, the Food menu, the set switcher): which one is open, the
   keys it takes, where it sits in the window, and the views of the picker and the materia menu.
   A part of the setPage component (components/set-page.js composes the parts). */
import { jobGear } from '../../../core/items.js';
import { drawInSteps } from '../../draw-in-steps.js';
import { FIRST_ROWS, limitRows, ROWS_PER_STEP } from '../../views/limit-rows.js';
import { piecePickerView } from '../../views/piece-menu.js';
import { materiaMenuView } from '../../views/stone-menu.js';

/* A menu's gap to the window's bottom edge and to the pinned header (px). */
const MENU_MARGIN_PX = 12;
/* The lowest a menu that does not fit is made before it scrolls inside (px). */
const MENU_MIN_PX = 160;

/* The job's wearable pieces (items.js jobGear) for the piece picker, built once per job and kept out of reactive state
   (big data: CLAUDE.md). */
const gearByJob = new Map();
function gearOf(job) {
  if (!gearByJob.has(job.jobId)) gearByJob.set(job.jobId, jobGear(job));
  return gearByJob.get(job.jobId);
}

/* `raw`: Alpine.raw or a stand-in (components/set-page.js). Returns the part's members. */
export function menusPart(raw) {
  // the last whole piece picker view built, with what it was built from, and the last cut of it to pickRows rows (plain
  // variables: writing reactive state inside the view that reads it would run it again). The pieces keep their
  // objects from one cut to the next, so the rows already drawn are not drawn again when more are added.
  let lastPicker = null;
  let lastCut = null;
  return {
    // the open menu: 'pick:<row>', 'meal', 'mat:<row>:<slot>', 'sets', or null; the picker's search text
    open: null,
    query: '',
    // the materia menu shows every grade
    matAll: false,
    // how many pieces the open piece picker draws (it draws a long list in steps: views/limit-rows.js)
    pickRows: Infinity,

    /* ---- menus ---- */

    /* Open or close menu `id` (`box`: the element the menu opens in); an opened menu takes the keys and is scrolled
       into the window, below the pinned header. */
    toggleMenu(id, box) {
      if (id !== 'sets' && this.locked) return;
      this.open = this.open === id ? null : id;
      this.query = '';
      if (!this.open) return;
      if (id.startsWith('pick:')) this.drawPickerInSteps(Number(id.slice(5)));
      this.$nextTick(() =>
        requestAnimationFrame(() => {
          const menu = box?.querySelector('.same-menu, .matpop, .setmenu');
          (menu?.querySelector('input[type=text]') ?? menu?.querySelector('.on, .cur, button:not(:disabled)'))?.focus({
            preventScroll: true,
          });
          this.keepMenuInView(menu);
        }),
      );
    },
    /* Close menu `id` if it is the open one (a click outside it). */
    closeMenu(id) {
      if (this.open === id) this.open = null;
    },
    /* Room for an open menu: the window below the pinned header and, for a menu in the table, the stuck column names. */
    menuRoom(menu) {
      const head = this.$refs.head;
      let top = head.getBoundingClientRect().bottom;
      const names = this.$refs.table.querySelector('thead th');
      if (names && !menu.closest('.shead')) top = Math.max(top, names.getBoundingClientRect().bottom);
      return { top, room: innerHeight - top - MENU_MARGIN_PX };
    },
    /* Scroll the page so an opened menu sits between the pinned header and the window's bottom; one taller than that
       gets a height that fits and scrolls inside. */
    keepMenuInView(menu) {
      if (!menu) return;
      const list = menu.querySelector('.menu-list') ?? menu;
      list.style.maxHeight = '';
      const { room } = this.menuRoom(menu);
      // the search box and the footer stay; the list takes what is left (their height is measured, not guessed)
      const whole = menu.getBoundingClientRect().height;
      if (whole > room) list.style.maxHeight = `${Math.max(MENU_MIN_PX, room - (whole - list.getBoundingClientRect().height))}px`;
      const { top, room: left } = this.menuRoom(menu);
      const box = menu.getBoundingClientRect();
      const under = box.top - top - 8; // negative: the menu's top is under the pinned header
      const past = box.bottom - innerHeight + MENU_MARGIN_PX; // positive: its bottom is past the window
      const dy = box.height > left || under < 0 ? under : Math.min(past, under);
      if (dy > 0 || under < 0) scrollBy({ top: dy });
    },
    /* Draw the pieces of the piece picker of row `index` in steps: the first ones at once, the rest one step per frame
       while the picker stays open. */
    drawPickerInSteps(index) {
      const id = `pick:${index}`;
      this.pickRows = FIRST_ROWS;
      drawInSteps(() => {
        if (this.open !== id) return false;
        this.pickRows += ROWS_PER_STEP;
        return this.pickRows < this.picker(index).count;
      });
    },
    /* The open piece picker of row `index` (piecePickerView), as many pieces as pickRows. Kept for the next read: the
       template reads it once per part of the menu, and it depends on the job, the pieces held (a Unique ring in the
       other ring row), the search and the rows drawn only. */
    picker(index) {
      const gearSet = raw(this.draft) ?? this.saved;
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
       carries its piece's gameId (data-game-id) or is the Empty this slot row (data-empty-slot); a disabled row (a Unique
       ring worn in the other ring row), the search box and the Clear search button do nothing here. */
    pickClick(event, index) {
      const row = event.target.closest?.('.same-item');
      if (!row || row.disabled) return;
      if (row.hasAttribute('data-empty-slot')) this.pick(index, null);
      else if (row.dataset.gameId !== undefined) this.pick(index, Number(row.dataset.gameId));
    },
    /* The open materia menu of row `index`, slot `slot` (materiaMenuView). */
    materia(index, slot) {
      return materiaMenuView(this.job, raw(this.draft) ?? this.saved, index, slot, this.matAll);
    },
    /* The meal menu's source for the shared Food menu (components/meal-menu.js): the menu and what a pick does. */
    get mealSource() {
      return { menu: self => self.mealMenuView, pick: (self, key) => self.setMeal(key), watch: 'open' };
    },
  };
}
