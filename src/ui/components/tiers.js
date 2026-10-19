/* How the math works, Substat tiers: the substats' tier ladder (views/tiers.js). The values are not saved: each starts at
   the substat's base, and what the user types or clicks is kept on top until the job or the level changes. The level is the synced level until the user types another into the math bar's box; it is in
   $store.app.tiers (not saved), shared by the bar (tierControls) and the table (tierTable), as the GCD tab's
   are (owner, 2026-10-19: every sub-tab's controls in the bar). The values are worked out on every read (no effect
   that refills them later), so a level typed in the settings shows its own tiers and values in one render. */
import { numberField } from '../helpers.js';
import { tierInput, tierLevel, tiersView, tierValues } from '../views/tiers.js';

/* Space kept between a ? note and the panel's edge, and between it and its button (px); the note starts HELP_SHIFT px
   left of its button, so the button stays in view above the note's start. */
const HELP_GAP = 8;
const HELP_SHIFT = 20;
/* The note's width before it has been shown once (px; the CSS width of .statpop). */
const HELP_WIDTH = 340;

export function tierTable() {
  // the last view and what it was built from: the template and `help` read `view` many times a render
  let cached = { key: null, view: null };
  return {
    /* values typed or clicked, {stat: value}, and the settings they were made under (editsKey) */
    edits: {},
    editsFor: '',
    get level() {
      return tierLevel(this.$store.app, this.$store.app.tiers.level);
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
    /* the cards (views/tiers.js tiersView), or null with no job; built again only when the job, the level or the edits
       change */
    get view() {
      const app = this.$store.app;
      if (!app.job) return null;
      const key = JSON.stringify([app.job, this.level, this.liveEdits]);
      if (cached.key !== key) cached = { key, view: tiersView(app, { ...tierValues(app, this.level), ...this.liveEdits }, this.level) };
      return cached.view;
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
      const value = tierInput(this.$store.app, stat, el.value, this.level);
      if (value == null) return;
      this.setEdit(stat, value);
      el.value = value;
    },
    /* a tier clicked: the value goes to its start */
    pick(to) {
      const [stat, start] = to.split(':');
      this.setEdit(stat, Number(start));
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

/* The math bar's Substat tiers control: its Level box. */
export function tierControls() {
  return {
    get level() {
      return tierLevel(this.$store.app, this.$store.app.tiers.level);
    },
    /* the level box: each valid level counts as it is typed, as in the settings' level box (owner, 2026-10-19); the
       synced level itself, or an empty box left or entered, follows the synced level again */
    get levelField() {
      const app = this.$store.app;
      return numberField(
        () => this.level,
        v => {
          app.tiers.level = v === app.level ? null : v;
        },
        1,
        () => app.jobCtx.maxLevel,
        {
          live: true,
          onEmpty: input => {
            app.tiers.level = null;
            input.value = this.level;
          },
        },
      );
    },
  };
}
