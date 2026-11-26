/* The math bar as a Lit element in light DOM: the sub-tab links, the "?" help, the Job menu, and the controls row of the open sub-tab
   (Stat Allocation's Slot menu, Substats & materia chip with its three menus, and Gear item level slider; the GCD and Substat
   tiers controls elements). The sticky box around it (`.mathbar`) is in <gsa-math-screen>'s template. The element takes the math tab's
   settings from that screen (docs/engineering/architecture.md section 3) and reads no store:
   - `tab` (the open sub-tab: 'piece', 'gcd' or 'tiers'), `jobId` (the job the Job menu shows: the open sub-tab's own), `pieceJob`,
     `sync` and `piece` (Stat Allocation's job, sync settings and example piece), `gcd` and `tiers` (those sub-tabs' settings);
   - it sends `math-sub` (a plain click on a sub-tab link), `piece-edit` (a change of the example piece) and `job-change` (the Job
     menu's); the GCD and Substat tiers controls send their own events (`gcd-edit`, `tiers-level`), which pass through; the page
     edits the store and gives the settings back.
   What the controls show comes from `mathBarView` (views/math-bar.ts), which also holds the rules for an edit.
   The Sync settings chip (between the Substats & materia chip and the Gear item level control) opens a popover with the Level and Synced IL
   fields (`<gsa-level-field>`, `<gsa-cap-field>`: the same fields as the Gear browser's strip) and the IL Sync switch. The element gets
   the panel it edits (`syncPanel`: the stored cap and level and the switch; `openTab`, whether the math tab is open, which makes the cap
   field follow the level; `levelScope`, which ends the text typed in the Level box) and sends what they commit (`level-change`,
   `cap-change`, and `sync-change`, the switch's state, a boolean); the page edits the store. The chip says the cap the Synced IL field
   lowered (`lowered-change`) and goes red while the Level box holds text that is no level (`typed-bad-change`). */
import { LitElement, html, nothing } from 'lit';
import { classMap } from 'lit/directives/class-map.js';
import { ifDefined } from 'lit/directives/if-defined.js';
import { live } from 'lit/directives/live.js';
import { makeJobContext } from '../../../core/job-context.ts';
import { followInPage } from '../../router/plain-click.ts';
import { formatRoute } from '../../router/routes.ts';
import {
  IL_BOX_SIZER,
  IL_CONTROL_TEXT,
  PIECE_CHIP_SIZERS,
  PIECE_CHIP_TEXT,
  SUBSTAT_SIZER,
  SYNC_CHIP_SIZERS,
  SYNC_CHIP_TEXT,
  SYNC_LABEL_ROWS,
  capGuessText,
  syncChipView,
} from '../../views/sync-explainer.ts';
import { SLOT_SIZER } from '../../views/piece.ts';
import { MATH_SUB_TABS, ilvlEdit, mathBarView, slotEdit, subsEdit } from '../../views/math-bar.ts';
import './bar-popover.ts';
import './gcd-controls.ts';
import './tiers-controls.ts';
import '../app/cap-field.ts';
import type { SlotType } from '../../../core/types.ts';
import type { GsaCapField } from '../app/cap-field.ts';
import '../app/job-menu.ts';
import '../app/level-field.ts';
import type { GsaLevelField } from '../app/level-field.ts';
import type { LoweredCap } from '../app/field-names.ts';
import '../shared/select.ts';
import {
  PIECE_EDIT_EVENT,
  SUB_TAB_EVENT,
  SYNC_CHANGE_EVENT,
  type ExamplePiece,
  type GcdState,
  type SyncPanel,
  type SyncSettings,
  type TiersState,
} from './math-bar-names.ts';

/* The hidden copies that give the Substats & materia chip one width: every text it can show, made once for the page. */
const PIECE_CHIP_WIDTH_COPIES = PIECE_CHIP_SIZERS.map(text => html`<span class="sizertext" aria-hidden="true">${text}</span>`);

/* One menu of the Substats & materia popover. */
interface PieceMenu {
  id: string;
  label: string;
  options: readonly object[];
  value: string;
  // every text of the menu, one per line, that gives it one width (empty: none)
  sizer: string;
  onChange: (value: string) => void;
}

