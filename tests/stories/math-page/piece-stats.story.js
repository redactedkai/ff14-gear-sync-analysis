/* Story of <gsa-piece-stats>: the Stat Allocation screen alone, given the settings its parent gives it (the math bar's controls are
   the math-bar story's). The defaults are the owner's case: Sage at level 85 with item level sync 123 and a body piece of item level
   130 (above the cap, so the bars show a gain, a cut and a gold line); the props take any other piece or sync. */
import { html } from 'lit';
import '../../../src/ui/elements/math-page/piece-stats.ts';

/* The item level sync the stories use, and the piece above its cap. */
export const SYNC_123 = { cap: 123, sync: true, level: 85 };
export const NO_SYNC = { cap: null, sync: false, level: 100 };
export const BODY_ABOVE_CAP = { ilvl: 130, slot: 'body', subs: ['crit', 'sps'], slots: null };

/* The screen at the width of the window. */
export const Default = ({
  job = 'SGE',
  sync = /** @type {{ cap: number | null, sync: boolean, level: number }} */ (SYNC_123),
  piece = BODY_ABOVE_CAP,
  switchOn = true,
} = {}) => html`
  <gsa-piece-stats .job=${job} .sync=${sync} .piece=${piece} .switchOn=${switchOn}></gsa-piece-stats>
`;
