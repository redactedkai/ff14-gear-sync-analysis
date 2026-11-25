/* A set page's Auto-fill settings popover (the gear button in the bar; <gsa-settings-popover> opens and closes it): the goal, the Target
   GCD and Gear to search boxes that edit the set's saved Auto-fill settings, and the Gear to search count from the solver. Part of the
   page's session (session.js). The Gear to search answer (the line, the count, the pieces per "Gear categories" box, the Target GCD
   label) and the id of the count on its way are in the store (`session.pageState.gearToSearch`, `countId`; `pages` changes them). */
import { numberBox } from '../../number-field.js';
import { clone } from '../../text.ts';
import { gearFilter } from '../../../core/items.js';
import { rankChoices, rankSwapNote, withRank } from '../../ranks.js';
import { TARGET_GCD_RANGE } from '../../job-sync-panel.js';
import { isCancelled, solverRequest } from '../../solver.js';
import { fillRecipe } from '../../sheets/fill-settings.js';
import { evaluateInSheet } from '../../views/set-totals.js';

/* The page's Auto-fill settings edits (`session.settings`): the goal, Target GCD and Gear to search boxes, and the Gear to search count. */
export class PageFillSettings {
  /* `session`: the page's session (session.js). */
  constructor(session) {
    this.session = session;
    // after a goal pick moved another rank: "Tiebreak 1 changed to Mind (a stat holds one rank)."; any other edit clears it
    this.rankNote = '';
    // the newest Gear to search count still on its way (resolved once it has landed or failed); not in the store: a Promise is not state
    this.countLanding = Promise.resolve();
    this.targetGcdRange = TARGET_GCD_RANGE;
    // the option lists of the selects, by select (kept)
    this.lists = new Map();
    // the number boxes of the popover: 'lvl', 'min' and 'max' of Gear to search, and 'gcd' (the Target GCD)
    this.boxes = {
      lvl: this.criteriaBox('lvl', () => session.job.maxLevel),
      min: this.criteriaBox('min', () => session.ports.maxReal),
      max: this.criteriaBox('max', () => session.ports.maxReal),
      gcd: numberBox(
        () => session.fillSettings.goal.gcd,
        value =>
          this.editFill(settings => {
            settings.goal.gcd = value;
          }),
        TARGET_GCD_RANGE[0],
        TARGET_GCD_RANGE[1],
        { empty: '', decimals: 2 },
      ),
    };
  }

  /* The number box of the search criterion `key` ('lvl', 'min', 'max'), whole numbers from 1 to `max()`. */
  criteriaBox(key, max) {
    return numberBox(
      () => this.session.fillSettings.searchCriteria[key],
      value =>
        this.editFill(settings => {
          settings.searchCriteria[key] = value;
        }),
      1,
      max,
      { empty: '' },
    );
  }

  /* The popover opened or closed (`open`): an opening counts the pieces to search for the set's settings, and a closing drops the line
     about a moved rank. The gear is off while an Auto-fill runs, and the bar does not draw it then. */
  settingsToggled(open) {
    if (open) {
      this.refreshCount();
    } else {
      this.rankNote = '';
      this.session.changed();
    }
  }

  /* The set's Auto-fill settings with `change(settings)` applied, saved. Refused while an Auto-fill runs or a result waits: the result
     was made for the settings it was run with, and the settings popover is not drawn then (the bar shows Apply and Discard), so no edit
     can arrive; this keeps it so if a way to one is ever added. */
  editFill(change) {
    const { session } = this;
    if (session.sheets.busy || session.suggestion) {
      return;
    }
    this.rankNote = '';
    const next = clone(session.fillSettings);
    change(next);
    // the tied best meals were found for the old settings: they go with them
    const done = session.sheets.updateSet(session.saved.id, { fillSettings: next, bestMeals: null });
    if (done.ok === false && done.error) {
      return;
    }
    this.refreshCount();
  }

  setGoalField(key, value) {
    this.editFill(settings => {
      settings.goal[key] = value;
    });
  }

