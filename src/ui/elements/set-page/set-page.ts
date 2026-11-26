/* A set page (the Sheets tab's third level) as one Lit element in light DOM: the sticky header (the breadcrumb with the set switcher, the
   sheet's settings read-only, the set's name, notes and Edit, Copy and Delete buttons, the set bar with Auto-fill, the goal and the gear
   icon, and the stat block), the gear table with its piece pickers, materia and meal menus and pins, the Auto-fill settings popover, an
   Auto-fill suggestion with its Take boxes, a manual draft, and the question before leaving.
   It sits inside the Sheets screen (`<gsa-sheets-screen>`, sheets/sheets-screen.ts), made again for each set it shows (the screen draws
   it with `keyed(setId, ...)`), so nothing here outlives a set:
   - the screen gives it `ports` (the store, its Sheets facade, the solver and the highest real item level: SetPagePorts), `setId`,
     `header` (the page's top line, views/sheet-sets.js setHeaderView) and `dialogIsOpen` (a function: whether a dialog of the screen is
     open); the element follows the store itself: it draws again when the Sheets tab or the set pages change;
   - what it does is the page's session (session.ts and the parts it makes: menus, edits, Auto-fill, settings, leaving); the element
     makes one when it has its ports and set, starts it, and stops it when it leaves the page (the Auto-fill still running is stopped,
     the page's draft and result go);
   - what it draws is views/set-page.js's view, built once per change of the sheets, the set, the draft or the result (never in reactive
     state); the template only displays it;
   - Edit and Delete are asked of the Sheets screen, which owns those dialogs, with a `sheet-action` event (sheets/sheet-action.ts).
   Everything a menu, a popover or the question needs is an element of its own (the piece picker, the materia menu, the Food menu, the
   Auto-fill settings popover and the question's dialog), placed in this template. */
import type { StatKey } from '../../../core/types.ts';
import { LitElement, type PropertyValues, type TemplateResult, html, nothing } from 'lit';
import { classMap } from 'lit/directives/class-map.js';
import { ifDefined } from 'lit/directives/if-defined.js';
import { repeat } from 'lit/directives/repeat.js';
import { JOB_ICONS } from '../../../data/job-icons.js';
import { followInPage } from '../../router/plain-click.ts';
import { fillButtonView, noPiecesFlag, setPageViews } from '../../views/set-page.js';
import '../gear-browser/expansion-menu.ts';
import '../gear-browser/gear-categories.ts';
import { copyIcon, deleteIcon, editIcon } from '../shared/button-icons.ts';
import '../shared/dialog.ts';
import { shownNumber } from '../shared/number-box.ts';
import '../shared/select.ts';
import { type SheetAction, sendSheetAction } from '../sheets/sheet-action.ts';
import '../sheets/switch-menu.ts';
import './food-menu.ts';
import './materia-menu.ts';
import './piece-picker.ts';
import './rank-note.ts';
import type { LeaveChoice } from './leave-guard.ts';
import { PageSession } from './session.ts';
import type { SetPagePorts } from './session-types.ts';
import './settings-popover.ts';
import type { PageView, RowView } from './set-page-types.ts';

/* The framed job icons by job id (src/data/job-icons.js). */
const ICONS: Record<string, string> = JOB_ICONS;

/* The page's top line (views/sheet-sets.js setHeaderView). */
export interface SetPageHeader {
  crumbs: readonly { text: string }[];
  jobId: string;
  settingsText: string;
  notes: { text: string; empty: boolean };
}

/* A style that hides an element that stays in the page (a row's pin of an empty row, a line with nothing to say). */
const HIDDEN = 'display: none;';
const hideWhen = (hidden: boolean) => (hidden ? HIDDEN : nothing);

const PIN_ON =
  'M22.3126 10.1753L20.8984 11.5895L20.1913 10.8824L15.9486 15.125L15.2415 18.6606L13.8273 20.0748L9.58466 15.8321L4.63492 20.7819L3.2207 19.3677L8.17045 14.4179L3.92781 10.1753L5.34202 8.76107L8.87756 8.05396L13.1202 3.81132L12.4131 3.10422L13.8273 1.69L22.3126 10.1753Z';
const PIN_OFF =
  'M13.8273 1.69L22.3126 10.1753L20.8984 11.5895L20.1913 10.8824L15.9486 15.125L15.2415 18.6606L13.8273 20.0748L9.58466 15.8321L4.63492 20.7819L3.2207 19.3677L8.17045 14.4179L3.92781 10.1753L5.34202 8.76107L8.87756 8.05396L13.1202 3.81132L12.4131 3.10422L13.8273 1.69ZM14.5344 5.22554L9.86358 9.89637L7.0417 10.4607L13.5418 16.9609L14.1062 14.139L18.7771 9.46818L14.5344 5.22554Z';
