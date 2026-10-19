/* Page root and the job / sync settings panel. Nested components inherit the root's `job` and helpers. */
import { JOBS, JOB_ROWS, SLOT_LABEL } from '../../core/constants.js';
import { JOB_ICONS } from '../../data/job-icons.js';
import { dataSourceLabel } from '../../core/tables.js';
import { rankChoices } from '../views/ranks.js';
import { limitCapToLevel } from '../state.js';
import { TYPING_DEBOUNCE_MS } from '../helpers.js';

export function page() {
  return {
    slotLabel: SLOT_LABEL,
    /* footer note naming the datamining commit; empty when unknown */
    dataSource: dataSourceLabel(),
    /* the current JobContext */
    get job() {
      return this.$store.app.jobCtx;
    },
    get slotOptions() {
      return this.job.activeSlotTypes.map(t => [t, SLOT_LABEL[t]]);
    },
    get substatOptions() {
      return this.job.substats.map(s => [s, this.job.label[s]]);
    },
    /* the 2nd substat's options: none, then every substat but the 1st (views/ranks.js) */
    get substat2Options() {
      const subs = this.$store.app.piece.subs;
      return [['', 'none']].concat(rankChoices(subs, 1, this.job.substats).map(s => [s, this.job.label[s]]));
    },
  };
}

export function settings() {
  return {
    requestJob(id) {
      this.$store.app.setJob(id); // job-specific settings reset (resetForJob); nothing else is lost, so no confirmation
    },
    /* the cap field holds text that is not a whole item level in range (the store keeps its last valid cap) */
    capTypedBad: false,
    // the cap the page last lowered, {from, to, level} (limitCapToLevel), for the note under the field; null once the
    // cap is changed to one the level allows, or the level settles without lowering it
    capLowered: null,
    init() {
      this.$watch('$store.app.cap', cap => {
        this.capTypedBad = false; // changed from elsewhere (reset, or a valid entry)
        if (cap === this.capLowered?.to) return; // the page's own lowering
        this.lowerCap(); // a cap entered above what the level allows (the field commits once typing settles)
      });
      this.$watch('$store.app.sync', () => this.lowerCap());
      // the cap follows the level once the level settles: the level field commits on every keystroke, and typing 80
      // passes through 8, which would lower the cap to level 8's
      let timer = null;
      this.$watch('$store.app.level', () => {
        clearTimeout(timer);
        timer = setTimeout(() => this.lowerCap(), TYPING_DEBOUNCE_MS);
      });
    },
    /* limitCapToLevel, keeping what it lowered for the note. A second lowering (the up arrow at the limit) updates the
       note in place and flashes the field again: hiding and showing the note made the panel jump (owner's report,
       2026-10-18). */
    lowerCap() {
      const lowered = limitCapToLevel(this.$store.app);
      this.capLowered = lowered;
      if (!lowered) return;
      const field = this.$refs.cap; // restart the flash: drop the class, let the browser see it gone, add it back
      field.classList.remove('flash');
      void field.offsetWidth;
      field.classList.add('flash');
    },
    /* under the cap field after the page lowered it: "Lowered to 135, the highest for level 50.", or at the job's
       level cap "Lowered to 795, the highest item level." */
    get capLoweredNote() {
      const c = this.capLowered;
      if (!c || this.capError) return '';
      return `Lowered to ${c.to}, the highest ${c.level == null ? 'item level' : `for level ${c.level}`}.`;
    },
    onCapInput(text) {
      const app = this.$store.app,
        v = Number(text);
      if (text === '') app.cap = null; // an empty field means no cap
      // a whole number above the highest real item level is a cap too: limitCapToLevel lowers it
      this.capTypedBad = text !== '' && !(Number.isInteger(v) && v >= 1);
    },
    /* shown under the cap field while sync is on */
    get capError() {
      const app = this.$store.app;
      if (!app.sync) return '';
      if (this.capTypedBad) return `Enter a whole item level from 1 to ${app.maxReal}`;
      return app.cap == null ? 'Enter a sync cap' : '';
    },
    /* every setting back to its default, after the browser's own confirmation dialog */
    requestReset() {
      if (window.confirm('Reset every setting to its default?')) this.$store.app.resetAll();
    },
    jobRows: JOB_ROWS.map(([label, ids]) => ({
      label,
      jobs: ids.map(id => ({ id, name: JOBS.find(j => j[0] === id)[1], icon: JOB_ICONS[id] })),
    })),
  };
}
