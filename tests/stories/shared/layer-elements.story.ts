/* Stories of the overlay bridge: a Zag popover alone, beside a page layer, inside one, and holding one. */
import { html } from 'lit';
import './layer-elements.ts';

/* The accessible name of the page-menu stub's button (its panel is named "<label> panel"); the specs and the Slot menu's stories read it from here. */
export const APP_MENU_LABEL = 'App menu';

/* A Zag popover and a button outside it. */
export const Alone = () => html`
  <zag-test-popover label="Popover"></zag-test-popover>
  <button type="button">Outside</button>
`;

/* A Zag popover and, far to its right, a page menu that is not part of it. The menu is out of the popover's way so that the
   popover's content never covers the menu's button, and the menu's panel opens below its button, so it never moves the
   popover's trigger (a press that closes the panel would otherwise miss the button it was aimed at). */
export const BesideAppMenu = () => html`
  <div style="display: flex; gap: 400px; align-items: flex-start">
    <zag-test-popover label="Popover"></zag-test-popover>
    <app-menu-stub layer-id="app-menu" label="${APP_MENU_LABEL}"></app-menu-stub>
  </div>
`;

/* A Zag popover inside a page menu's panel, part of that layer. */
export const InsideAppMenu = () => html`<app-menu-stub layer-id="app-menu" label="${APP_MENU_LABEL}" with-zag></app-menu-stub>`;

/* A page menu inside a Zag popover, part of that layer. */
export const HoldingAppMenu = () => html`<zag-test-popover label="Popover" inner-menu></zag-test-popover>`;
