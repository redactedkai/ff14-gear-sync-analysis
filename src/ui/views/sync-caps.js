/* Sync limits: the per-slot ceiling at the current cap, and what a high item level piece keeps after syncing. */
/* Pure view builder: no Alpine import, so Node can load and test it. */
import { SUB_WEIGHTS } from '../../core/constants.js';
import { clampIlvl, capsFor, pieceValue } from '../../core/formulas.js';
import { gcdFor, dotMult } from '../../core/speed.js';
import { syncActive } from '../state.js';

/* null while sync is off or no cap is set */
export function syncView(app) {
  if (!syncActive(app)) return null;
  const job = app.jobCtx,
    cap = app.cap,
    hil = clampIlvl(app.syncIlvl);
  const tot = { n1: 0, n2: 0, n3: 0, h1: 0, h2: 0, h3: 0, c: 0, spec: 0, main: 0, vit: 0 };
  /* "Substat cap" is the shared Critical Hit / Determination / Direct Hit / speed column. Piety and Tenacity have
     their own column, which is higher at a few item levels (docs/math.md section 2); show it only where it differs. */
  let specDiffers = false;
  const rows = job.activeSlotTypes.map(t => {
    const c = capsFor(job, t, cap),
      m = t === 'ring' ? 2 : 1;
    const n = SUB_WEIGHTS.map(w => pieceValue(job, 'crit', cap, t, w));
    const hi = SUB_WEIGHTS.map(w => Math.min(c.crit, pieceValue(job, 'crit', hil, t, w)));
    if (t !== 'weapon' && t !== 'offhand') {
      tot.n1 += n[0] * m;
      tot.n2 += n[1] * m;
      tot.n3 += n[2] * m;
      tot.h1 += hi[0] * m;
      tot.h2 += hi[1] * m;
      tot.h3 += hi[2] * m;
      tot.c += c.crit * m;
      tot.spec += c.spec * m;
      tot.main += c.main * m;
      tot.vit += c.vit * m;
    }
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
    best = Math.max(tot.c, tot.spec);
  return {
    cap,
    hil,
    rows,
    tot,
    specLabel: specDiffers ? job.short.spec : '',
    best,
    bestLabel: best > tot.c ? job.label.spec : '',
    gain: hi2 - nat2,
    gainPct: nat2 > 0 ? ((100 * (hi2 - nat2)) / nat2).toFixed(0) : 0,
    spd,
    gcd: gcdFor(spd, app.level).toFixed(2),
    dot: ((dotMult(spd, app.level) - 1) * 100).toFixed(1),
  };
}
