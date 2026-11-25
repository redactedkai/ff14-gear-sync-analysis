/* The "?" of "Spare points to tiebreaks" in the Auto-fill settings, with its note, as a Lit element in light DOM and a Zag popover
   (gear-browser/filter-popover.ts has the keys, the focus and the place). It sits in the Alpine-run settings popover as an island
   (docs/engineering/architecture.md section 3), takes no property and sends no event:
   - the note opens under the "?" with its right edge on the button's, and closes with Escape (the settings popover stays), a press
     outside it, the "?" again or the focus leaving it;
   - it is a child layer of the settings popover (the element inside it with `data-overlay-layer`), fixed to the window so the
     popover's scroll box does not cut it. */
import { LitElement, html } from 'lit';
import { createFilterPopover } from '../gear-browser/filter-popover.ts';

/* What the note says and its name (read by a screen reader); the page's tests import them instead of repeating the sentence. */
export const RANK_NOTE_TEXT =
  'Substats only improve at tiers, so points short of the next tier do nothing in game. This sends those spare points to your tiebreaks instead.';
export const RANK_NOTE_NAME = 'About Spare points to tiebreaks';
/* The ids of the "?" button and of the note (the page's tests and styles name them). */
export const RANK_NOTE_BUTTON_ID = 's-rank-btn';
export const RANK_NOTE_ID = 's-rank-pop';

/* The `gsa-rank-note` element (registered below); see the file header. */
export class GsaRankNote extends LitElement {
  readonly layer: ReturnType<typeof createFilterPopover>;

  constructor() {
    super();
    this.layer = createFilterPopover({
      element: this,
      triggerId: () => RANK_NOTE_BUTTON_ID,
      contentId: () => RANK_NOTE_ID,
      name: RANK_NOTE_NAME,
      placement: 'bottom-end',
    });
  }

  /* Light DOM: draw into the element itself, so the page's CSS reaches the markup. */
  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.layer.bridge.release();
  }

  /* After each draw (Zag's attributes are on the parts by now): the layer is registered with the page's manager, or dropped; a closed
     note forgets where it was placed, so the next opening is not taken for a placed one a frame early. */
  protected override updated(): void {
    this.layer.bridge.sync();
    if (!this.layer.zag.api.open) {
      this.layer.zag.clearPlacement();
    }
  }

  protected override render() {
    return html`
      <button type="button" class="help shelp" data-zag-part="trigger">?</button>
      <div data-zag-part="positioner">
        <div class="popover statpop" data-zag-part="content"><p>${RANK_NOTE_TEXT}</p></div>
      </div>
    `;
  }
}

customElements.define('gsa-rank-note', GsaRankNote);
