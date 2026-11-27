/* Story of <gsa-sheet-page>: a Sage sheet at level 70 synced to item level 300, with two gear sets, as the page's wrapper would give them.
   The page's part is played here: an edit of the item level answers with the cap lowered to 405 (the most level 70 allows) and every
   action the element sends is appended to the `events` output as `action:kind:id` or `action:value`. */
import { html } from 'lit';
import { GsaSheetPage, type SheetPageView, type SheetSwitcher } from '../../../src/ui/elements/sheets/sheet-page.ts';
import type { SheetAction } from '../../../src/ui/elements/sheets/sheet-action.ts';
import '../../../src/ui/elements/shared/select.ts';
import { listenerElement } from '../gallery/dom.ts';
import { recordEvents } from '../gallery/record.ts';
import { actionFields } from './action-fields.ts';

/* A gear set's row, shaped as views/sheet-sets.ts builds it (the two figures are the main stat and the GCD). */
const set = (id: string, name: string, mind: number, gcd: string, description = ''): SheetPageView['rows'][number] => ({
  id,
  href: `#/sheets/s_raid/sets/${id}`,
  name,
  description,
  descriptionLine: description,
  originText: '0 pinned, 11 unpinned',
  figures: [
    { key: 'main', label: 'MND', text: String(mind) },
    { key: 'gcd', label: 'GCD', text: gcd },
  ],
  points: [{ key: 'mind', label: 'MND', text: String(mind) }],
});

/* The sheet page's view. */
export const VIEW: SheetPageView = {
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
  rows: [set('g_1', 'Set 1', 300, '2.50s'), set('g_2', 'Set 2', 400, '2.40s', 'Week 1 note')],
  bonusNote: '',
  empty: false,
  emptyCard: { title: 'No gear sets yet', text: 'A gear set is a set of pieces.' },
};

/* The caret menu after the sheet's name. */
const SWITCHER: SheetSwitcher = {
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
  const answer = (event: CustomEvent<SheetAction>) => {
    const { action, kind, id, value, mode, name } = actionFields(event.detail);
    if (action === 'clan' || action === 'party') {
      // the Clan and Party bonus boxes: the page keeps the pick and shows the note under the table
      const page = listenerElement(event, GsaSheetPage);
      page.clan = action === 'clan' ? name || null : page.clan;
      page.partyRoles = action === 'party' ? Number(value) : page.partyRoles;
      page.view = {
        ...VIEW,
        bonusNote: page.clan || page.partyRoles ? `${page.clan ?? 'No clan'}, ${page.partyRoles}% party bonus` : '',
      };
    }
    if (event.detail.action === 'cap' && Number(value) > LOWERED_TO) {
      event.detail.result = { ok: true, lowered: { from: Number(value), to: LOWERED_TO, level: 70 } };
    } else if (event.detail.action === 'cap' || event.detail.action === 'level') {
      event.detail.result = { ok: true, lowered: null };
    }
    record({ detail: [action, kind, id, value ?? name, mode].filter(part => part !== undefined).join(':') });
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
