/* How the math works, Piece stats: what sync does to one piece, against the same piece at the cap with its melds. Pure
   view builder, so Node can load and test it.
   A "generic piece" here is a piece built from the budget table (buildPiece): the main stat, Vitality and the two
   chosen substats at their 100% / 70% shares, with 2 meld slots (meldInfo). Its melds are the optimizer's best stones
   (bestMeld) in those two substats, so the explainer and an Auto-fill meld alike. */
import { MATERIA, MAX_LEVEL, MAX_REAL } from '../../core/tables.ts';
import { JOBS, SLOT_LABEL, SUB_WEIGHTS } from '../../core/constants.ts';
import { makeJobContext } from '../../core/job-context.js';
import { buildPiece, capsFor, clampIlvl, syncStats } from '../../core/formulas.ts';
import { mkItem } from '../../core/items.js';
import { bestMeld } from '../../core/meld.js';
import { meldSlotChoices, meldSlotsOf, shownSync } from '../job-sync-panel.js';
import { LEVEL_TEXT, rangeOnly, rangeText } from '../level-cap.js';
import { OVERGEAR_BANDS, overgearChartSvg } from '../sync-charts.js';

/* The item level range the slider and both charts cover, relative to the cap (item levels). */
const RANGE_BELOW = 30; // from 30 below the cap
const RANGE_MIN_OVER = 40; // the range always reaches 40 above it
const RANGE_PAST_LAST = 20; // and 20 past the last item level where a full set's substats still change
const RANGE_MAX_OVER = 150; // but never more than 150 above it
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
// The words under an item level in the table under the bars, by the row's `kind` (what the template shows; tests read the kind).
const ROW_KIND_TEXT = { overgeared: 'overgeared', melded: 'melded', 'at-cap': 'at the cap', 'below-cap': 'below the cap' };

/* Piece stats' bars: the longest bar (a stat or its cap) fills 1 / BAR_HEADROOM of the chart, so its end stays clear
   of the chart's right edge. */
const BAR_HEADROOM = 1.05;

/* The two substats the explainer shows: Piece stats' ranks (`subs`, the store's piece.subs), rank 2 possibly null. */
function chosenSubs(subs) {
  return subs.slice(0, 2).map(s => s || null);
}

/* The keys melds go into: the two chosen substats (`subs`, Piece stats' ranks), the 2nd first, since the 1st is at the
   piece's own cap already. */
export function meldKeys(subs) {
  const [s1, s2] = chosenSubs(subs);
  return [s2, s1].filter(Boolean);
}

/* One generic piece of slot `type` at item level `il` in a duty synced to `cap`: its stats before and after sync, its
   melds (bestMeld, kept only at or below the cap) and its substat points in the duty (the chosen substats after sync,
   plus every meld it keeps). {il, raw, synced, meld, kept, points, bare} */
const pieceMemo = new Map();
const PIECE_MEMO_MAX = 20000; // a few thousand per setting; dropped whole when full
function pieceAt(job, type, il, cap, subs, keys, slots) {
  // the curves ask for the same pieces on every slider move: remember them per setting
  const key = `${job.jobId}|${type}|${il}|${cap}|${subs.join(',')}|${keys.join(',')}|${slots}`;
  let hit = pieceMemo.get(key);
  if (!hit) {
    if (pieceMemo.size >= PIECE_MEMO_MAX) {
      pieceMemo.clear();
    }
    hit = buildPieceAt(job, type, il, cap, subs, keys, slots);
    pieceMemo.set(key, hit);
  }
  return hit;
}
function buildPieceAt(job, type, il, cap, subs, keys, slots) {
  const raw = buildPiece(job, il, type, subs);
  const synced = syncStats(job, raw, type, cap, il);
  const item = mkItem('generic', type, il, raw, { meld: { slots, overmeld: false } });
  const meld = bestMeld(job, item, keys);
  const kept = il <= cap; // a synced piece loses its melds
  const bare = subs.reduce((a, s) => a + (s ? synced[s] : 0), 0);
  const meldPoints = kept && meld ? Object.values(meld.gain).reduce((a, b) => a + b, 0) : 0;
  return { il, raw, synced, meld, kept, bare, points: bare + meldPoints };
}

