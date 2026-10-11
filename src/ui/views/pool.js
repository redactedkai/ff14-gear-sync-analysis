/* Your pool: the items the optimizer searches. */
/* Pure view builder: no Alpine import, so Node can load and test it (docs/audit-2.md A4). */
import { SLOT_TYPES, SLOT_LABEL } from '../../core/constants.js';
import { effStats } from '../../core/optimizer/index.js';
import { statCell, fmtInt } from '../helpers.js';

export const POOL_ROWS = 400; /* rows rendered; the rest are still searched */

export function poolView(app) {
  const job = app.jobCtx,
    filt = app.poolFilter;
  const ord = t => SLOT_TYPES.indexOf(t);
  const items = app.pool
    .slice()
    .sort((a, b) => ord(a.type) - ord(b.type) || b.ilvl - a.ilvl || a.name.localeCompare(b.name))
    .filter(i => filt === 'all' || filt === i.type);
  const sync = { cap: app.cap, sync: app.sync };
  const rows = items.slice(0, POOL_ROWS).map(it => {
    const e = effStats(job, it, sync);
    return { item: it, cells: job.stats.map(s => statCell(it.stats[s], e[s])) };
  });
  return {
    rows,
    hidden: fmtInt(Math.max(0, items.length - POOL_ROWS)),
    hasHidden: items.length > POOL_ROWS,
    countText:
      `${app.pool.length} items · ` +
      job.activeSlotTypes.map(t => `${SLOT_LABEL[t]} ${app.pool.filter(i => i.type === t).length}`).join(' · '),
  };
}
