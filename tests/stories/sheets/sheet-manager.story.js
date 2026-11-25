/* Stories of <gsa-sheet-manager>: the Sheets tab's first level with three sheets, as the page's wrapper would give them. The page's part is
   played here: a `step` action moves the row in the story's own list and answers with its new index, and every action the element
   sends is appended to the `events` output as `action:kind:id` (the element never reads a store). */
import { html } from 'lit';
import '../../../src/ui/elements/sheets/sheet-manager.ts';
import { recordEvents } from '../gallery/record.js';

/* One sheet's row, shaped as views/sheet-manager.js builds it. */
const row = (id, name, jobId, jobName) => ({
  id,
  href: `#/sheets/${id}`,
  name,
  descriptionLine: 'No description',
  jobId,
  jobName,
  settingsText: 'Lv 100 / IL 795',
  setCount: 2,
  created: '2026-11-01',
  changed: '2026-11-02',
  patch: '7.56',
  patchTitle: 'Game data d9582a6, 2026-09-30',
});

/* The words the specs look for. */
export const NAMES = ['Raid', 'Dungeons', 'Crafting'];

/* The manager's view with the sheets of `names` in that order. */
const viewOf = names => ({
  title: 'Sheets',
  empty: false,
  showNewButton: true,
  emptyCard: { title: 'No sheets yet', text: 'A sheet is for one piece of content.', buttonText: 'New sheet' },
  columns: ['Sheet', 'Job', 'Level / IL', 'Sets', 'Created', 'Changed', 'Patch'],
  rows: names.map(name => row(`s_${name.toLowerCase()}`, name, 'SGE', 'Sage')),
  unreadableTitle: 'Could not be read',
  unreadable: [],
});

export const Default = () => {
  let order = NAMES;
  const record = recordEvents('events');
  /* The page's wrapper: records the action, and moves a row for a step. */
  const answer = event => {
    const { action, kind, id, index, step } = event.detail;
    if (action === 'step') {
      const to = Math.min(Math.max(index + step, 0), order.length - 1);
      const moved = [...order];
      moved.splice(to, 0, moved.splice(index, 1)[0]);
      order = moved;
      event.detail.result = to;
      event.currentTarget.view = viewOf(order);
    }
    record({ detail: [action, kind, id].filter(Boolean).join(':') });
  };
  return html`
    <gsa-sheet-manager .view=${viewOf(NAMES)} @sheet-action=${answer}></gsa-sheet-manager>
    <output data-testid="events" hidden></output>
  `;
};

/* The "not found" screen: an address named a sheet that is not saved. */
export const NotFound = () => html`
  <gsa-sheet-manager
    .notFound=${{ title: 'Sheet not found', text: 'No sheet with this address is saved in this browser.', buttonText: 'Open the sheets' }}
    @sheet-action=${recordEvents('events')}
  ></gsa-sheet-manager>
  <output data-testid="events" hidden></output>
`;
