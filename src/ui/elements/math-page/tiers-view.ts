/* The Substat tiers sub-tab as a Lit element in light DOM: a card per substat (its box for the value on the character panel,
   the effects of that value, a scroll area with every tier, and what is spare), and each substat's "?" note. A child of
   <gsa-math-screen> (docs/engineering/architecture.md section 3):
   - its parent gives it the tab's settings: `job` (Substat tiers' own job id), `typedLevel` (the level
     typed into the math bar's box, or null: the job's level cap) and `shown` (the sub-tab is open); the element reads no store;
   - the values typed or clicked are the element's own: each substat starts at its base, and a value is kept until the job or
     the level changes (views/tiers.js tierEdited), not saved;
   - a card's rows are a window of the tiers drawn by the `tierRows` directive on its scroll area (tier-rows.ts); a value typed
     brings its row to the middle, a click on a row only moves the highlight;
   - the "?" note is the `gsa-stat-note` element drawn inside this one, hung under the button of the open substat;
   - the view is built again only when the job, the level or a value changes (`viewCache`). */
import { LitElement, html, nothing, type PropertyValues } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import { makeJobContext } from '../../../core/job-context.ts';
import type { StatKey } from '../../../core/types.ts';
import {
  NO_TIER_EDITS,
  tierEdited,
  tierEditsKept,
  tierEditsKey,
  tierInput,
  tierLevel,
  tierPicked,
  tiersView,
  tierValues,
} from '../../views/tiers.js';
import { viewCache } from '../../view-cache.ts';
import { STAT_NOTE_ID } from './stat-note-names.ts';
import './stat-note.ts';
import { tierRows, type TierRowsSource } from './tier-rows.ts';

/* One card of the view (the shape `tiersView` in views/tiers.js builds). */
interface TierCard extends TierRowsSource {
  stat: string;
  label: string;
  value: number;
  lines: string[];
  haste: string;
  help: { title: string; affects: string; size: string };
  foot: { spare: string; toNext: string | null };
}

/* What the tab shows. */
interface TiersTabView {
  level: number;
  cards: TierCard[];
}

/* The `gsa-tiers-view` element (registered below): see the file header. */
export class GsaTiersView extends LitElement {
  static properties = {
    job: { attribute: false },
    typedLevel: { attribute: false },
    shown: { attribute: false },
    edits: { state: true },
    typed: { state: true },
    helpFor: { state: true },
  };

  declare job: string;
  declare typedLevel: number | null;
  declare shown: boolean;
  // the values typed or clicked, with the settings they were made under (views/tiers.js tierEdited)
  declare edits: { key: string; values: Readonly<Record<string, number>> };
  // how many times a value was typed into each substat's box, {stat: count}: its card brings the tier to the middle of its
  // scroll area at each (a click on a row does not)
  declare typed: Record<string, number>;
  // the substat whose "?" note is open ('' for none), and its button
  declare helpFor: string;
  private helpButton: HTMLElement | null = null;
  private readonly views = viewCache<TiersTabView>();

  constructor() {
    super();
    this.job = '';
    this.typedLevel = null;
    this.shown = false;
    this.edits = NO_TIER_EDITS;
    this.typed = {};
    this.helpFor = '';
  }

  /* Light DOM: draw into the element itself, so the page's CSS reaches the markup. */
  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  /* The job and the level the sub-tab uses: the level typed (held to the job's cap), else the cap. */
  private get settings() {
    const job = makeJobContext(this.job);
    return { job, level: tierLevel(job, job.maxLevel, this.typedLevel) };
  }

  /* Before each draw: the values made under other settings are dropped for good (going back to the old job or level starts from
     the bases again), and a note whose substat the job has no card for closes. */
  protected override willUpdate(_changed: PropertyValues): void {
    const { job, level } = this.settings;
    this.edits = tierEditsKept(this.edits, tierEditsKey(job, level));
    if (this.helpFor && !job.substats.includes(this.helpFor as StatKey)) {
      this.helpFor = '';
      this.helpButton = null;
    }
  }

