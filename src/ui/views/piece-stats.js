/* The Stat Allocation screen as one view (the <gsa-piece-stats> element): the two panels (one piece before and after sync, and the
   same slot at every item level) and the step-by-step table, with the sentences the template shows. Pure view builder: no DOM, so Node
   can load and test it. */
import { explainerItemLevel, explainerOffText, explainerView } from './sync-explainer.js';
import { pieceView } from './piece.js';

/* The text of a line with nothing to say: a no-break space, which keeps the line's height, so the panel does not jump as the slider
   passes the cap. */
export const KEEP_LINE = '\u00a0';

/* The text a bar's number line adds after the stat's total: the points over what the piece at the cap has, and the melds. */
const extraText = points => (points ? ` +${points}` : '');

/* What Stat Allocation shows for `job` (a JobContext) under `sync` (syncSettings) and the example piece `piece` ({ilvl, slot, subs,
   slots}), with the chart drawn `width` px wide and `switchOn` the IL Sync switch (the store's `sync`, which the empty state's
   sentence follows):
   {pick ({range, il}: the slider's range and the item level shown), offText (what the screen says while no sync applies, else ''),
   explainer (explainerView with the number lines' texts, the legend's and the table's flags added, or null while no sync applies),
   steps (pieceView with each row's texts added)}. */
export function pieceStatsView(job, sync, piece, { width, switchOn }) {
  const pick = explainerItemLevel(job, sync, piece);
  const explainer = explainerView(job, sync, piece, { piece: width });
  const steps = pieceView(job, sync, piece, pick.il);
  return {
    pick,
    offText: explainer ? '' : explainerOffText(switchOn),
    explainer: explainer && {
      ...explainer,
      title: `An example IL ${explainer.il} piece, before and after sync`,
      bars: explainer.bars.map(bar => ({ ...bar, extraText: extraText(bar.extra), meldText: extraText(bar.melds) })),
      anyMelds: explainer.bars.some(bar => bar.melds),
      aboveCapLegend: `More than an IL ${explainer.cap} piece has`,
      capLegend: `Synced item level ${explainer.cap}`,
      // one row alone: the table keeps a second row's space, so the panel does not jump as the slider passes the cap
      solo: explainer.vsRows.length < 2,
      vsRows: explainer.vsRows.map(row => ({ ...row, tag: row.tag || KEEP_LINE, materiaNote: row.materiaNote || KEEP_LINE })),
      verdict: explainer.verdict || KEEP_LINE,
    },
    steps: {
      ...steps,
      rows: steps.rows.map(row => ({ ...row, weightText: `${row.w}%`, lostText: `−${row.lost}` })),
    },
  };
}
