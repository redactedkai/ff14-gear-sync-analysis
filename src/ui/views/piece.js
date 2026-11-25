/* Piece stats: how one piece's stats come from its item level, line by line, and what sync does to them.
   Pure view builder: no Alpine import, so Node can load and test it. */
import { ACCESSORIES_LABEL, ACCESSORY_SLOTS, JOBS, SLOT_LABEL, SUB_WEIGHTS } from '../../core/constants.js';
import { makeJobContext } from '../../core/job-context.js';
import { capDerivation, clampIlvl, isOffhand, statDerivation } from '../../core/formulas.js';
import { MAX_REAL } from '../../core/tables.js';
import { statEffectKinds } from '../../core/tiers.js';
import { shownSync } from '../job-sync-panel.js';
import { withRank } from '../ranks.js';

/* The Slot menu's choices for `job` (a JobContext): the job's slots that share a budget share, each group one choice, in
   slot order: [{value (the group's first slot, what the piece's slot is set to), label ("Head / Hands / Feet"; "Accessories" for the four accessories), slots}].
   Slots with the same share get the same stats at every item level, so one choice stands for the group (two-handed:
   Weapon; Head, Hands, Feet; Body, Legs; the four accessories; a job with a shield (weaponMode '1h+oh' or 'mixed') has the one-handed
   Weapon and the Off-hand apart). */
export function slotGroups(job) {
  const groups = new Map(); // share (per mille) -> slots
  for (const type of job.activeSlotTypes) {
    const share = job.slotPct[type];
    groups.set(share, [...(groups.get(share) ?? []), type]);
  }
  // the four accessories take one short name, so the Slot menu stays narrow
  const labelOf = slots => (slots.join() === ACCESSORY_SLOTS.join() ? ACCESSORIES_LABEL : slots.map(t => SLOT_LABEL[t]).join(' / '));
  return [...groups.values()].map(slots => ({ value: slots[0], label: labelOf(slots), slots }));
}

/* A slot share in per mille as a percent: one decimal shows it exactly (85 ‰ = 8.5%). */
const sharePct = perMille => `${perMille / 10}%`;

/* "base × 8.5% = 26.4 → 26; × 70% = 18.2 → 18": a stat's derivation (statDerivation's steps). */
function formulaText(steps) {
  return steps
    .map(s => {
      if (s.kind === 'offhand') {
        return `two-handed ${s.two} − one-handed ${s.one} = ${s.value}`;
      }
      if (s.kind === 'slot') {
        return `${s.base} × ${sharePct(s.pct)} = ${s.exact.toFixed(1)} → ${s.value}`;
      }
      if (s.kind === 'factor') {
        return `× ${s.factor} = ${s.exact.toFixed(1)} → ${s.value}`;
      }
      return `× ${s.weight}% = ${s.exact.toFixed(1)} → ${s.value}`;
    })
    .join('; ');
}

/* "363 × 8.5% = 30.8 → 31", or with a stat factor "414 × 90% = 372; × 8.5% = 31.6 → 32": a cap's derivation
   (capDerivation), in the order the cap is computed. */
function capFormulaText(d) {
  if (d.offhand) {
    return `two-handed ${d.offhand.two} − one-handed ${d.offhand.one} = ${d.value}`;
  }
  const head = d.factorPct !== 100 ? `${d.base} × ${d.factorPct}% = ${d.afterFactor}; × ` : `${d.base} × `;
  return `${head}${sharePct(d.pct)} = ${d.exact.toFixed(1)} → ${d.value}`;
}

/* One sentence for where a stat's value on the piece comes from (statDerivation's steps); `main`: the job's main stat
   name, for the Vitality factor. */
function ownSentence(steps, il, main) {
  const first = steps[0];
  if (first.kind === 'offhand') {
    return `The two-handed weapon's ${first.two} minus the one-handed weapon's ${first.one}.`;
  }
  let text = `${sharePct(first.pct)} of the item level ${il} budget (${first.base})`;
  for (const s of steps.slice(1)) {
    if (s.kind === 'factor') {
      text += `, then ${Math.round(s.factor * 100)}% on ${main} gear`;
    }
    if (s.kind === 'share') {
      text += `, then ${s.weight}% for the 2nd substat`;
    }
  }
  return `${text}.`;
}

/* One sentence for where a stat's ceiling comes from (capDerivation), worded like
   ownSentence's; `main`: the job's main stat name. */
function capSentence(d, cap, main) {
  if (d.offhand) {
    return `Most allowed: the two-handed ceiling ${d.offhand.two} minus the one-handed ceiling ${d.offhand.one}.`;
  }
  let text = `Most allowed: ${sharePct(d.pct)} of the item level ${cap} budget (${d.base})`;
  if (d.factorPct !== 100) {
    text += `, with ${d.factorPct}% on ${main} gear`;
  }
  return `${text}.`;
}

/* Every text the Slot menu can show, one per line: the slot groups of all the jobs. The menu is as wide as the longest and
   never changes with the job or the pick (the .sizertext of a select, as the substat menus), whatever the font. */
export const SLOT_SIZER = [...new Set(JOBS.flatMap(job => slotGroups(makeJobContext(job.id)).map(group => group.label)))].join('\n');

