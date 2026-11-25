/* The Sheets tab's screen as one Lit element in light DOM: the bar for unavailable storage, the sheet manager (`<gsa-sheet-manager>`,
   which also draws the "not found" screen), a sheet's page (`<gsa-sheet-page>`), a gear set's page (`<gsa-set-page>`) and the dialogs
   (`<gsa-sheet-dialog>`). The tab's own section (`#tab-sheets`, its `hidden`) stays in the page's frame, and the element takes no box
   of its own (sheets.css), so the screen's `.sheetsview` column is the section's child.
   - the page gives it `ports` (the two facades and what a set page needs, SheetsScreenPorts) once, from main.js; it reads no `$store`;
   - it follows the parts of the store the screens are made from (`sheetsSelection`, sheets-screen-model.ts) and draws again when one
     changes, or when the open dialog changes; what it shows and does is the model's (sheets-screen-model.ts);
   - each of the three screens' elements is given its view while its own screen is open and null otherwise, so it draws nothing;
   - the gear set's page is drawn with `keyed(setId, ...)`: another set is a new element, so nothing of one set's page (an open menu,
     its note, the question before leaving) outlives it;
   - it answers the elements' `sheet-action` events and the sheet switcher's pick, and the dialog's `dialog-action` and `dialog-closed`
     events (the model gives the focus back to the control that opened a dialog);
   - a Back or Forward closes an open dialog (a change of tab, sheet or gear set does too, in the model's `follow`). */
import { LitElement, type TemplateResult, html, nothing } from 'lit';
import { keyed } from 'lit/directives/keyed.js';
import type { AppState } from '../../store/app-state.ts';
import { Select, shallowEq } from '../../store/select.ts';
import '../set-page/set-page.ts';
import type { SheetAction } from './sheet-action.ts';
import type { DialogAction } from './sheet-dialogs-model.ts';
import './sheet-dialog.ts';
import './sheet-manager.ts';
import './sheet-page.ts';
import { SheetsScreenModel, type SheetsScreenPorts, sheetsSelection } from './sheets-screen-model.ts';
import type { SwitchPick } from './switch-menu.ts';

/* The `gsa-sheets-screen` element (registered below): see the file header. */
export class GsaSheetsScreen extends LitElement {
  static properties = {
    ports: { attribute: false },
  };

  declare ports: SheetsScreenPorts | null;
  // made once the element has its ports
  private model: SheetsScreenModel | null = null;
  // follows the store once the element has its ports
  private selection: Select<AppState, ReturnType<typeof sheetsSelection>> | null = null;
  private readonly closeDialogOnPopstate = () => this.model?.dialogs.close(false);

  constructor() {
    super();
    this.ports = null;
  }

  /* Light DOM: draw into the element itself, so the page's CSS reaches the markup. */
  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    addEventListener('popstate', this.closeDialogOnPopstate);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    removeEventListener('popstate', this.closeDialogOnPopstate);
  }

  /* Before each draw: once the element has its ports, make the model and start following the store parts the screens are made from;
     then close a dialog the screen has moved away from. */
  protected override willUpdate(): void {
    const { ports } = this;
    if (ports && !this.model) {
      this.model = new SheetsScreenModel(ports, () => this.requestUpdate());
      this.selection = new Select(this, ports.store, sheetsSelection, shallowEq);
    }
    this.model?.follow();
  }

  protected override render(): TemplateResult | typeof nothing {
    const { model } = this;
    if (!model || !this.selection) {
      return nothing;
    }
    const unavailable = model.manager.unavailableText;
    const manager = model.managerProps();
    const page = model.pageProps();
    const setPage = model.setPageProps();
    const setId = model.sheets.setId;
    const showSet = model.screen === 'set' && setPage.header !== null;
    return html`<div class="sheetsview" @sheet-action=${(event: CustomEvent<SheetAction>) => model.onSheetAction(event.detail)}>
      ${unavailable ? html`<p class="callout small" id="sh-unavailable">${unavailable}</p>` : nothing}

      <!-- THE SHEET MANAGER (with the "not found" screen) and a sheet's page: each is given its view while its screen is open, else null -->
      <gsa-sheet-manager
        .view=${manager.view}
        .notFound=${manager.notFound}
        .busy=${manager.busy}
        .dialogOpen=${manager.dialogOpen}></gsa-sheet-manager>
      <gsa-sheet-page
        .view=${page.view}
        .figures=${page.figures}
        .sheetId=${page.sheetId}
        .clan=${page.clan}
        .partyRoles=${page.partyRoles}
        .switcher=${page.switcher}
        .busy=${page.busy}
        .dialogOpen=${page.dialogOpen}
        @switch-pick=${(event: CustomEvent<SwitchPick>) => model.onSwitchPick(event.detail)}></gsa-sheet-page>

      <!-- A GEAR SET'S PAGE: keyed by the set's id, so each set gets a page of its own -->
      ${
        showSet
          ? html`<div class="sheetsview" id="sh-set">
            ${keyed(
              setId,
              html`<gsa-set-page
                .ports=${setPage.ports}
                .setId=${setId}
                .header=${setPage.header}
                .dialogIsOpen=${setPage.dialogIsOpen}></gsa-set-page>`,
            )}
          </div>`
          : nothing
      }

      <!-- THE DIALOGS: a Zag dialog while one is open; the model answers it and gives the focus back once its box is gone -->
      <gsa-sheet-dialog
        .view=${model.dialogs.view()}
        @dialog-action=${(event: CustomEvent<DialogAction>) => model.dialogs.act(event.detail)}
        @dialog-closed=${() => model.dialogs.afterClosed()}></gsa-sheet-dialog>
    </div>`;
  }
}

customElements.define('gsa-sheets-screen', GsaSheetsScreen);

declare global {
  interface HTMLElementTagNameMap {
    'gsa-sheets-screen': GsaSheetsScreen;
  }
}
