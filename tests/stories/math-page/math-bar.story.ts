/* Stories of <gsa-math-bar> and <gsa-piece-stats>: the math bar and the Stat Allocation screen under it. The page's part is played by
   listeners that apply `piece-edit` and `math-sub` to both elements, as <gsa-math-screen> does with the store. The Sync settings chip
   shows the settings below; its fields' edits are not applied here (the strip's story plays them). */
import { html } from 'lit';
import { GsaMathBar } from '../../../src/ui/elements/math-page/math-bar.ts';
import { GsaPieceStats } from '../../../src/ui/elements/math-page/piece-stats.ts';
import type { ExamplePiece } from '../../../src/ui/elements/math-page/math-bar-names.ts';
import { findElement, listenerElement } from '../gallery/dom.ts';

/* The settings both elements are given: Sage at level 85 with item level sync 123, a head piece with the usual substats. */
const SYNC = { cap: 123, sync: true, level: 85 };
const SYNC_PANEL = { cap: 123, level: 85, on: true };
const PIECE = { ilvl: null, slot: 'head', subs: ['crit', 'sps'], slots: null };

/* The page's job: an edit of the piece or a change of sub-tab is kept on the root, and the elements are given the result. */
function applyPieceEdit(event: CustomEvent<Partial<ExamplePiece>>) {
  const root = listenerElement(event);
  const bar = findElement(root, 'gsa-math-bar', GsaMathBar);
  const stats = findElement(root, 'gsa-piece-stats', GsaPieceStats);
  bar.piece = { ...bar.piece, ...event.detail };
  stats.piece = bar.piece;
}

/* The page's job for a change of sub-tab (`detail` is the sub-tab's id). */
function applySubTab(event: CustomEvent<string>) {
  findElement(listenerElement(event), 'gsa-math-bar', GsaMathBar).tab = event.detail;
}

/* The bar on Stat Allocation, and the screen under it. */
export const Default = () => html`
  <div class="mathbar" style="width: 1100px" @piece-edit=${applyPieceEdit} @math-sub=${applySubTab}>
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