const GEAR_ICON =
  'M5.33409 4.54491C6.3494 3.63637 7.55145 2.9322 8.87555 2.49707C9.60856 3.4128 10.7358 3.99928 12 3.99928C13.2642 3.99928 14.3914 3.4128 15.1245 2.49707C16.4486 2.9322 17.6506 3.63637 18.6659 4.54491C18.2405 5.637 18.2966 6.90531 18.9282 7.99928C19.5602 9.09388 20.6314 9.77679 21.7906 9.95392C21.9279 10.6142 22 11.2983 22 11.9993C22 12.7002 21.9279 13.3844 21.7906 14.0446C20.6314 14.2218 19.5602 14.9047 18.9282 15.9993C18.2966 17.0932 18.2405 18.3616 18.6659 19.4536C17.6506 20.3622 16.4486 21.0664 15.1245 21.5015C14.3914 20.5858 13.2642 19.9993 12 19.9993C10.7358 19.9993 9.60856 20.5858 8.87555 21.5015C7.55145 21.0664 6.3494 20.3622 5.33409 19.4536C5.75952 18.3616 5.7034 17.0932 5.0718 15.9993C4.43983 14.9047 3.36862 14.2218 2.20935 14.0446C2.07212 13.3844 2 12.7002 2 11.9993C2 11.2983 2.07212 10.6142 2.20935 9.95392C3.36862 9.77679 4.43983 9.09388 5.0718 7.99928C5.7034 6.90531 5.75952 5.637 5.33409 4.54491ZM13.5 14.5974C14.9349 13.7689 15.4265 11.9342 14.5981 10.4993C13.7696 9.0644 11.9349 8.57277 10.5 9.4012C9.06512 10.2296 8.5735 12.0644 9.40192 13.4993C10.2304 14.9342 12.0651 15.4258 13.5 14.5974Z';
const WARNING_ICON =
  'M12.8659 3.00017L22.3922 19.5002C22.6684 19.9785 22.5045 20.5901 22.0262 20.8662C21.8742 20.954 21.7017 21.0002 21.5262 21.0002H2.47363C1.92135 21.0002 1.47363 20.5525 1.47363 20.0002C1.47363 19.8246 1.51984 19.6522 1.60761 19.5002L11.1339 3.00017C11.41 2.52187 12.0216 2.358 12.4999 2.63414C12.6519 2.72191 12.7782 2.84815 12.8659 3.00017ZM4.20568 19.0002H19.7941L11.9999 5.50017L4.20568 19.0002ZM10.9999 16.0002H12.9999V18.0002H10.9999V16.0002ZM10.9999 9.00017H12.9999V14.0002H10.9999V9.00017Z';
const CLOSE_ICON =
  'M12 10.5858L16.9497 5.63604L18.364 7.05025L13.4142 12L18.364 16.9497L16.9497 18.364L12 13.4142L7.05025 18.364L5.63604 16.9497L10.5858 12L5.63604 7.05025L7.05025 5.63604L12 10.5858Z';

/* A pin icon, filled or outline. */
const pinIcon = (filled: boolean) =>
  html`<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d=${filled ? PIN_ON : PIN_OFF} /></svg>`;
/* The X of a popover or dialog. */
const closeIcon = () =>
  html`<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d=${CLOSE_ICON} /></svg>`;

/* The `gsa-set-page` element (registered below); see the file header. */
export class GsaSetPage extends LitElement {
  static properties = {
    ports: { attribute: false },
    setId: { type: String, attribute: 'set-id' },
    header: { attribute: false },
    dialogIsOpen: { attribute: false },
  };

  declare ports: SetPagePorts | null;
  declare setId: string | null;
  declare header: SetPageHeader | null;
  declare dialogIsOpen: () => boolean;
  // the page's logic (session.ts), made when the element has its ports and set; the views of the set it shows
  private session: PageSession | null = null;
  private readonly views = setPageViews();
  private unfollow: (() => void) | null = null;
  // the store's revisions of the Sheets tab and of the set pages at the last change that drew: another slice's change draws nothing
  private followed = '';
  private headWatch: ResizeObserver | null = null;
  private watchedHead: Element | null = null;
  // the line the Food menu stays under (the bottom of the pinned header and the stuck column names), a function the menu reads
  private readonly viewTop = () => this.session?.menus.viewTop() ?? 0;

  constructor() {
    super();
    this.ports = null;
    this.setId = null;
    this.header = null;
    this.dialogIsOpen = () => false;
  }

