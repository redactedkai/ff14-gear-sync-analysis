/* How the math works, Substat tiers: every substat of the job as a card of tiers (a ladder), every tier from the
   substat's base up to the most a box takes (core/tiers.ts tierLadder), each row the range of character panel values
   that give its effect. Values are character panel numbers: each starts at the substat's base (tierValues), and the
   user types or clicks others. The tiers follow the job and the sub-tab's own level (the synced level until the user
   types another); item level sync does not change them. The view object is built here; the template only shows it. */
import { clamp } from '../../core/clamp.ts';
import { rowIndexAt, tierLadder, tierSizes, statEffectKinds } from '../../core/tiers.ts';
import { hasteFor } from '../../core/speed.ts';
import { statBase } from '../../core/base-stats.ts';
import { levelParams } from '../../core/level-params.ts';
import { MAX_SPEED } from '../../core/tables.ts';
import { fmtInt } from '../text.ts';
import { commit } from '../number-commit.ts';
import { deepFreeze } from '../view-cache.ts';

/* The rows kept for the cards last shown, by the key of what they depend on (rowsOf): the job, substat and level change
   them, a value never does. Enough for the cards of a few jobs and levels. */
const ROWS_KEPT = 30;
const rowsKept = new Map();

/* Each effect kind's column name; the header line under a substat's name uses the same words ("+58.7% on crit"). */
const COLUMN = { rate: 'Rate', onCrit: 'On crit', dmgHeal: 'Dmg & heal', dmgTaken: 'Dmg taken', gcd: 'GCD', mp: 'MP' };
const lineWord = kind => (kind === 'gcd' || kind === 'mp' ? COLUMN[kind] : COLUMN[kind].toLowerCase());
/* The first column: the range of panel values a row covers. */
const POINTS_COLUMN = 'Points';

const SPEED_AFFECTS =
  'Shortens the GCD (the recast of weaponskills and spells) in 0.01 s steps. Points between two steps still add a little to damage and healing over time and to auto-attacks.';

/* What each substat does, for its ? note (AkhMorning, checked 2026-10-17; a direct hit adds 25% damage). Keyed by the
   stat key. */
const AFFECTS = {
  crit: 'Raises the chance of a critical hit (Rate) and how much a critical hit adds (On crit), for damage and healing. On crit is always the rate + 35%.',
  det: 'Raises all damage and healing done (Dmg & heal). Heals received are not affected.',
  dh: 'Raises the chance of a direct hit (Rate), which adds 25% damage. Damage only, not healing.',
  sks: SPEED_AFFECTS,
  sps: SPEED_AFFECTS,
  piety: 'Raises the MP regained every 3 seconds (MP).',
  ten: 'Tanks only. Raises damage and healing done (Dmg & heal) and lowers damage taken (Dmg taken).',
};

/* "13 or 14", "85, 86, 128 or 129" */
const sizeList = sizes => (sizes.length === 1 ? String(sizes[0]) : `${sizes.slice(0, -1).join(', ')} or ${sizes.at(-1)}`);

/* The sub-tab's level for `job` (a JobContext): `typed` (a level typed into its box, or null) held to 1 and the job's
   level cap, else `syncedLevel` (the job's level cap: Substat tiers has no synced level of its own). */
export function tierLevel(job, syncedLevel, typed) {
  if (typed == null) {
    return syncedLevel;
  }
  return clamp(typed, 1, job.maxLevel);
}

/* Each of `job`'s substats' starting value at `level`: its base there, {stat: value}. */
export function tierValues(job, level) {
  return Object.fromEntries(job.substats.map(s => [s, statBase(job, s, level)]));
}

/* The highest panel value of a substat at `level`: its base plus the most gear points any job can have of one stat
   there (MAX_SPEED, the most total speed, less the base speed; a guess for the other substats, which draw on the same
   pieces and melds). The ladder ends at it and so does the box. */
function tierMost(job, stat, level) {
  return statBase(job, stat, level) + MAX_SPEED[level - 1] - levelParams(level).sub;
}

/* A value typed into a substat's box, held to the base at `level` and the most it can be there (tierMost), with no note
   (the box shows the value kept: owner); null for text that is not a number. */
export function tierInput(job, stat, text, level) {
  const result = commit(text, { min: statBase(job, stat, level), max: tierMost(job, stat, level), final: true });
  return result ? result.value : null;
}

/* The values typed or clicked on Substat tiers, with the settings they were made under: {key (tierEditsKey), values
   ({stat: panel value})}. Values made under other settings no longer apply: going back to the old job or level starts from the
   bases again. */
export const NO_TIER_EDITS = Object.freeze({ key: '', values: Object.freeze({}) });

/* The settings the values were made under: the job and the level the sub-tab uses (`job` a JobContext). */
export function tierEditsKey(job, level) {
  return JSON.stringify([job.jobId, level]);
}

/* `kept` (a NO_TIER_EDITS shape) if it was made under `key`, else none. */
export function tierEditsKept(kept, key) {
  return kept.key === key ? kept : NO_TIER_EDITS;
}

/* `kept` with `value` set for `stat` under `key`, dropping values made under other settings. */
export function tierEdited(kept, key, stat, value) {
  return { key, values: { ...tierEditsKept(kept, key).values, [stat]: value } };
}

/* The substat and the value a clicked row sets: a row's `to` ('stat:start', see tiersView) as {stat, value}. */
export function tierPicked(to) {
  const [stat, start] = to.split(':');
  return { stat, value: Number(start) };
}

