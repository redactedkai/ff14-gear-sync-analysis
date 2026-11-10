/* A saved gear set's numbers, as a sheet shows them: the evaluation under the sheet's settings, the table's Total, Tier and
   Defense rows, the header's figures (main stat, GCD, Critical Hit, ...) and the delta lines between two sets' figures.
   Every builder takes plain data (a saved Sheet and GearSet: docs/engineering/sheets.md, "Saved data") and returns a
   plain view object; the template only displays it. Pure: no Alpine, no store.
   The numbers are the character panel's (docs/mechanics/math.md): every stat is the gear's points plus the character's own
   base (statBase), with the meal's bonus when the set has one. */
import { makeJobContext } from '../../core/job-context.js';
import { evaluateSet, makeSet } from '../../core/set.js';
import { tierLadder } from '../../core/tiers.js';
import { fmtInt, plural } from '../helpers.js';
import { syncSettings } from '../settings.js';
import { isUsed } from './saved-set.js';

/* The header's figures in order, by figure id. A stat figure's label is the job's short name for the stat (job.short);
   `main` and `spec` are the figures of the job's main stat (job.mainKey) and special substat (job.specKey, a figure only
   a job that has one shows); the other ids are stat keys. `gcd`, `critDmg` and `dot` are derived (the GCD, Critical
   Hit's second effect, the DoT/HoT bonus of the speed). */
const FIGURES = ['main', 'gcd', 'crit', 'critDmg', 'det', 'dh', 'spec', 'dot'];
const FIGURE_LABEL = { gcd: 'GCD', critDmg: 'Crit dmg', dot: 'DoT' };
/* The GCD figure's label for a job with an always-on haste (HASTE in core/constants.js): its text is the hasted GCD, and
   `shown` adds the GCD without the haste in front of it. */
const HASTE_GCD_LABEL = 'GCD (with Haste)';
/* The job's stat behind a figure id: the stat key for a stat figure, null for a derived one or a job without it. */
function figureStat(job, id) {
  if (id === 'main') return job.mainKey;
  if (id === 'spec') return job.specKey;
  return job.stats.includes(id) ? id : null;
}

/* A gear set evaluated under its sheet's job, level and item level sync: {job (JobContext), level, sync (core's sync
   settings), evaluated (core/set.js evaluateSet)}. The rows of `gearSet.pieces` a job does not use (the off-hand of a
   two-handed job) keep their piece in the saved set but are not counted, so they are emptied here; the evaluation's rows
   keep the saved set's row numbers. */
export function evaluateInSheet(sheet, gearSet) {
  const job = makeJobContext(sheet.job);
  const level = Math.min(sheet.level, job.maxLevel);
  const sync = syncSettings({ cap: sheet.sync.cap, sync: sheet.sync.on, level });
  const pieces = gearSet.pieces.map(piece => (isUsed(job, piece) ? piece : { slot: piece.slot }));
  return { job, level, sync, evaluated: evaluateSet(job, makeSet(pieces, gearSet.meal ?? null), sync, level) };
}

/* The Tier row's cells, one per stat in job.stats order: {effect, spare, toNext, text ("3 · +16"; "0 · –" at the last
   tier), zero}, or null for a stat without tiers. spare is the points above the tier's start, toNext the points to the
   next tier. */
function tierCells(evaluated) {
  return evaluated.tiers.map(
    tier =>
      tier && {
        effect: tier.effect,
        spare: tier.spare,
        toNext: tier.toNext,
        text: `${tier.spare} · ${tier.toNext == null ? '–' : `+${tier.toNext}`}`,
        zero: tier.zero,
      },
  );
}

/* The Defense row: {phys, mag}, each {label, value, valueText ("3,456"), pctText ("−12% damage")}; the share of damage a
   defense removes is whole percent at the sheet's level (shown only, never ranked). */
function defenseRow(evaluated) {
  const d = evaluated.defense;
  return {
    phys: { label: 'Physical', value: d.phys, valueText: fmtInt(d.phys), pctText: `−${d.physPct}% damage` },
    mag: { label: 'Magic', value: d.mag, valueText: fmtInt(d.mag), pctText: `−${d.magPct}% damage` },
  };
}

/* The Total row's cells for panel numbers `values` (a stat map): one per stat in job.stats order, {stat, header (the
   job's short name), value}. */
function totalCells(job, values) {
  return job.stats.map(stat => ({ stat, header: job.short[stat], value: values[stat] }));
}

/* The table's Total, Tier and Defense rows for a set evaluated by evaluateInSheet (`context`):
   - total: {hasMeal, cells, withoutMeal}. cells are the Total row, counting the meal when the set has one (the character
     panel's numbers: gear + meal + the character's base); withoutMeal the gear alone on the same base, for a reader who
     wants the meal's part. emptyCount: used rows with no piece and no covering piece, and emptyText ("2 slots empty",
     '' for none);
   - tier: {caption: "spare · to next tier", cells} (tierCells), counting the meal;
   - defense: defenseRow. */
