/* A set page's Auto-fill settings popover (the gear button in the bar): opening and closing it, the goal, the Target GCD and
   Gear to search boxes that edit the set's saved Auto-fill settings, and the Gear to search count from the solver.
   A part of the setPage component (components/set-page.js composes the parts). */
import { numberField } from '../../number-field.js';
import { overlays } from '../../overlays.js';
import { clone } from '../../text.ts';
import { expansionToggles, gearFromToggles } from '../filter-menus.js';
import { gearFilter } from '../../../core/items.js';
import { rankChoices, rankSwapNote, withRank } from '../../ranks.js';
import { TARGET_GCD_RANGE } from '../../job-sync-panel.js';
import { isCancelled, solverRequest } from '../../solver.js';
import { fillRecipe } from '../../sheets/fill-settings.js';
import { evaluateInSheet } from '../../views/set-totals.js';
import { RANK_NOTE_LAYER, SETTINGS_LAYER } from './menus.js';

/* `solver`: ui/solver.js's; `page`: {el, refs, setId} (frame.js). Returns the part's members. The Gear to search answer (the line,
   the count, the pieces per "Gear categories" box, the Target GCD label) and the id of the count on its way are in the store
   (page-state.js reads them; `pages` changes them). */
export function settingsPart(solver, page) {
  // the newest Gear to search count still on its way (resolved once it has landed or failed); not in the store: a Promise is not
  // state, and a proxy around one breaks its methods
  let countLanding = Promise.resolve();

  return {
    // the Auto-fill settings popover is open; the "Spare points to tiebreaks" note in it
    settingsOpen: false,
    rankHelp: false,
    // after a goal pick moved another rank: "Tiebreak 1 changed to Mind (a stat holds one rank)."; any other edit clears it
    rankNote: '',
    targetGcdRange: TARGET_GCD_RANGE,

    /* ---- the Auto-fill settings popover (the gear button) ---- */

    /* The gear button: opens the popover, or closes it when it is open. */
    toggleSettings() {
      if (this.settingsOpen) {
        this.closeSettings();
      } else {
        this.openSettings();
      }
    },
    /* Open the popover and move the focus into it (its first box). Not while an Auto-fill runs. It is a layer of the overlay
       manager (Escape and a press outside close it; Tab out does not, as it is not modal); its menus and note are layers inside
       it. */
    openSettings() {
      if (this.$store.sheets.busy) {
        return;
      }
      overlays.open({
        id: SETTINGS_LAYER,
        root: () => page.refs.gearWrap,
        opener: () => page.refs.gear,
        close: () => {
          this.settingsOpen = false;
          this.rankHelp = false;
          this.rankNote = '';
        },
      });
      this.settingsOpen = true;
      this.refreshCount();
      this.afterDraw(() => page.refs.settings?.querySelector('select')?.focus());
    },
    /* Close the popover (the gear button, its X; Escape and a press outside it close it through the manager). `refocus`: put the
       focus back on the gear button; false where the focus goes elsewhere (the page left the rest state). */
    closeSettings(refocus = true) {
      if (!this.settingsOpen) {
        return;
      }
      if (overlays.close(SETTINGS_LAYER, { restoreFocus: refocus })) {
        return;
      }
      this.settingsOpen = false;
      this.rankHelp = false;
      this.rankNote = '';
    },
    /* The "?" of Spare points to tiebreaks: its note opens under the button, inside the popover, and closes with Escape (the
       popover stays), a press outside it or the button again. */
    toggleRankHelp() {
      if (this.rankHelp) {
        if (!overlays.close(RANK_NOTE_LAYER, { restoreFocus: true })) {
          this.rankHelp = false;
        }
        return;
      }
      overlays.open({
        id: RANK_NOTE_LAYER,
        parent: SETTINGS_LAYER,
        root: () => page.refs.rankWrap,
        opener: () => page.refs.rankBtn,
        tabOut: true,
        close: () => {
          this.rankHelp = false;
        },
      });
      this.rankHelp = true;
      this.$nextTick(() => this.placeMenu(page.refs.rankPop, page.refs.rankBtn));
    },
    /* The set's Auto-fill settings with `change(settings)` applied, saved. Refused while an Auto-fill runs or a result waits:
       the result was made for the settings it was run with, and the settings popover is not drawn then (the bar shows Apply
       and Discard), so no edit can arrive; this keeps it so if a way to one is ever added. */
    editFill(change) {
      if (this.$store.sheets.busy || this.suggestion) {
        return;
      }
      this.rankNote = '';
      const next = clone(this.fillSettings);
      change(next);
      // the tied best meals were found for the old settings: they go with them
      const done = this.$store.sheets.updateSet(this.saved.id, { fillSettings: next, bestMeals: null });
      if (done.ok === false && done.error) {
        return;
      }
      this.refreshCount();
    },
    setGoalField(key, value) {
      this.editFill(s => {
        s.goal[key] = value;
      });
    },
    /* Maximize (0), Tiebreak 1 or Tiebreak 2 set to `value` (ranks.js withRank: a stat held by another swaps). */
    setGoal(i, value) {
      let note = '';
      this.editFill(s => {
        const g = s.goal;
        const before = [g.target, g.tb, g.tb2];
        const after = withRank(before, i, value, this.job.stats);
        note = rankSwapNote(before, i, value, after, stat => this.job.label[stat]);
        [g.target, g.tb, g.tb2] = after.map(r => r ?? '');
      });
      this.rankNote = note;
    },
    /* The goal is the job's speed stat: the Target GCD boxes are off (maximizing speed already gives the fastest GCD). */
    get targetIsSpeed() {
      return this.fillSettings.goal.target === this.job.speedKey;
    },
    get statOptions() {
      return this.job.stats.map(s => [s, this.job.label[s]]);
    },
    tiebreakOptions(i) {
      const g = this.fillSettings.goal;
      return [['', 'none']].concat(rankChoices([g.target, g.tb, g.tb2], i, this.job.stats).map(s => [s, this.job.label[s]]));
    },
    /* A number box of the dialog: 'lvl', 'min' or 'max' of Gear to search, or 'gcd' (the Target GCD). */
    fillField(key) {
      const criteria = key !== 'gcd';
      const criteriaMax = key === 'lvl' ? () => this.job.maxLevel : () => this.$store.app.maxReal;
      return numberField(
        () => (criteria ? this.fillSettings.searchCriteria[key] : this.fillSettings.goal.gcd),
        value =>
          this.editFill(s => {
            if (criteria) {
              s.searchCriteria[key] = value;
            } else {
              s.goal.gcd = value;
            }
          }),
        criteria ? 1 : TARGET_GCD_RANGE[0],
        criteria ? criteriaMax : TARGET_GCD_RANGE[1],
        { empty: '', ...(criteria ? {} : { decimals: 2 }) },
      );
    },
    /* the filters under Gear to search, read from and written to the set's Auto-fill settings */
    ...expansionToggles({
      read: self => self.fillSettings.searchCriteria,
      write: (self, patch) => self.editFill(s => Object.assign(s.searchCriteria, patch)),
    }),
    ...gearFromToggles({
      read: self => self.fillSettings.searchCriteria,
      write: (self, patch) => self.editFill(s => Object.assign(s.searchCriteria, patch)),
    }),
    /* The Gear to search line for the set's Auto-fill settings, from the solver (in the set's own lane). */
    refreshCount() {
      const saved = this.saved;
      if (!saved) {
        return;
      }
      const context = evaluateInSheet(this.sheet, saved);
      const recipe = fillRecipe(this.fillSettings);
      // the numbers of the "Gear categories" boxes are for the job and filters they were counted under: no old ones under others
      // (the store drops them when this count starts)
      const countedFor = JSON.stringify([this.job.jobId, gearFilter(recipe)]);
      const id = this.pages.startCount(this.setId, countedFor);
      countLanding = solver
        .request(solverRequest('gearToSearch', { job: this.job, sync: context.sync, level: context.level, recipe }, { key: saved.id }))
        .then(
          ({ result }) => {
            this.pages.countLanded(this.setId, id, countedFor, result);
          },
          error => {
            // the line says so, in its own place, instead of showing a count for other settings; a newer count's answer is the one kept
            const text = `count failed: ${String(error?.message || error).replace(/\.$/, '')}`;
            this.pages.countFailed(this.setId, id, text, isCancelled(error));
          },
        );
    },
    /* Resolves once the newest Gear to search count has landed, so the Auto-fill button's state (off with no piece to search)
       is the settings' own: a press within the first moments of a set page, or right after a settings edit, waits for it. */
    countLanded() {
      return countLanding;
    },
    // whether a count is still on its way (a press that finds none pending needs no wait)
    countPending() {
      return this.pageState.countId !== null;
    },
  };
}
