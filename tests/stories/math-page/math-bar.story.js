/* Stories of <gsa-math-bar> and <gsa-piece-stats>: the math bar and the Stat Allocation screen under it. The page's part is played by
   listeners that apply `piece-edit` and `math-sub` to both elements, as <gsa-math-screen> does with the store. The Sync settings chip
   shows the settings below; its fields' edits are not applied here (the strip's story plays them). */
import { html } from 'lit';
import '../../../src/ui/elements/math-page/math-bar.ts';
import '../../../src/ui/elements/math-page/piece-stats.ts';

/* The settings both elements are given: Sage at level 85 with item level sync 123, a head piece with the usual substats. */
const SYNC = { cap: 123, sync: true, level: 85 };
const SYNC_PANEL = { cap: 123, level: 85, on: true };
const PIECE = { ilvl: null, slot: 'head', subs: ['crit', 'sps'], slots: null };

/* The page's job: an edit of the piece or a change of sub-tab is kept on the root, and the elements are given the result. */
function apply(event) {
  const root = event.currentTarget;
  const bar = root.querySelector('gsa-math-bar');
  const stats = root.querySelector('gsa-piece-stats');
  if (event.type === 'piece-edit') {
    bar.piece = { ...bar.piece, ...event.detail };
    stats.piece = bar.piece;
  } else {
    bar.tab = event.detail;
  }
}

/* The bar on Stat Allocation, and the screen under it. */
export const Default = () => html`
  <div class="mathbar" style="width: 1100px" @piece-edit=${apply} @math-sub=${apply}>
    <gsa-math-bar
      .tab=${'piece'}
      .jobId=${'SGE'}
      .pieceJob=${'SGE'}
      .sync=${SYNC}
      .syncPanel=${SYNC_PANEL}
      .openTab=${'math'}
      .levelScope=${'math SGE'}
      .maxReal=${795}
      .piece=${PIECE}
      .gcd=${{ level: null, haste: '', speed: null, syncedLevel: 85 }}
      .tiers=${{ job: 'SGE', level: null }}></gsa-math-bar>
    <gsa-piece-stats .job=${'SGE'} .sync=${SYNC} .piece=${PIECE} .switchOn=${true}></gsa-piece-stats>
  </div>
`;
