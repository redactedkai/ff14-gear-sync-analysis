/* A plain Lit counter in light DOM: the placeholder element that proves the stories chain (tests/stories/app/). It shows
   the rules every element here follows:
   - `static properties`, no decorators, no class fields: a field with an initializer next to `static properties` would
     shadow Lit's accessor and the property would stop updating (the lint rule lit/no-classfield-shadowing and the story
     tests/stories/app/class-field-trap.spec.ts guard it); the default is set in the constructor;
   - `createRenderRoot()` returns the element itself, so the page's CSS reaches the markup (no shadow DOM);
   - it draws from its properties only and tells the page through a `count-change` event. */
import { LitElement, html } from 'lit';

/* The `count-change` event: `detail` is the new count. */
export const COUNT_CHANGE_EVENT = 'count-change';

export class GsaCounter extends LitElement {
  static properties = { count: { type: Number } };

  /* The number shown; the buttons add or remove one. */
  declare count: number;

  constructor() {
    super();
    this.count = 0;
  }

  /* Light DOM: draw into the element itself. */
  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  /* Adds `step` to the count and tells the page. */
  private change(step: number): void {
    this.count += step;
    this.dispatchEvent(new CustomEvent(COUNT_CHANGE_EVENT, { detail: this.count, bubbles: true, composed: true }));
  }

  protected override render() {
    return html`
      <button type="button" @click=${() => this.change(-1)}>Fewer</button>
      <output>Count ${this.count}</output>
      <button type="button" @click=${() => this.change(1)}>More</button>
    `;
  }
}

customElements.define('gsa-counter', GsaCounter);
