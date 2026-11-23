/* Fixture for lint-lit.test.js: one class field next to `static properties` and one <img> without alt. Never imported. */
import { LitElement, html } from 'lit';

export class BadElement extends LitElement {
  static properties = { count: { type: Number } };

  count = 0;

  render() {
    return html`<img src="a.png" />`;
  }
}
