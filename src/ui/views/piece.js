/* Piece stats: how one piece's stats come from its item level, line by line, and what sync does to them.
   Pure view builder: no Alpine import, so Node can load and test it. */
import { SLOT_LABEL, SUB_WEIGHTS } from '../../core/constants.js';
import { capDerivation, clampIlvl, isOffhand, statDerivation } from '../../core/formulas.js';
import { MAX_REAL } from '../../core/tables.js';
import { shownSync } from '../state.js';
import { withRank } from './ranks.js';

/* A slot share in per mille as a percent: one decimal shows it exactly (85 ‰ = 8.5%). */
const sharePct = perMille => `${perMille / 10}%`;

/* "base × 8.5% = 26.4 → 26; × 70% = 18.2 → 18": a stat's derivation (statDerivation's steps). */
function formulaText(steps) {
  return steps
    .map(s => {
      if (s.kind === 'offhand') return `two-handed ${s.two} − one-handed ${s.one} = ${s.value}`;
      if (s.kind === 'slot') return `${s.base} × ${sharePct(s.pct)} = ${s.exact.toFixed(1)} → ${s.value}`;
      if (s.kind === 'factor') return `× ${s.factor} = ${s.exact.toFixed(1)} → ${s.value}`;
      return `× ${s.weight}% = ${s.exact.toFixed(1)} → ${s.value}`;
    })
    .join('; ');
}

/* "363 × 8.5% = 30.8 → 31", or with a stat factor "414 × 90% = 372; × 8.5% = 31.6 → 32": a cap's derivation
   (capDerivation), in the order the cap is computed. */
function capFormulaText(d) {
  if (d.offhand) return `two-handed ${d.offhand.two} − one-handed ${d.offhand.one} = ${d.value}`;
  const head = d.factorPct !== 100 ? `${d.base} × ${d.factorPct}% = ${d.afterFactor}; × ` : `${d.base} × `;
  return `${head}${sharePct(d.pct)} = ${d.exact.toFixed(1)} → ${d.value}`;
}

/* One sentence for where a stat's value on the piece comes from (statDerivation's steps); `main`: the job's main stat
   name, for the Vitality factor. */
function ownSentence(steps, il, main) {
  const first = steps[0];
  if (first.kind === 'offhand') return `The two-handed weapon's ${first.two} minus the one-handed weapon's ${first.one}.`;
  let text = `${sharePct(first.pct)} of the item level ${il} budget (${first.base})`;
  for (const s of steps.slice(1)) {
    if (s.kind === 'factor') text += `, then ${Math.round(s.factor * 100)}% on ${main} gear`;
    if (s.kind === 'share') text += `, then ${s.weight}% for the 2nd substat`;
  }
  return `${text}.`;
}

/* One sentence for where a stat's ceiling comes from (capDerivation), for the substat share `w`, worded like
   ownSentence's; `main`: the job's main stat name. */
function capSentence(d, cap, w, main) {
  if (d.offhand) return `The two-handed cap ${d.offhand.two} minus the one-handed cap ${d.offhand.one}.`;
  let text = `${sharePct(d.pct)} of the item level ${cap} budget (${d.base})`;
  if (d.factorPct !== 100) text += `, with ${d.factorPct}% on ${main} gear`;
  if (w != null && w !== 100) text += `, with no ${w}% for the 2nd substat`;
  return `${text}.`;
}

/* The slots of a full set as slices of one budget, in per mille: the job's slots with both rings (they add up to the
   whole budget, 1,000), `slot` marked. [{label, width, on}] */
function budgetSlices(job, slot) {
  const types = [...job.activeSlotTypes, 'ring'];
  let ringSeen = false;
  return types.map(t => {
    const on = t === slot && !(t === 'ring' && ringSeen);
    if (t === 'ring') ringSeen = true;
    return { label: SLOT_LABEL[t], width: job.slotPct[t], share: sharePct(job.slotPct[t]), on };
  });
}

