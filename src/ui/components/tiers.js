/* How the math works, Substat tiers: the substats' tier ladder (views/tiers.js). The values are not saved: each starts at
   the substat's base, and what the user types, clicks or fills is kept on top until the job or the level changes. The
   optimizer result comes in only from the math bar's Fill chip (owner, 2026-10-18), never on its own after an
   Optimize. The level is the synced level until the user types
   another into the title's box (not saved). The values are worked out on every read (no effect that refills them
   later), so a level typed in the settings shows its own tiers and values in one render. The Fill chip sends
   'tier-fill', which puts the result's values in at the synced level. */
import { tierFill, tierInput, tierLevel, tiersView, tierValues } from '../views/tiers.js';

/* Space kept between a ? note and the panel's edge, and between it and its button (px); the note starts HELP_SHIFT px
   left of its button, so the button stays in view above the note's start. */
const HELP_GAP = 8;
const HELP_SHIFT = 20;
/* The note's width before it has been shown once (px; the CSS width of .statpop). */
const HELP_WIDTH = 340;

export function tierTable() {
  return {
    /* values typed or clicked, {stat: {value, note}}, and the settings they were made under (editsKey) */
    edits: {},
    editsFor: '',
    /* More tiers: 7 either side instead of 3 */
    more: false,
    /* a level typed into the title's box, or null to follow the synced level */
    typedLevel: null,
    get level() {
      return tierLevel(this.$store.app, this.typedLevel);
    },
    /* the tier under the mouse ('stat:start'): all its cells are highlighted, since a click on any of them sets it */
    hover: '',
    /* the substat whose ? note is open, or null, and where the note sits in the panel */
    helpFor: null,
    helpAt: { top: 0, left: 0 },
    /* the job and levels the values were made under: edits made under another key are dropped */
    get editsKey() {
      const app = this.$store.app;
      return JSON.stringify([app.job, this.level, app.level]);
    },
    /* the edits that still apply: none once the settings they were made under have changed */
    get liveEdits() {
      return this.editsFor === this.editsKey ? this.edits : {};
    },
    get view() {
      const app = this.$store.app;
      if (!app.job) return null;
      const values = tierValues(app, this.level),
        notes = {};
      for (const [stat, e] of Object.entries(this.liveEdits)) {
        values[stat] = e.value;
        notes[stat] = e.note;
      }
      return tiersView(app, values, notes, this.more, this.level);
    },
    get help() {
      return this.view?.groups.find(g => g.stat === this.helpFor)?.help ?? null;
    },
    /* keep `edit` ({value, note}) for a substat, dropping edits made under other settings */
    setEdit(stat, edit) {
      this.edits = { ...this.liveEdits, [stat]: edit };
      this.editsFor = this.editsKey;
    },
    /* the Fill chip: the optimizer result's values (tierFill, for the current settings only), at the synced level;
       typed and clicked values are dropped */
    fill() {
      this.typedLevel = null;
      const values = tierFill(this.$store.app) ?? {};
      this.edits = Object.fromEntries(Object.entries(values).map(([stat, value]) => [stat, { value, note: '' }]));
      this.editsFor = this.editsKey;
    },
    /* a level typed into the title's box (Enter or leaving it); empty, or the synced level itself, follows the synced
       level again */
    typeLevel(el) {
      const v = Math.round(Number(el.value));
      this.typedLevel = el.value === '' || !Number.isFinite(v) || v === this.$store.app.level ? null : v;
      el.value = this.level;
    },
    /* a value typed into a substat's box (Enter or leaving the box); the box shows the value kept */
    type(stat, el) {
      const r = tierInput(this.$store.app, stat, el.value, this.level);
      if (!r) return;
      this.setEdit(stat, r);
      el.value = r.value;
    },
    /* a tier clicked: the value goes to its start */
    pick(to) {
      const [stat, start] = to.split(':');
      this.setEdit(stat, { value: Number(start), note: '' });
    },
    /* open or close a substat's ? note, under its button and inside the panel */
    toggleHelp(stat, button) {
      if (this.helpFor === stat) {
        this.helpFor = null;
        return;
      }
      const panel = this.$refs.panel.getBoundingClientRect(),
        r = button.getBoundingClientRect();
      const width = this.$refs.pop.offsetWidth || HELP_WIDTH;
      this.helpAt = {
        top: Math.round(r.bottom - panel.top + HELP_GAP),
        left: Math.round(Math.max(HELP_GAP, Math.min(r.left - panel.left - HELP_SHIFT, panel.width - width - HELP_GAP))),
      };
      this.helpFor = stat;
    },
  };
}
