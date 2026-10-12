/* Gear: browse the item database and manage the pool in one table (see views/gear.js). */
import Alpine from 'alpinejs';
import { gearView, ADD_LIMIT } from '../views/gear.js';
import { fmtInt } from '../helpers.js';
import { EXPANSIONS, SOURCES } from '../../core/constants.js';

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
    /* oldest first, the game's own order */
    expansions: EXPANSIONS.map(([short, name]) => [short, name]),
    /* the dropdown button: "All expansions", one name, or how many are on */
    get expSummary() {
      const on = EXPANSIONS.filter(e => this.expShown(e[0]));
      if (on.length === EXPANSIONS.length) return 'All expansions';
      if (!on.length) return 'None';
      return on.length === 1 ? on[0][1] : `${on.length} expansions`;
    },
    expShown(short) {
      return !this.$store.app.browse.expOff.includes(short);
    },
    setExpShown(short, on) {
      const off = this.$store.app.browse.expOff.filter(k => k !== short);
      this.$store.app.browse.expOff = on ? off : EXPANSIONS.map(e => e[0]).filter(k => k === short || off.includes(k));
    },
    /* gear groups that can be left out (crafted, tomestone, ...): a ticked box excludes the group */
    sources: SOURCES,
    excluded(key) {
      return this.$store.app.browse.exclude.includes(key);
    },
    setExcluded(key, on) {
      const ex = this.$store.app.browse.exclude.filter(k => k !== key);
      this.$store.app.browse.exclude = on ? SOURCES.map(s => s.key).filter(k => k === key || ex.includes(k)) : ex;
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
