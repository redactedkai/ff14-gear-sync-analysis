/* A TypeScript element with a field initializer next to `static properties`. It works only because the build reads
   tsconfig's useDefineForClassFields false and assigns the field in the constructor (through Lit's accessor). The story
   TypeScriptField in broken-elements.story.js pins that setting; the page's own elements still avoid the pattern. */
import { LitElement, html } from 'lit';

export class TsFieldElement extends LitElement {
  static properties = { count: { type: Number } };

  count = 0;

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  protected override render() {
    return html`<output>Count ${this.count}</output>`;
  }
}

customElements.define('ts-field', TsFieldElement);
