/* Gear: browse the item database and manage the pool in one table (see views/gear.js). */
import Alpine from 'alpinejs';
import { gearView, ADD_LIMIT } from '../views/gear.js';
import { fmtInt } from '../helpers.js';

export function gear() {
  return {
    view: null,
    /* replaces the count after "Add all": {kind: 'added' | 'toomany', n, skipped} */
    notice: null,
    init() {
      Alpine.effect(() => {
        const app = this.$store.app;
        if (app.tab !== 'pool') return;
        app.poolVersion; // dependency: any pool change
        this.view = gearView(app);
        this.notice = null;
      });
    },
    get sortOptions() {
      return [['ilvl', 'Item level']].concat(this.job.stats.map(s => [s, 'Synced ' + this.job.label[s]]));
    },
    get typeOptions() {
      return [['any', 'Any slot']].concat(this.slotOptions);
    },
    show(which) {
      this.$store.app.browse.show = which;
    },
    /* the row's "In pool" checkbox */
    toggle(x) {
      const app = this.$store.app;
      if (x.item) app.removeItem(x.item.id);
      else if (x.row) app.addRows([x.row]);
    },
    addAll() {
      const all = this.view.all;
      if (!all.length) return;
      if (all.length > ADD_LIMIT) {
        this.notice = { kind: 'toomany', n: fmtInt(all.length), limit: fmtInt(ADD_LIMIT) };
        return;
      }
      const n = this.$store.app.addRows(all.map(x => x.row));
      // set after the pool change has recomputed the view (which clears the notice)
      this.$nextTick(() => {
        this.notice = { kind: 'added', n: fmtInt(n), plural: n === 1 ? '' : 's', skipped: n < all.length ? fmtInt(all.length - n) : '' };
      });
    },
  };
}
