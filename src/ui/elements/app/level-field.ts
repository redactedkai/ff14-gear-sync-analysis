/* The synced level field as a Lit element in light DOM: the label with its range or flag, and the number box. One field for every
   place that has one: the Gear browser's strip, the Sync settings popover of Stat Allocation, a sheet's page and the New and Copy
   sheet dialogs. The element is the field's own box (its `class` and `title` are set on it), so the page's CSS for `.f` and `.mctl`
   reaches it as it did the boxes it replaces. It reads no store (docs/engineering/architecture.md section 3):
   - the page gives it `layout` (the ids, label and classes of the place it is in: LAYOUTS), `value` (the stored level, null for none),
     `max` (the job's level cap) and `disabled`;
   - it sends `level-change` (the level the box commits); the page edits the store and gives `value` back;
   - the box commits a level as it is typed with `live` (no wait: the Gear browser's strip and Stat Allocation), else after a pause,
     a step at once, Enter or leaving the box at once. A level out of range moves to the nearest on leaving the box with `snap` (the
     default); without it, it stays in the box;
   - `validate`: text that is no level in range (levelTextBad) is flagged and not committed, the box marked invalid, and `typed-bad-change`
     tells the page (Stat Allocation's chip turns red); `scope` changing (the open tab or the job) drops the text typed and shows the
     stored level again, and so does `clearTyped()`. */
import { LitElement, type PropertyValues, html, nothing } from 'lit';
import { classMap } from 'lit/directives/class-map.js';
import { levelTextBad } from '../../level-cap.ts';
import { numberBox } from '../../number-field.js';
import { levelFieldView } from '../../views/cap-field.ts';
import { shownNumber } from '../shared/number-box.ts';
import { capFlagTemplate } from './cap-flag.ts';
import { LEVEL_CHANGE_EVENT, TYPED_BAD_EVENT } from './field-names.ts';

/* The places a level field is in: `id` (the box's id; its range and error are `<id>-range` and `-error`), `host` (the field's own
   classes), `labelClass`, `label`, and `errors` (the place shows the error line and marks the box invalid). */
const LAYOUTS = {
  strip: { id: 'level', host: 'f boxf field', labelClass: '', label: 'Synced level', errors: false },
  math: { id: 'p-level', host: 'mctl sync-level', labelClass: 'mctl-head capline', label: 'Level', errors: true },
  sheet: { id: 'sh-level', host: 'f field', labelClass: '', label: 'Level', errors: false },
  dialog: { id: 'sh-dlg-level', host: 'f field', labelClass: '', label: 'Level', errors: false },
};
export type LevelLayout = keyof typeof LAYOUTS;

/* The `gsa-level-field` element (registered below): see the file header. */
export class GsaLevelField extends LitElement {
  static properties = {
    layout: { type: String },
    value: { attribute: false },
    max: { type: Number },
    disabled: { type: Boolean },
    live: { type: Boolean },
    snap: { type: Boolean },
    validate: { type: Boolean },
    scope: { attribute: false },
    typedBad: { state: true },
  };

  declare layout: LevelLayout;
  declare value: number | null;
  declare max: number;
  declare disabled: boolean;
  declare live: boolean;
  declare snap: boolean;
  declare validate: boolean;
  declare scope: unknown;
  declare typedBad: boolean;
  private box;
  private view: ReturnType<typeof levelFieldView> | null = null;
  private resync = false;
  private classesSet = false;
  private reportedBad = false;

  constructor() {
    super();
    this.layout = 'strip';
    this.value = null;
    this.max = 1;
    this.disabled = false;
    this.live = false;
    this.snap = true;
    this.validate = false;
    this.scope = null;
    this.typedBad = false;
    this.box = this.makeBox();
  }

  /* The number box (number-field.js) from 1 to the job's level cap. */
  private makeBox() {
    return numberBox(
      () => this.value,
      (value: unknown) => this.dispatchEvent(new CustomEvent(LEVEL_CHANGE_EVENT, { detail: value, bubbles: true })),
      1,
      () => this.max,
      { live: this.live, snap: this.snap },
    );
  }

  /* Light DOM: draw into the element itself, so the page's CSS reaches the markup. */
  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  /* Drops the text typed in the box and shows the stored level again. */
  clearTyped(): void {
    this.typedBad = false;
    const input = this.querySelector('input');
    if (input) {
      input.value = this.value == null ? '' : String(this.value);
    }
  }

  /* Before each draw: the box's options, a stored level that changed or another scope ending the text typed, and the flag. */
  protected override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('live') || changed.has('snap')) {
      this.box = this.makeBox();
    }
    if (this.hasUpdated && (changed.has('value') || changed.has('scope'))) {
      this.typedBad = false;
    }
    this.resync = this.hasUpdated && changed.has('scope');
    this.view = levelFieldView({ typedBad: this.validate && this.typedBad, max: this.max });
  }

  /* After each draw: the field's own box (classes and tooltip), the stored level back in the box when the scope changed, and what the
     page is told about the text typed. */
  protected override updated(): void {
    if (!this.classesSet) {
      this.classList.add(...LAYOUTS[this.layout].host.split(' '));
      this.classesSet = true;
    }
    const title = this.view?.flag.full;
    if (title) {
      this.title = title;
    } else {
      this.removeAttribute('title');
    }
    if (this.resync) {
      this.resync = false;
      const input = this.querySelector('input');
      if (input) {
        input.value = this.value == null ? '' : String(this.value);
      }
    }
    const bad = Boolean(this.view?.error);
    if (bad !== this.reportedBad) {
      this.reportedBad = bad;
      this.dispatchEvent(new CustomEvent(TYPED_BAD_EVENT, { detail: bad, bubbles: true }));
    }
  }

  /* Text typed in the box, at each keystroke. */
  private onInput(event: InputEvent): void {
    this.typedBad = levelTextBad((event.target as HTMLInputElement).value, this.max);
    this.box.onInput(event);
  }

  protected override render() {
    const view = this.view;
    if (!view) {
      return nothing;
    }
    const layout = LAYOUTS[this.layout];
    const id = layout.id;
    return html`<label for=${id} class=${layout.labelClass}>${layout.label} ${capFlagTemplate(`${id}-range`, view.range, view.flag)}</label>
      <input
        type="number"
        id=${id}
        step="1"
        inputmode="numeric"
        min="1"
        max=${this.max}
        ?disabled=${this.disabled}
        .value=${shownNumber(this.box)}
        class=${classMap({ invalid: layout.errors && Boolean(view.error) })}
        aria-invalid=${layout.errors ? String(Boolean(view.error)) : nothing}
        aria-describedby=${layout.errors ? `${id}-error` : nothing}
        @input=${this.onInput}
        @change=${this.box.onChange}
      />
      ${layout.errors ? html`<span class="sr-only" id="${id}-error" style=${view.error ? '' : 'display: none'} aria-live="polite">${view.error}</span>` : nothing}`;
  }
}

customElements.define('gsa-level-field', GsaLevelField);