export function setTotalsView(context) {
  const { job, evaluated } = context;
  const base = evaluated.base;
  const add = gear => Object.fromEntries(job.stats.map(s => [s, gear[s] + base[s]]));
  const used = evaluated.rows.filter(row => isUsed(job, row));
  const emptyCount = used.filter(row => !row.item && !row.blockedBy).length;
  return {
    total: {
      label: 'Stat Total',
      hasMeal: !!evaluated.meal,
      cells: totalCells(job, add(evaluated.withFood)),
      withoutMeal: totalCells(job, add(evaluated.gear)),
      emptyCount,
      emptyText: emptyCount ? `${plural(emptyCount, 'slot')} empty` : '',
    },
    tier: { label: 'Tier', caption: 'spare · to next tier', cells: tierCells(evaluated) },
    defense: { label: 'Defense', ...defenseRow(evaluated) },
  };
}

/* The header's figures for a set evaluated by evaluateInSheet (`context`), as texts the way the character panel's
   effects read: [{key, label, text}] in FIGURES order, "MND 6,406"-style numbers for the main stat, the GCD ("2.48s"),
   Critical Hit rate ("19.3%"), its Crit dmg ("+54.3%"), Determination, Direct Hit, the special substat (a job without
   one has no such figure), and the DoT/HoT bonus ("+0.7%"). Tiers count the meal, as the Tier row does. A job with an
   always-on haste (Monk, Ninja, Samurai, Viper) has the label "GCD (with Haste)", its `text` the hasted GCD (the one the
   delta lines compare) and `shown` "2.49s (1.99s)": the GCD without the haste, then with it. */
export function setFigures(context) {
  const { job, level, evaluated } = context;
  const tierOf = stat => evaluated.tiers[job.stats.indexOf(stat)];
  const critPanel = evaluated.withFood.crit + evaluated.base.crit;
  const { mainKey, speedKey, specKey } = job;
  const text = {
    main: String(evaluated.withFood[mainKey] + evaluated.base[mainKey]),
    gcd: tierOf(speedKey)?.effect ?? `${evaluated.gcd.gcd.toFixed(2)}s`,
    crit: tierOf('crit').effect,
    critDmg: tierLadder(job, 'crit', level, critPanel, 0).rows[0].values[1],
    det: tierOf('det').effect,
    dh: tierOf('dh').effect,
    spec: specKey ? tierOf(specKey).effect : null,
    dot: `+${evaluated.gcd.dot.toFixed(1)}%`,
  };
  const hasted = !!evaluated.gcd.haste;
  return FIGURES.filter(key => text[key] != null).map(key => ({
    key,
    label: key === 'gcd' && hasted ? HASTE_GCD_LABEL : (FIGURE_LABEL[key] ?? job.short[figureStat(job, key)]),
    text: text[key],
    // what the page shows when it differs from `text` (the figure deltas are taken from `text`): "2.49s (1.99s)"
    ...(key === 'gcd' && hasted ? { shown: `${evaluated.gcd.unhasted.toFixed(2)}s (${text.gcd})` } : {}),
  }));
}

/* The widths of a row of figures (setFigures' list), for a CSS grid: one share per figure, a figure with a `shown` text
   (the GCD of a job with haste, "2.49s (1.99s)") gets 1.7 shares. */
export function figureColumns(figures) {
  return figures.map(figure => (figure.shown ? 'minmax(0, 1.7fr)' : 'minmax(0, 1fr)')).join(' ');
}

/* How a figure changed from `before` to `after` (texts as setFigures gives them): {text ("+1.7%", "−0.01s"), up}, or null
   when the two texts are the same. text is the signed difference with the figure's unit and as many decimals as the
   figures have; up is whether the number rose. */
export function figureChange(before, after) {
  if (before === after) return null;
  const number = t => Number.parseFloat(t.replace(/[^0-9.-]/g, ''));
  const decimals = t => (t.replace(/[^0-9.]/g, '').split('.')[1] || '').length;
  const diff = number(after) - number(before);
  const unit = after.includes('%') ? '%' : /s$/.test(after) ? 's' : '';
  const places = Math.max(decimals(before), decimals(after));
  return { text: `${diff < 0 ? '−' : '+'}${Math.abs(diff).toFixed(places)}${unit}`, up: diff > 0 };
}

/* The figures of `after` with each one's delta line against `before` (both setFigures lists): [{key, label, text,
   change}], change {text, up, good} or null. good is the colour's data (green better, red worse): a
   higher figure is good, except the GCD, where a lower one is. The template maps good to a class. */
export function figuresAgainst(before, after) {
  return after.map((figure, i) => {
    const change = figureChange(before[i].text, figure.text);
    return { ...figure, change: change && { ...change, good: figure.key === 'gcd' ? !change.up : change.up } };
  });
}