/* The item level range for a cap: [lo, hi], from RANGE_BELOW under the cap to RANGE_PAST_LAST past the last item level
   where a full set's chosen substats still change after sync (the 2nd substat reaching the cap in the slowest slot),
   at least RANGE_MIN_OVER and at most RANGE_MAX_OVER above the cap, never past the highest real item level. */
const rangeMemo = new Map();
/* explainerRange(job, cap, subs): that range, memoized by job, cap and substats. */
function explainerRange(job, cap, subs) {
  const key = `${job.jobId}|${cap}|${subs.join(',')}`;
  if (!rangeMemo.has(key)) {
    rangeMemo.set(key, computeRange(job, cap, subs));
  }
  return rangeMemo.get(key);
}
function computeRange(job, cap, subs) {
  const lo = Math.max(1, cap - RANGE_BELOW);
  const top = Math.min(MAX_REAL, cap + RANGE_MAX_OVER);
  let last = cap,
    prev = null;
  for (let il = cap + 1; il <= top; il++) {
    let sum = 0;
    for (const t of job.activeSlotTypes) {
      const s = syncStats(job, buildPiece(job, il, t, subs), t, cap, il);
      sum += subs.reduce((a, k) => a + (k ? s[k] : 0), 0);
    }
    if (prev != null && sum !== prev) {
      last = il;
    }
    prev = sum;
  }
  const hi = Math.min(top, Math.max(cap + RANGE_MIN_OVER, last + RANGE_PAST_LAST));
  return [lo, Math.max(lo, hi)];
}

/* The slider's range and the chosen item level: {range: [lo, hi], il}. With a sync, explainerRange and the saved
   item level (null: the cap, where Reset puts it; owner's decision); without one, every real item level
   (null: the highest). For `job` under `sync`
   (syncSettings), and Piece stats' `piece` ({ilvl, slot, subs}). */
export function explainerItemLevel(job, sync, piece) {
  const shown = shownSync(job, sync);
  const clampTo = ([lo, hi], v) => Math.max(lo, Math.min(hi, clampIlvl(v)));
  if (!shown) {
    const range = [1, MAX_REAL];
    return { range, il: clampTo(range, piece.ilvl ?? MAX_REAL) };
  }
  const cap = shown.cap;
  const range = explainerRange(job, cap, chosenSubs(piece.subs));
  return { range, il: clampTo(range, piece.ilvl ?? cap) };
}

/* A piece's melds in words, in two parts: {stones: "2 × Grade X Skill Speed (+54 each)", afterCap: "+90 after the cap"
   when the piece's cap cuts the stones, else ''}. */
function meldParts(job, meld) {
  if (!meld?.stones.length) {
    return { stones: 'none', afterCap: '' };
  }
  const parts = meld.stones.map(s => `${s.n} × Grade ${ROMAN[s.grade - 1]} ${job.label[s.stat]} (+${MATERIA.values[s.grade - 1]} each)`);
  const full = meld.stones.reduce((a, s) => a + s.n * MATERIA.values[s.grade - 1], 0);
  const gain = Object.values(meld.gain).reduce((a, b) => a + b, 0);
  return { stones: parts.join(', '), afterCap: gain < full ? `+${gain} after the cap` : '' };
}

/* The chart legend's name for the melds band: the stats the stones add to, as "Critical Hit (Melds)" ("Melds" alone with
   no stones). The stones themselves (count, grade, value) are in the table under the bars. */
function meldsLegend(job, meld) {
  const stats = [...new Set((meld?.stones ?? []).map(stone => job.label[stone.stat]))];
  return stats.length ? `${stats.join(' + ')} (Melds)` : 'Melds';
}

/* A number as wide as any number with as many digits as `limit` (8 is the widest digit): the hidden copies of the sync
   fields' label rows are written with it, so the boxes are as wide as the widest label row at the real limits. */
