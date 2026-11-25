/* The Job and sync strip of the Gear browser as a Lit element in light DOM: the Job box (with its menu), the synced level, the synced
   item level, the IL Sync switch and Reset. The page's frame keeps the strip's section (`.jobstrip`: its box, its `aria-label`, hidden
   off the Gear browser, `data-job`); this element is the row inside it and takes no box of its own. It is an island in the Alpine-run
   page (docs/engineering/architecture.md section 3):
   - the page gives it the Gear browser's panel from a wrapper's `x-effect`: `job` (an id), `level`, `cap`, `sync` (the IL Sync
     switch), `maxLevel` (the job's level cap), `maxReal` (the highest real item level) and `tab` (the open tab, for `active`);
   - the fields' events pass through to the page (`level-change`, `cap-change`), and so does the Job menu's (`job-change`); the strip
     sends `sync-change` (the switch, a boolean) and `strip-reset` (after the browser's own confirmation);
   - the cap field follows the level (it lowers a cap above what the level allows) while the Gear browser is open. */
import { LitElement, html } from 'lit';
import '../shared/select.ts';
import './cap-field.ts';
import './job-menu.ts';
import './level-field.ts';
import { RESET_QUESTION, STRIP_RESET_EVENT, SYNC_CHANGE_EVENT } from './job-strip-names.ts';

/* The tab this strip belongs to. */
const STRIP_TAB = 'browse';

/* The `gsa-job-strip` element (registered below): see the file header. */
export class GsaJobStrip extends LitElement {
  static properties = {
    job: { type: String },
    level: { attribute: false },
    cap: { attribute: false },
    sync: { type: Boolean },
    maxLevel: { type: Number },
    maxReal: { type: Number },
    tab: { type: String },
  };

  declare job: string;
  declare level: number | null;
  declare cap: number | null;
  declare sync: boolean;
  declare maxLevel: number;
  declare maxReal: number;
  declare tab: string;

  constructor() {
    super();
    this.job = '';
    this.level = null;
    this.cap = null;
    this.sync = false;
    this.maxLevel = 1;
    this.maxReal = 1;
    this.tab = '';
  }

  /* Light DOM: draw into the element itself, so the page's CSS reaches the markup. */
  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  /* Reset: the browser asks first, and the page resets the open tab's settings on yes. */
  private reset(): void {
    if (window.confirm(RESET_QUESTION)) {
      this.dispatchEvent(new CustomEvent(STRIP_RESET_EVENT, { bubbles: true }));
    }
  }

  // The IL Sync switch is a native checkbox with role=switch: its state is `checked`, which a screen reader reads (the page's other
  // switches are written the same way); the lint rule wants an aria-checked beside it.
  /* eslint-disable lit-a11y/role-has-required-aria-attrs */
  protected override render() {
    return html`
      <div class="f boxf jobfield"><gsa-job-menu prefix="job" button-id="job-menu-btn" menu-id="job-menu" .job=${this.job}></gsa-job-menu></div>
      <gsa-level-field layout="strip" live .value=${this.level} .max=${this.maxLevel}></gsa-level-field>
      <gsa-cap-field
        layout="strip"
        follow
        .value=${this.cap}
        .max=${this.maxReal}
        .syncOn=${this.sync}
        .disabled=${!this.sync}
        .level=${this.level}
        .active=${this.tab === STRIP_TAB}
        .scope=${this.tab}></gsa-cap-field>
      <label class="f"><span>IL Sync</span>
        <span class="toggle"><input
          type="checkbox"
          role="switch"
          class="switch"
          id="sync"
          .checked=${this.sync}
          @change=${(event: Event) =>
            this.dispatchEvent(new CustomEvent(SYNC_CHANGE_EVENT, { detail: (event.target as HTMLInputElement).checked, bubbles: true }))}
        /><span>${this.sync ? 'On' : 'Off'}</span></span>
      </label>
      <span class="jobstrip-gap"></span>
      <div class="f"><span aria-hidden="true">&nbsp;</span><span class="stripctl"><button class="chip" id="reset" type="button" @click=${this.reset}>Reset</button></span></div>`;
  }
  /* eslint-enable lit-a11y/role-has-required-aria-attrs */
}

customElements.define('gsa-job-strip', GsaJobStrip);