/* The step-by-step section of Piece stats for its piece at item level `ilvl` (the explainer's chosen one,
   explainerItemLevel): a summary, the slot slices of the budget, and per stat the piece's value and, under sync, the
   ceiling (the same slot at the synced item level), each with a sentence and its arithmetic. */
export function pieceView(app, ilvl) {
  const job = app.jobCtx,
    p = app.piece,
    il = clampIlvl(ilvl ?? p.ilvl ?? MAX_REAL),
    t = p.slot,
    slotName = SLOT_LABEL[t].toLowerCase();
  const sync = shownSync(app),
    cap = sync?.cap ?? null;
  const status = !sync ? 'off' : il <= cap ? 'below' : 'above';

  // each line: the piece's value, and under sync its ceiling; a piece above the cap keeps the lower of the two
  const lines = [
    { stat: 'main', w: 100 },
    { stat: 'vit', w: 100 },
  ];
  p.subs.forEach((s, i) => {
    if (s && (s !== 'spec' || job.profile.spec)) lines.push({ stat: s, w: SUB_WEIGHTS[i], sub: true });
  });
  const rows = lines.map(({ stat, w, sub }) => {
    const d = statDerivation(job, stat, il, t, w);
    const c = sync ? capDerivation(job, stat, cap, t) : null;
    const raw = d.value,
      syn = status === 'above' ? Math.min(raw, c.value) : raw;
    return {
      stat,
      w,
      sub: !!sub,
      label: job.label[stat],
      raw,
      syn,
      lost: raw - syn,
      ownText: ownSentence(d.steps, il, job.label.main),
      ownFormula: formulaText(d.steps),
      cap: c?.value ?? null,
      capText: c ? capSentence(c, cap, sub ? w : null, job.label.main) : '',
      capFormula: c ? capFormulaText(c) : '',
      // the number the duty keeps: the piece's own, unless it is above the cap and over its ceiling
      ownKept: status !== 'above' || raw <= c.value,
    };
  });

  // the summary: what sync does to the piece's substats
  const subs = rows.filter(r => r.sub);
  const subRaw = subs.reduce((a, r) => a + r.raw, 0),
    subKept = subs.reduce((a, r) => a + r.syn, 0);
  const most = subs.reduce((a, r) => (r.lost > (a?.lost ?? 0) ? r : a), null);
  let summary;
  if (status === 'off') summary = `No sync applies: these are the ${slotName}'s stats as they are.`;
  else if (status === 'below')
    summary = `At item level ${il} this ${slotName} is at or below the cap (${cap}): sync leaves every stat as it is.`;
  else if (!most) summary = `Synced to ${cap}, this item level ${il} ${slotName} keeps all ${subRaw} of its substat points.`;
  else
    summary = `Synced to ${cap}, this item level ${il} ${slotName} keeps ${subKept} of its ${subRaw} substat points. ${most.label}, its ${most.w}% stat, loses the most (−${most.lost}).`;

  return {
    il,
    rows,
    lost: rows.reduce((a, r) => a + r.lost, 0),
    cap,
    byLevel: !!sync?.byLevel,
    level: sync?.level ?? null,
    status,
    summary,
    slotName,
    slotShare: isOffhand(t) ? null : sharePct(job.slotPct[t]),
    slices: budgetSlices(job, t),
    // sync cuts the 70% line to the full-share cap, so it ends up level with the first (math.md section 5)
    evenSubs: status === 'above' && rows.some(r => r.w === SUB_WEIGHTS[1] && r.syn === r.cap),
    // the fixed Direct Hit line exists only on older Mind gear
    healerNote: job.profile.main === 'mind',
  };
}

/* Piece stats substat ranks after choosing `value` (or '' for none) at rank `i`: the shared rule of ranked dropdowns
   (views/ranks.js withRank), on two ranks. Rank 1 is never empty; rank 2 may be. */
export function withSub(subs, i, value, substats) {
  const two = subs.slice(0, 2);
  while (two.length < 2) two.push(null);
  return withRank(two, i, value, substats);
}
