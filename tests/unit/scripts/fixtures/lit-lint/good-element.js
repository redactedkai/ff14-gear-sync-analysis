/* Fixture for lint-lit.test.ts: the same element with the two faults fixed. Never imported. */
import { LitElement, html } from 'lit';

export class GoodElement extends LitElement {
  static properties = { count: { type: Number } };

  constructor() {
    super();
    this.count = 0;
  }

  render() {
    return html`<img src="a.png" alt="Sage icon" />`;
  }
}
