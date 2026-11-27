/* Story of <gsa-level-field>: the level box of a Paladin (level cap 100) as Stat Allocation has it, with the error line. The page's part
   is played here: every level the field sends (`level-change`) is kept as `value` and given back, and appended to the `events` output. */
import { html } from 'lit';
import { GsaLevelField } from '../../../src/ui/elements/app/level-field.ts';
import { listenerElement } from '../gallery/dom.ts';
import { recordEvents } from '../gallery/record.ts';

/* The job's level cap and the level the story starts at. */
export const MAX_LEVEL = 100;
const START_LEVEL = 100;

export const Default = () => {
  const record = recordEvents('events');
  const onLevel = (event: CustomEvent<number | null>) => {
    listenerElement(event, GsaLevelField).value = event.detail;
    record(event);
  };
  return html`
    <gsa-level-field layout="math" .value=${START_LEVEL} .max=${MAX_LEVEL} validate @level-change=${onLevel}></gsa-level-field>
    <output data-testid="events" hidden></output>
  `;
};
