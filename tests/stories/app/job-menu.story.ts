/* Stories of <gsa-job-menu>: the Job box of the page's strip, with a button before it and one after it (where Tab goes). A pick
   (`job-change`) is appended to the `events` output as the job's id, and the story sets `job` as the page does. */
import { html } from 'lit';
import '../../../src/ui/elements/app/job-menu.ts';

/* The job the story starts with, and its name in the box. */
export const START_JOB = 'SGE';
export const START_JOB_NAME = 'Sage';

/* Sets `job` to the pick and records it. */
function onPick(event) {
  event.currentTarget.querySelector('gsa-job-menu').job = event.detail;
  const output = document.querySelector('[data-testid="events"]');
  output.textContent = JSON.stringify([...JSON.parse(output.textContent || '[]'), event.detail]);
}

export const Default = () => html`
  <button type="button">Before</button>
  <div class="f boxf jobfield" @job-change=${onPick}>
    <gsa-job-menu .job=${START_JOB} prefix="job" button-id="job-menu-btn" menu-id="job-menu"></gsa-job-menu>
  </div>
  <button type="button">After</button>
  <output data-testid="events" hidden></output>
`;