/* The `gsa-math-bar` element (registered below): see the file header. */
export class GsaMathBar extends LitElement {
  static properties = {
    tab: { attribute: false },
    jobId: { attribute: false },
    pieceJob: { attribute: false },
    sync: { attribute: false },
    syncPanel: { attribute: false },
    openTab: { type: String },
    levelScope: { type: String },
    maxReal: { type: Number },
    piece: { attribute: false },
    gcd: { attribute: false },
    tiers: { attribute: false },
    capLowered: { state: true },
    levelBad: { state: true },
  };

  declare tab: string;
  declare jobId: string;
  declare pieceJob: string;
  declare sync: SyncSettings;
  declare syncPanel: SyncPanel;
  declare openTab: string;
  declare levelScope: string;
  declare maxReal: number;
  declare piece: ExamplePiece;
  declare gcd: GcdState;
  declare tiers: TiersState;
  // the cap the Synced IL field last lowered (for the chip), and whether the Level box holds text that is no level
  declare capLowered: LoweredCap | null;
  declare levelBad: boolean;

  constructor() {
    super();
    this.tab = 'piece';
    this.jobId = '';
    this.pieceJob = '';
    this.sync = { cap: null, sync: false, level: null };
    this.syncPanel = { cap: null, level: null, on: false };
    this.openTab = '';
    this.levelScope = '';
    this.maxReal = 1;
    this.capLowered = null;
    this.levelBad = false;
    this.piece = { ilvl: null, slot: 'weapon', subs: [], slots: null };
    this.gcd = { level: null, haste: '', speed: null, syncedLevel: 1 };
    this.tiers = { job: '', level: null };
  }