/* The ? note of a substat: {title, affects, size}. */
function helpOf(job, stat, level, haste) {
  const affects = AFFECTS[stat];
  let size;
  // a stat with two effects that step apart (Tenacity) gives each its own size
  if (statEffectKinds(stat).includes('dmgTaken')) {
    size = `At level ${level}, Dmg & heal steps every ${sizeList(tierSizes(job, stat, level, 0, 'dmgHeal'))} points and Dmg taken every ${sizeList(tierSizes(job, stat, level, 0, 'dmgTaken'))}.`;
  } else {
    size = `At level ${level}, each ${stat === job.speedKey ? '0.01 s step' : 'tier'} is ${sizeList(tierSizes(job, stat, level, haste))} points.`;
  }
  return { title: job.label[stat], affects, size };
}

/* A row's range of panel values: "341–342" for a tier from 341 up to 342, "343" for one value, "365+" for the last
   tier. `next` is the first value of the tier after it, null for the last. */
function rangeText(start, next) {
  if (next == null) {
    return `${fmtInt(start)}+`;
  }
  return next - start === 1 ? fmtInt(start) : `${fmtInt(start)}–${fmtInt(next - 1)}`;
}

/* `text` safe inside HTML (the column names hold "&"). */
const escapeHtml = text => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

/* A card's table without its rows, as HTML: the column names inside an empty row group the page draws the rows in
   (elements/math-page/tier-rows.ts). The rows are divs, not table rows, so they can be drawn a window at a time; the roles make
   them a table for a screen reader. */
function ladderShell(names) {
  const head = names.map(name => `<span role="columnheader">${escapeHtml(name)}</span>`).join('');
  return `<div class="ladder cols${names.length}" role="table"><div class="lhead" role="row">${head}</div><div class="lbody" role="rowgroup"></div></div>`;
}

/* One row ({range, values, marks, to}) as HTML: plain text and one data attribute, with no state of its own. */
function rowHtml(row) {
  const cells = row.values.map((text, k) => `<span role="cell" class="eff${row.marks[k] ? ' chg2' : ''}">${escapeHtml(text)}</span>`);
  return `<div class="lrow" role="row" data-to="${row.to}"><span role="cell">${row.range}</span>${cells.join('')}</div>`;
}

/* The rows of one substat of `job` at `level` (haste in percent): {key, kinds, names, rows, shell, rowsHtml}. Made once per job,
   substat, level and haste, then kept (ROWS_KEPT): a value typed or clicked only moves the highlighted row. rows:
   [{start, range, values (text per effect), marks (per effect: it changed at this tier, only for a stat with two
   effects), to}], frozen; key: what they were made from, for the page to tell new rows
   from the same ones; shell: the table without rows; rowsHtml: each row drawn, one string per row. */
function rowsOf(job, stat, level, haste) {
  const key = `${job.jobId}|${stat}|${level}|${haste}`;
  const kept = rowsKept.get(key);
  if (kept) {
    return kept;
  }

  // 1. every tier of the substat from its base to its most
  const ladder = tierLadder(job, stat, level, 0, Infinity, haste, tierMost(job, stat, level));
  const rows = ladder.rows.map(tier => {
    const some = ladder.kinds.length > 1 && !tier.changed.every(Boolean);
    return {
      start: tier.start,
      range: rangeText(tier.start, tier.next),
      values: tier.values,
      marks: tier.changed.map(changed => some && changed),
      to: `${stat}:${tier.start}`,
    };
  });

  // 2. the table, kept with them
  const names = [POINTS_COLUMN, ...ladder.kinds.map(kind => COLUMN[kind])];
  const made = deepFreeze({ key, kinds: ladder.kinds, names, rows, shell: ladderShell(names), rowsHtml: rows.map(rowHtml) });
  rowsKept.set(key, made);
  if (rowsKept.size > ROWS_KEPT) {
    rowsKept.delete(rowsKept.keys().next().value);
  }
  return made;
}

/* The Tiers view of `job` (a JobContext, or null with no job chosen) at `level` for `values` ({stat: panel value}), or
   null with no job: {level, cards}, one card per substat (owner: a card each, its own table, since a table across all
   substats read as one row of stats). A card: {stat, label, value, lines (the effect lines under its box), haste
   (speed's: the job's haste at the level, "with Fuka 10%", else ''), help, names (its column names, Points first),
   rows (every tier, see rowsOf), rowsKey, rowsShell and rowsHtml (the rows' key, the table without rows and each
   row drawn: what the page draws the rows from), cur (the index of the value's tier in rows), foot: {spare, toNext}}. Each row's `to` is 'stat:start', what a click on it sets the value to. */
export function tiersView(job, values, level) {
  if (!job) {
    return null;
  }
  const haste = hasteFor(job.jobId, level);
  const cards = job.substats.map(stat => {
    // 1. the substat's tiers, and the value's place in them
    const value = values[stat] ?? statBase(job, stat, level);
    const { key, kinds, names, rows, shell, rowsHtml } = rowsOf(job, stat, level, haste?.pct ?? 0);
    const cur = rowIndexAt(rows, value);
    const spare = Math.max(0, value - rows[cur].start);
    const nextStart = rows[cur + 1]?.start;

    // 2. the header, the column names and the footer
    return {
      stat,
      label: job.label[stat],
      value,
      lines: kinds.map((kind, k) => `${rows[cur].values[k]} ${lineWord(kind)}`),
      haste: stat === job.speedKey && haste ? `with ${haste.name} ${haste.pct}%` : '',
      help: helpOf(job, stat, level, haste?.pct ?? 0),
      names,
      rows,
      rowsKey: key,
      rowsShell: shell,
      rowsHtml,
      cur,
      foot: { spare: fmtInt(spare), toNext: nextStart == null ? null : fmtInt(nextStart - Math.max(value, rows[0].start)) },
    };
  });
  return { level, cards };
}
