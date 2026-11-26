/* The item level (sync cap) field as a Lit element in light DOM: the label with its range or flag, the number box, and the notes a
   screen reader hears. One field for every place that has one: the Gear browser's strip, the Sync settings popover of Stat Allocation,
   a sheet's page and the New and Copy sheet dialogs. The element is the field's own box (its `class` and `title` are set on it), so
   the page's CSS for `.f` and `.mctl` reaches it as it did the boxes it replaces. It reads no store
   (docs/engineering/architecture.md section 3):
   - the page gives it `layout` (the ids, label and classes of the place it is in: LAYOUTS), `value` (the stored cap, null for none),
     `max` (the highest real item level), `syncOn`, `disabled`, and `guess` (a sentence that is the tooltip while no flag says more:
     Stat Allocation's inferred level sync target);
   - it sends `cap-change` (the cap the box commits: a typed number after a pause, a step at once, Enter or leaving the box at once;
     null for an emptied box while `follow`); the page edits the store and gives `value` back;
   - the box holds any whole number from 1 as typed (the page lowers it); text that is no item level is flagged (`validate`: the
     store keeps its last cap), and with `snap` a number out of range moves to the nearest on leaving the box;
   - `lowered`: the cap the page last lowered ({from, to, level}), for the note, the flag and the box's gold border. The box shows the
     lowered cap and flashes each time `lowered` is a new object (not when `scope` changed with it: that is another sheet);
   - `follow` (the Job and sync panels): the field lowers the cap itself when the stored cap, IL Sync or, once it settles, the level
     changes, while `active` (its tab is open), and sends `lowered-change`; `scope` (the open tab) changing drops the text typed and
     the note. The rule is cap-follow.ts's.
   `clearTyped()` drops the text typed and shows the stored cap again. */
import { LitElement, type PropertyValues, html, nothing } from 'lit';
import { classMap } from 'lit/directives/class-map.js';
import { MAX_REAL } from '../../../core/tables.ts';
import { capTextBad, limitCapToLevel } from '../../level-cap.ts';
import { TYPING_DEBOUNCE_MS, flashLowered, numberBox } from '../../number-field.ts';
import { capFieldView } from '../../views/cap-field.ts';
import { shownNumber } from '../shared/number-box.ts';
import { type CapFlag, capFlagTemplate } from './cap-flag.ts';
import { type FollowInput, followPlan } from './cap-follow.ts';
import { CAP_CHANGE_EVENT, LOWERED_CHANGE_EVENT, type LoweredCap } from './field-names.ts';

/* The places a cap field is in: `id` (the box's id; its range, error, lowered note and guess are `<id>-range`, `-error`, `-lowered` and
   `-guess`), `host` (the field's own classes), `labelClass`, `label`, and `errors` (the place shows the error line and marks the box
   invalid; the dialogs' form shows neither, only the note). */
const LAYOUTS = {
  strip: { id: 'cap', host: 'f boxf field', labelClass: 'capline', label: html`Synced item level`, errors: true },
  math: { id: 'p-cap', host: 'mctl sync-cap', labelClass: 'mctl-head capline', label: html`<span>Synced IL</span>`, errors: true },
  sheet: { id: 'sh-cap', host: 'f field', labelClass: 'capline', label: html`Item level`, errors: true },
  dialog: { id: 'sh-dlg-cap', host: 'f field', labelClass: 'capline', label: html`Item level`, errors: false },
};
export type CapLayout = keyof typeof LAYOUTS;

/* The inputs whose change cap-follow.ts plans for. */
const FOLLOWED_INPUTS = ['value', 'syncOn', 'level', 'active', 'scope'] as const;

/* The `gsa-cap-field` element (registered below): see the file header. */
export class GsaCapField extends LitElement {
  static properties = {
    layout: { type: String },
    value: { attribute: false },
    max: { type: Number },
    syncOn: { type: Boolean, attribute: 'sync-on' },
    disabled: { type: Boolean },
    guess: { type: String },
    level: { attribute: false },
    follow: { type: Boolean },
    active: { type: Boolean },
    scope: { attribute: false },
    validate: { type: Boolean },
    snap: { type: Boolean },
    lowered: { attribute: false },
    typedBad: { state: true },
  };

  declare layout: CapLayout;
  declare value: number | null;
  declare max: number;
  declare syncOn: boolean;
  declare disabled: boolean;
  declare guess: string;
  declare level: number | null;
  declare follow: boolean;
  declare active: boolean;
  declare scope: unknown;
  declare validate: boolean;
  declare snap: boolean;
  declare lowered: LoweredCap | null;
  declare typedBad: boolean;
  private box;
  private view: ReturnType<typeof capFieldView> | null = null;
  private levelTimer: ReturnType<typeof setTimeout> | undefined;
  private scopeChanged = false;
  private classesSet = false;

  constructor() {
    super();
    this.layout = 'strip';
    this.value = null;
    this.max = MAX_REAL;
    this.syncOn = false;
    this.disabled = false;
    this.guess = '';
    this.level = null;
    this.follow = false;
    this.active = true;
    this.scope = null;
    this.validate = true;
    this.snap = false;
    this.lowered = null;
    this.typedBad = false;
    this.box = this.makeBox();
  }

  /* The number box (number-field.ts): any whole number from 1 as typed; `snap` moves a number out of range to the nearest on leaving. */
  private makeBox() {
    return numberBox(
      () => this.value,
      (value: unknown) => this.send(value as number | null),
      1,
      Infinity,
      { snap: this.snap },
    );
  }