export const widestNumber = limit => '8'.repeat(String(limit).length);

/* The widest texts of the Sync settings popover's label rows (the flag row, the range row) at the real limits, from which a hidden copy
   of the rows gives the Level and Synced IL boxes one width in every state: `levelFlag` and `levelRange` (the Level row), `capFlag`
   ("1–795 only"), `capDigits` (the digits after "Max") and `capRange` (the Synced IL row). */
export const SYNC_LABEL_ROWS = Object.freeze({
  levelFlag: rangeOnly(LEVEL_TEXT.range(widestNumber(MAX_LEVEL))),
  levelRange: LEVEL_TEXT.range(widestNumber(MAX_LEVEL)),
  capFlag: rangeOnly(rangeText(widestNumber(MAX_REAL))),
  capDigits: widestNumber(MAX_REAL),
  capRange: rangeText(widestNumber(MAX_REAL)),
});

/* The text of the 2nd substat menu's empty choice. */
export const NO_SUBSTAT_LABEL = 'none';

/* Every text the 1st and 2nd substat menus can show, one per line: the labels of the substats of all the jobs (derived
   from each job's own list) and the empty choice. The menus are as wide as the longest and never change with the job or
   the pick (the .sizertext of a select, as the Haste menu). */
export const SUBSTAT_SIZER = [
  ...new Set(
    JOBS.flatMap(job => {
      const ctx = makeJobContext(job.id);
      return ctx.substats.map(stat => ctx.label[stat]);
    }),
  ),
  NO_SUBSTAT_LABEL,
].join('\n');

/* The texts of the Piece chip (the one control in the math bar that stands for the 1st and 2nd substat and the Materia slots)
   and of its popover's fields. The chip's own words are built by pieceChipView; templates and tests read these. */
export const PIECE_CHIP_TEXT = Object.freeze({
  label: 'Substats & materia', // over the chip, and its popover's name
  first: '1st substat',
  second: '2nd substat',
  slots: 'Materia slots',
  separator: ' · ',
  slotOne: 'slot',
  slotMany: 'slots',
  slotsLong: 'materia slots', // the chip's full name for a screen reader: "2 materia slots"
  noSecond: 'no 2nd substat', // the same, where the 2nd substat is none
});

/* A materia slot total as the chip says it: "2 slots", "1 slot". */
function slotsText(count) {
  return `${count} ${count === 1 ? PIECE_CHIP_TEXT.slotOne : PIECE_CHIP_TEXT.slotMany}`;
}

/* The Piece chip's words for `job` (a JobContext) and the example piece `piece` ({subs, slot, slots}): {text (the short stat
   names and the slot total: "CRT · SkS · 2 slots"; "none" for no 2nd substat), name (the same in full words, the chip's
   accessible name: "Substats & materia: Critical Hit, Skill Speed, 2 materia slots")}. */
export function pieceChipView(job, piece) {
  const [first, second] = piece.subs;
  const count = meldSlotsOf(piece);
  const short = stat => job.short[stat];
  const text = [short(first), second ? short(second) : NO_SUBSTAT_LABEL, slotsText(count)].join(PIECE_CHIP_TEXT.separator);
  const full = [job.label[first], second ? job.label[second] : PIECE_CHIP_TEXT.noSecond, `${count} ${PIECE_CHIP_TEXT.slotsLong}`];
  return { text, name: `${PIECE_CHIP_TEXT.label}: ${full.join(', ')}` };
}

/* Every text the chip can show, one per line: each short stat name of any job (derived from each job's own list) as the 1st
   substat, each other one or none as the 2nd, each total of materia slots any slot has. The chip is as wide as the longest
   (the hidden copy of a select's texts, .sizertext) and never changes with the job or the picks, whatever the font. */
