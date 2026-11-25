/* How the math works, Substat tiers: the substats' tier ladder (views/tiers.js). The values are not saved: each starts
   at the substat's base, and what the user types or clicks is kept on top until the job or the level changes. The level
   is the job's level cap until the user types another into the math bar's box; the job is Substat tiers' own (the Job box
   in the math bar, `$store.app.tiers.job`, saved; not Stat Allocation's). Both are in $store.app.tiers, the level not saved,
   shared by the bar (tierControls) and the table (tierTable), as the GCD tab's are (owner: every sub-tab's
   controls in the bar). The values are worked out on every read (no effect that refills them later), so a level typed
   in the settings shows its own tiers and values in one render. */
import { numberField } from '../number-field.js';
import { compose } from './compose.js';
import { rowsInView, rowsToDraw, scrollTopToCenter, viewLeavesDrawn } from '../tier-window.js';
import { viewCache } from '../view-cache.ts';
import { tierInput, tierLevel, tiersView, tierValues } from '../views/tiers.js';

/* A card's scroll area as drawn: {key (of the rows), rows (each row's HTML), lbody (the row group), rowHeight and
   namesHeight (px, from the CSS), cur (the index of the value's row), row (that row's element, while drawn), from and to
   (the rows drawn: from, up to but not including to), centered (how many times the card was asked to center), pending
   (it still has to center: the area was hidden)}. */

/* The sizes the CSS gives a card's rows and column names (px), read from its custom properties (they read the same
   while the area is hidden). */
function cssSizes(area) {
  const style = getComputedStyle(area);
  return {
    rowHeight: Number.parseFloat(style.getPropertyValue('--ladder-row')),
    namesHeight: Number.parseFloat(style.getPropertyValue('--ladder-names')),
  };
}

/* Highlights the value's row if it is drawn. */
function markCurrent(state) {
  state.row?.classList.remove('cur');
  state.row = state.cur >= state.from && state.cur < state.to ? state.lbody.children[state.cur - state.from] : null;
  state.row?.classList.add('cur');
}

/* Draws rows `from` up to `to` of a card, padding the row group for the rest so the area keeps its full height. */
function drawRows(state, from, to) {
  state.lbody.style.paddingTop = `${from * state.rowHeight}px`;
  state.lbody.style.paddingBottom = `${(state.rows.length - to) * state.rowHeight}px`;
  state.lbody.innerHTML = state.rows.slice(from, to).join('');
  state.from = from;
  state.to = to;
  markCurrent(state);
}

