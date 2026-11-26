/* The math bar's GCD controls as a Lit element in light DOM: Level, Haste and the speed row (slider, box, Reset). A child of
   <gsa-math-screen> (docs/engineering/architecture.md section 3):
   - its parent gives it the tab's settings: `level` (the level typed into the Level box, or null),
     `syncedLevel` (Stat Allocation's, which the tab follows until a level is typed), `haste` (a haste job id, or '') and `speed`
     (the speed asked for, or null); the element reads no store;
   - an edit sends `gcd-edit` (`detail`: `{level}`, `{haste}` or `{speed}`); the page edits its settings and gives them back;
   - the boxes count a typed number once typing stops (TYPING_DEBOUNCE_MS) or at once on Enter or leaving the box, then show
     what is used: a level out of range is corrected, and text that is no level marks the box invalid (no note beside the box,
     which moved the controls after it, and no gold border or flash: owner); a speed is held to the level's range. The slider
     and Reset act at once. */
import { LitElement, html } from 'lit';
import { classMap } from 'lit/directives/class-map.js';
import { LEVEL_TEXT } from '../../level-cap.ts';
import { TYPING_DEBOUNCE_MS } from '../../number-field.ts';
import { GCD_LEVELS, HASTE_OPTIONS, HASTE_SIZER, gcdControlsView, gcdLevelTyped, gcdSpeedTyped } from '../../views/gcd.ts';
import { GCD_EDIT_EVENT, type GcdSettings } from './gcd-names.ts';

/* The `gsa-gcd-controls` element (registered below): see the file header. */
export class GsaGcdControls extends LitElement {
  static properties = {
    level: { attribute: false },
    syncedLevel: { attribute: false },
    haste: { attribute: false },
    speed: { attribute: false },
    levelError: { state: true },
  };

  declare level: number | null;
  declare syncedLevel: number;
  declare haste: string;
  declare speed: number | null;
  // set for text that is no level: the Level box shows as invalid
  declare levelError: string;
  private levelTimer: ReturnType<typeof setTimeout> | undefined;
  private speedTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    super();
    this.level = null;
    this.syncedLevel = 1;
    this.haste = '';
    this.speed = null;
    this.levelError = '';
  }

  /* Light DOM: draw into the element itself, so the page's CSS reaches the markup. */
  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    clearTimeout(this.levelTimer);
    clearTimeout(this.speedTimer);
  }

  private edit(patch: Partial<GcdSettings>): void {
    this.dispatchEvent(new CustomEvent(GCD_EDIT_EVENT, { detail: patch, bubbles: true }));
  }

  /* What the controls show now (views/gcd.ts gcdControlsView). */
  private get shown() {
    return gcdControlsView(this.level, this.syncedLevel, this.speed);
  }

  /* The Level box's text, counted at once (`now`) or once typing stops. */
  private typeLevel(box: HTMLInputElement, now = false): void {
    clearTimeout(this.levelTimer);
    if (!now) {
      this.levelTimer = setTimeout(() => this.typeLevel(box, true), TYPING_DEBOUNCE_MS);
      return;
    }
    const typed = gcdLevelTyped(box.value, this.syncedLevel);
    this.levelError = typed.error ? LEVEL_TEXT.typedBad(GCD_LEVELS) : '';
    if (typed.patch) {
      this.edit(typed.patch);
      box.value = String(typed.shown);
    }
  }

  /* The speed box's text, counted at once (`now`) or once typing stops. */
  private typeSpeed(box: HTMLInputElement, now = false): void {
    clearTimeout(this.speedTimer);
    if (!now) {
      this.speedTimer = setTimeout(() => this.typeSpeed(box, true), TYPING_DEBOUNCE_MS);
      return;
    }
    const typed = gcdSpeedTyped(box.value, this.shown.level, this.speed);
    if (typed.patch) {
      this.edit(typed.patch);
    }
    box.value = String(typed.shown);
  }

  protected override render() {
    const shown = this.shown;
    const invalid = Boolean(this.levelError);
    return html`
      <label class="mctl wide"><span class="mctl-head">Level <span class="f-range">${`1–${GCD_LEVELS}`}</span></span>
        <input
          type="number"
          id="g-level"
          min="1"
          max=${GCD_LEVELS}
          step="1"
          inputmode="numeric"
          .value=${String(shown.level)}
          aria-label="Level of the GCD tab"
          class=${classMap({ invalid: invalid })}
          aria-invalid=${String(invalid)}
          @input=${(event: Event) => this.typeLevel(event.target as HTMLInputElement)}
          @change=${(event: Event) => this.typeLevel(event.target as HTMLInputElement, true)}>
      </label>
      <div class="mctl fit">
        <label for="g-haste">Haste</label>
        <span class="sized"><span
          class="selhost"><gsa-select
            button-id="g-haste"
            label="Haste"
            .options=${HASTE_OPTIONS}
            .value=${this.haste}
            @change=${(event: CustomEvent<string>) => this.edit({ haste: event.detail })}></gsa-select></span><span class="sizertext" aria-hidden="true">${HASTE_SIZER}</span></span>
      </div>
      <div class="ilctl small">
        <label for="g-range">Speed (base + gear + food)</label>
        <span class="bound">${shown.base}</span>
        <input
          type="range"
          id="g-range"
          min=${shown.base}
          max=${shown.most}
          step="1"
          .value=${String(shown.speed)}
          style=${`--fill: ${shown.fill}%`}
          @input=${(event: Event) => this.edit({ speed: Number((event.target as HTMLInputElement).value) })}>
        <span class="bound" id="g-most">${shown.most}</span>
        <input
          type="number"
          id="g-speed"
          min=${shown.base}
          max=${shown.most}
          step="1"
          inputmode="numeric"
          .value=${String(shown.speed)}
          aria-label="Speed (base + gear + food)"
          @input=${(event: Event) => this.typeSpeed(event.target as HTMLInputElement)}
          @change=${(event: Event) => this.typeSpeed(event.target as HTMLInputElement, true)}>
        <button type="button" class="chip" id="g-reset" @click=${() => this.edit({ speed: null })}>Reset</button>
      </div>
    `;
  }
}

customElements.define('gsa-gcd-controls', GsaGcdControls);