export const PIECE_CHIP_SIZERS = (() => {
  const shorts = [
    ...new Set(
      JOBS.flatMap(job => {
        const ctx = makeJobContext(job.id);
        return ctx.substats.map(stat => ctx.short[stat]);
      }),
    ),
  ];
  const counts = [...new Set(Object.keys(SLOT_LABEL).flatMap(meldSlotChoices))].map(slotsText);
  return Object.freeze(
    shorts.flatMap(first =>
      [...shorts.filter(other => other !== first), NO_SUBSTAT_LABEL].flatMap(second =>
        counts.map(count => [first, second, count].join(PIECE_CHIP_TEXT.separator)),
      ),
    ),
  );
})();

/* The text of the Gear item level control in the math bar: the label over it, which is also the accessible name of its slider and
   number box. */
export const IL_CONTROL_TEXT = Object.freeze({
  label: 'Gear item level',
});

/* The widest value the Gear item level number box can hold, as digits: four 8s, or as many as the highest real item level has
   if that is more (8 is the widest digit). A hidden copy of it gives the box its width, so the box is as wide as that value, its
   padding and the caret need, in whatever font the page has. */
export const IL_BOX_SIZER = '8'.repeat(Math.max(4, String(MAX_REAL).length));

/* The chip's text for neither level sync nor IL Sync (its accessible name says it in lower case). */
const NOT_SYNCED = 'Unsynced';

/* The texts of the Sync chip (the one control in the math bar that stands for the synced level, the synced item level and
   IL Sync) and of its popover. The chip's own words are built by syncChipView; templates and tests read these.
   The chip reads "Lv 85 · IL 270" while IL Sync is on and "Lv 85 · IL 536" while only the level syncs gear (the item level is the
   one that level gives; its number is regular and lighter than with IL Sync on, and the chip's name says IL Sync is off),
   "Unsynced" with neither, "Lv 85 · Enter IL" while IL Sync is on with no item level. The level is always shown, the job's
   level cap included. A gold mark after the label (guess) says the number is an inferred level sync target. */
export const SYNC_CHIP_TEXT = Object.freeze({
  label: 'Sync settings', // over the chip, its popover's name and the start of the chip's accessible name
  notSynced: NOT_SYNCED,
  needCap: 'Enter IL',
  level: level => `Lv ${level}`,
  itemLevel: cap => `IL ${cap}`,
  separator: '·',
  guess: '*', // after the label: level sync's item level for a weapon or off-hand is inferred (WEAPON_LEVEL_SYNC_GUESS)
  // the chip's name for a screen reader and its tooltip
  name: {
    on: (label, level, cap) => `${label}: ${level == null ? '' : `level ${level}, `}item level ${cap}, IL Sync on`,
    off: (label, level, cap) => `${label}: ${level == null ? '' : `level ${level}, `}item level ${cap}, IL Sync off`,
    notSynced: label => `${label}: ${NOT_SYNCED.toLowerCase()}, IL Sync off`,
    needCap: (label, level) => `${label}: ${level == null ? '' : `level ${level}, `}IL Sync on, no item level`,
  },
});

/* The widest texts of the chip, from the real limits (the highest equip level and item level in the data, MAX_LEVEL and
   MAX_REAL): every digit is an 8, the widest in most fonts, and as many as the limit has. One array of parts per text. The chip is as wide
   as the longest (their hidden copies, .sizertext) and never changes with the state, whatever the font. */
const chipLevel = SYNC_CHIP_TEXT.level(widestNumber(MAX_LEVEL));
export const SYNC_CHIP_SIZERS = Object.freeze([
  chipParts({ level: chipLevel, il: SYNC_CHIP_TEXT.itemLevel(widestNumber(MAX_REAL)) }),
  chipParts({ il: SYNC_CHIP_TEXT.notSynced }),
  chipParts({ level: chipLevel, il: SYNC_CHIP_TEXT.needCap }),
]);

/* The chip's text as parts, {text, cls}: the level, then the item level (cls "il" plus a state word), with a separator part
   between them. `chip` is {level, il, warn}. */
function chipParts({ level = '', il, warn = '' }) {
  const parts = [];
  if (level) {
    parts.push({ text: level, cls: 'lv' }, { text: SYNC_CHIP_TEXT.separator, cls: 'dot' });
  }
  parts.push({ text: il, cls: `il ${warn}`.trim() });
  return parts;
}

