/* Browse real gear: filter the item database for this job and add rows to the pool. */
/* Pure view builder: no Alpine import, so Node can load and test it (docs/audit-2.md A4). */
import { browseItems, dbStats } from '../../core/items.js';
import { syncStats } from '../../core/formulas.js';
import { statCell } from '../helpers.js';

export const SHOW_LIMIT = 100; /* rows rendered */
export const ADD_LIMIT = 3000; /* most rows "Add all" will take at once */

export function browseView(app) {
  const job = app.jobCtx,
    b = app.browse;
  const rows = browseItems(job, { q: b.q, type: b.type, ilvlMin: +b.min || 0, ilvlMax: +b.max || 0, lvlMax: +b.lvl || 0 });
  const all = rows.map(r => {
    const raw = dbStats(job, r.st);
    const eff = app.sync ? syncStats(job, raw, r.type, app.cap, r.ilvl) : raw;
    return { r, raw, eff };
  });
  all.sort((x, y) => {
    if (b.sort !== 'ilvl') {
      const d = (y.eff[b.sort] || 0) - (x.eff[b.sort] || 0);
      if (d) return d;
    }
    return y.r.ilvl - x.r.ilvl || x.r.name.localeCompare(y.r.name);
  });
  const shown = all.slice(0, SHOW_LIMIT).map(x => ({ ...x, cells: job.stats.map(s => statCell(x.raw[s], x.eff[s])) }));
  return Object.freeze({ all: Object.freeze(all), shown: Object.freeze(shown) });
}
