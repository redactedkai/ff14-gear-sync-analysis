/* Gear: one table for browsing the item database and for the pool the optimizer searches.
   `browse.show` picks the list: 'all' = database rows matching the filters, 'pool' = pool items matching them.
   Pure view builder: no Alpine import, so Node can load and test it. */
import { SLOT_LABEL } from '../../core/constants.js';
import { browseItems, dbStats, kindFactors, poolKey, slotInfo, slotLabel } from '../../core/items.js';
import { syncStats } from '../../core/formulas.js';
import { syncTarget } from '../../core/sync-target.js';
import { effStats } from '../../core/optimizer/index.js';
import { statCell, fmtInt } from '../helpers.js';
import { syncSettings } from '../state.js';

export const SHOW_LIMIT = 100; /* database rows rendered */
export const POOL_ROWS = 400; /* pool rows rendered; the rest are still searched */
export const ADD_LIMIT = 3000; /* most rows "Add all" will take at once */

function byOrder(sort) {
  return (x, y) => {
    if (sort !== 'ilvl') {
      const d = (y.eff[sort] || 0) - (x.eff[sort] || 0);
      if (d) return d;
    }
    return y.ilvl - x.ilvl || x.name.localeCompare(y.name);
  };
}

/* Pool items matching the browse filters (name, slot, item level range; pool items carry no equip level). */
function poolMatches(app) {
  const b = app.browse,
    q = (b.q || '').trim().toLowerCase(),
    lo = +b.min || 0,
    hi = +b.max || 0;
  return app.pool.filter(
    i =>
      (!q || i.name.toLowerCase().includes(q)) && (b.type === 'any' || i.type === b.type) && (!lo || i.ilvl >= lo) && (!hi || i.ilvl <= hi),
  );
}

export function gearView(app) {
  const job = app.jobCtx,
    b = app.browse,
    sync = syncSettings(app),
    showPool = b.show === 'pool';
  const inPool = new Map(app.pool.map(i => [poolKey(i), i]));
  let all;
  if (showPool) {
    all = poolMatches(app).map(item => ({
      name: item.name,
      type: item.type,
      ilvl: item.ilvl,
      lvl: '',
      hq: !!item.hq,
      copies: item.copies || 1,
      blocks: slotInfo(job, item).blocks,
      raw: item.stats,
      eff: effStats(job, item, sync),
      row: null,
      item,
    }));
  } else {
    const rows = browseItems(job, {
      q: b.q,
      type: b.type,
      expOff: b.expOff,
      ilvlMin: +b.min || 0,
      ilvlMax: +b.max || 0,
      lvlMax: +b.lvl || 0,
    });
    all = rows.map(r => {
      const raw = dbStats(job, r.st);
      const target = syncTarget({ itemLevel: r.ilvl, equipLevel: r.lvl, syncOn: sync.sync, cap: sync.cap, syncedLevel: sync.level });
      return {
        name: r.name,
        type: r.type,
        ilvl: r.ilvl,
        lvl: r.lvl,
        hq: r.hq,
        copies: r.type === 'ring' && !r.unique ? 2 : 1, // as poolItemFromRow sets it
        blocks: r.blocks,
        raw,
        eff: target == null ? raw : syncStats(job, raw, r.type, target, r.ilvl, r.pct, kindFactors(job, r.kind)),
        row: r,
        item: inPool.get(poolKey(r)) ?? null,
      };
    });
  }
  all.sort(byOrder(b.sort));
  const limit = showPool ? POOL_ROWS : SHOW_LIMIT;
  const shown = all.slice(0, limit).map(x => ({
    ...x,
    key: poolKey(x),
    slot: slotLabel(x.type, x.blocks),
    cells: job.stats.map(s => statCell(x.raw[s], x.eff[s])),
  }));
  const n = all.length;
  return Object.freeze({
    showPool,
    all: Object.freeze(all),
    shown: Object.freeze(shown),
    countText: showPool
      ? `${fmtInt(app.pool.length)} items · ` +
        job.activeSlotTypes.map(t => `${SLOT_LABEL[t]} ${app.pool.filter(i => i.type === t).length}`).join(' · ') +
        (n < app.pool.length ? ` · ${fmtInt(n)} match the filters` : '')
      : n
        ? `${fmtInt(n)} matches${n > limit ? `, showing the first ${limit}` : ''}`
        : 'No matches',
    hidden: n > limit ? fmtInt(n - limit) : '',
  });
}
