/* How the math works, Substat tiers: every substat of the job as a column group of tiers (a ladder), each around its value, the
   value's tier on the middle row (core/tiers.js tierLadder). Values are character panel numbers (base + gear, and food
   when the optimizer result counts it). The tiers follow the job and the synced level; item level sync does not change
   them. The view object is built here; the template only shows it. */
import { tierLadder, tierSizes } from '../../core/tiers.js';
import { hasteFor } from '../../core/speed.js';
import { statBase } from '../../core/food.js';
import { fmtInt } from '../helpers.js';
import { optimizerKey } from './optimizer.js';

/* Tiers shown either side of each value's tier: the default, and with More tiers. */
export const TIER_NEAR = 3;
export const TIER_NEAR_MORE = 7;
/* The highest value a box takes: far above any real total (a few thousand), and inside the speed search (speed.js). */
export const TIER_VALUE_MAX = 99999;

/* Each effect kind's column name; the header line under a substat's name uses the same words ("+58.7% on crit"). */
const COLUMN = { rate: 'Rate', onCrit: 'On crit', dmgHeal: 'Dmg & heal', dmgTaken: 'Dmg taken', gcd: 'GCD', mp: 'MP' };
const lineWord = kind => (kind === 'gcd' || kind === 'mp' ? COLUMN[kind] : COLUMN[kind].toLowerCase());

/* What each substat does, for its ? note (AkhMorning, checked 2026-10-17; a direct hit adds 25% damage). Keyed by the
   neutral stat, with spec split into the job's special substat. */
const AFFECTS = {
  crit: 'Raises the chance of a critical hit (Rate) and how much a critical hit adds (On crit), for damage and healing. On crit is always the rate + 35%.',
  det: 'Raises all damage and healing done (Dmg & heal). Heals received are not affected.',
  dh: 'Raises the chance of a direct hit (Rate), which adds 25% damage. Damage only, not healing.',
  spd: 'Shortens the GCD (the recast of weaponskills and spells) in 0.01 s steps. Points between two steps still add a little to damage and healing over time and to auto-attacks.',
  piety: 'Raises the MP regained every 3 seconds (MP).',
  ten: 'Tanks only. Raises damage and healing done (Dmg & heal) and lowers damage taken (Dmg taken).',
};

/* "13 or 14", "85, 86, 128 or 129" */
const sizeList = sizes => (sizes.length === 1 ? String(sizes[0]) : `${sizes.slice(0, -1).join(', ')} or ${sizes.at(-1)}`);

/* The optimizer result's substat values ({stat: value}) when it was solved for the current settings, else null. */
export function tierFill(app) {
  const p = app.optPanel;
  return p && p.key === optimizerKey(app) ? p.values : null;
}

/* Each substat's starting value: the optimizer result's (tierFill), else the substat's base. {stat: value} */
export function tierValues(app) {
  const job = app.jobCtx,
    fill = tierFill(app);
  return Object.fromEntries(job.substats.map(s => [s, fill?.[s] ?? statBase(job, s, app.level)]));
}

/* A value typed into a substat's box: {value, note}, held to the base and TIER_VALUE_MAX with a note saying so; null
   for text that is not a number. */
export function tierInput(app, stat, text) {
  const v = Math.round(Number(text));
  if (text === '' || !Number.isFinite(v)) return null;
  const base = statBase(app.jobCtx, stat, app.level);
  if (v < base) return { value: base, note: `Under the base of ${fmtInt(base)}; shown at ${fmtInt(base)}.` };
  if (v > TIER_VALUE_MAX) return { value: TIER_VALUE_MAX, note: `Shown at ${fmtInt(TIER_VALUE_MAX)}.` };
  return { value: v, note: '' };
}