  /* Light DOM: draw into the element itself, so the page's CSS reaches the markup. */
  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  private send(name: string, detail: unknown): void {
    this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true }));
  }

  /* A change of the example piece (views/math-bar.ts builds the patch); none when the edit changes nothing. */
  private editPiece(patch: object | null): void {
    if (patch) {
      this.send(PIECE_EDIT_EVENT, patch);
    }
  }

  /* A click on a sub-tab link: a plain click shows it, any other is the browser's. */
  private goSub(sub: string, event: MouseEvent): void {
    followInPage(event, () => this.send(SUB_TAB_EVENT, sub));
  }

  private renderSubTabs() {
    return html`
      <nav class="subtabs" aria-label="Math views">
        ${MATH_SUB_TABS.map(
          ({ sub, label }) =>
            html`<a
              data-sub=${sub}
              data-label=${label}
              href=${formatRoute({ tab: 'math', mathTab: sub })}
              aria-current=${ifDefined(this.tab === sub ? 'page' : undefined)}
              @click=${(event: MouseEvent) => this.goSub(sub, event)}>${label}</a>`,
        )}
      </nav>`;
  }

  /* The "?" at the right end of the sub-tabs row, after them in the tab order: the popover on how gear stats and syncing work. */
  private renderHelp() {
    return html`
      <gsa-bar-popover
        class="helpwrap"
        trigger-id="m-help"
        content-id="m-help-pop"
        placement="bottom-end"
        gap="8"
        modal
        ?hidden=${this.tab !== 'piece'}>
        <button type="button" class="help" data-zag-part="trigger">?</button>
        <div class="backdrop" data-zag-part="backdrop" hidden></div>
        <div data-zag-part="positioner">
        <div class="popover" data-zag-part="content" aria-label="Gear stats and syncing" hidden>
          <h3>How gear stats work</h3>
          <ul class="facts">
            <li>The item level and slot set a budget for each piece’s stats: the main stat (like Strength or Mind), Vitality, and sub-stats (like Critical Hit or Tenacity).</li>
            <li>The main stat and Vitality generally hold 100% of their budget, except Vitality on magical ranged and healer gear (90%).</li>
            <li>Primary sub-stats can hold 100% of that budget, and secondary sub-stats can hold 70%.</li>
            <li>Notable exceptions:
              <ul>
                <li>Some all-job earrings / rings have their main stat and Vitality capped at 90% when synced.</li>
                <li>Some level 50 healer gear has a tertiary Direct Hit substat accounting for 20-25% of that budget (remapped from Accuracy back in 4.0).</li>
              </ul>
            </li>
          </ul>
          <h3>How stat syncing works</h3>
          <ul class="facts">
            <li>Level sync lowers your character’s level, and item level sync caps your gear’s item level.</li>
            <li>A synced piece’s stats are clamped to a maximum based on its slot and synced item level. Stats below the limit are unaffected.</li>
            <li>Pieces synced down lose their materia, while pieces at or below the item level limit are unaffected.</li>
            <li>Level sync alone syncs pieces made for a higher level to a set item level (level 80: item level 530).</li>
            <li>When both level and item level sync are active, the item level cap decides.</li>
            <li>Gear that scales with the wearer’s level (such as Menphina’s Earring) always syncs to the duty’s level.</li>
          </ul>
          <p class="small dim">Sources: FFXIV Wiki, <a href="https://ffxiv.consolegameswiki.com/wiki/Item_Level" target="_blank" rel="noopener">Item Level</a> and <a href="https://ffxiv.consolegameswiki.com/wiki/Level_Sync" target="_blank" rel="noopener">Level Sync</a>; game data from <a href="https://github.com/xivapi/ffxiv-datamining" target="_blank" rel="noopener">ffxiv-datamining</a>.</p>
        </div>
        </div>
      </gsa-bar-popover>`;
  }

  /* One menu of the Substats & materia popover: its label over the select, which sits in a `.sized` box that keeps one width when the
     menu has a `sizer`. */
  private renderPieceMenu(menu: PieceMenu) {
    const select = html`<span class="selhost"><gsa-select
      button-id=${menu.id}
      .label=${menu.label}
      .options=${menu.options}
      .value=${menu.value}
      @change=${(event: CustomEvent<string>) => menu.onChange(event.detail)}></gsa-select></span>`;
    return html`
      <div class="mctl">
        <label for=${menu.id}>${menu.label}</label>
        ${menu.sizer ? html`<span class="sized">${select}<span class="sizertext" aria-hidden="true">${menu.sizer}</span></span>` : select}
      </div>`;
  }

  /* The Slot menu and the Substats & materia chip (with its popover of three menus): Stat Allocation's "Piece" section. */
  private renderPieceSection(job: ReturnType<typeof makeJobContext>, view: ReturnType<typeof mathBarView>) {
    const text = PIECE_CHIP_TEXT;
    return html`
      <div class="barsec divided afterjob piecesec" ?hidden=${this.tab !== 'piece'}>
        <div class="mctl menu">
          <label for="p-slot">Slot</label>
          <span class="sized"><span class="selhost"><gsa-select
            button-id="p-slot"
            label="Slot"
            .options=${view.slotOptions}
            .value=${view.slotValue}
            @change=${(event: CustomEvent<SlotType>) => this.editPiece(slotEdit(this.piece, event.detail))}></gsa-select></span><span class="sizertext" aria-hidden="true">${SLOT_SIZER}</span></span>
        </div>
        <gsa-bar-popover class="mctl piecewrap" id="p-piece-wrap" trigger-id="p-piece-chip" content-id="p-piece-pop" focus-in="#p-s1" align-bar>
          <span id="p-piece-label">${text.label}</span>
          <button type="button" class="multi-btn piecechip" data-zag-part="trigger" aria-label=${view.chip.name}><span class="sized">
            <span id="p-piece-text">${view.chip.text}</span>
            ${PIECE_CHIP_WIDTH_COPIES}
            <span class="sizertext labelsizer" aria-hidden="true">${text.label}</span>
          </span></button>
          <div data-zag-part="positioner">
          <div class="popover piecepop" data-zag-part="content" aria-label=${text.label} hidden>
            ${this.renderPieceMenu({
              id: 'p-s1',
              label: text.first,
              options: view.firstOptions,
              value: view.firstValue,
              sizer: SUBSTAT_SIZER,
              onChange: value => this.editPiece(subsEdit(this.piece, 0, value, job)),
            })}
            ${this.renderPieceMenu({
              id: 'p-s2',
              label: text.second,
              options: view.secondOptions,
              value: view.secondValue,
              sizer: SUBSTAT_SIZER,
              onChange: value => this.editPiece(subsEdit(this.piece, 1, value, job)),
            })}
            ${this.renderPieceMenu({
              id: 'p-slots',
              label: text.slots,
              options: view.slotsOptions,
              value: view.slotsValue,
              sizer: '',
              onChange: value => this.editPiece({ slots: Number(value) }),
            })}
          </div>
          </div>
        </gsa-bar-popover>
      </div>`;
  }

  /* The IL Sync switch of the popover: what the page does with it is the page's (`sync-change`); any text left in the item level box
     is dropped. */
  private onSyncSwitch(event: Event): void {
    this.querySelector<GsaCapField>('gsa-cap-field')?.clearTyped();
    this.send(SYNC_CHANGE_EVENT, (event.target as HTMLInputElement).checked);
  }

  /* The popover closed by itself: the Level and Synced IL boxes show the stored values again, dropping what they hold that is no level
     or cap. */
  private clearTypedErrors(): void {
    this.querySelector<GsaLevelField>('gsa-level-field')?.clearTyped();
    this.querySelector<GsaCapField>('gsa-cap-field')?.clearTyped();
  }

  /* The chip's words as spans, one per part ("Lv 85", "·", "IL 270"). */
  private chipParts(parts: readonly { text: string; cls: string }[]) {
    return parts.map(part => html`<span class=${part.cls}>${part.text}</span>`);
  }

  // The IL Sync switch is a native checkbox with role=switch: its state is `checked`, which a screen reader reads (the page's other
  // switches are written the same way); the lint rule wants an aria-checked beside it.
  /* eslint-disable lit-a11y/role-has-required-aria-attrs */
  /* The Sync settings chip: the synced level, the synced item level and whether IL Sync is on, in a few words (a hidden copy of its
     widest texts gives it one width); it opens a popover under the chip with the Level and Synced IL fields and the IL Sync switch. */
  private renderSyncChip(job: ReturnType<typeof makeJobContext>) {
    const text = SYNC_CHIP_TEXT;
    const rows = SYNC_LABEL_ROWS;
    const panel = this.syncPanel;
    const loweredFrom = this.capLowered && this.capLowered.to === panel.cap ? this.capLowered.from : null;
    const chip = syncChipView(job, this.sync, this.piece.slot, {
      switchOn: panel.on,
      loweredFrom,
      capMissing: panel.on && panel.cap == null,
    });
    const guess = capGuessText(job, this.sync, this.piece.slot);
    return html`
      <gsa-bar-popover
        class="mctl syncwrap"
        id="p-sync-wrap"
        trigger-id="p-sync-chip"
        content-id="p-sync-pop"
        focus-in="#p-level"
        align-bar
        ?hidden=${this.tab !== 'piece'}
        @popover-close=${this.clearTypedErrors}>
        <span id="p-sync-label"><span>${text.label}</span><span class="guess" id="p-sync-guess-mark" style=${chip.guess ? '' : 'display: none'} title=${chip.guess} aria-hidden="true">${text.guess}</span></span>
        <span class="sr-only" id="p-sync-guess" style=${chip.guess ? '' : 'display: none'}>${chip.guess}</span>
        <button
          type="button"
          class=${classMap({ 'multi-btn': true, syncchip: true, error: this.levelBad })}
          data-zag-part="trigger"
          aria-label=${chip.name}
          aria-describedby=${ifDefined(chip.guess ? 'p-sync-guess' : undefined)}
          title=${chip.name}><span class="sized">
            <span id="p-sync-text">${this.chipParts(chip.parts)}</span>
            ${SYNC_CHIP_SIZERS.map(parts => html`<span class="sizertext" aria-hidden="true">${this.chipParts(parts)}</span>`)}
            <span class="sizertext labelsizer" aria-hidden="true"><span>${text.label}</span><span class="guess">${text.guess}</span></span>
          </span></button>
        <div data-zag-part="positioner">
        <div class="popover syncpop" data-zag-part="content" aria-label=${text.label} hidden>
          <div class="syncpair">
            <!-- hidden copy of the widest label rows (the flag row, the range row): both boxes take its width, whatever the font -->
            <span class="mctl sizer" aria-hidden="true">
              <span class="mctl-head capline">Level <span class="f-flag"><i class="flagicon"></i><span>${rows.levelFlag}</span></span></span>
              <span class="mctl-head capline">Synced IL <span class="f-flag"><i class="flagicon"></i>Max <span>${rows.capDigits}</span></span></span>
              <span class="mctl-head capline">Synced IL <span class="f-flag"><i class="flagicon"></i><span>${rows.capFlag}</span></span></span>
              <span class="mctl-head capline"><span>Synced IL</span> <span class="f-range">${rows.capRange}</span></span>
              <span class="mctl-head capline">Level <span class="f-range">${rows.levelRange}</span></span>
            </span>
            <gsa-level-field
              layout="math"
              live
              .snap=${false}
              .validate=${true}
              .value=${panel.level}
              .max=${job.maxLevel}
              .scope=${this.levelScope}
              @typed-bad-change=${(event: CustomEvent<boolean>) => {
                this.levelBad = event.detail;
              }}></gsa-level-field>
            <gsa-cap-field
              layout="math"
              follow
              .value=${panel.cap}
              .max=${this.maxReal}
              .syncOn=${panel.on}
              .disabled=${!panel.on}
              .level=${panel.level}
              .active=${this.openTab === 'math'}
              .scope=${this.openTab}
              .guess=${guess}
              @lowered-change=${(event: CustomEvent<LoweredCap | null>) => {
                this.capLowered = event.detail;
              }}></gsa-cap-field>
          </div>
          <label class="mctl sync-switch"><span>IL Sync</span>
            <span class="toggle"><input type="checkbox" role="switch" class="switch" id="p-sync" .checked=${panel.on} @change=${this.onSyncSwitch}></span>
          </label>
        </div>
        </div>
      </gsa-bar-popover>`;
  }

  /* eslint-enable lit-a11y/role-has-required-aria-attrs */

  /* The Gear item level control: its label on top, the slider with its bounds, the number box and Reset on the controls' line. */
  private renderItemLevel(view: ReturnType<typeof mathBarView>) {
    const [lowest, highest] = view.range;
    const label = IL_CONTROL_TEXT.label;
    const pick = (text: string) => this.editPiece(ilvlEdit(text, view.range));
    return html`
      <div class="mctl ilgroup divided" id="p-ilgroup" ?hidden=${this.tab !== 'piece'}>
        <label for="p-range">${label}</label>
        <div class="ilrow small">
          <span class="bound">${lowest}</span>
          <input
            type="range"
            id="p-range"
            aria-label=${label}
            min=${lowest}
            max=${highest}
            step="1"
            .value=${live(String(view.il))}
            style=${`--fill: ${view.fill}%`}
            @input=${(event: Event) => pick((event.target as HTMLInputElement).value)}>
          <span class="bound">${highest}</span>
          <span class="sized ilnum">
            <input
              type="number"
              id="p-ilvl"
              min=${lowest}
              max=${highest}
              step="1"
              inputmode="numeric"
              .value=${live(String(view.il))}
              aria-label=${label}
              @change=${(event: Event) => pick((event.target as HTMLInputElement).value)}>
            <span class="sizertext" aria-hidden="true">${IL_BOX_SIZER}</span>
          </span>
          <button type="button" class="chip" id="p-ilvl-reset" @click=${() => this.editPiece({ ilvl: null })}>Reset</button>
        </div>
      </div>`;
  }

  protected override render() {
    if (!this.pieceJob) {
      return nothing;
    }
    const job = makeJobContext(this.pieceJob);
    const view = mathBarView(job, this.sync, this.piece);
    const gcd = this.gcd;
    return html`
      ${this.renderSubTabs()}
      ${this.renderHelp()}
      <div class="barrow">
        <div class="mctl jobctl" id="m-job-wrap" ?hidden=${this.tab === 'gcd'}>
          <gsa-job-menu sized prefix="m-job" button-id="m-job-btn" menu-id="m-job-menu" .job=${this.jobId}></gsa-job-menu>
        </div>
        ${this.renderPieceSection(job, view)}
        <span class="barbreak after-piece" aria-hidden="true" ?hidden=${this.tab !== 'piece'}></span>
        ${this.renderSyncChip(job)}
        <span class="barbreak after-sync" aria-hidden="true" ?hidden=${this.tab !== 'piece'}></span>
        ${this.renderItemLevel(view)}
        ${this.tab === 'gcd' ? html`<gsa-gcd-controls .level=${gcd.level} .haste=${gcd.haste} .speed=${gcd.speed} .syncedLevel=${gcd.syncedLevel}></gsa-gcd-controls>` : nothing}
        ${this.tab === 'tiers' ? html`<gsa-tiers-controls .job=${this.tiers.job} .typedLevel=${this.tiers.level}></gsa-tiers-controls>` : nothing}
      </div>`;
  }
}

customElements.define('gsa-math-bar', GsaMathBar);
