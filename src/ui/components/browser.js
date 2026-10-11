/* Browse real gear: filter the item database for this job and add rows to the pool. */
import Alpine from 'alpinejs';
import { browseView, SHOW_LIMIT, ADD_LIMIT } from '../views/browse.js';
import { fmtInt } from '../helpers.js';
export function browser() {
  return {
    view: null,
    /* per-row button state after a click ('Added' / 'In pool'), reset whenever the list is recomputed */
    rowStatus: {},
    /* replaces the match count after "Add all": {kind: 'added' | 'toomany', n, skipped} */
    notice: null,
    init() {
      Alpine.effect(() => {
        const app = this.$store.app;
        if (app.tab !== 'pool') return;
        this.view = browseView(app);
        this.rowStatus = {};
        this.notice = null;
      });
    },
    get sortOptions() {
      return [['ilvl', 'Item level']].concat(this.job.stats.map(s => [s, 'Synced ' + this.job.label[s]]));
    },
    get typeOptions() {
      return [['any', 'Any slot']].concat(this.slotOptions);
    },
    get countText() {
      const n = this.view ? this.view.all.length : 0;
      if (!n) return 'No matches';
      return `${fmtInt(n)} matches${n > SHOW_LIMIT ? `, showing the first ${SHOW_LIMIT}` : ''}`;
    },
    add(i) {
      const x = this.view.shown[i];
      if (!x) return;
      this.rowStatus[i] = this.$store.app.addRows([x.r]) ? 'Added' : 'In pool';
    },
    addAll() {
      const all = this.view.all;
      if (!all.length) return;
      if (all.length > ADD_LIMIT) {
        this.notice = { kind: 'toomany', n: fmtInt(all.length), limit: fmtInt(ADD_LIMIT) };
        return;
      }
      const n = this.$store.app.addRows(all.map(x => x.r));
      this.notice = { kind: 'added', n: fmtInt(n), plural: n === 1 ? '' : 's', skipped: n < all.length ? fmtInt(all.length - n) : '' };
    },
  };
}
