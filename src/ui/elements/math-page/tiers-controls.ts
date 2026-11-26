/* The math bar's Substat tiers control as a Lit element in light DOM: the Level box (the Job box before it is the bar's own).
   A child of <gsa-math-screen> (docs/engineering/architecture.md section 3):
   - its parent gives it the sub-tab's settings: `job` (Substat tiers' own job id) and `typedLevel` (the
     level typed into the box, or null: the job's level cap); the element reads no store;
   - a level typed sends `tiers-level` (`detail`: `{level}`, null for the level cap); the page stores it and gives it back;
   - the box is the page's number box (number-field.js numberBox, `live`): each valid level counts as it is typed, with no wait (owner),
     text that still means the stored level stays as typed ("60.7"), the box left or Enter corrects a level out of range to the
     nearest end, and an emptied box goes back to the job's level cap. */
import { LitElement, html } from 'lit';
import { makeJobContext } from '../../../core/job-context.ts';
import { numberBox } from '../../number-field.js';
import { tierLevel } from '../../views/tiers.ts';
import { shownNumber } from '../shared/number-box.ts';
import { TIERS_LEVEL_EVENT } from './tiers-names.ts';

/* The `gsa-tiers-controls` element (registered below): see the file header. */
export class GsaTiersControls extends LitElement {
  static properties = {
    job: { attribute: false },
    typedLevel: { attribute: false },
  };

  declare job: string;
  declare typedLevel: number | null;
  private box;

  constructor() {
    super();
    this.job = '';
    this.typedLevel = null;
    this.box = this.makeBox();
  }

  /* Light DOM: draw into the element itself, so the page's CSS reaches the markup. */
  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  /* The level shown: the one typed, or the job's level cap. */
  private shownLevel(): number {
    const job = makeJobContext(this.job);
    return tierLevel(job, job.maxLevel, this.typedLevel);
  }

  /* Tells the page the level to count: null for the job's level cap itself (the sub-tab then follows it). */
  private sendLevel(level: number | null): void {
    this.dispatchEvent(new CustomEvent(TIERS_LEVEL_EVENT, { detail: { level }, bubbles: true }));
  }

  /* The number box (number-field.js) from 1 to the job's level cap; an emptied box left or entered goes back to the level cap. */
  private makeBox() {
    return numberBox(
      () => this.shownLevel(),
      (level: unknown) => this.sendLevel(level === makeJobContext(this.job).maxLevel ? null : (level as number)),
      1,
      () => makeJobContext(this.job).maxLevel,
      {
        live: true,
        onEmpty: (input: HTMLInputElement) => {
          this.sendLevel(null);
          input.value = String(makeJobContext(this.job).maxLevel);
        },
      },
    );
  }

  protected override render() {
    const job = makeJobContext(this.job);
    return html`
      <label class="mctl wide divided afterjob"><span class="mctl-head">Level <span class="f-range" id="t-level-range">${`1–${job.maxLevel}`}</span></span>
        <input
          type="number"
          id="t-level"
          min="1"
          max=${job.maxLevel}
          step="1"
          inputmode="numeric"
          .value=${shownNumber(this.box)}
          aria-label="Level of the tiers"
          @input=${this.box.onInput}
          @change=${this.box.onChange}>
      </label>
    `;
  }
}

customElements.define('gsa-tiers-controls', GsaTiersControls);