  /* The cards (views/tiers.js tiersView) for the settings and the values. */
  private get view(): TiersTabView {
    const { job, level } = this.settings;
    const key = JSON.stringify([job.jobId, level, this.edits.values]);
    return this.views.get(key, () => tiersView(job, { ...tierValues(job, level), ...this.edits.values }, level) as TiersTabView);
  }

  /* A value typed into a substat's box (Enter or leaving the box): the box shows the value kept. */
  private typeValue(stat: string, box: HTMLInputElement): void {
    const { job, level } = this.settings;
    const value = tierInput(job, stat, box.value, level);
    if (value == null) {
      return;
    }
    this.edits = tierEdited(this.edits, tierEditsKey(job, level), stat, value);
    this.typed = { ...this.typed, [stat]: (this.typed[stat] ?? 0) + 1 };
    box.value = String(value);
  }

  /* After the first draw: a click on a row of a card's scroll area picks the tier. A pointer shortcut only: the card's number box is
     the keyboard way to the same value, so the rows have no key handler. */
  protected override firstUpdated(): void {
    this.querySelector('#t-table')?.addEventListener('click', event => this.pickRow(event));
  }

  /* A click in a card's scroll area: on a row, the value goes to the tier's start, and the list stays where it is under the pointer. */
  private pickRow(event: Event): void {
    const row = (event.target as Element).closest<HTMLElement>('.tierscroll .lrow');
    if (!row?.dataset.to) {
      return;
    }
    const { job, level } = this.settings;
    const { stat, value } = tierPicked(row.dataset.to);
    this.edits = tierEdited(this.edits, tierEditsKey(job, level), stat, value);
  }

  /* A substat's "?" button: open its note under the button, or close it when it is the open one; a press on another
     substat's button moves the note. */
  private toggleHelp(stat: string, button: HTMLElement): void {
    const closing = this.helpFor === stat;
    this.helpFor = closing ? '' : stat;
    this.helpButton = closing ? null : button;
  }

  protected override render() {
    const view = this.view;
    const help = view.cards.find(card => card.stat === this.helpFor)?.help ?? null;
    return html`
      <div id="t-panel" style="position:relative">
        <div class="tiercards" id="t-table">${repeat(
          view.cards,
          card => card.stat,
          card => html`<div class="tiercard" data-stat=${card.stat}>
            <div class="tierhead">
              <div class="lname"><span>${card.label}</span> <button
                type="button"
                class="help shelp"
                data-help=${card.stat}
                aria-expanded=${String(this.helpFor === card.stat)}
                aria-controls=${STAT_NOTE_ID}
                @click=${(event: Event) => this.toggleHelp(card.stat, event.currentTarget as HTMLElement)}>?</button></div>
              <input
                type="number"
                min="0"
                step="1"
                inputmode="numeric"
                data-n=${card.stat}
                .value=${String(card.value)}
                aria-label=${`${card.label} on the character panel`}
                @change=${(event: Event) => this.typeValue(card.stat, event.target as HTMLInputElement)}>
              <div class="leff">${card.lines.map(line => html`<span class="lline">${line}</span>`)}${
                card.haste ? html`<span class="lline lhaste">${card.haste}</span>` : nothing
              }</div>
            </div>
            <div
              class="tierscroll"
              role="region"
              tabindex="0"
              aria-label=${`${card.label} tiers`}
              ${tierRows(card, this.typed[card.stat] ?? 0, this.shown)}
              ></div>
            <div class="lfoot small"><span><b>${card.foot.spare}</b> spare</span>${
              card.foot.toNext == null ? html`<span>last tier</span>` : html`<span><b>${`+${card.foot.toNext}`}</b> to next</span>`
            }</div>
          </div>`,
        )}</div>
        <gsa-stat-note .note=${help} .anchor=${help ? this.helpButton : null} @note-close=${() => {
          this.helpFor = '';
          this.helpButton = null;
        }}></gsa-stat-note>
      </div>
    `;
  }
}

customElements.define('gsa-tiers-view', GsaTiersView);
