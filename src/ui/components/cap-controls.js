/* The sync cap field's behaviour (capControls) and the Level box's validation (levelControls). The cap's is shared by the two places that have one: the Job and sync strip (Gear browser) and the Sync
   settings popover of Stat Allocation (How the math works). Each takes it with its own tab name, and reacts only while that
   tab is open, so the hidden one never lowers or flags the open tab's cap. Both edit the store's top-level level, cap and
   sync (the open tab's panel). The component using it calls `initCap()` from its `init()`, and has an x-ref "cap" on the input. */
import {
  CAP_MISSING_TEXT,
  CAP_TYPED_BAD_TEXT,
  LEVEL_TEXT,
  capFlag,
  capLoweredText,
  capTextBad,
  levelTextBad,
  limitCapToLevel,
} from '../level-cap.js';
import { TYPING_DEBOUNCE_MS, flashLowered } from '../number-field.js';

/* The members for the component of tab `ownTab` ('browse' or 'math'); put a component together with them by compose
   (compose.js). */
export function capControls(ownTab) {
  return {
    /* the cap field holds text that is not a whole item level in range (the store keeps its last valid cap) */
    capTypedBad: false,
    // the cap the page last lowered, {from, to, level} (limitCapToLevel), for the note under the field; null once the
    // cap is changed to one the level allows, or the level settles without lowering it
    capLowered: null,
    initCap() {
      const open = () => this.$store.app.tab === ownTab;
      this.$watch('$store.app.tab', () => {
        this.capTypedBad = false;
        this.capLowered = null;
      });
      this.$watch('$store.app.cap', cap => {
        if (!open()) {
          return;
        }
        this.capTypedBad = false; // changed from elsewhere (reset, or a valid entry)
        if (cap === this.capLowered?.to) {
          return; // the page's own lowering
        }
        this.lowerCap(); // a cap entered above what the level allows (the field commits once typing settles)
      });
      this.$watch('$store.app.sync', () => open() && this.lowerCap());
      // the cap follows the level once the level settles: the level field commits on every keystroke, and typing 80
      // passes through 8, which would lower the cap to level 8's
      let timer = null;
      this.$watch('$store.app.level', () => {
        clearTimeout(timer);
        timer = setTimeout(() => open() && this.lowerCap(), TYPING_DEBOUNCE_MS);
      });
    },
    /* limitCapToLevel, keeping what it lowered for the note. A second lowering (the up arrow at the limit) updates the note
       in place and flashes the field again: hiding and showing the note made the panel jump (owner's report, 2026-10-18). */
    lowerCap() {
      const app = this.$store.app;
      // limitCapToLevel lowers the cap of the object it is given: a copy of the panel's fields, then the store gets the new cap
      const lowered = limitCapToLevel({ cap: app.cap, sync: app.sync, level: app.level });
      if (lowered) {
        app.editPanel({ cap: lowered.to });
      }
      this.capLowered = lowered;
      if (lowered) {
        flashLowered(this.$refs.cap);
      }
    },
    /* under the cap field after the page lowered it (capLoweredText): "Lowered to 135, max for level 50." */
    get capLoweredNote() {
      return this.capError ? '' : capLoweredText(this.capLowered);
    },
    /* the cap field's flag in its label line (level-cap.js capFlag); `range` is the range text, "1–795" */
    capFlag(range) {
      return capFlag({ error: this.capError, missing: this.capMissing, note: this.capLoweredNote, lowered: this.capLowered, range });
    },
    onCapInput(text) {
      if (text === '') {
        this.$store.app.editPanel({ cap: null }); // an empty field means no cap
      }
      this.capTypedBad = capTextBad(text);
    },
    /* sync is on, the field is empty and holds no text that is no cap (that error comes first) */
    get capMissing() {
      const app = this.$store.app;
      return app.sync && !this.capTypedBad && app.cap == null;
    },
    /* shown under the cap field while sync is on */
    get capError() {
      if (!this.$store.app.sync) {
        return '';
      }
      if (this.capTypedBad) {
        return CAP_TYPED_BAD_TEXT;
      }
      return this.capMissing ? CAP_MISSING_TEXT : '';
    },
  };
}

/* The Level box's validation, for Stat Allocation's Sync settings popover (the Gear browser strip's level box has none: it
   moves a level out of range to the nearest one when it is left). The box commits each valid level as it is typed
   ({live: true, snap: false}, so a bad value is neither committed nor moved to the nearest level); this keeps the text that
   is no level (levelTextBad) for the error flag and the box's look, as capControls does for the cap box. The component calls
   `initLevel()` from its `init()`; the input has an x-ref "level". Put a component together with it by compose. */
export function levelControls() {
  return {
    /* the level box holds text that is no whole level in range (the store keeps its last valid level) */
    levelTypedBad: false,
    initLevel() {
      // a valid entry (or a change from elsewhere) ends the error; so does a job change or a tab change, which also put the
      // stored level back in the box
      const clear = () => {
        this.levelTypedBad = false;
        if (this.$refs.level) {
          this.$refs.level.value = this.$store.app.level ?? '';
        }
      };
      this.$watch('$store.app.level', () => (this.levelTypedBad = false));
      this.$watch('$store.app.job', clear);
      this.$watch('$store.app.tab', clear);
    },
    /* text typed in the level box: whether it is no level */
    onLevelInput(text) {
      this.levelTypedBad = levelTextBad(text, this.$store.app.jobCtx.maxLevel);
    },
    /* the whole sentence while the box holds text that is no level (LEVEL_TEXT.typedBad), else '' */
    get levelError() {
      return this.levelTypedBad ? LEVEL_TEXT.typedBad(this.$store.app.jobCtx.maxLevel) : '';
    },
    /* the level box's flag in its label line (capFlag, as the cap box's); `range` is the range text, "1–100" */
    levelFlag(range) {
      return capFlag({ error: this.levelError, range });
    },
  };
}
