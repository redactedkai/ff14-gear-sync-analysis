/* Story of <gsa-cap-field>: the item level box with item level sync on, as the Gear browser's strip has it, and a level the page can
   change with a button. The page's part is played here: every cap the field sends (`cap-change`) is kept as `value` and given back,
   and appended to the `events` output; with `follow`, the field lowers the cap to what the level allows, and says so. */
import { html } from 'lit';
import '../../../src/ui/elements/app/cap-field.ts';
import { recordEvents } from '../gallery/record.ts';

/* The highest real item level, as the page gives it, and the start values. */
const MAX_REAL = 795;
const START_CAP = 300;
const START_LEVEL = 100;
/* The level the button sets. */
export const LOWER_LEVEL = 40;

export const Default = () => {
  const record = recordEvents('events');
  const field = event => event.currentTarget.closest('[data-story-root]').querySelector('gsa-cap-field');
  const onCap = event => {
    event.currentTarget.value = event.detail;
    record(event);
  };
  const onLowered = event => {
    event.currentTarget.lowered = event.detail;
  };
  return html`
    <div data-story-root>
      <button type="button" @click=${event => Object.assign(field(event), { level: LOWER_LEVEL })}>Lower the level</button>
      <gsa-cap-field
        layout="strip"
        .value=${START_CAP}
        .max=${MAX_REAL}
        .level=${START_LEVEL}
        sync-on
        follow
        @cap-change=${onCap}
        @lowered-change=${onLowered}
      ></gsa-cap-field>
    </div>
    <output data-testid="events" hidden></output>
  `;
};
