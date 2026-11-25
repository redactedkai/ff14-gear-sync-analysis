/* The rows of a Substat tiers card's scroll area, as a Lit directive on the scroll element (`<div ${tierRows(card, typedCount, shown)}>`).
   A card has up to some 650 rows, too many to keep in the page, so the directive draws only the window around the rows in
   view (src/ui/tier-window.js says which) and pads the rest, and draws another window as the area scrolls: one set of
   `.lrow` elements per window, written as one string, with nothing rebuilt per scroll event. Lit does not manage the area's
   children (the template gives the element no content), so the directive owns them.
   - New rows (the first time, a new job or level; their `rowsKey` differs): the table's shell and the rows around the value's
     are drawn, and the value's row is brought to the middle once the area is on screen.
   - A value typed (`typedCount` rises, even for the same value) brings its row to the middle; a click on a row only moves the
     highlight (`card.cur` changes, the rows do not).
   - An area hidden (no height: its sub-tab is not open) waits; it is centered when `shown` is true and it has a height. */
import { Directive, PartType, directive, type ElementPart, type PartInfo } from 'lit/directive.js';
import { nothing } from 'lit';
import { rowsInView, rowsToDraw, scrollTopToCenter, viewLeavesDrawn } from '../../tier-window.js';

/* The parts of a card (src/ui/views/tiers.js tiersView) the rows are drawn from. */
export interface TierRowsSource {
  // what the rows were made from (job, substat, level, haste): the same key means the same rows
  rowsKey: string;
  // the table without its rows: the column names and an empty row group, `.lbody`
  rowsShell: string;
  // each row drawn, one string per row
  rowsHtml: readonly string[];
  // the index of the value's row
  cur: number;
}

/* A card's scroll area as drawn: the rows' key, rows (each row's HTML), the row group, the sizes the CSS gives (px), the index
   of the value's row, its element while drawn, the rows drawn (from, up to but not including to), how many times it was
   asked to center (`centered`) and whether it still has to (`pending`: the area was hidden). */
interface DrawnArea {
  key: string;
  rows: readonly string[];
  lbody: HTMLElement;
  rowHeight: number;
  namesHeight: number;
  cur: number;
  row: Element | null;
  from: number;
  to: number;
  centered: number;
  pending: boolean;
}

/* The sizes the CSS gives a card's rows and column names (px), read from its custom properties (they read the same while
   the area is hidden). */
function cssSizes(area: HTMLElement): { rowHeight: number; namesHeight: number } {
  const style = getComputedStyle(area);
  return {
    rowHeight: Number.parseFloat(style.getPropertyValue('--ladder-row')),
    namesHeight: Number.parseFloat(style.getPropertyValue('--ladder-names')),
  };
}

/* Highlights the value's row if it is drawn. */
function markCurrent(state: DrawnArea): void {
  state.row?.classList.remove('cur');
  state.row = state.cur >= state.from && state.cur < state.to ? state.lbody.children[state.cur - state.from] : null;
  state.row?.classList.add('cur');
}

/* Draws rows `from` up to `to` of a card, padding the row group for the rest so the area keeps its full height. */
function drawRows(state: DrawnArea, from: number, to: number): void {
  state.lbody.style.paddingTop = `${from * state.rowHeight}px`;
  state.lbody.style.paddingBottom = `${(state.rows.length - to) * state.rowHeight}px`;
  state.lbody.innerHTML = state.rows.slice(from, to).join('');
  state.from = from;
  state.to = to;
  markCurrent(state);
}

/* Draws the rows around the ones in view of `area` when the rows drawn no longer cover them (the area is scrolled). */
function redrawIfNeeded(area: HTMLElement, state: DrawnArea): void {
  if (area.clientHeight === 0) {
    return;
  }
  const view = rowsInView(area.scrollTop, area.clientHeight, state.rowHeight, state.rows.length);
  if (!viewLeavesDrawn(state, view, state.rows.length)) {
    return;
  }
  const { from, to } = rowsToDraw(view, state.rows.length);
  drawRows(state, from, to);
}

/* Scrolls `area` so the value's row is in the middle, and draws the rows there. Does nothing while the area is hidden (it has no
   height then); returns whether it scrolled. */
function centerCurrent(area: HTMLElement, state: DrawnArea): boolean {
  if (area.clientHeight === 0) {
    return false;
  }
  area.scrollTop = scrollTopToCenter(state.cur, area.clientHeight, state.namesHeight, state.rowHeight);
  redrawIfNeeded(area, state);
  return true;
}

class TierRowsDirective extends Directive {
  // what the area shows now; kept here, not in reactive state: it holds page elements and every row's HTML
  private state: DrawnArea | null = null;
  private listening = false;

  constructor(partInfo: PartInfo) {
    super(partInfo);
    if (partInfo.type !== PartType.ELEMENT) {
      throw new Error('tierRows goes on an element');
    }
  }

  /* The directive adds no content: the area's children are drawn by `paint`. */
  render(_card: TierRowsSource, _typedCount: number, _shown: boolean): typeof nothing {
    return nothing;
  }

  override update(part: ElementPart, [card, typedCount, shown]: [TierRowsSource, number, boolean]): typeof nothing {
    const area = part.element as HTMLElement;
    if (area.isConnected) {
      this.paint(area, card, typedCount, shown);
    } else {
      // the first draw of a template: its elements join the page after the directives ran, and the CSS sizes are unknown until then
      queueMicrotask(() => this.paint(area, card, typedCount, shown));
    }
    return nothing;
  }

  /* Draws the card's rows in `area` and highlights the value's row, for what the card holds now. */
  private paint(area: HTMLElement, card: TierRowsSource, typedCount: number, shown: boolean): void {
    if (!this.listening) {
      area.addEventListener('scroll', () => this.scrolled(area), { passive: true });
      this.listening = true;
    }
    let state = this.state;

    // 1. the rows, only when they changed: the value moves the highlight, not the rows
    if (state?.key !== card.rowsKey) {
      area.innerHTML = card.rowsShell;
      const lbody = area.querySelector<HTMLElement>('.lbody');
      if (!lbody) {
        return;
      }
      state = {
        key: card.rowsKey,
        rows: card.rowsHtml,
        lbody,
        ...cssSizes(area),
        cur: card.cur,
        row: null,
        from: 0,
        to: 0,
        centered: typedCount,
        pending: true,
      };
      const { from, to } = rowsToDraw({ first: card.cur, last: card.cur + 1 }, card.rowsHtml.length);
      drawRows(state, from, to);
      this.state = state;
    }
    if (state.centered !== typedCount) {
      state.centered = typedCount;
      state.pending = true;
    }

    // 2. the value's row (it is drawn: a click is on a row in view, a typed value is centered below)
    state.cur = card.cur;
    markCurrent(state);

    // 3. bring it to the middle, once the area is on screen
    if (state.pending && shown && centerCurrent(area, state)) {
      state.pending = false;
    } else if (state.pending && shown) {
      const waiting = state;
      queueMicrotask(() => {
        if (centerCurrent(area, waiting)) {
          waiting.pending = false;
        }
      });
    }
  }

  /* The area scrolled: draw the rows now in view. */
  private scrolled(area: HTMLElement): void {
    if (this.state) {
      redrawIfNeeded(area, this.state);
    }
  }
}

/* `tierRows(card, typedCount, shown)`: draws a card's rows in the scroll element it is put on (see the file header). `card`: a
   card of the view (`TierRowsSource`); `typedCount`: how many times a value was typed into the card's box; `shown`: whether
   the Substat tiers sub-tab is open. */
export const tierRows = directive(TierRowsDirective);