  /* Light DOM: draw into the element itself, so the page's CSS reaches the markup. */
  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    if (this.hasUpdated) {
      this.requestUpdate();
    }
  }

  /* The page leaves (its set was left, or the screen changed): the session stops (the Auto-fill, the guard, the page's entry in the
     store), and the element stops following the store and the header's height. */
  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.session?.stop();
    this.session = null;
    this.unfollow?.();
    this.unfollow = null;
    this.headWatch?.disconnect();
    this.headWatch = null;
    this.watchedHead = null;
  }

  /* What the session needs of this element (session-types.ts SessionHost). */
  private sessionHost() {
    const element = this;
    return {
      get isConnected() {
        return element.isConnected;
      },
      get dialogOpen() {
        return element.dialogIsOpen();
      },
      query: (selector: string) => element.querySelector<HTMLElement>(selector),
      requestUpdate: () => element.requestUpdate(),
      // once the page has drawn the change just made (it draws again first: the store tells it a tick later), unless it is gone by then
      afterDraw: (callback: () => void) => {
        element.requestUpdate();
        void element.updateComplete.then(() => {
          if (element.isConnected) {
            callback();
          }
        });
      },
    };
  }

  /* Before each draw: once the element has its ports and set, the session is made and started (the page's entry in the store, the leave
     guard, the first Gear to search count), and the element follows the store. */
  protected override willUpdate(_changed: PropertyValues<this>): void {
    const ports = this.ports;
    if (this.session || !ports || !this.setId || !this.isConnected) {
      return;
    }
    this.session = new PageSession(ports, this.setId, this.sessionHost());
    this.session.start();
    this.followed = this.revisions(ports);
    this.unfollow = ports.store.subscribe(() => {
      const now = this.revisions(ports);
      if (now !== this.followed) {
        this.followed = now;
        this.requestUpdate();
      }
    });
  }

  /* The store's revisions the page draws from: the Sheets tab's and the set pages'. */
  private revisions(ports: SetPagePorts): string {
    return `${ports.store.revs.sheets}|${ports.store.revs.setPages}`;
  }

  /* After each draw: the header's height is followed (the column names stick under it: `--sh` on the page). */
  protected override updated(): void {
    const head = this.querySelector('.shead');
    if (head === this.watchedHead || typeof ResizeObserver !== 'function') {
      return;
    }
    this.headWatch?.disconnect();
    this.watchedHead = head;
    if (!head) {
      return;
    }
    // its exact height, not offsetHeight's whole pixels, or the column names stick a fraction of a pixel off the header's bottom edge
    const page = this.querySelector<HTMLElement>('.setpage');
    const set = () => page?.style.setProperty('--sh', `${head.getBoundingClientRect().height}px`);
    set();
    this.headWatch = new ResizeObserver(set);
    this.headWatch.observe(head);
  }

  /* Sends an action to the Sheets tab (Edit and Delete of the set: it owns those dialogs). */
  private send(action: SheetAction): void {
    sendSheetAction(this, action);
  }

  /* TODO: after a click on a sheet name, a set name or a breadcrumb the focus ends on the page body, because the link is gone with its
     screen. Moving the focus to the new screen's heading, as Back and Forward do, would remove this. */
  /* A breadcrumb link: 'sheets' the manager, 'sheet' the open sheet's page. Only a plain click moves inside the page; any other click is
     left to the browser. */
  private goCrumb(to: 'sheets' | 'sheet', event: MouseEvent): void {
    const sheets = this.ports?.sheets;
    followInPage(event, () => {
      if (to === 'sheets') {
        sheets?.openManager();
      } else {
        sheets?.closeSet();
      }
    });
  }

  protected override render() {
    const session = this.session;
    const header = this.header;
    if (!session || !header) {
      return nothing;
    }
    // a set deleted or left before the Sheets tab has taken the page away draws nothing
    const saved = session.saved;
    const sheet = session.sheet;
    if (!saved || !sheet || saved.id !== session.setId) {
      return nothing;
    }
    const view = this.views.view(session.sheets.rev, sheet, saved, session.draft, session.suggestion) as PageView;
    return html`<div class="setpage" @keydown=${(event: KeyboardEvent) => session.leave.pageKey(event)}>
      ${this.renderHead(session, header, view)}
      <p class="small stale-note" id="sh-fill-line" role="alert" style=${hideWhen(!session.fillLine)}>${session.fillLine}</p>
      <p class="small stale-note" id="sh-empty-note" style=${hideWhen(!view.suggest?.emptyNote)}>${view.suggest?.emptyNote}</p>
      ${this.renderTable(session, view)}
      ${view.rows.anyAtCap ? html`<p class="small dim" id="sh-cap-key"><span class="atcap">48</span> <span>${view.rows.capKeyText}</span></p>` : nothing}
      ${view.bonusNote ? html`<p class="small dim" id="sh-set-bonus-note">${view.bonusNote}</p>` : nothing}
      ${this.renderLeave(session, view)}
    </div>`;
  }

  /* ---- the sticky header ---- */

  /* The sticky header: the breadcrumb line, the set's heading with its buttons, the set bar and the stat block. */
  private renderHead(session: PageSession, header: SetPageHeader, view: PageView) {
    const { sheets, saved } = session;
    const busy = sheets.busy;
    const asking = (action: 'edit' | 'delete') => (event: MouseEvent) =>
      this.send({ action, kind: 'set', id: saved.id, opener: event.currentTarget as HTMLElement });
    const switcher = session.menus.setSwitcher;
    return html`<div class=${classMap({ shead: true, sug: view.mode === 'suggestion', man: view.mode === 'draft' })}>
      <div class="setline">
        <nav class="setcrumb" aria-label="Breadcrumb"><a href=${sheets.href()} @click=${(event: MouseEvent) => this.goCrumb('sheets', event)}>Sheets</a><span class="csep" aria-hidden="true">/</span><a
          href=${sheets.href(sheets.sheetId)}
          class="clipname"
          title=${header.crumbs[1].text}
          @click=${(event: MouseEvent) => this.goCrumb('sheet', event)}>${header.crumbs[1].text}</a><span class="csep" aria-hidden="true">/</span><span
          class="crumbhere clipname"
          aria-current="page"
          title=${header.crumbs[2].text}>${header.crumbs[2].text}</span>
          <span class="setsw"><gsa-switch-menu
            button-id="sh-set-switch"
            menu-id="sh-set-menu"
            button-label="Switch gear set"
            menu-label="Gear sets"
            .items=${switcher.items}
            .allLabel=${switcher.allLabel}
            .allHref=${switcher.allHref}
            .newLabel=${switcher.newLabel}
            .newDisabled=${switcher.newDisabled}
            @switch-pick=${(event: CustomEvent) => session.menus.pickSet(event.detail)}></gsa-switch-menu></span>
        </nav>
        <span class="sp"></span>
        <span class="sheetro" id="sh-set-settings" role="group" aria-label="Sheet settings, read-only"><img class="jobico" src=${ICONS[header.jobId]} alt="" width="20" height="20" /><span>${header.settingsText}</span></span>
      </div>
      <div class="setbox">
      <div class="setheading">
        <div class="sethd">
          <h2 class="setname" id="sh-set-name" title=${saved.name}>${saved.name}</h2>
          <p class=${classMap({ setnotes: true, dim: header.notes.empty })} id="sh-set-notes">${header.notes.text}</p>
        </div>
        <div class="setactions">
          <button type="button" id="sh-set-edit" ?disabled=${busy} @click=${asking('edit')}>${editIcon()}Edit</button>
          <button type="button" id="sh-set-copy" ?disabled=${busy} @click=${() => session.leave.copySet()}>${copyIcon()}Copy</button>
          <button type="button" class="danger" id="sh-set-delete" ?disabled=${busy} @click=${asking('delete')}>${deleteIcon()}Delete</button>
        </div>
      </div>
      <div class="tbar"><div class="topline bline">${this.renderBar(session, view)}</div></div>
      </div>
      ${view.head.rows.length ? this.renderFigures(view) : nothing}
    </div>`;
  }

  /* The set bar follows the state: at rest Auto-fill, the goal and the gear; a draft, Apply and Discard; a result, Apply and Discard
     with the goal; a running Auto-fill, "Solving…" and Cancel. */
  private renderBar(session: PageSession, view: PageView) {
    const { fill, edits } = session;
    if (view.mode === 'suggestion') {
      return html`<div class="fillbar"><div class="sugbtns"><button
        type="button"
        class="primary applybtn"
        id="sh-apply"
        ?disabled=${view.apply?.disabled}
        @click=${() => fill.applySuggestion()}>${view.apply?.text}</button><button type="button" id="sh-discard" @click=${() => fill.discardSuggestion()}>Discard</button></div>
        <span class="small goalsum" id="sh-goal">for<b class="gtxt">${view.goalLine}</b></span>
      </div>`;
    }
    if (view.mode === 'draft') {
      return html`<div class="sugbtns"><button
        type="button"
        class="primary applybtn"
        id="sh-apply"
        ?disabled=${view.apply?.disabled}
        @click=${() => edits.applyDraft()}>${view.apply?.text}</button><button type="button" id="sh-discard" @click=${() => edits.discardDraft()}>Discard</button></div>`;
    }
    if (session.running) {
      return html`<span class="fillrun"><span class="solving" role="status">Solving…</span><button type="button" id="sh-cancel" @click=${() => fill.cancelFill()}>Cancel</button></span>`;
    }
    const button = fillButtonView(view, { draft: session.draft, busy: session.sheets.busy, searchedCount: session.searchedCount });
    const flag = noPiecesFlag(session.searchedCount);
    // Auto-fill comes up where Apply and Discard were: the second click of a double-click on them (detail 2) must not start a run
    return html`<div class="fillbar">
      <button
        type="button"
        class="primary"
        id="sh-fill"
        ?disabled=${button.disabled}
        title=${ifDefined(button.title ?? undefined)}
        @click=${(event: MouseEvent) => {
          if (event.detail < 2) {
            void fill.fill();
          }
        }}>${button.text}</button>
      ${view.goalLine ? html`<span class="small goalsum" id="sh-goal">for<b class="gtxt">${view.goalLine}</b></span>` : nothing}
      ${this.renderSettings(session)}
      ${
        flag
          ? html`<span class="nopieces" id="sh-no-pieces" title=${flag.full} aria-hidden="true"><svg viewBox="0 0 24 24"><path fill="currentColor" d=${WARNING_ICON} /></svg><span>${flag.short}</span></span>`
          : nothing
      }
      <span class="sr-only" id="sh-no-pieces-note" role="status">${flag ? flag.full : ''}</span>
    </div>`;
  }

  /* The stat block: the figures of the set shown, with the change a draft or a result makes. */
  private renderFigures(view: PageView) {
    const { names, columns, rows } = view.head;
    return html`<div class="totals tb3" id="sh-figures" style=${`--figs: ${names.length}; --cols: ${columns}`}>
      <div class="crow hrow"><span class="cl"></span>${names.map(name => html`<span class="cn">${name.label}</span>`)}</div>
      ${rows.map(
        row =>
          html`<div class=${classMap({ crow: true, after: row.after, moved: Boolean(row.moved) })}><span class="cl" title=${row.label}>${row.label}</span>${row.figures.map(
            figure =>
              html`<span class=${classMap({ cc: true, chg: Boolean(figure.change) })} data-fig=${figure.key}>${
                figure.change
                  ? html`<em class=${classMap({ dl: true, good: figure.change.good, bad: !figure.change.good })}><svg class="dlarrow" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d=${figure.change.up ? 'M12 8L18 14H6L12 8Z' : 'M12 16L6 10H18L12 16Z'} /></svg><span>${figure.change.text}</span></em>`
                  : nothing
              }<b class=${figure.change ? 'chgfig' : ''}>${figure.shown ?? figure.text}</b></span>`,
          )}</div>`,
      )}
    </div>`;
  }

  /* ---- the Auto-fill settings popover ---- */

  /* The settings popover (the gear button and its box): the goal, the Target GCD and Gear to search boxes, which edit the set's Auto-fill
     settings. <gsa-settings-popover> draws nothing of its own: it opens and closes this markup. */
  /* eslint-disable lit-a11y/role-has-required-aria-attrs */
  private renderSettings(session: PageSession) {
    const { settings, sheets } = session;
    const job = session.job;
    const fillSettings = session.fillSettings;
    const goal = fillSettings.goal;
    const answer = session.pageState.gearToSearch;
    const label = answer.gcdLabel;
    const off = settings.targetIsSpeed;
    const boxes = settings.boxes;
    const [gcdMin, gcdMax] = settings.targetGcdRange;
    const filters = settings.filters;
    return html`<gsa-settings-popover class="gearwrap" trigger-id="sh-settings" content-id="sh-settings-dialog" @settings-open=${(event: CustomEvent<boolean>) => settings.settingsToggled(event.detail)}>
      <button
        type="button"
        class="linkbtn gearbtn"
        aria-label="Auto-fill settings"
        data-zag-part="trigger"
        ?disabled=${sheets.busy}><svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d=${GEAR_ICON} /></svg></button>
      <div data-zag-part="positioner"><div class="setpop" data-overlay-layer="settings" data-zag-part="content" aria-label="Auto-fill settings">
        <button type="button" class="dlgclose" data-zag-part="close-trigger">${closeIcon()}</button>
        <div class="part" role="group" aria-labelledby="s-goal-h">
          <h3 id="s-goal-h">Goal</h3>
          <div class="grid">
            <div class="f field"><label for="s-target">Maximize</label><span class="selhost"><gsa-select button-id="s-target" label="Maximize" .options=${settings.statOptions} .value=${goal.target} @change=${(event: CustomEvent<string>) => settings.setGoal(0, event.detail)}></gsa-select></span></div>
            <div class="f field"><label for="s-tb1">Tiebreak 1</label><span class="selhost"><gsa-select button-id="s-tb1" label="Tiebreak 1" .options=${settings.tiebreakOptions(1)} .value=${goal.tb} @change=${(event: CustomEvent<string>) => settings.setGoal(1, event.detail)}></gsa-select></span></div>
            <div class="f field"><label for="s-tb2">Tiebreak 2</label><span class="selhost"><gsa-select button-id="s-tb2" label="Tiebreak 2" .options=${settings.tiebreakOptions(2)} .value=${goal.tb2} @change=${(event: CustomEvent<string>) => settings.setGoal(2, event.detail)}></gsa-select></span></div>
            <div class="f field gcd-field"><label for="s-gcd" class="gcd-label"><span class="gcd-left" aria-hidden="true"><span>${label.name}</span>${label.range ? html`<span> · <span class="gcd-range">${label.range}</span></span>` : nothing}</span>${label.haste || label.off ? html`<span class="gcd-side" aria-hidden="true" title=${ifDefined(label.haste)}>${label.haste || label.off}</span>` : nothing}<span class="sr-only">${label.full}</span></label>
              <div class="row">
                <input
                  type="number"
                  id="s-gcd"
                  step="0.01"
                  inputmode="decimal"
                  placeholder="Any"
                  min=${gcdMin}
                  max=${gcdMax}
                  ?disabled=${off}
                  .value=${shownNumber(boxes.gcd)}
                  @input=${boxes.gcd.onInput}
                  @change=${boxes.gcd.onChange} />
                <div class=${classMap({ seg: true, off })} role="radiogroup" aria-label="Target GCD mode">
                  <label><input
                    type="radio"
                    name="s-gcd-mode"
                    value="exact"
                    ?disabled=${off}
                    .checked=${goal.gcdMode === 'exact'}
                    @change=${() => settings.setGoalField('gcdMode', 'exact')} />exactly</label>
                  <label><input
                    type="radio"
                    name="s-gcd-mode"
                    value="min"
                    ?disabled=${off}
                    .checked=${goal.gcdMode === 'min'}
                    @change=${() => settings.setGoalField('gcdMode', 'min')} />or faster</label>
                </div>
              </div>
            </div>
          </div>
          <div class="row switches">
            <label class="toggle"><input
              type="checkbox"
              role="switch"
              class="switch"
              id="s-melds"
              .checked=${goal.melds}
              @change=${(event: Event) => settings.setGoalField('melds', (event.target as HTMLInputElement).checked)} /><span>Materia</span></label>
            <label class="toggle"><input
              type="checkbox"
              role="switch"
              class="switch"
              id="s-food"
              .checked=${goal.food}
              @change=${(event: Event) => settings.setGoalField('food', (event.target as HTMLInputElement).checked)} /><span>Food</span></label>
            <span class="rankwrap">
              <label class=${classMap({ toggle: true, off: !goal.tb })}><input
                type="checkbox"
                role="switch"
                class="switch"
                id="s-by-tier"
                ?disabled=${!goal.tb}
                .checked=${goal.byTier}
                @change=${(event: Event) => settings.setGoalField('byTier', (event.target as HTMLInputElement).checked)} /><span>Spare points to tiebreaks</span></label>
              <gsa-rank-note></gsa-rank-note>
            </span>
          </div>
          <p class="small dim rank-note" id="s-rank-note" role="status" style=${hideWhen(!settings.rankNote)}>${settings.rankNote}</p>
        </div>
        <div class="part" role="group" aria-labelledby="s-gear-h">
          <h3 id="s-gear-h">Gear to search <span class="count" id="s-count" data-state=${answer.searched === null ? 'pending' : 'ready'}>${answer.countText ? `· ${answer.countText}` : ''}</span></h3>
          <div class="grid">
            <gsa-expansion-menu class="f multi" id-prefix="s" .off=${filters.expOff} @expansion-change=${(event: CustomEvent<string[]>) => settings.setFilters({ expOff: event.detail })}></gsa-expansion-menu>
            <label class="f"><span>Equip level <span class="f-range">1–${job.maxLevel}</span></span><input type="number" id="s-lvl" inputmode="numeric" min="1" max=${job.maxLevel} .value=${shownNumber(boxes.lvl)} @input=${boxes.lvl.onInput} @change=${boxes.lvl.onChange} /></label>
            <div class="f field ilvl-field"><span id="s-ilvl-label">Item level <span class="f-range">1–${session.ports.maxReal}</span></span><div class="pair" role="group" aria-labelledby="s-ilvl-label"><input
              type="number"
              id="s-min"
              inputmode="numeric"
              placeholder="min"
              aria-label="Item level min"
              min="1"
              max=${session.ports.maxReal}
              .value=${shownNumber(boxes.min)}
              @input=${boxes.min.onInput}
              @change=${boxes.min.onChange} /><span aria-hidden="true">–</span><input
              type="number"
              id="s-max"
              inputmode="numeric"
              placeholder="max"
              aria-label="Item level max"
              min="1"
              max=${session.ports.maxReal}
              .value=${shownNumber(boxes.max)}
              @input=${boxes.max.onInput}
              @change=${boxes.max.onChange} /></div></div>
            <gsa-gear-categories
              class="f multi"
              id-prefix="s"
              .exclude=${filters.exclude}
              .market=${Boolean(filters.market)}
              .counts=${answer.fromCounts}
              @categories-change=${(event: CustomEvent) => settings.setFilters(event.detail)}></gsa-gear-categories>
          </div>
        </div>
      </div></div>
    </gsa-settings-popover>`;
  }
  /* eslint-enable lit-a11y/role-has-required-aria-attrs */

  /* ---- the gear table ---- */

  /* The gear table: one row per slot, the Food row and the totals, with the piece picker and the materia menu under it. */
  // a click on the table says why nothing happens while a result waits; every control in it has its own key
  /* eslint-disable lit-a11y/click-events-have-key-events */
  private renderTable(session: PageSession, view: PageView) {
    const { menus, fill } = session;
    const rows = view.rows;
    const columns = rows.headers.length + 3;
    return html`<div
      class=${classMap({ tablewrap: true, menus: true, settable: true, ghostlock: view.mode === 'suggestion' })}
      @click=${(event: MouseEvent) => fill.tableClick(event.target as Element)}><table class="coltint" id="sh-gear">
      <thead><tr><th>Slot</th><th>Item</th><th class="n" data-col="ilvl">ilvl</th>${rows.headers.map(
        header =>
          html`<th class="n" data-col=${header.stat}>${header.rank ? html`<i class="rk">${header.rank}</i>` : nothing}<span>${header.text}</span></th>`,
      )}</tr></thead>
      <tbody>
        ${repeat(
          rows.rows,
          row => row.index,
          row => this.renderRow(session, view, row),
        )}
        <tr class="sect"><th colspan=${columns}>${rows.consumablesLabel}</th></tr>
        ${this.renderFoodRow(session, view)}
        ${this.renderTotals(view)}
      </tbody>
    </table>
    <div>
      <gsa-piece-picker
        .menu=${menus.pickerMenu}
        .anchor=${menus.pickAnchor}
        .query=${menus.query}
        @picker-shown=${(event: CustomEvent<HTMLElement>) => {
          if (menus.pickAnchor) {
            menus.keepMenuInView(event.detail, menus.pickAnchor);
          }
        }}
        @picker-close=${() => menus.closePicker()}
        @picker-query=${(event: CustomEvent<string>) => menus.setQuery(event.detail)}
        @piece-pick=${(event: CustomEvent<number | null>) => menus.pickPiece(event.detail)}></gsa-piece-picker>
    </div>
    <div>
      <gsa-materia-menu
        .menu=${menus.materiaMenu}
        .anchor=${menus.matAnchor}
        .all=${menus.matAll}
        @materia-shown=${(event: CustomEvent<HTMLElement>) => menus.keepMenuInView(event.detail, menus.matAnchor)}
        @materia-close=${() => menus.closeMateria()}
        @stone-pick=${(event: CustomEvent<{ stat: StatKey; grade: number }>) => menus.pickStone(event.detail)}
        @stone-remove=${() => menus.dropStone()}
        @grades-toggle=${() => menus.toggleAllGrades()}></gsa-materia-menu>
    </div></div>`;
  }
  /* eslint-enable lit-a11y/click-events-have-key-events */

  /* One piece's row: the pin, the piece button with its Take box, where it is from and its stone chips, the item level and the stats. */
  private renderRow(session: PageSession, view: PageView, row: RowView) {
    const { menus, edits, fill } = session;
    const locked = session.locked;
    const rows = view.rows;
    const shieldNoteId = `shield-note-${row.index}`;
    return html`<tr data-row=${row.index} class=${classMap({ changed: row.changed, emptyrow: row.empty })}>
      <td class="pnc"><button
        type="button"
        class=${classMap({ pinic: true, on: row.pinned })}
        style=${hideWhen(row.empty)}
        aria-pressed=${String(row.pinned)}
        aria-label=${`${row.label}: ${row.pinned ? 'pinned' : 'unpinned'}`}
        ?disabled=${locked}
        @click=${() => edits.togglePin(row.index)}>${pinIcon(row.pinned)}</button><span class="pinspacer" style=${hideWhen(!row.empty)}></span><span>${row.label}</span></td>
      <td class="item">
        <div class="same">
          <button
            type="button"
            class=${classMap({ 'same-btn': true, 'choose-empty': row.empty && !row.covered, covered: Boolean(row.covered) })}
            data-pick=${row.index}
            data-empty=${String(row.empty)}
            aria-expanded=${String(menus.pickOpen === row.index)}
            aria-disabled=${ifDefined(row.covered ? 'true' : undefined)}
            aria-describedby=${ifDefined(row.shieldNote ? shieldNoteId : undefined)}
            title=${ifDefined(row.shieldNote || row.coveredTitle || undefined)}
            ?disabled=${locked}
            @click=${(event: MouseEvent) => {
              if (!row.covered) {
                menus.togglePicker(row.index, event.currentTarget as HTMLElement);
              }
            }}><span><span>${row.empty ? row.emptyText : row.name}</span>${row.hq ? html`<span class="hqg" role="img" aria-label="High quality"></span>` : nothing}</span></button>
        </div>
        ${row.shieldNote ? html`<div class="shield-note" id=${shieldNoteId}>${row.shieldNote}</div>` : nothing}
        ${row.take ? this.renderTake(row.take, taken => fill.setTake(row.index, taken)) : nothing}
        <div class="from" style=${hideWhen(row.empty || !(row.category || row.from))}><span
          class=${row.category ? `pill cat-${row.category.key}` : 'pill'}
          style=${hideWhen(!row.category)}>${row.category?.label ?? ''}</span><span>${row.from ?? ''}</span></div>
        ${
          !row.empty && row.chips?.length
            ? html`<div class="slots">${repeat(
                row.chips,
                chip => chip.index,
                chip => html`<span class="pop">
            <button
              type="button"
              class=${classMap({ mchip: true, over: Boolean(chip.over), empty: Boolean(chip.empty), on: menus.chipOpen(row.index, chip.index), 'cap-none': chip.fit === 'none', removed: Boolean(chip.removed) })}
              data-chip=${`${row.index}:${chip.index}`}
              ?disabled=${locked || Boolean(chip.locked)}
              @click=${(event: MouseEvent) => menus.toggleMateria(row.index, chip.index, event.currentTarget as HTMLElement)}>${chip.text}</button>
          </span>`,
              )}</div>`
            : nothing
        }
        ${!row.empty && !row.chips?.length ? html`<div class="small dim">${row.noChipsText}</div>` : nothing}
      </td>
      <td class="n" data-col="ilvl">${row.empty ? '' : row.ilvlText}</td>
      ${rows.headers.map((header, k) => {
        const cell = row.cells?.[k];
        return html`<td class="n" data-col=${header.stat}><span style=${hideWhen(row.empty)} class=${classMap({ atcap: Boolean(cell?.atCap), dim: Boolean(cell?.zero) })}><span>${cell?.text ?? ''}</span>${cell?.beforeCap ? html`<i class="lost">(${cell.beforeCap})</i>` : nothing}</span></td>`;
      })}
    </tr>`;
  }

  /* A Take box: a piece or the meal of a result, taken or declined. `change(taken)`: the box was ticked or cleared. */
  private renderTake(take: { taken: boolean; text: string; locked?: boolean }, change: (taken: boolean) => void) {
    return html`<label class=${classMap({ takebox: true, locked: Boolean(take.locked) })} title=${ifDefined(take.locked ? 'Follows the weapon' : undefined)}><input type="checkbox" .checked=${take.taken} ?disabled=${Boolean(take.locked)} @change=${(event: Event) => change((event.target as HTMLInputElement).checked)} /><span>Take <span class="dim">${take.text}</span></span></label>`;
  }

  /* The Food row: the pin, the Food menu, its Take box and the stats the meal adds. */
  private renderFoodRow(session: PageSession, view: PageView) {
    const { menus, edits, fill } = session;
    const food = view.rows.food;
    return html`<tr class=${classMap({ food: true, changed: food.changed })} id="sh-food-row">
      <td class="pnc">${
        food.empty
          ? html`<span class="pinspacer"></span>`
          : html`<button
            type="button"
            class=${classMap({ pinic: true, on: food.pinned })}
            id="sh-meal-pin"
            aria-pressed=${String(food.pinned)}
            aria-label=${`Food: ${food.pinned ? 'pinned' : 'unpinned'}`}
            ?disabled=${session.locked}
            @click=${() => edits.toggleMealPin()}>${pinIcon(food.pinned)}</button>`
      }<span>${food.label}</span></td>
      <td class="item">
        <div class="mealline"><gsa-food-menu
          class="same"
          .label=${food.empty ? food.emptyText : food.name}
          .empty=${food.empty}
          .disabled=${session.locked}
          .viewTop=${this.viewTop}
          .menu=${menus.foodOpen ? this.views.mealMenu() : null}
          @food-open=${(event: CustomEvent<boolean>) => menus.setFoodOpen(event.detail)}
          @meal-pick=${(event: CustomEvent<string | null>) => edits.setMeal(event.detail)}></gsa-food-menu><span class="small" style=${hideWhen(!food.best.note)}><span class="star" role="img" aria-label=${ifDefined(food.best.note || undefined)}></span></span></div>
        ${food.take ? this.renderTake(food.take, taken => fill.setTake(null, taken)) : nothing}
      </td>
      <td class="n" data-col="ilvl">${food.ilvl ?? ''}</td>
      ${view.rows.headers.map((header, k) => {
        const cell = food.cells[k];
        return html`<td class="n" data-col=${header.stat}>${cell ? html`<span><span>${cell.text}</span>${cell.capped ? html`<span class="small dim capped">capped</span>` : nothing}</span>` : nothing}</td>`;
      })}
    </tr>`;
  }

  /* The Total, Tier and Defense rows. */
  private renderTotals(view: PageView) {
    const { total, tier, defense } = view.totals;
    return html`<tr class="total" id="sh-total"><td>${total.label}</td><td class="small dim">${total.emptyText}</td><td class="n" data-col="ilvl" aria-label=${ifDefined(total.ilvlLabel || undefined)}>${total.ilvl}</td>${total.cells.map(
      cell => html`<td class="n" data-col=${cell.stat}>${cell.value}</td>`,
    )}</tr>
      <tr class="tier" id="sh-tier"><td>${tier.label}</td><td class="small dim">${tier.caption}</td><td class="n"></td>${tier.cells.map(
        cell => html`<td class=${classMap({ n: true, small: true, dim: Boolean(cell?.zero) })}>${cell ? cell.text : ''}</td>`,
      )}</tr>
      <tr class="tier" id="sh-defense"><td>${defense.label}</td><td class="defense" colspan=${view.rows.headers.length + 2}><span>${defense.phys.label}</span> <b>${defense.phys.valueText}</b> <em><span class="defdot">·</span><span>${defense.phys.pctText}</span></em> <span class="defsep">/</span> <span>${defense.mag.label}</span> <b>${defense.mag.valueText}</b> <em><span class="defdot">·</span><span>${defense.mag.pctText}</span></em></td></tr>`;
  }

  /* ---- the question before leaving ---- */

  /* The question before leaving the page with a draft, a running Auto-fill or an Auto-fill result waiting: a <gsa-dialog alert> only
     while it is asked; Escape, the X and a press outside all answer Keep. */
  private renderLeave(session: PageSession, view: PageView): TemplateResult | typeof nothing {
    const { leave } = session;
    const ask = leave.ask;
    if (!ask) {
      return nothing;
    }
    const answer = (choice: LeaveChoice) => () => leave.answerLeave(choice);
    let buttons: TemplateResult;
    if (ask.kind === 'draft') {
      buttons = html`<button type="button" class="primary" id="sh-leave-apply" @click=${answer('apply')}>Apply and leave</button><button type="button" id="sh-leave-discard" @click=${answer('discard')}>Discard and leave</button><button type="button" id="sh-leave-keep" @click=${answer('keep')}>Keep editing</button>`;
    } else if (ask.kind === 'running') {
      buttons = html`<button type="button" id="sh-leave-go" @click=${answer('leave')}>Leave and cancel the Auto-fill</button><button type="button" class="primary" id="sh-leave-keep" @click=${answer('keep')}>Keep waiting</button>`;
    } else {
      buttons = html`<button type="button" id="sh-leave-go" @click=${answer('leave')}>Leave and discard the result</button><button type="button" class="primary" id="sh-leave-keep" @click=${answer('keep')}>Keep reviewing</button>`;
    }
    return html`<gsa-dialog
      alert
      content-id="sh-leave"
      title-id="sh-leave-q"
      initial-focus="#sh-leave-keep"
      @dialog-close=${answer('keep')}
      @dialog-escape=${answer('keep')}>
      <div class="dlg-backdrop" data-zag-part="backdrop"></div>
      <div class="dlg-positioner" data-zag-part="positioner">
      <div class="dlg" data-zag-part="content">
        <p class="question" id="sh-leave-q">${leave.questionText(view)}</p>
        <div class="dlgbtns">${buttons}</div>
        <button type="button" class="dlgclose" data-zag-part="close-trigger" aria-label="Close">${closeIcon()}</button>
      </div>
      </div>
    </gsa-dialog>`;
  }
}

customElements.define('gsa-set-page', GsaSetPage);
