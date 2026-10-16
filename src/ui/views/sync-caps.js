/* Sync limits: the per-slot ceiling at the current cap, and what a high item level piece keeps after syncing.
   Pure view builder: no Alpine import, so Node can load and test it. */
import { SUB_WEIGHTS } from '../../core/constants.js';
import { statBase } from '../../core/food.js';
import { clampIlvl, capsFor, pieceValue } from '../../core/formulas.js';
import { gcdFor } from '../../core/speed.js';
import { shownSync } from '../state.js';

/* null while no sync applies (item level sync off or no cap set, and the synced level at the level cap). With level
   sync the cap is the synced level's item level, for gear with a higher equip level (shownSync). */
export function syncView(app) {
  const sync = shownSync(app);
  if (!sync) return null;
  const job = app.jobCtx,
    cap = sync.cap,
    hil = clampIlvl(app.syncIlvl),
    compare = hil > cap; // a piece at or below the cap is not synced, so there is nothing to compare
  // totals over every slot the job wears, the weapon (and shield) included, each ring counted twice:
  // n1, n2: a native piece's first and second substat at the cap item level; h1, h2: the same lines of a piece at
  // `hil` after sync; c: the substat cap; spec, main, vit: the Piety/Tenacity, main stat and Vitality caps
  const tot = { n1: 0, n2: 0, h1: 0, h2: 0, c: 0, spec: 0, main: 0, vit: 0 };
  /* "Substat cap" is the shared Critical Hit / Determination / Direct Hit / speed column. Piety and Tenacity have
     their own column, which is higher at a few item levels (docs/mechanics/math.md section 2); show it only where it differs. */
  let specDiffers = false;
  const rows = job.activeSlotTypes.map(t => {
    const c = capsFor(job, t, cap),
      m = t === 'ring' ? 2 : 1; // how many of the slot a character wears
    const n = SUB_WEIGHTS.map(w => pieceValue(job, 'crit', cap, t, w));
    const hi = SUB_WEIGHTS.map(w => Math.min(c.crit, pieceValue(job, 'crit', hil, t, w)));
    tot.n1 += n[0] * m;
    tot.n2 += n[1] * m;
    tot.h1 += hi[0] * m;
    tot.h2 += hi[1] * m;
    tot.c += c.crit * m;
    tot.spec += c.spec * m;
    tot.main += c.main * m;
    tot.vit += c.vit * m;
    if (job.profile.spec && c.spec !== c.crit) specDiffers = true;
    return {
      type: t,
      times: m,
      pct: job.slotPct[t] / 10,
      sub: c.crit,
      spec: c.spec,
      main: c.main,
      vit: c.vit,
      native: n.join(' / '),
      synced: hi.join(' / '),
    };
  });
  const nat2 = tot.n1 + tot.n2,
    hi2 = tot.h1 + tot.h2,
    spd = tot.c,
    best = Math.max(tot.c, tot.spec),
    spdBase = statBase(job, 'spd', app.level);
  return {
    cap,
    byLevel: sync.byLevel,
    level: sync.level,
    hil,
    compare,
    slots: rows.reduce((a, r) => a + r.times, 0),
    rows,
    tot,
    specLabel: specDiffers ? job.short.spec : '',
    best,
    bestLabel: best > tot.c ? job.label.spec : '',
    gain: hi2 - nat2,
    gainPct: nat2 > 0 ? ((100 * (hi2 - nat2)) / nat2).toFixed(0) : 0,
    spd,
    // the character panel's number: the level's base plus gear, as in the optimizer's result
    spdBase,
    spdPanel: spdBase + spd,
    gcd: gcdFor(spd, app.level).toFixed(2),
  };
}
