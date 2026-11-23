/* How the math works, GCD (views/gcd.js): the sub-tab (gcdTab) and its controls in the math bar (gcdControls), which
   share their settings through $store.app.gcd (not saved). The level follows the synced level until one is typed. */
import { clamp } from '../../core/clamp.js';
import { LEVEL_TEXT } from '../level-cap.js';
import { TYPING_DEBOUNCE_MS } from '../number-field.js';
import { viewCache } from '../view-cache.js';
import { GCD_LEVELS, HASTE_OPTIONS, HASTE_SIZER, gcdLevelInput, gcdView, speedRange as speedRangeAt } from '../views/gcd.js';

/* The tab's level: the one typed into its box, else Stat Allocation's synced level (the only thing it takes from another
   sub-tab: a level, no job), held to the levels the tab covers. */
function tabLevel(app) {
  return clamp(app.gcd.level ?? app.panel('math').level, 1, GCD_LEVELS);
}

/* The sub-tab: the facts, the chart and the step table. A bar or a row clicked sets the level or the speed. */
export function gcdTab() {
  // the last view and the settings it was built for (view-cache.js viewCache): the template reads `view` several times a
  // render, and a build walks every level for the chart
  const views = viewCache();
  return {
    // the chart's container width (px): the chart is drawn at its width, so its text keeps the page's size
    width: 0,
    init() {
      const observer = new ResizeObserver(([e]) => {
        const w = Math.round(e.contentRect.width);
        if (w && w !== this.width) this.width = w;
      });
      this.$nextTick(() => observer.observe(this.$refs.chart));
    },
    /* the tab's view (views/gcd.js gcdView), built again only when its settings or the chart's width change */
    get view() {
      const app = this.$store.app;
      const args = [tabLevel(app), app.gcd.haste, app.gcd.speed, this.width];
      return views.get(args.join('|'), () => gcdView(...args));
    },
    /* a bar of the chart: its level */
    pickLevel(e) {
      const bar = e.target.closest('[data-level]');
      if (bar) this.$store.app.gcd.level = Number(bar.dataset.level);
    },
    /* a step of the table: its speed (none past the most any job can have) */
    pickSpeed(row) {
      if (!row.out) this.$store.app.gcd.speed = row.speed;
    },
  };
}

/* The math bar's GCD controls: Level, Haste, and the speed row (slider, box, Reset). The boxes count a typed number
   once typing stops (TYPING_DEBOUNCE_MS) or at once on Enter or leaving the box, then show what is used: a level out of
   range is corrected, its note as the box's hover text (no note beside the box, which moved the controls after it, and
   no gold border or flash: owner); a speed is held to the level's range. */
export function gcdControls() {
  let levelTimer = null,
    speedTimer = null;
  return {
    hasteOptions: HASTE_OPTIONS,
    hasteSizer: HASTE_SIZER,
    /* the highest level the Level box takes (every level of the game: views/gcd.js GCD_LEVELS) */
    gcdLevels: GCD_LEVELS,
    /* set for text that is no level: the box shows as invalid */
    levelError: '',
    get level() {
      return tabLevel(this.$store.app);
    },
    /* the speed slider's range at the level: {base, most} (views/gcd.js speedRange) */
    get speedRange() {
      return speedRangeAt(this.level);
    },
    /* the speed used: the one asked for, held to the level's range */
    get speed() {
      const { base, most } = this.speedRange,
        asked = this.$store.app.gcd.speed;
      return Math.max(base, Math.min(most, asked ?? base));
    },
    /* how far along its range the slider's thumb is (percent): the track is drawn filled up to it */
    get speedFill() {
      const { base, most } = this.speedRange;
      return most > base ? ((this.speed - base) / (most - base)) * 100 : 0;
    },
    typeLevel(el, now = false) {
      clearTimeout(levelTimer);
      if (!now) {
        levelTimer = setTimeout(() => this.typeLevel(el, true), TYPING_DEBOUNCE_MS);
        return;
      }
      const app = this.$store.app;
      this.levelError = '';
      // an empty box follows the synced level again
      if (el.value === '') {
        app.gcd.level = null;
        el.value = this.level;
        return;
      }
      const r = gcdLevelInput(el.value);
      if (!r) {
        this.levelError = LEVEL_TEXT.typedBad(GCD_LEVELS);
        return;
      }
      app.gcd.level = r.level === app.panel('math').level ? null : r.level;
      el.value = r.level;
    },
    typeSpeed(el, now = false) {
      clearTimeout(speedTimer);
      if (!now) {
        speedTimer = setTimeout(() => this.typeSpeed(el, true), TYPING_DEBOUNCE_MS);
        return;
      }
      const v = Math.round(Number(el.value));
      if (el.value !== '' && Number.isFinite(v)) this.$store.app.gcd.speed = v;
      el.value = this.speed;
    },
    slide(value) {
      this.$store.app.gcd.speed = Number(value);
    },
    /* back to the level's base: no speed from gear or food */
    resetSpeed() {
      this.$store.app.gcd.speed = null;
    },
  };
}
