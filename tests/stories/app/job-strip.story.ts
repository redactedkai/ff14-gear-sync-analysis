/* Story of <gsa-job-strip>: the Gear browser's strip with a Sage at level 100 synced to item level 300, as the page's wrapper would give
   it. The page's part is played here: every edit the strip sends (`level-change`, `cap-change`, `sync-change`) is kept in the story's
   state, given back to the strip as properties, and appended to the `events` output as `level:50` or `cap:200`. */
import { html } from 'lit';
import { GsaJobStrip } from '../../../src/ui/elements/app/job-strip.ts';
import { findElement, listenerElement } from '../gallery/dom.ts';
import { recordEvents } from '../gallery/record.ts';

/* The highest level and item level a job takes, as the page gives them. */
const MAX_LEVEL = 100;
const MAX_REAL = 795;

export const Default = () => {
  const state = { job: 'SGE', level: MAX_LEVEL, cap: 300, sync: true };
  const record = recordEvents('events');
  const give = (strip: GsaJobStrip) => Object.assign(strip, { ...state, maxLevel: MAX_LEVEL, maxReal: MAX_REAL, tab: 'browse' });
  /* The page's answer to an edit: keep it, give the strip the settings again, and record it. */
  const take = <Field extends keyof typeof state>(field: Field, event: CustomEvent<(typeof state)[Field]>) => {
    state[field] = event.detail;
    give(findElement(listenerElement(event), 'gsa-job-strip', GsaJobStrip));
    record({ detail: `${field}:${event.detail}` });
  };
  return html`
    <section
      class="panel jobstrip"
      aria-label="Job and sync settings"
      @level-change=${(event: CustomEvent<number>) => take('level', event)}
      @cap-change=${(event: CustomEvent<number>) => take('cap', event)}
      @sync-change=${(event: CustomEvent<boolean>) => take('sync', event)}
    >
      <gsa-job-strip
        .job=${state.job}
        .level=${state.level}
        .cap=${state.cap}
        .sync=${state.sync}
        .maxLevel=${MAX_LEVEL}
        .maxReal=${MAX_REAL}
        .tab=${'browse'}
      ></gsa-job-strip>
    </section>
    <output data-testid="events" hidden></output>
  `;
};
