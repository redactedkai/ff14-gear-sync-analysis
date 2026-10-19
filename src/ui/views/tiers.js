/* How the math works, Substat tiers: every substat of the job as a card of tiers (a ladder), each around its value, the
   value's tier on the middle row unless it is near the base or the last tier (core/tiers.js tierLadder). Values are
   character panel numbers: each starts at the substat's base (tierValues), and the user types or clicks others. The
   tiers follow the job and the sub-tab's own level (the synced level until the user types another); item level sync
   does not change them. The view object is built here; the template only shows it. */
import { tierLadder, tierSizes } from '../../core/tiers.js';
import { hasteFor } from '../../core/speed.js';
import { statBase } from '../../core/food.js';
import { MAX_SPEED } from '../../core/tables.js';
import { fmtInt } from '../helpers.js';

/* Tiers shown either side of each value's tier (15 rows; there is no More tiers button: owner, 2026-10-19). */
export const TIER_NEAR = 7;
/* The highest value a box takes: far above any real total (a few thousand), and inside the speed search (speed.js). */
export const TIER_VALUE_MAX = 99999;

/* Each effect kind's column name; the header line under a substat's name uses the same words ("+58.7% on crit"). */
const COLUMN = { rate: 'Rate', onCrit: 'On crit', dmgHeal: 'Dmg & heal', dmgTaken: 'Dmg taken', gcd: 'GCD', mp: 'MP' };
const lineWord = kind => (kind === 'gcd' || kind === 'mp' ? COLUMN[kind] : COLUMN[kind].toLowerCase());

/* What each substat does, for its ? note (AkhMorning, checked 2026-10-17; a direct hit adds 25% damage). Keyed by the
   neutral stat, with spec split by what the job's special substat does (JobContext.specKind). */
const AFFECTS = {
  crit: 'Raises the chance of a critical hit (Rate) and how much a critical hit adds (On crit), for damage and healing. On crit is always the rate + 35%.',
  det: 'Raises all damage and healing done (Dmg & heal). Heals received are not affected.',
  dh: 'Raises the chance of a direct hit (Rate), which adds 25% damage. Damage only, not healing.',
  spd: 'Shortens the GCD (the recast of weaponskills and spells) in 0.01 s steps. Points between two steps still add a little to damage and healing over time and to auto-attacks.',
  spec: {
    mp: 'Raises the MP regained every 3 seconds (MP).',
    mitigation: 'Tanks only. Raises damage and healing done (Dmg & heal) and lowers damage taken (Dmg taken).',
  },
};

/* "13 or 14", "85, 86, 128 or 129" */
const sizeList = sizes => (sizes.length === 1 ? String(sizes[0]) : `${sizes.slice(0, -1).join(', ')} or ${sizes.at(-1)}`);

/* The sub-tab's level: `typed` (a level typed into its box, or null) held to 1 and the job's level cap, else the synced
   level. */
export function tierLevel(app, typed) {
  if (typed == null) return app.level;
  return Math.max(1, Math.min(app.jobCtx.maxLevel, typed));
}

/* Each substat's starting value at `level`: its base there, {stat: value}. */
export function tierValues(app, level = app.level) {
  const job = app.jobCtx;
  return Object.fromEntries(job.substats.map(s => [s, statBase(job, s, level)]));
}

/* A value typed into a substat's box, held to the base at `level` and the most it can be there, with no note (the box
   shows the value kept: owner, 2026-10-19); null for text that is not a number. The most: for speed, the most total
   speed any job can have at the level (MAX_SPEED, as the GCD tab's slider); for the others, TIER_VALUE_MAX. */
export function tierInput(app, stat, text, level = app.level) {
  const v = Math.round(Number(text));
  if (text === '' || !Number.isFinite(v)) return null;
  const most = stat === 'spd' ? MAX_SPEED[level - 1] : TIER_VALUE_MAX;
  return Math.max(statBase(app.jobCtx, stat, level), Math.min(most, v));
}

/* The ? note of a substat: {title, affects, size}. */
function helpOf(job, stat, level, haste) {
  const affects = stat === 'spec' ? AFFECTS.spec[job.specKind] : AFFECTS[stat];
  let size;
  if (stat === 'spec' && job.specKind === 'mitigation')
    size = `At level ${level}, Dmg & heal steps every ${sizeList(tierSizes(job, stat, level, 0, 'dmgHeal'))} points and Dmg taken every ${sizeList(tierSizes(job, stat, level, 0, 'dmgTaken'))}.`;
  else
    size = `At level ${level}, each ${stat === 'spd' ? '0.01 s step' : 'tier'} is ${sizeList(tierSizes(job, stat, level, haste))} points.`;
  return { title: job.label[stat], affects, size };
}

/* The Tiers view at `level` for `values` ({stat: panel value}), or null with no job: {level, cards}, one card per
   substat, each its own small table (owner, 2026-10-19: a table across all substats read as one row of stats, with
   empty space between a From column and its effects). A card: {stat, label, value, lines (the effect lines under its
   box), haste (speed's: the job's haste at the level, "with Fuka 10%", else ''), help, names (its column names),
   rows, foot: {spare, toNext}}. rows: [[{text, eff, mark, cur, to, title}]], From first; cur: the value's tier (the
   middle row unless the value is near the base or the last tier: tierLadder); mark: with two effects, the one that
   changes at the tier; to: 'stat:start' to set the value by a click. */
export function tiersView(app, values, level = app.level) {
  if (!app.job) return null;
  const job = app.jobCtx;
  const haste = hasteFor(job.jobId, level);
  const cards = job.substats.map(stat => {
    // 1. the substat's tiers around its value
    const value = values[stat] ?? statBase(job, stat, level);
    const ladder = tierLadder(job, stat, level, value, TIER_NEAR, haste?.pct ?? 0);

    // 2. one row per tier, the value's tier highlighted
    const rows = ladder.rows.map((t, i) => {
      const to = `${stat}:${t.start}`,
        title = `Set ${job.label[stat]} to ${t.start}`,
        cur = i === ladder.cur;
      const some = ladder.kinds.length > 1 && !t.changed.every(Boolean);
      return [
        { text: fmtInt(t.start), eff: false, mark: false, cur, to, title },
        ...t.values.map((text, k) => ({ text, eff: true, mark: some && t.changed[k], cur, to, title })),
      ];
    });

    // 3. the header, the column names and the footer
    return {
      stat,
      label: job.label[stat],
      value,
      lines: ladder.kinds.map((kind, k) => `${ladder.rows[ladder.cur].values[k]} ${lineWord(kind)}`),
      haste: stat === 'spd' && haste ? `with ${haste.name} ${haste.pct}%` : '',
      help: helpOf(job, stat, level, haste?.pct ?? 0),
      names: ['From', ...ladder.kinds.map(kind => COLUMN[kind])],
      rows,
      foot: { spare: fmtInt(ladder.spare), toNext: ladder.toNext == null ? null : fmtInt(ladder.toNext) },
    };
  });
  return { level, cards };
}
