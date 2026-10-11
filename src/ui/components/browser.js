/* Browse real gear: filter the item database for this job and add rows to the pool. */
import Alpine from 'alpinejs';
import { browseItems, dbStats } from '../../core/items.js';
import { syncStats } from '../../core/formulas.js';
import { statCell, fmtInt } from '../helpers.js';

export const SHOW_LIMIT = 100;   /* rows rendered */
export const ADD_LIMIT = 3000;   /* most rows "Add all" will take at once */

export function browseView(app) {
  const job = app.jobCtx, b = app.browse;
  const rows = browseItems(job, { q: b.q, type: b.type, ilvlMin: +b.min || 0, ilvlMax: +b.max || 0, lvlMax: +b.lvl || 0 });
  const all = rows.map(r => {
    const raw = dbStats(job, r.st);
    const eff = app.sync ? syncStats(job, raw, r.type, app.cap, r.ilvl) : raw;
    return { r, raw, eff };
  });
  all.sort((x, y) => {
    if (b.sort !== 'ilvl') { const d = (y.eff[b.sort] || 0) - (x.eff[b.sort] || 0); if (d) return d; }
    return y.r.ilvl - x.r.ilvl || x.r.name.localeCompare(y.r.name);
  });
  const shown = all.slice(0, SHOW_LIMIT).map(x => ({ ...x, cells: job.stats.map(s => statCell(x.raw[s], x.eff[s])) }));
  return Object.freeze({ all: Object.freeze(all), shown: Object.freeze(shown) });
}

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
    get sortOptions() { return [['ilvl', 'Item level']].concat(this.job.stats.map(s => [s, 'Synced ' + this.job.label[s]])); },
    get typeOptions() { return [['any', 'Any slot']].concat(this.slotOptions); },
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
      if (all.length > ADD_LIMIT) { this.notice = { kind: 'toomany', n: fmtInt(all.length), limit: fmtInt(ADD_LIMIT) }; return; }
      const n = this.$store.app.addRows(all.map(x => x.r));
      this.notice = { kind: 'added', n: fmtInt(n), plural: n === 1 ? '' : 's', skipped: n < all.length ? fmtInt(all.length - n) : '' };
    },
  };
}