/* The Sync chip for `job` (a JobContext) under `sync` (syncSettings) and the example piece's slot code `slot`:
   {parts (the chip's text, chipParts), name (its accessible name and tooltip), guess (the sentence for the gold mark after the label, or '')}.
   `switchOn` is the IL Sync switch (the store's `sync`; syncSettings.sync is also false while it is on with no cap),
   `loweredFrom` the cap the page lowered (the cap box's capLowered.from) or null, `capMissing` IL Sync is on and the box is
   empty. The item level is gold while the page lowered the typed cap to what the level allows, red with no item level.
   @param {any} job
   @param {any} sync
   @param {string} slot
   @param {{ switchOn: boolean, loweredFrom?: number | null, capMissing?: boolean }} options */
export function syncChipView(job, sync, slot, { switchOn, loweredFrom = /** @type {number | null} */ (null), capMissing = false }) {
  const T = SYNC_CHIP_TEXT;
  const level = sync.level ?? null;
  const levelText = level == null ? '' : T.level(level);
  if (capMissing) {
    return { parts: chipParts({ level: levelText, il: T.needCap, warn: 'error' }), name: T.name.needCap(T.label, level), guess: '' };
  }
  const shown = shownSync(job, sync);
  if (!shown) {
    return { parts: chipParts({ il: T.notSynced }), name: T.name.notSynced(T.label), guess: '' };
  }
  const lowered = !shown.byLevel && loweredFrom != null && loweredFrom > shown.cap;
  const guess = capGuessText(job, sync, slot);
  const off = !switchOn;
  let warn = '';
  if (lowered) {
    warn = 'lowered';
  } else if (off) {
    warn = 'quiet';
  }
  const name = off ? T.name.off(T.label, level, shown.cap) : T.name.on(T.label, level, shown.cap);
  return {
    parts: chipParts({
      level: levelText,
      il: T.itemLevel(shown.cap),
      warn,
    }),
    name: guess ? `${name}. ${guess}` : name,
    guess,
  };
}

/* What Stat Allocation says while no sync applies (explainerView is null): with IL Sync on and no item level entered, that
   one is missing; off, why nothing is synced and how to see it. */
export const OFF_TEXT = {
  needCap: 'Enter a synced item level to see what sync does.',
  off: 'No sync applies: IL Sync is off and the level is the job’s level cap. Turn IL Sync on and enter a synced item level, or lower the level, to see what sync does.',
};
/* The sentence for the empty state: OFF_TEXT.needCap while the IL Sync switch is on (`syncSwitch`, the store's `sync`), else
   OFF_TEXT.off. */
export function explainerOffText(syncSwitch) {
  return syncSwitch ? OFF_TEXT.needCap : OFF_TEXT.off;
}

/* The words in the Synced IL box's tooltip, and the Sync chip's description, while the item level shown is level sync's for a
   weapon or off-hand: that target is inferred (a player's report supports it at level 90), so the label over the chip carries
   a gold "*" (SYNC_CHIP_TEXT.guess). */
export const WEAPON_LEVEL_SYNC_GUESS = 'Level sync’s item level for a weapon or off-hand is inferred, not verified in game.';

/* The text of that tooltip for `job` under `sync` (syncSettings) and the example piece's slot code `slot`, or '' while the
   cap is not level sync's item level or the piece is no weapon or off-hand. */
export function capGuessText(job, sync, slot) {
  const byLevel = shownSync(job, sync)?.byLevel;
  return byLevel && (slot === 'weapon' || slot === 'offhand') ? WEAPON_LEVEL_SYNC_GUESS : '';
}

/* Everything Piece stats shows for `job` under `sync` (syncSettings), or null while no sync applies: Piece stats'
   `settings` ({ilvl, slot, subs}: the store's `piece`) against the same piece at the cap, melded in the two chosen
   substats (meldKeys). `widths`: the chart container's width in px ({piece}), so the
   chart is drawn at its own size and its text stays at the page's size. */