/* The slots of a full set as slices of one budget, in per mille: the job's slots with both rings (they add up to the
   whole budget, 1,000), the slots that share `slot`'s share marked (the Slot menu's group: Head, Hands and Feet).
   [{label, width, on}] */
function budgetSlices(job, slot) {
  return [...job.activeSlotTypes, 'ring'].map(t => ({
    label: SLOT_LABEL[t],
    width: job.slotPct[t],
    share: sharePct(job.slotPct[t]),
    on: job.slotPct[t] === job.slotPct[slot],
  }));
}

/* The step-by-step section of Piece stats for `job` (a JobContext) under `sync` ({cap, sync, level}: ui/job-sync-panel.js
   syncSettings), for Piece stats' piece (`piece`: {ilvl, slot, subs}, the store's `piece`) at item level `ilvl` (the
   explainer's chosen one, explainerItemLevel; null: the piece's own, else the highest): a summary, the slot slices of
   the budget, and per stat the piece's value and, under sync, the ceiling (the same slot at the synced item level),
   each with a sentence and its arithmetic. */
export function pieceView(job, sync, piece, ilvl) {
  const p = piece,
    il = clampIlvl(ilvl ?? p.ilvl ?? MAX_REAL),
    t = p.slot,
    slotName = SLOT_LABEL[t].toLowerCase();
  const shown = shownSync(job, sync),
    cap = shown?.cap ?? null;
  let status = 'off';
  if (shown) {
    status = il <= cap ? 'below' : 'above';
  }

  // each line: the piece's value, and under sync its ceiling; a piece above the cap keeps the lower of the two
  const lines = [
    { stat: job.mainKey, w: 100 },
    { stat: 'vit', w: 100 },
  ];
  p.subs.forEach((s, i) => {
    if (s && job.substats.includes(s)) {
      lines.push({ stat: s, w: SUB_WEIGHTS[i], sub: true });
    }
  });
  const rows = lines.map(({ stat, w, sub }) => {
    const d = statDerivation(job, stat, il, t, w);
    const c = shown ? capDerivation(job, stat, cap, t) : null;
    const raw = d.value,
      syn = status === 'above' ? Math.min(raw, c.value) : raw;
    return {
      stat,
      w,
      sub: Boolean(sub),
      label: job.label[stat],
      raw,
      syn,
      lost: raw - syn,
      ownText: ownSentence(d.steps, il, job.label[job.mainKey]),
      ownFormula: formulaText(d.steps),
      cap: c?.value ?? null,
      capText: c ? capSentence(c, cap, job.label[job.mainKey]) : '',
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
  if (status === 'off') {
    summary = `No sync applies: these are the ${slotName}'s stats as they are.`;
  } else if (status === 'below') {
    summary = `At item level ${il} this ${slotName} is at or below the cap (${cap}): sync leaves every stat as it is.`;
  } else if (!most) {
    summary = `Synced to ${cap}, this item level ${il} ${slotName} keeps all ${subRaw} of its substat points.`;
  } else {
    summary = `Synced to ${cap}, this item level ${il} ${slotName} keeps ${subKept} of its ${subRaw} substat points. ${most.label}, its ${most.w}% stat, loses the most (−${most.lost}).`;
  }

  return {
    il,
    rows,
    lost: rows.reduce((a, r) => a + r.lost, 0),
    cap,
    byLevel: Boolean(shown?.byLevel),
    level: shown?.level ?? null,
    status,
    summary,
    slotName,
    slotShare: isOffhand(t) ? null : sharePct(job.slotPct[t]),
    // the sentences and headings of the section: the level sync line, where the slot's share comes from, the rule under
    // sync, and the two value columns' headings
    byLevelText: shown?.byLevel
      ? `Level sync: at level ${shown.level}, gear with a higher equip level is synced to item level ${cap}, used as the cap here.`
      : '',
    shareText: isOffhand(t)
      ? 'An off-hand is the two-handed weapon’s value minus the one-handed weapon’s'
      : `The ${slotName} takes ${sharePct(job.slotPct[t])}`,
    ruleText: `either this ${slotName}'s own value or the ceiling at the synced item level.`,
    ownHead: `This ${slotName} (item level ${il})`,
    capHead: `The ceiling at item level ${cap}`,
    slices: budgetSlices(job, t),
    // sync cuts the 70% line to the full-share cap, so it ends up level with the first (math.md section 5)
    evenSubs: status === 'above' && rows.some(r => r.w === SUB_WEIGHTS[1] && r.syn === r.cap),
    // the fixed Direct Hit line exists only on older healer gear: the jobs whose special substat (Piety) gives MP
    healerNote: statEffectKinds(job.specKey).includes('mp'),
  };
}

/* Piece stats substat ranks after choosing `value` (or '' for none) at rank `i`: the shared rule of ranked dropdowns
   (ui/ranks.js withRank), on two ranks. Rank 1 is never empty; rank 2 may be. */
export function withSub(subs, i, value, substats) {
  const two = subs.slice(0, 2);
  while (two.length < 2) {
    two.push(null);
  }
  return withRank(two, i, value, substats);
}