  /* Maximize (0), Tiebreak 1 or Tiebreak 2 set to `value` (ranks.js withRank: a stat held by another swaps). */
  setGoal(rank, value) {
    const { job } = this.session;
    let note = '';
    this.editFill(settings => {
      const goal = settings.goal;
      const before = [goal.target, goal.tb, goal.tb2];
      const after = withRank(before, rank, value, job.stats);
      note = rankSwapNote(before, rank, value, after, stat => job.label[stat]);
      [goal.target, goal.tb, goal.tb2] = after.map(stat => stat ?? '');
    });
    this.rankNote = note;
    this.session.changed();
  }

  /* The goal is the job's speed stat: the Target GCD boxes are off (maximizing speed already gives the fastest GCD). */
  get targetIsSpeed() {
    return this.session.fillSettings.goal.target === this.session.job.speedKey;
  }

  /* The options of the Maximize select: every stat of the job. The same array while the job is, so the select is not given new
     options at every draw. */
  get statOptions() {
    const { job } = this.session;
    return this.kept('target', job.stats.join(), () => job.stats.map(stat => ({ value: stat, label: job.label[stat] })));
  }

  /* The options of the Tiebreak `rank` (1 or 2) select: none and the stats no other rank holds. */
  tiebreakOptions(rank) {
    const { job, fillSettings } = this.session;
    const goal = fillSettings.goal;
    const stats = rankChoices([goal.target, goal.tb, goal.tb2], rank, job.stats);
    return this.kept(`tiebreak${rank}`, stats.join(), () => [
      { value: '', label: 'none' },
      ...stats.map(stat => ({ value: stat, label: job.label[stat] })),
    ]);
  }

  /* The list kept under `name` while its `signature` is the same, else `build()`. */
  kept(name, signature, build) {
    if (this.lists.get(name)?.signature !== signature) {
      this.lists.set(name, { signature, list: build() });
    }
    return this.lists.get(name).list;
  }

  /* The filters under Gear to search (the Expansion and Gear categories menus), read from and written to the set's Auto-fill settings. */
  get filters() {
    return this.session.fillSettings.searchCriteria;
  }

  /* A menu sent `patch` (a part of the filters' settings): the set's Auto-fill settings take it. */
  setFilters(patch) {
    this.editFill(settings => Object.assign(settings.searchCriteria, patch));
  }

  /* The Gear to search line for the set's Auto-fill settings, from the solver (in the set's own lane). */
  refreshCount() {
    const { session } = this;
    const saved = session.saved;
    if (!saved) {
      return;
    }
    const job = session.job;
    const context = evaluateInSheet(session.sheet, saved);
    const recipe = fillRecipe(session.fillSettings);
    // the numbers of the "Gear categories" boxes are for the job and filters they were counted under: no old ones under others (the
    // store drops them when this count starts)
    const countedFor = JSON.stringify([job.jobId, gearFilter(recipe)]);
    const id = session.pages.startCount(session.setId, countedFor);
    this.countLanding = session.solver
      .request(solverRequest('gearToSearch', { job, sync: context.sync, level: context.level, recipe }, { key: saved.id }))
      .then(
        ({ result }) => {
          session.pages.countLanded(session.setId, id, countedFor, result);
        },
        error => {
          // the line says so, in its own place, instead of showing a count for other settings; a newer count's answer is the one kept
          const text = `count failed: ${String(error?.message || error).replace(/\.$/, '')}`;
          session.pages.countFailed(session.setId, id, text, isCancelled(error));
        },
      );
  }

  /* Resolves once the newest Gear to search count has landed, so the Auto-fill button's state (off with no piece to search) is the
     settings' own: a press within the first moments of a set page, or right after a settings edit, waits for it. */
  countLanded() {
    return this.countLanding;
  }

  // whether a count is still on its way (a press that finds none pending needs no wait)
  countPending() {
    return this.session.pageState.countId !== null;
  }
}
