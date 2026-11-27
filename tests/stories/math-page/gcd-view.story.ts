/* Stories of <gsa-gcd-view>: the GCD Scaling sub-tab. The page's part is played by a listener that applies `gcd-edit` to the
   element's properties, as <gsa-math-screen> does with the store. */
import { html } from 'lit';
import { GsaGcdView } from '../../../src/ui/elements/math-page/gcd-view.ts';
import { findElement, listenerElement } from '../gallery/dom.ts';

/* The page's job: a `gcd-edit` sets the typed level or the speed asked for, and the element draws again. */
function applyEdit(event: CustomEvent<{ level: number } | { speed: number }>) {
  const view = findElement(listenerElement(event), 'gsa-gcd-view', GsaGcdView);
  Object.assign(view, event.detail);
}

/* The element at the synced level 50 with no typed level and no speed asked (the base). */
export const Default = () => html`
  <div style="width: 1000px" @gcd-edit=${applyEdit}>
    <gsa-gcd-view .level=${null} .syncedLevel=${50} .haste=${''} .speed=${null}></gsa-gcd-view>
  </div>
`;
