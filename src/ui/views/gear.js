/* Gear browser: the item database rows the job can wear that match the filters, with their synced stats.
   Gear the browser's "Gear from" filter leaves out (`browse.exclude` and `browse.market`, its own; the optimizer has
   `opt.exclude` and `opt.market`) is not listed.
   Pure view builder: no Alpine import, so Node can load and test it. */
import {
  allowedActivities,
  browseItems,
  copiesOf,
  dbStats,
  emptyActivities,
  kindFactors,
  poolKey,
  routesAllow,
  slotLabel,
} from '../../core/items.js';
import { syncStats } from '../../core/formulas.js';
import { syncTarget } from '../../core/sync-target.js';
import { statCell, fmtInt } from '../helpers.js';
import { gearFilter, syncSettings } from '../state.js';

export const SHOW_LIMIT = 100; /* rows rendered */

function byOrder(sort) {
  return (x, y) => {
    if (sort !== 'ilvl') {
      const d = (y.eff[sort] || 0) - (x.eff[sort] || 0);
      if (d) return d;
    }
    return y.ilvl - x.ilvl || x.name.localeCompare(y.name);
  };
}

export function gearView(app) {
  const job = app.jobCtx,
    b = app.browse,
    sync = syncSettings(app);
  const rows = browseItems(job, { ...gearFilter(b), q: b.q, type: b.type });
  const allowed = allowedActivities(b.exclude || [], b.market !== false);
  const all = rows
    .filter(r => routesAllow(r.routes, allowed))
    .map(r => {
      const raw = dbStats(job, r.st);
      const target = syncTarget({
        itemLevel: r.ilvl,
        equipLevel: r.lvl,
        scales: r.scales,
        syncOn: sync.sync,
        cap: sync.cap,
        syncedLevel: sync.level,
      });
      return {
        name: r.name,
        type: r.type,
        ilvl: r.ilvl,
        lvl: r.lvl,
        hq: r.hq,
        copies: copiesOf(r.type, r.unique),
        blocks: r.blocks,
        raw,
        eff: target == null ? raw : syncStats(job, raw, r.type, target, r.ilvl, r.pct, kindFactors(job, r.kind)),
      };
    });
  all.sort(byOrder(b.sort));
  const shown = all.slice(0, SHOW_LIMIT).map(x => ({
    ...x,
    key: poolKey(x),
    slot: slotLabel(x.type, x.blocks),
    cells: job.stats.map(s => statCell(x.raw[s], x.eff[s])),
  }));
  const n = all.length;
  return Object.freeze({
    shown: Object.freeze(shown),
    countText: n ? `${fmtInt(n)} matches${n > SHOW_LIMIT ? `, showing the first ${SHOW_LIMIT}` : ''}` : 'No matches',
    hidden: n > SHOW_LIMIT ? fmtInt(n - SHOW_LIMIT) : '',
    // "Gear from" boxes with nothing for the job and the other filters: greyed out in the menu
    emptyBoxes: Object.freeze(emptyActivities(rows.map(r => r.routes))),
  });
}
