/* Story of <gsa-gcd-controls>: the math bar's GCD Scaling controls (Level, Haste, the speed row). The page's part is played here:
   every `gcd-edit` is kept in the story's settings, given back to the element as properties, and appended to the `events` output. */
import { html } from 'lit';
import '../../../src/ui/elements/math-page/gcd-controls.ts';
import '../../../src/ui/elements/shared/select.ts';
import { recordEvents } from '../gallery/record.ts';

/* The element at the synced level 50 with no typed level, no haste and no speed asked (the base). */
export const Default = () => {
  const settings = { level: null, haste: '', speed: null };
  const record = recordEvents('events');
  const take = event => {
    Object.assign(settings, event.detail);
    Object.assign(event.currentTarget.querySelector('gsa-gcd-controls'), settings);
    record(event);
  };
  return html`
    <div @gcd-edit=${take}>
      <gsa-gcd-controls .level=${settings.level} .haste=${settings.haste} .speed=${settings.speed} .syncedLevel=${50}></gsa-gcd-controls>
    </div>
    <output data-testid="events" hidden></output>
  `;
};
