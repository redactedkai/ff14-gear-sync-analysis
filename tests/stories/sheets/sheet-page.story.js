/* Story of <gsa-sheet-page>: a Sage sheet at level 70 synced to item level 300, with two gear sets, as the page's wrapper would give them.
   The page's part is played here: an edit of the item level answers with the cap lowered to 405 (the most level 70 allows) and every
   action the element sends is appended to the `events` output as `action:kind:id` or `action:value`. */
import { html } from 'lit';
import '../../../src/ui/elements/sheets/sheet-page.ts';
import { recordEvents } from '../gallery/record.js';

/* A gear set's row, shaped as views/sheet-sets.js builds it (the two figures are the main stat and the GCD). */
const set = (id, name, mind, gcd) => ({
  id,
  href: `#/sheets/s_raid/sets/${id}`,
  name,
  description: '',
  descriptionLine: '',
  originText: '0 pinned, 11 unpinned',
  figures: [
    { key: 'main', text: String(mind) },
    { key: 'gcd', text: gcd },
  ],
  points: [{ key: 'mind', text: String(mind) }],
});

/* The sheet page's view. */
export const VIEW = {
  id: 's_raid',
  crumbs: [
    { text: 'Sheets', to: 'sheets', href: '#/sheets' },
    { text: 'Raid', here: true },
  ],
  name: 'Raid',
  description: { text: 'No description', empty: true },
  job: { id: 'SGE', name: 'Sage' },
  level: { value: 70, max: 100 },
  sync: { on: true, cap: 300, max: 795 },
  setCount: 2,
  title: 'Gear sets',
  columns: ['MND', 'GCD'],
  pointColumns: ['MND'],
  columnKeys: ['main', 'gcd'],
  pointKeys: ['mind'],
  wideColumns: [false, false],
  rows: [set('g_1', 'Set 1', 300, '2.50s'), set('g_2', 'Set 2', 400, '2.40s')],
  bonusNote: '',
  empty: false,
  emptyCard: { title: 'No gear sets yet', text: 'A gear set is a set of pieces.' },
};

/* The caret menu after the sheet's name. */
const SWITCHER = {
  items: [{ id: 's_raid', name: 'Raid', href: '#/sheets/s_raid', current: true }],
  allLabel: 'All sheets (1)',
  allHref: '#/sheets',
  newLabel: '+ New sheet',
  disabled: false,
};

/* The words the specs look for. */
export const LOWERED_TO = 405;

export const Default = () => {
  const record = recordEvents('events');
  /* The page's wrapper: records the action, and answers an item level above what level 70 allows with the lowered cap. */
  const answer = event => {
    const { action, kind, id, value, mode } = event.detail;
    if (action === 'cap' && Number(value) > LOWERED_TO) {
      event.detail.result = { ok: true, lowered: { from: Number(value), to: LOWERED_TO, level: 70 } };
    } else if (action === 'cap' || action === 'level') {
      event.detail.result = { ok: true, lowered: null };
    }
    record({ detail: [action, kind, id, value, mode].filter(part => part !== undefined).join(':') });
  };
  return html`
    <gsa-sheet-page
      .view=${VIEW}
      .figures=${'effects'}
      .sheetId=${'s_raid'}
      .clan=${null}
      .partyRoles=${0}
      .switcher=${SWITCHER}
      @sheet-action=${answer}
    ></gsa-sheet-page>
    <output data-testid="events" hidden></output>
  `;
};
