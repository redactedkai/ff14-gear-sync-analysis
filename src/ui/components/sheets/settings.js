/* The sheet page's settings: the breadcrumb menu of sheets (the caret after the sheet's name), the level box, the item level
   sync switch and the cap box, the Clan and Party bonus boxes, applied as typed with no question, and the notes about a lowered cap or text that is no cap.
   A part of the sheetsTab component (components/sheets.js composes the parts). Borrows: sheets and afterDraw (frame.js). */
import { flashLowered, numberField } from '../../number-field.js';
import { bonusOptions } from '../../sheets/bonus-options.js';
import { ranges } from '../../sheets/ops.js';
import { CAP_TYPED_BAD_TEXT, capFlag, capLoweredText, capTextBad } from '../../level-cap.js';

/* Returns the part's members. */
export function settingsPart() {
  // the entries of the Clan and Party bonus lists (the same for every sheet)
  const bonusLists = bonusOptions();

  return {
    // the cap the sheet page last lowered: {sheetId, from, to, level} (ui/store/sheets-actions.ts editSettings), for the note under the
    // field; null once a change leaves the cap as typed
    capLowered: null,
    // the sheet page's cap field holds text that is no whole item level (the sheet keeps its last cap: capTextBad)
    capTypedBad: false,

    /* What the sheet page's caret menu (<gsa-switch-menu>, the island after the sheet's name) shows: a link to the manager, one
       link per saved sheet (the open one marked) and "+ New sheet". Off while an Auto-fill runs. */
    get sheetSwitcher() {
      const store = this.sheets;
      const rows = this.manager.rows;
      return {
        items: rows.map(row => ({ id: row.id, name: row.name, href: store.href(row.id), current: row.id === store.sheetId })),
        allLabel: `All sheets (${rows.length})`,
        allHref: store.href(),
        newLabel: '+ New sheet',
        disabled: store.busy,
      };
    },
    /* A pick in the caret menu (`pick`: {kind, id, opener}, the element's switch-pick event): the manager, another sheet, or a
       new sheet's dialog. */
    pickSheet(pick) {
      if (pick.kind === 'all') {
        this.sheets.openManager();
      } else if (pick.kind === 'item') {
        if (pick.id !== this.sheets.sheetId) {
          this.sheets.openSheet(pick.id);
        }
      } else {
        this.sheets.openManager();
        this.openNewSheet(pick.opener);
      }
    },

    /* The level box. Typed digits commit once typing settles (numberField), so the cap follows the level typed, not
       the numbers on the way ("8" of "80"). */
    get levelField() {
      const store = this.sheets;
      return numberField(
        () => store.currentSheet?.level,
        value => this.noteLowered(store.setLevel(value)),
        1,
        () => ranges(store.currentSheet?.job).level.max,
      );
    },
    /* The cap box, as on the Job and sync panel: any whole number from 1 (its max attribute, in the template, stops the
       arrow keys), lowered to what the level allows with a note; other text is an error (capError, onCapInput) and
       the sheet keeps its last cap. */
    get capField() {
      const store = this.sheets;
      return numberField(
        () => store.currentSheet?.sync.cap,
        value => this.noteLowered(store.setCap(value)),
        1,
        Infinity,
        { snap: false },
      );
    },
    /* Text typed in the cap box, at each keystroke: whether it is an error (capTextBad). */
    onCapInput(text) {
      this.capTypedBad = capTextBad(text);
    },
    /* Under the sheet page's cap field while sync is on: CAP_TYPED_BAD_TEXT for text that is no cap, else ''. */
    get capError() {
      return this.capTypedBad && this.sheets.currentSheet?.sync.on ? CAP_TYPED_BAD_TEXT : '';
    },
    /* The sheet page's sync switch: switched on, the cap is lowered to what the level allows. */
    toggleSync(on) {
      this.noteLowered(this.sheets.setSyncOn(on));
    },
    /* The Clan and Party bonus boxes' entries (bonus-options.js bonusOptions). */
    get bonusLists() {
      return bonusLists;
    },
    /* The open sheet's clan name, or null for none. */
    get sheetClan() {
      return this.sheets.currentSheet?.clan ?? null;
    },
    /* The open sheet's unique party roles, 0 to 5. */
    get sheetPartyRoles() {
      return this.sheets.currentSheet?.partyRoles ?? 0;
    },
    /* The Clan box changed: `name` is a clan's name, '' for "Select Race/Clan". The sets' totals follow (the sheet's
       page view is rebuilt from the saved sheet). A refused edit (an Auto-fill runs) changes nothing: the box shows the saved clan
       (`sheetClan`) still, since the element only shows the value the page gives it. */
    pickClan(name) {
      this.sheets.setClan(name || null);
    },
    /* The Party bonus box changed: `value` is the number of unique roles as text. A refused edit leaves the box as it was. */
    pickPartyRoles(value) {
      this.sheets.setPartyRoles(value);
    },
    /* Keep what an edit of the open sheet lowered (`result`: the store's {ok, lowered}) for the note, and flash the
       cap field; a refused edit (an Auto-fill runs) leaves the note as it was. A lowered cap is put in the field too: typed
       again over a cap already at the limit (or the up arrow there), the sheet does not change, so its binding does
       not run again and the field would keep the text typed. */
    noteLowered(result) {
      if (!result?.ok) {
        return;
      }
      const lowered = result.lowered;
      this.capLowered = lowered ? { ...lowered, sheetId: this.sheets.sheetId } : null;
      if (!lowered) {
        return;
      }
      const field = this.$refs.sheetCap;
      if (field) {
        field.value = String(lowered.to);
      }
      flashLowered(field);
    },
    /* Under the sheet page's cap field after it was lowered (level-cap.js capLoweredText, the Job and sync panel's
       wording): "Lowered to 405, max for level 70."; '' on another sheet, while sync is off, or while the field
       shows an error (it takes the note's place). */
    get capLoweredNote() {
      const lowered = this.capLowered;
      const sheet = this.sheets.currentSheet;
      if (!lowered || !sheet?.sync.on || lowered.sheetId !== sheet.id || this.capError) {
        return '';
      }
      return capLoweredText(lowered);
    },
    /* The sheet page's cap field's flag in its label line (level-cap.js capFlag); `range` is the range text, "1–795". */
    capFlag(range) {
      return capFlag({ error: this.capError, note: this.capLoweredNote, lowered: this.capLowered, range });
    },
  };
}