/* The ? note of a substat: {title, affects, size}. */
function helpOf(job, stat, level, haste) {
  const key = stat === 'spec' ? job.profile.spec : stat;
  let size;
  if (key === 'ten')
    size = `At level ${level}, Dmg & heal steps every ${sizeList(tierSizes(job, stat, level, 0, 'dmgHeal'))} points and Dmg taken every ${sizeList(tierSizes(job, stat, level, 0, 'dmgTaken'))}.`;
  else
    size = `At level ${level}, each ${key === 'spd' ? '0.01 s step' : 'tier'} is ${sizeList(tierSizes(job, stat, level, haste))} points.`;
  return { title: job.label[stat], affects: AFFECTS[key], size };
}

/* The Tiers view for `values` ({stat: panel value}), `notes` ({stat: text} under a box) and `more` (More tiers), or null
   with no job. Shape, in the table's order:
   - title; cols: [{first}] one per table column after the row labels (first: a substat's From column);
   - groups: one per substat {stat, label, span (its columns), value, lines (header effect lines), note, help};
   - names: [{text, first}] the column names; rows: [{label, cur, cells: [{text, first, eff, mark, to, title}]}], cells
     empty ({text: ''}) where a substat has no tier; to: 'stat:start' to set the value by a click;
   - foot: [{span, spare, toNext}]; haste: "Greased Lightning (20% haste)" or ''. */
export function tiersView(app, values, notes, more) {
  if (!app.job) return null;
  const job = app.jobCtx,
    level = app.level;
  const near = more ? TIER_NEAR_MORE : TIER_NEAR;
  const haste = hasteFor(job.jobId, level);

  // 1. each substat's tiers around its value
  const ladders = job.substats.map(stat => {
    const value = values[stat] ?? statBase(job, stat, level);
    return { stat, value, ladder: tierLadder(job, stat, level, value, near, haste?.pct ?? 0) };
  });

  // 2. the header: names, boxes, the effect lines in the column names' words, the ? notes
  const groups = ladders.map(({ stat, value, ladder }) => ({
    stat,
    label: job.label[stat],
    span: 1 + ladder.kinds.length,
    value,
    lines: ladder.kinds.map((kind, k) => `${ladder.rows[near].values[k]} ${lineWord(kind)}`),
    note: notes[stat] || '',
    help: helpOf(job, stat, level, haste?.pct ?? 0),
  }));
  const cols = ladders.flatMap(({ ladder }) => [{ first: true }, ...ladder.kinds.map(() => ({ first: false }))]);
  const names = ladders.flatMap(({ ladder }) => [
    { text: 'From', first: true },
    ...ladder.kinds.map(kind => ({ text: COLUMN[kind], first: false })),
  ]);

  // 3. one row per offset from the values' tiers; with two effects, the one that changes at a tier is marked
  const rows = [];
  for (let i = 0; i < 2 * near + 1; i++) {
    const off = i - near;
    const cells = ladders.flatMap(({ stat, ladder }) => {
      const t = ladder.rows[i];
      if (!t) return [{ text: '', first: true }, ...ladder.kinds.map(() => ({ text: '', first: false }))];
      const to = `${stat}:${t.start}`,
        title = `Set ${job.label[stat]} to ${t.start}`;
      const some = ladder.kinds.length > 1 && !t.changed.every(Boolean);
      return [
        { text: fmtInt(t.start), first: true, eff: false, mark: false, to, title },
        ...t.values.map((text, k) => ({ text, first: false, eff: true, mark: some && t.changed[k], to, title })),
      ];
    });
    rows.push({ label: off === 0 ? 'Current' : `${off < 0 ? '−' : '+'}${Math.abs(off)}`, cur: off === 0, cells });
  }

  // 4. the footer: spare and to next per substat
  const foot = ladders.map(({ ladder }) => ({
    span: 1 + ladder.kinds.length,
    spare: fmtInt(ladder.spare),
    toNext: ladder.toNext == null ? null : fmtInt(ladder.toNext),
  }));

  return {
    title: `${job.jobName} substat tiers at level ${level}`,
    cols,
    groups,
    names,
    rows,
    foot,
    haste: haste ? `${haste.name} (${haste.pct}% haste)` : '',
  };
}
