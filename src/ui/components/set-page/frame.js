/* The frame of a set page: what runs when its element starts and goes away (its entry in the store, the sticky header's
   height, the store's leave guard, the Auto-fill still running), and `afterDraw` and `focusFill`, which move the focus once Alpine has drawn a change.
   A part of the setPage component (components/set-page.js composes the parts; `page` is the state they share). */

import { overlays } from '../../overlays.js';
import { afterDraw } from '../compose.js';
import { RANK_NOTE_LAYER, SET_MENU_LAYER, SETTINGS_LAYER } from './menus.js';

/* `page`: {el, refs, setId}, the shared holder of the page's own element, its refs and its set's id, kept from init: `this.$el` and `this.$refs`
   belong to the element a handler ran on, and a click can remove that element (Cancel, Apply, Discard), so after one
   `this.$el` is not in the page and `this.$refs` and `this.$root` are empty. Returns the part's members. */
export function framePart(page) {
  let headWatch = null;

  return {
    init() {
      page.el = this.$el;
      page.setId = this.saved.id;
      this.pages.openPage(page.setId);
      this.$store.sheets.setLeaveGuard(move => this.guardLeave(move));
      this.refreshCount();
      // the gear and its popover are in the bar only at rest: a draft, a result or a running Auto-fill closes the popover
      this.$watch(
        () => this.view.mode !== 'rest' || this.running,
        away => {
          if (away) {
            this.closeSettings(false);
          }
        },
      );
      // a menu or popover the page closes itself (a pick, Apply, Auto-fill) is taken off the overlay manager too, so it no longer
      // answers Escape
      for (const [flag, layer] of [
        ['open', SET_MENU_LAYER],
        ['settingsOpen', SETTINGS_LAYER],
        ['rankHelp', RANK_NOTE_LAYER],
      ]) {
        this.$watch(flag, value => {
          if (!value) {
            overlays.close(layer);
          }
        });
      }
      // the sticky header's height, for the column names that stick under it (--sh); its exact height, not offsetHeight's
      // whole pixels, or the column names stick a fraction of a pixel off the header's bottom edge
      this.$nextTick(() => {
        page.refs = this.$refs; // after the page's elements have started, so their refs are in it
        const head = page.refs.head;
        // a page taken away before its first frame (a quick click on a tab) has no header left to watch
        if (!head || typeof ResizeObserver !== 'function') {
          return;
        }
        const set = () => this.$root.style.setProperty('--sh', `${head.getBoundingClientRect().height}px`);
        set();
        headWatch = new ResizeObserver(set);
        headWatch.observe(head);
      });
    },
    destroy() {
      headWatch?.disconnect();
      this.$store.sheets.setLeaveGuard(null);
      if (this.running) {
        this.stopFill();
      }
      // the page's draft and result go with it; an answer that comes later finds no page and is ignored
      this.pages.closePage(this.setId);
    },

    /* Runs `callback` once Alpine has drawn the change just made, unless the page is gone by then (an Auto-fill cancelled or a
       result discarded by leaving the page): its elements and refs are gone with it. */
    afterDraw(callback) {
      afterDraw(this, () => page.el, callback);
    },
    focusFill() {
      this.afterDraw(() => {
        const { fill, gear } = page.refs; // a click made right after the one that asked can already have changed the bar again
        (fill?.disabled ? gear : fill)?.focus({ preventScroll: true });
      });
    },
  };
}