  /* Light DOM: draw into the element itself, so the page's CSS reaches the markup. */
  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    clearTimeout(this.levelTimer);
  }

  private send(cap: number | null): void {
    this.dispatchEvent(new CustomEvent(CAP_CHANGE_EVENT, { detail: cap, bubbles: true }));
  }

  private input(): HTMLInputElement | null {
    return this.querySelector('input');
  }

  /* Drops the text typed in the box and shows the stored cap again. */
  clearTyped(): void {
    this.typedBad = false;
    const input = this.input();
    if (input) {
      input.value = this.value == null ? '' : String(this.value);
    }
  }

  /* Lowers the cap to what the level allows (level-cap.ts limitCapToLevel), keeping what it lowered for the note. A second lowering
     (the up arrow at the limit) is a new object: the note stays and the box flashes again. */
  private lowerCap(): void {
    const lowered = limitCapToLevel({ cap: this.value, sync: this.syncOn, level: this.level }) as LoweredCap | null;
    if (lowered) {
      this.send(lowered.to);
    }
    this.setLowered(lowered);
  }

  private setLowered(lowered: LoweredCap | null): void {
    if (lowered === this.lowered) {
      return;
    }
    this.lowered = lowered;
    this.dispatchEvent(new CustomEvent(LOWERED_CHANGE_EVENT, { detail: lowered, bubbles: true }));
  }

  /* The rules that follow the level (cap-follow.ts), run when one of the inputs they read changed. */
  private applyFollowPlan(changed: PropertyValues<this>): void {
    const names = new Set<FollowInput>(FOLLOWED_INPUTS.filter(name => changed.has(name)));
    const plan = followPlan(names, this.active, this.lowered?.to ?? null, this.value);
    if (plan.reset) {
      this.typedBad = false;
      this.setLowered(null);
    }
    if (plan.dropTyped) {
      this.typedBad = false;
    }
    if (plan.lowerNow) {
      this.lowerCap();
    }
    if (plan.lowerWhenLevelSettles) {
      clearTimeout(this.levelTimer);
      this.levelTimer = setTimeout(() => {
        // a field whose tab was left meanwhile lowers nothing (the edit would go to the open tab's panel); it checks when its tab opens
        if (this.active) {
          this.lowerCap();
        }
      }, TYPING_DEBOUNCE_MS);
    }
  }

  /* Before each draw: the rules that follow the level, and the error, note and flag built from what is held. */
  protected override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('snap')) {
      this.box = this.makeBox();
    }
    this.scopeChanged = this.hasUpdated && changed.has('scope');
    if (this.hasUpdated) {
      if (this.follow) {
        this.applyFollowPlan(changed);
      } else if (changed.has('value') || changed.has('scope')) {
        this.typedBad = false;
      }
    }
    this.view = capFieldView({
      syncOn: this.syncOn,
      value: this.value,
      typedBad: this.validate && this.typedBad,
      lowered: this.lowered,
      max: this.max,
    });
  }

  /* After each draw: the field's own box (classes and tooltip), and a cap the page just lowered shown in the box with a flash. */
  protected override updated(changed: PropertyValues<this>): void {
    if (!this.classesSet) {
      this.classList.add(...LAYOUTS[this.layout].host.split(' '));
      this.classesSet = true;
    }
    const title = this.view?.flag.full || this.guess;
    if (title) {
      this.title = title;
    } else {
      this.removeAttribute('title');
    }
    if (changed.has('lowered') && this.lowered && !this.scopeChanged) {
      const input = this.input();
      if (input) {
        input.value = String(this.lowered.to);
        flashLowered(input);
      }
    }
  }

  /* Text typed in the box, at each keystroke. */
  private onInput(event: InputEvent): void {
    const text = (event.target as HTMLInputElement).value;
    if (this.follow && text === '') {
      this.send(null);
    }
    this.typedBad = capTextBad(text);
    this.box.onInput(event);
  }

  protected override render() {
    const view = this.view;
    if (!view) {
      return nothing;
    }
    const layout = LAYOUTS[this.layout];
    const id = layout.id;
    const flag: CapFlag = view.flag;
    const describedBy = [layout.errors ? `${id}-error` : '', `${id}-lowered`, this.guess ? `${id}-guess` : ''].filter(Boolean).join(' ');
    return html`<label for=${id} class=${layout.labelClass}>${layout.label} ${capFlagTemplate(`${id}-range`, view.range, flag)}</label>
      <input
        type="number"
        id=${id}
        step="1"
        inputmode="numeric"
        min="1"
        max=${this.max}
        ?disabled=${this.disabled}
        .value=${shownNumber(this.box)}
        class=${classMap({ invalid: layout.errors && Boolean(view.error), lowered: Boolean(view.note) })}
        aria-invalid=${layout.errors ? String(Boolean(view.error)) : nothing}
        aria-describedby=${describedBy}
        @input=${this.onInput}
        @change=${this.box.onChange}
      />
      ${layout.errors ? html`<span class="sr-only" id="${id}-error" style=${view.error ? '' : 'display: none'}>${view.error}</span>` : nothing}
      <span class="sr-only" id="${id}-lowered" style=${view.note ? '' : 'display: none'} aria-live="polite">${view.note}</span>
      ${this.guess ? html`<span class="sr-only" id="${id}-guess">${this.guess}</span>` : nothing}`;
  }
}

customElements.define('gsa-cap-field', GsaCapField);
