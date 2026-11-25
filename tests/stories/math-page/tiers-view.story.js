/* Stories of <gsa-tiers-view> and <gsa-tiers-controls>: the Substat tiers sub-tab and the math bar's Level box. The page's part is
   played by a listener that applies `tiers-level` to both elements, as the Alpine wrapper does with the store. */
import { html } from 'lit';
import '../../../src/ui/elements/math-page/tiers-controls.ts';
import '../../../src/ui/elements/math-page/tiers-view.ts';

/* The page's job: a `tiers-level` sets the typed level on both elements. */
function applyLevel(event) {
  for (const element of event.currentTarget.querySelectorAll('gsa-tiers-view, gsa-tiers-controls')) {
    element.typedLevel = event.detail.level;
  }
}

/* Sage's tiers at level 100 (its level cap) with the sub-tab open, and the Level box. */
export const Default = () => html`
  <div style="width: 1000px" @tiers-level=${applyLevel}>
    <gsa-tiers-controls .job=${'SGE'} .typedLevel=${null}></gsa-tiers-controls>
    <gsa-tiers-view .job=${'SGE'} .typedLevel=${null} .shown=${true}></gsa-tiers-view>
  </div>
`;
