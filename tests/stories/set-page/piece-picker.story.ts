/* Stories of <gsa-piece-picker>: the set page's piece picker with a hand-made list of 700 pieces, hung under whichever of two row
   buttons the page names. The page's part is played here by two plain buttons and listeners (the search filters the list, a close
   lets go of the button). Every pick is appended to the `events` output (the piece's gameId, or null for Empty this slot). */
import { html } from 'lit';
import { GsaPiecePicker } from '../../../src/ui/elements/set-page/piece-picker.ts';
import type { PiecePicker, PickerPiece } from '../../../src/ui/elements/set-page/piece-picker-names.ts';
import { closestElement, findElement, listenerElement } from '../gallery/dom.ts';
import { recordEvents } from '../gallery/record.ts';

/* The pieces: 400 of Dawntrail and 300 of Endwalker, `Piece 1` to `Piece 700`; the first Endwalker one is a Unique ring worn in the
   other ring row (shown, not pickable). */
export const PIECE_COUNT = 700;
export const TAKEN_PIECE = 'Piece 401';
const piece = (number: number): PickerPiece => ({
  key: 1000 + number,
  name: `Piece ${number}`,
  hq: false,
  unique: number === 401,
  uniqueText: ' Unique, in the other ring',
  taken: number === 401,
  onClass: number === 2 ? 'on' : '',
  pillClass: 'pill',
  pillLabel: 'Crafted',
  line: 'CRT 306 · DET 214',
  levels: '640, lvl 90',
});
const PIECES = Array.from({ length: PIECE_COUNT }, (_, index) => piece(index + 1));

/* The picker for the search `query`, as views/piece-menu.ts builds it: every piece whose name has the text, by expansion. */
function pickerFor(query: string): PiecePicker {
  const text = query.trim().toLowerCase();
  const shown = PIECES.filter(item => item.name.toLowerCase().includes(text));
  const groups = [
    { label: 'Dawntrail', items: shown.filter(item => item.key <= 1400) },
    { label: 'Endwalker', items: shown.filter(item => item.key > 1400) },
  ].filter(group => group.items.length);
  return {
    placeholder: 'Search head pieces',
    canEmpty: true,
    groups,
    emptyText: shown.length ? '' : `No piece matches "${query.trim()}".`,
    footText: `${PIECE_COUNT} pieces`,
  };
}

/* Records whether each opening's menu was under its button when the page was told it is shown. */
const recordShown = recordEvents('shown');

/* The page's job: a press on a row button opens its picker (or closes it when it is the open one) with an empty search; the
   picker's own close and search come back as events. */
function toggle(event: Event) {
  const button = listenerElement(event);
  const picker = findElement(closestElement(button, '.story-picker-page'), 'gsa-piece-picker', GsaPiecePicker);
  const open = picker.anchor === button;
  picker.query = '';
  picker.menu = open ? null : pickerFor('');
  picker.anchor = open ? null : button;
}

/* The element beside two row buttons and a control after them. */
export const Default = () => html`
  <div
    class="story-picker-page"
    style="position: relative; padding: 20px"
    @picker-close=${(event: Event) => {
      const picker = findElement(listenerElement(event), 'gsa-piece-picker', GsaPiecePicker);
      picker.anchor = null;
      picker.menu = null;
    }}
    @picker-query=${(event: CustomEvent<string>) => {
      const picker = findElement(listenerElement(event), 'gsa-piece-picker', GsaPiecePicker);
      picker.query = event.detail;
      picker.menu = pickerFor(event.detail);
    }}
    @picker-shown=${(event: CustomEvent<Element>) => {
      // whether the menu was already under the pressed button when the page was told it is shown (a stale place would say no)
      const button = findElement(listenerElement(event), 'gsa-piece-picker', GsaPiecePicker).anchor;
      if (!button) {
        throw new Error('the picker is shown with no button to hang under');
      }
      recordShown({ detail: event.detail.getBoundingClientRect().top >= button.getBoundingClientRect().bottom });
    }}
    @piece-pick=${recordEvents('events')}
  >
    <button type="button" class="same-btn" data-pick="2" @click=${toggle}>Head piece</button>
    <div style="height: 240px"></div>
    <button type="button" class="same-btn" data-pick="3" @click=${toggle}>Body piece</button>
    <input type="text" aria-label="After the buttons" />
    <gsa-piece-picker></gsa-piece-picker>
  </div>
  <output data-testid="events" hidden></output>
  <output data-testid="shown" hidden></output>
`;
