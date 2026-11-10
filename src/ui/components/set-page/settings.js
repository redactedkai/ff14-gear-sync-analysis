/* A set page's Fill settings dialog (the gear icon): opening and closing it, the goal, the Target GCD and Gear to search
   boxes that edit the set's saved Fill settings, and the Gear to search count from the solver.
   A part of the setPage component (components/set-page.js composes the parts). */
import { clone, expansionToggles, gearFromToggles, numberField } from '../../helpers.js';
import { rankChoices, rankSwapNote, withRank } from '../../ranks.js';
import { TARGET_GCD_RANGE } from '../../settings.js';
import { isCancelled, solverRequest } from '../../solver.js';
import { fillRecipe } from '../../views/fill-settings.js';
import { evaluateInSheet } from '../../views/set-totals.js';

/* The note when the Fill settings change under a waiting result. */
export const SETTINGS_DROPPED_TEXT = 'The Fill settings changed, so the Fill result was dropped. Fill again.';

/* `solver`: ui/solver.js's; `page`: {el, refs} (frame.js). Returns the part's members. */
export function settingsPart(solver, page) {
  let countId = 0;

  return {
    // the Fill settings dialog is open; the "Spare points to tiebreaks" note in it
    settingsOpen: false,
    rankHelp: false,
    // after a goal pick moved another rank: "Tiebreak 1 changed to Mind (a stat holds one rank)."; any other edit clears it
    rankNote: '',
    // the Fill settings' Gear to search, from the solver: "searching 1,939 of 1,999 pieces", the count, the greyed boxes
    // and the Target GCD label
    countText: '',
    searched: null,
    emptyBoxes: [],
    gcdLabel: 'Target GCD',
    targetGcdRange: TARGET_GCD_RANGE,

    /* ---- the Fill settings dialog (the gear icon) ---- */

    openSettings() {
      if (this.$store.sheets.busy) return;
      this.settingsOpen = true;
      this.refreshCount();
      this.afterDraw(() => page.refs.settings.querySelector('select').focus());
    },
    closeSettings() {
      this.settingsOpen = false;
      this.rankHelp = false;
      this.rankNote = '';
      this.afterDraw(() => page.refs.gear.focus());
    },
    /* The set's Fill settings with `change(settings)` applied, saved; a waiting result is dropped, as it no longer
       fits them. */
    editFill(change) {
      if (this.$store.sheets.busy) return;
      this.rankNote = '';
      const next = clone(this.fillSettings);
      change(next);
      // the tied best meals were found for the old settings: they go with them
      const done = this.$store.sheets.updateSet(this.saved.id, { fillSettings: next, bestMeals: null });
      if (done.ok === false && done.error) return;
      if (this.suggestion) {
        this.suggestion = null;
        this.$store.sheets.note = SETTINGS_DROPPED_TEXT;
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
      return numberField(
        () => (criteria ? this.fillSettings.searchCriteria[key] : this.fillSettings.goal.gcd),
        value =>
          this.editFill(s => {
            if (criteria) s.searchCriteria[key] = value;
            else s.goal.gcd = value;
          }),
        criteria ? 1 : TARGET_GCD_RANGE[0],
        criteria ? (key === 'lvl' ? () => this.job.maxLevel : Number.POSITIVE_INFINITY) : TARGET_GCD_RANGE[1],
        { empty: '', ...(criteria ? {} : { decimals: 2 }) },
      );
    },
    /* the filters under Gear to search, read from and written to the set's Fill settings */
    ...expansionToggles({
      read: self => self.fillSettings.searchCriteria,
      write: (self, patch) => self.editFill(s => Object.assign(s.searchCriteria, patch)),
    }),
    ...gearFromToggles({
      read: self => self.fillSettings.searchCriteria,
      write: (self, patch) => self.editFill(s => Object.assign(s.searchCriteria, patch)),
    }),
    /* The Gear to search line for the set's Fill settings, from the solver (in the set's own lane). */
    refreshCount() {
      const saved = this.saved;
      if (!saved) return;
      const context = evaluateInSheet(this.sheet, saved);
      const id = ++countId;
      solver
        .request(
          solverRequest(
            'gearToSearch',
            { job: this.job, sync: context.sync, level: context.level, recipe: fillRecipe(this.fillSettings) },
            { key: saved.id },
          ),
        )
        .then(
          ({ result }) => {
            if (id !== countId) return;
            this.countText = result.countText;
            this.searched = result.searched;
            this.emptyBoxes = result.emptyBoxes;
            this.gcdLabel = result.gcdLabel;
          },
          error => {
            if (isCancelled(error) || id !== countId) return;
            // the line says so, in its own place, instead of showing a count for other settings
            this.countText = `count failed: ${String(error?.message || error).replace(/\.$/, '')}`;
            this.searched = null;
          },
        );
    },
  };
}