export function explainerView(job, sync, settings, widths = {}) {
  const shown = shownSync(job, sync);
  if (!shown) {
    return null;
  }
  const cap = shown.cap,
    level = shown.level ?? sync.level,
    type = settings.slot,
    slotName = SLOT_LABEL[type].toLowerCase();
  const subs = chosenSubs(settings.subs);
  const keys = meldKeys(settings.subs);
  const slots = meldSlotsOf(settings);

  // the range and the chosen item level
  const {
    range: [lo, hi],
    il,
  } = explainerItemLevel(job, sync, settings);
  const synced = il > cap;

  // ---------- Piece stats: one piece at `il` against the same slot at the cap, both melded where they keep melds
  const piece = pieceAt(job, type, il, cap, subs, keys, slots);
  const atCap = pieceAt(job, type, cap, cap, subs, keys, slots);
  const caps = capsFor(job, type, cap);
  const lines = [
    { stat: job.mainKey, label: job.label[job.mainKey], w: null },
    { stat: 'vit', label: job.label.vit, w: null },
    ...subs.map((s, i) => (s ? { stat: s, label: job.label[s], w: SUB_WEIGHTS[i] } : null)).filter(Boolean),
  ];
  // the melds a piece keeps (at or below the cap) add to its stats
  const meldOf = stat => (piece.kept && piece.meld ? piece.meld.gain[stat] || 0 : 0);
  const scale = Math.max(...lines.map(l => Math.max(piece.raw[l.stat] + meldOf(l.stat), caps[l.stat]))) * BAR_HEADROOM;
  // a bar's share of the chart; with no budget (synced levels 1 to 4) every stat and cap is 0, so no bar has length
  const pct = v => (scale > 0 ? `${((100 * v) / scale).toFixed(2)}%` : '0%');
  const bars = lines.map(l => {
    const raw = piece.raw[l.stat],
      kept = piece.synced[l.stat],
      melds = meldOf(l.stat),
      // a substat's value on the piece at the cap: the part above it is what overgearing adds (gold)
      native = l.w ? atCap.raw[l.stat] : null;
    const base = native != null ? Math.min(native, kept) : kept;
    return {
      label: l.w ? `${l.label} · ${l.w}%` : l.label,
      raw,
      kept,
      extra: native != null && kept > native ? kept - native : 0,
      keep: pct(base),
      riseLeft: pct(base),
      rise: native != null && kept > native ? pct(kept - native) : '0%',
      cutLeft: pct(kept),
      cut: raw > kept ? pct(raw - kept) : '0%',
      // the melds, after the stat's own points; total is what the piece has in the duty
      melds,
      total: kept + melds,
      meldLeft: pct(kept),
      meldWidth: pct(melds),
      capAt: pct(caps[l.stat]),
    };
  });
  const lost = lines.reduce((a, l) => a + piece.raw[l.stat] - piece.synced[l.stat], 0);
  // the materia row: only the stones the piece has in the duty, so none above the cap (a synced piece loses its melds)
  const keptStones = synced ? [] : piece.meld?.stones || [];
  const stoneChips = keptStones.flatMap(s => Array.from({ length: s.n }, () => `+${MATERIA.values[s.grade - 1]}`));
  let meldNote = keptStones.map(s => `${s.n} × Grade ${ROMAN[s.grade - 1]} ${job.label[s.stat]}`).join(', ');
  if (synced) {
    meldNote = 'None: a synced piece loses its melds.';
  } else if (!keptStones.length) {
    meldNote = slots === 0 ? 'None: this piece has no materia slots.' : 'No materia fits this item level.';
  }

  // the slots the stones leave empty: a stone that adds nothing stays out, so the substats are at their caps
  const stoneCount = keptStones.reduce((total, s) => total + s.n, 0);
  const emptyNote =
    stoneCount && stoneCount < slots ? `${slots - stoneCount} of ${slots} slots empty: the substats are at their caps.` : '';

  // the table under the bars: the piece, then the piece at the cap (or the one row when they are the same; the page
  // keeps the second row's space so the panel does not jump as the slider passes the cap)
  // each row's kind: overgeared against melded above the cap, else where the piece is against the cap
  const rowKind = p => {
    if (synced) {
      return p.il > cap ? 'overgeared' : 'melded';
    }
    return p.il === cap ? 'at-cap' : 'below-cap';
  };
  const vsRows = (il === cap ? [atCap] : [piece, atCap]).map(p => {
    const parts = p.kept ? meldParts(job, p.meld) : { stones: 'none', afterCap: 'ignored while synced' };
    const kind = rowKind(p);
    return { il: p.il, kind, tag: ROW_KIND_TEXT[kind], materia: parts.stones, materiaNote: parts.afterCap, points: p.points };
  });
  const diff = piece.points - atCap.points;
  let verdict = '';
  if (il !== cap) {
    if (!diff) {
      verdict = 'Both have the same.';
    } else if (synced) {
      verdict = `The ${diff > 0 ? 'overgeared' : 'melded'} ${slotName} (item level ${diff > 0 ? il : cap}) has ${Math.abs(diff)} more.`;
    } else {
      verdict = `The item level ${diff > 0 ? il : cap} ${slotName} has ${Math.abs(diff)} more.`;
    }
  }

  // ---------- the curve: the same slot at every item level of the range
  const curve = [];
  for (let x = lo; x <= hi; x++) {
    const p = pieceAt(job, type, x, cap, subs, keys, slots);
    curve.push({
      il: x,
      points: p.points,
      // the points by part, for the chart's bands: each chosen substat after sync, then the melds the piece keeps
      parts: subs.filter(Boolean).map(s => p.synced[s]),
      melds: p.points - p.bare,
    });
  }
  const over = curve.filter(p => p.il > cap);
  // the note: from which item level an overgeared piece has as much as the melded one, and from which it has more
  const asMuch = over.find(p => p.points >= atCap.points),
    more = over.find(p => p.points > atCap.points);
  const peak = over.length ? Math.max(...over.map(p => p.points)) : null,
    ref = atCap.points;
  const at = p => `item level ${p.il} (+${p.il - cap})`,
    melded = `the melded ${slotName} (${ref})`;
  let curveNote = ''; // empty when no item level of the range is above the cap
  if (over.length && !asMuch) {
    curveNote = `Overgeared never reaches ${melded}: at most ${peak}.`;
  } else if (asMuch && !more) {
    curveNote = `Overgeared matches ${melded} at ${at(asMuch)}, never more.`;
  } else if (more && more === asMuch) {
    curveNote = `Overgeared passes ${melded} at ${at(more)}, up to ${peak}.`;
  } else if (more) {
    curveNote = `Overgeared matches ${melded} at ${at(asMuch)} and passes it at ${at(more)}, up to ${peak}.`;
  }

  return {
    cap,
    level,
    byLevel: shown.byLevel,
    range: [lo, hi],
    il,
    synced,
    slotName,
    subLabels: subs.map(s => (s ? job.label[s] : '')),
    lead: synced
      ? `Synced to ${cap}: each stat is cut to its cap, ${lost} points in all.`
      : `At or below ${cap}: sync leaves every stat as it is.`,
    lost,
    bars,
    stoneChips,
    meldNote,
    emptyNote,
    vsRows,
    verdict,
    curveNote,
    curveChartSvg: overgearChartSvg({
      curve,
      cap,
      il,
      ref: atCap.points,
      labels: subs.filter(Boolean).map(s => job.label[s]),
      ceilings: subs.filter(Boolean).map(s => caps[s]),
      width: widths.piece,
    }),
    // the chart's legend: its bands, bottom up (OVERGEAR_BANDS); the melds band names the stones of the piece at the cap
    curveBands: [...subs.filter(Boolean).map((s, i) => `${job.label[s]} (${SUB_WEIGHTS[i]}%)`), meldsLegend(job, atCap.meld)].map(
      (label, k, all) => ({
        label,
        ...OVERGEAR_BANDS[k === all.length - 1 ? 2 : k],
      }),
    ),
  };
}
