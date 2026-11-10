/* The frame of a set page: what runs when its element starts and goes away (the sticky header's height, the store's leave
   guard, the Fill still running), and `afterDraw` and `focusFill`, which move the focus once Alpine has drawn a change.
   A part of the setPage component (components/set-page.js composes the parts; `page` is the state they share). */

/* `page`: {el, refs}, the shared holder of the page's own element and its refs, kept from init: `this.$el` and `this.$refs`
   belong to the element a handler ran on, and a click can remove that element (Cancel, Apply, Discard), so after one
   `this.$el` is not in the page and `this.$refs` and `this.$root` are empty. Returns the part's members. */
export function framePart(page) {
  let headWatch = null;

  return {
    init() {
      page.el = this.$el;
      this.$store.sheets.leaveGuard = move => this.guardLeave(move);
      this.refreshCount();
      // the sticky header's height, for the column names that stick under it (--sh)
      this.$nextTick(() => {
        page.refs = this.$refs; // after the page's elements have started, so their refs are in it
        const head = page.refs.head;
        if (typeof ResizeObserver !== 'function') return;
        const set = () => this.$root.style.setProperty('--sh', `${head.offsetHeight}px`);
        set();
        headWatch = new ResizeObserver(set);
        headWatch.observe(head);
      });
    },
    destroy() {
      headWatch?.disconnect();
      if (this.$store.sheets.leaveGuard) this.$store.sheets.leaveGuard = null;
      if (this.running) this.stopFill();
    },

    /* Runs `callback` once Alpine has drawn the change just made, unless the page is gone by then (a Fill cancelled or a
       result dropped by leaving the page): its elements and refs are gone with it. */
    afterDraw(callback) {
      this.$nextTick(() => {
        if (page.el.isConnected) callback();
      });
    },
    focusFill() {
      this.afterDraw(() => (page.refs.fill.disabled ? page.refs.gear : page.refs.fill).focus({ preventScroll: true }));
    },
  };
}