/* Draws the rows around the ones in view of `area` when the rows drawn no longer cover them (the area is scrolled). */
function redrawIfNeeded(area, state) {
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

/* Scrolls `area` so the value's row is in the middle, and draws the rows there. Does nothing while the area is hidden
   (it has no height then); returns whether it scrolled. */
function centerCurrent(area, state) {
  if (area.clientHeight === 0) {
    return false;
  }
  area.scrollTop = scrollTopToCenter(state.cur, area.clientHeight, state.namesHeight, state.rowHeight);
  redrawIfNeeded(area, state);
  return true;
}

/* The Substat tiers sub-tab: the cards, the values typed or clicked, and each substat's ? note. */
export function tierTable() {
  // the last view and what it was built from (view-cache.ts viewCache): the template and `help` read `view` many times a
  // render
  const views = viewCache();
  // what each card's scroll area shows now, by the area (see above). Kept outside the reactive state: it holds page
  // elements and every row's HTML.
  const drawn = new WeakMap();
  return compose({
    /* values typed or clicked, {stat: value}, and the settings they were made under (editsKey) */
    edits: {},
    editsFor: '',
    /* how many times a value was typed into each substat's box, {stat: count}: its card brings the tier to the middle
       of its scroll area at each (a click on a row does not) */
    typed: {},
    /* Substat tiers' own job (store.panel('tiers'): its job, and the job's level cap as its level) */
    get panel() {
      return this.$store.app.panel('tiers');
    },
    get level() {
      return tierLevel(this.panel.jobCtx, this.panel.level, this.$store.app.tiers.level);
    },
    /* the substat whose ? note is open, or null */
    helpFor: null,
    /* the job and levels the values were made under: edits made under another key are dropped */
    get editsKey() {
      return JSON.stringify([this.panel.job, this.level, this.panel.level]);
    },
    init() {
      // the settings changed: drop the edits for good (liveEdits already hides them for the render in between), so
      // going back to the old level or job starts from the bases again
      this.$watch('editsKey', () => {
        this.edits = {};
        this.editsFor = '';
      });
    },
    /* the edits that still apply: none once the settings they were made under have changed */
    get liveEdits() {
      return this.editsFor === this.editsKey ? this.edits : {};
    },
    /* the cards (views/tiers.js tiersView), or null with no job; built again only when the job, the level or the edits
       change */
    get view() {
      if (!this.panel.job) {
        return null;
      }
      const job = this.panel.jobCtx,
        level = this.level,
        edits = this.liveEdits;
      return views.get(JSON.stringify([this.panel.job, level, edits]), () =>
        tiersView(job, { ...tierValues(job, level), ...edits }, level),
      );
    },
    get help() {
      return this.view?.cards.find(g => g.stat === this.helpFor)?.help ?? null;
    },
    /* keep `value` for a substat, dropping edits made under other settings */
    setEdit(stat, value) {
      this.edits = { ...this.liveEdits, [stat]: value };
      this.editsFor = this.editsKey;
    },
    /* a value typed into a substat's box (Enter or leaving the box); the box shows the value kept */
    type(stat, el) {
      const value = tierInput(this.panel.jobCtx, stat, el.value, this.level);
      if (value == null) {
        return;
      }
      this.setEdit(stat, value);
      this.typed = { ...this.typed, [stat]: (this.typed[stat] ?? 0) + 1 };
      el.value = value;
    },
    /* a tier clicked: the value goes to its start, and the list stays where it is under the pointer */
    pick(to) {
      const [stat, start] = to.split(':');
      this.setEdit(stat, Number(start));
    },
    /* a click in a card's scroll area: on a row, pick it */
    pickRow(event) {
      const row = event.target.closest('.lrow');
      if (row) {
        this.pick(row.dataset.to);
      }
    },
    /* Draws a card's rows in its scroll area `area` and highlights the value's row, for x-effect (the effect runs again
       when the card's view, the typed count or the open sub-tab changes). Only the rows around the value's (and later
       around the ones scrolled to) are drawn: tier-window.js. New rows (the first time, a new job or level), a value
       typed and the sub-tab shown after the rows were drawn all bring the row to the middle; a click on a row only
       moves the highlight. */
    paint(area, card) {
      const { rowsKey, rowsShell, rowsHtml, cur, stat } = card;
      const typedCount = this.typed[stat] ?? 0;
      const shown = this.$store.app.mathTab === 'tiers';
      let state = drawn.get(area);

      // 1. the rows, only when they changed: the value moves the highlight, not the rows
      if (state?.key !== rowsKey) {
        area.innerHTML = rowsShell;
        state = { key: rowsKey, rows: rowsHtml, lbody: area.querySelector('.lbody'), ...cssSizes(area) };
        state.centered = typedCount;
        state.pending = true;
        state.from = state.to = 0;
        state.cur = cur;
        const { from, to } = rowsToDraw({ first: cur, last: cur + 1 }, rowsHtml.length);
        drawRows(state, from, to);
        drawn.set(area, state);
      }
      if (state.centered !== typedCount) {
        state.centered = typedCount;
        state.pending = true;
      }

      // 2. the value's row (it is drawn: a click is on a row in view, a typed value is centered below)
      state.cur = cur;
      markCurrent(state);

      // 3. bring it to the middle, once the area is on screen
      if (state.pending && shown && centerCurrent(area, state)) {
        state.pending = false;
      } else if (state.pending && shown) {
        this.$nextTick(() => {
          if (centerCurrent(area, state)) {
            state.pending = false;
          }
        });
      }
    },
    /* a card's scroll area scrolled: draw the rows now in view */
    scrolled(area) {
      const state = drawn.get(area);
      if (state) {
        redrawIfNeeded(area, state);
      }
    },
    /* a substat's ? button: open its note under the button, or close it when it is the open one; a press on another substat's
         button moves the note (the note element places itself under the `helpAnchor`) */
    toggleHelp(stat) {
      this.helpFor = this.helpFor === stat ? null : stat;
    },
    /* the open note's "?" button, or null: where the note element hangs */
    get helpAnchor() {
      return this.helpFor ? this.$refs.panel.querySelector(`[data-help="${this.helpFor}"]`) : null;
    },
  });
}

/* The math bar's Substat tiers control: its Level box (its Job box is the bar's own, before it). */
export function tierControls() {
  return {
    /* Substat tiers' own job (store.panel('tiers'): its job, and the job's level cap as its level) */
    get panel() {
      return this.$store.app.panel('tiers');
    },
    get level() {
      return tierLevel(this.panel.jobCtx, this.panel.level, this.$store.app.tiers.level);
    },
    /* the level box: each valid level counts as it is typed, as in the settings' level box (owner); the
       synced level itself, or an empty box left or entered, follows the synced level again */
    get levelField() {
      const app = this.$store.app;
      return numberField(
        () => this.level,
        v => {
          app.setTiersLevel(v === this.panel.level ? null : v);
        },
        1,
        () => this.panel.jobCtx.maxLevel,
        {
          live: true,
          onEmpty: input => {
            app.setTiersLevel(null);
            input.value = this.level;
          },
        },
      );
    },
  };
}
