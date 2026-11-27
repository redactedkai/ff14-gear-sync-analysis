/* Stories of <gsa-materia-menu>: the materia menu of a set page's table, hung under whichever of two chips the page names. The
   page's part is played here by two plain buttons and listeners; a pick is recorded into the `events` output as `stat:grade`. */
import { html } from 'lit';
import '../../../src/ui/elements/set-page/materia-menu.ts';
import { recordEvents } from '../gallery/record.ts';

/* The view of an overmeld slot (the shape of `materiaMenuView`): two grades of two stats, the second of Critical Hit worn. */
export const MENU = {
  title: 'Head · overmeld slot 1',
  bands: [
    {
      key: 0,
      columns: [
        { grade: 12, roman: 'XII', ok: true, odds: '10%' },
        { grade: 11, roman: 'XI', ok: true, odds: '12%' },
      ],
      rows: [
        {
          stat: 'crit',
          short: 'Crit',
          cells: [
            { grade: 12, text: '+54', ok: true, on: false, fit: '' },
            { grade: 11, text: '+36', ok: true, on: true, fit: '' },
          ],
        },
        {
          stat: 'det',
          short: 'Det',
          cells: [
            { grade: 12, text: '+54', ok: true, on: false, fit: '' },
            { grade: 11, text: '+36', ok: true, on: false, fit: 'part' },
          ],
        },
      ],
    },
  ],
  columns: 2,
  hasStone: true,
  canRemove: true,
  removeNote: '',
  allText: 'Show all grades',
  highNote: '',
  showOdds: true,
  nqNote: '',
};

/* The page's job: a press on a chip opens its menu (or closes it when it is the open one); the menu's own close clears it. */
function toggle(event) {
  const menu = event.currentTarget.closest('.story-materia-page').querySelector('gsa-materia-menu');
  const open = menu.anchor === event.currentTarget;
  menu.menu = open ? null : MENU;
  menu.anchor = open ? null : event.currentTarget;
}

/* The element beside two chips and a control after them. */
export const Default = () => html`
  <div class="story-materia-page" style="position: relative; padding: 20px" @materia-close=${event => {
    const menu = event.currentTarget.querySelector('gsa-materia-menu');
    menu.anchor = null;
    menu.menu = null;
  }} @stone-pick=${event => recordEvents('events')({ detail: `${event.detail.stat}:${event.detail.grade}` })}>
    <button type="button" class="mchip" data-chip="2:0" @click=${toggle}>crit +36</button>
    <button type="button" class="mchip" data-chip="2:1" @click=${toggle}>empty</button>
    <input type="text" aria-label="After the chips" />
    <gsa-materia-menu></gsa-materia-menu>
  </div>
  <output data-testid="events" hidden></output>
`;
