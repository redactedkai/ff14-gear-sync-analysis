/* Story of <gsa-app>: the page's root over a real page store, as main.js gives it its ports, opening on the Sheets tab with no saved
   sheet. The three tabs' screens are the real ones (the Gear browser draws its table when its tab opens). */
import { html } from 'lit';
import '../../../src/ui/elements/app/app-root.ts';
import { pagePorts } from '../shared/page-ports.js';

export const Default = () => html`<gsa-app class="wrap" .ports=${pagePorts()}></gsa-app>`;
