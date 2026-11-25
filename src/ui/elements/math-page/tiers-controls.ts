/* The math bar's Substat tiers control as a Lit element in light DOM: the Level box (the Job box before it is the bar's own).
   An island in the Alpine-run math page (docs/engineering/architecture.md section 3):
   - the page gives it the sub-tab's settings from a wrapper's `x-effect`: `job` (Substat tiers' own job id) and `typedLevel` (the
     level typed into the box, or null: the job's level cap); the element reads no store;
   - a level typed sends `tiers-level` (`detail`: `{level}`, null for the level cap); the page stores it and gives it back;
   - each valid level counts as it is typed, with no wait (owner); the box left or Enter corrects a level out of range to the
     nearest end, and an emptied box goes back to the job's level cap (views/tiers.js tierLevelTyped). */
import { LitElement, html } from 'lit';
import { makeJobContext } from '../../../core/job-context.js';
import { tierLevel, tierLevelTyped } from '../../views/tiers.js';
import { TIERS_LEVEL_EVENT } from './tiers-names.ts';

/* The `gsa-tiers-controls` element (registered below): see the file header. */
export class GsaTiersControls extends LitElement {
  static properties = {
    job: { attribute: false },
    typedLevel: { attribute: false },
  };

  declare job: string;
  declare typedLevel: number | null;

  constructor() {
    super();
    this.job = '';
    this.typedLevel = null;
  }

  /* Light DOM: draw into the element itself, so the page's CSS reaches the markup. */
  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  /* The text of the Level box, counted as it is typed or (`final`) when the box is left or Enter is pressed. */
  private typeLevel(box: HTMLInputElement, final: boolean): void {
    const job = makeJobContext(this.job);
    const typed = tierLevelTyped(job, box.value, tierLevel(job, job.maxLevel, this.typedLevel), final);
    if (!typed) {
      return;
    }
    if (typed.shown !== null) {
      box.value = String(typed.shown);
    }
    if (typed.patch) {
      this.dispatchEvent(new CustomEvent(TIERS_LEVEL_EVENT, { detail: typed.patch, bubbles: true }));
    }
  }

  protected override render() {
    const job = makeJobContext(this.job);
    const level = tierLevel(job, job.maxLevel, this.typedLevel);
    return html`
      <label class="mctl wide divided afterjob"><span class="mctl-head">Level <span class="f-range" id="t-level-range">${`1–${job.maxLevel}`}</span></span>
        <input
          type="number"
          id="t-level"
          min="1"
          max=${job.maxLevel}
          step="1"
          inputmode="numeric"
          .value=${String(level)}
          aria-label="Level of the tiers"
          @input=${(event: Event) => this.typeLevel(event.target as HTMLInputElement, false)}
          @change=${(event: Event) => this.typeLevel(event.target as HTMLInputElement, true)}>
      </label>
    `;
  }
}

customElements.define('gsa-tiers-controls', GsaTiersControls);
