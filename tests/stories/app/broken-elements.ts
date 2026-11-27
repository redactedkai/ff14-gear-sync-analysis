/* Two deliberately broken elements, for the stories that prove the fixture and the class-field guard work. Never part of
   the page. They are plain JavaScript on purpose: esbuild gives a JavaScript class field define semantics (the trap),
   while a TypeScript field follows tsconfig's useDefineForClassFields false (see class-field-trap.spec.ts). */
import { LitElement, html } from 'lit';

/* A class field with an initializer next to `static properties`: it shadows Lit's accessor, so Lit's development build
   throws "will not trigger updates as expected" on the first update. */
export class BrokenFieldElement extends LitElement {
  static properties = { count: { type: Number } };

  count = 0;

  createRenderRoot() {
    return this;
  }

  render() {
    return html`<output>Count ${this.count}</output>`;
  }
}

/* An element whose render() throws. */
export class ThrowingRenderElement extends LitElement {
  createRenderRoot() {
    return this;
  }

  render() {
    throw new Error('render failed on purpose');
  }
}

customElements.define('broken-field', BrokenFieldElement);
customElements.define('throwing-render', ThrowingRenderElement);
