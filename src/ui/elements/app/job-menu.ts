/* The Job menu as a Lit element in light DOM, with a Zag menu (radio items) for the open state, the keys, the focus and the
   placement. It is the Job box of the Gear browser's strip and of the math bar's controls row (Stat Allocation and Substat
   tiers, each with its own job), a child element (docs/engineering/architecture.md section 3):
   - its parent gives it the job as `job` (an id: 'SGE') and listens for `job-change`, whose `detail` is
     the id picked; the page then switches the job (a switch resets the settings of the old job) and sets `job` again;
   - it draws the label, the button (the job's icon, name and code) and the menu: one row of 40 px icons for each role, the
     rows and icons are the app's job constants (core/constants.ts), not read from the store;
   - `sized` (math bar): a hidden copy of the longest "Name (CODE)" shares the button's cell, so the button keeps one width for
     every job;
   - `prefix`, `button-id` and `menu-id` give the ids the page's labels and tests use: `<prefix>-label`, `<prefix>-name`,
     `<prefix>-code`;
   - keys: ArrowDown on the button opens the menu on the chosen job; Up and Down move between the roles (to the icon in the same
     place, or the last of a shorter row), Left and Right inside a role, Home and End the first and last icon (Zag's), Enter and
     Space pick; Escape, a pick and a press outside close it with the focus on the button; Tab closes it and the focus moves on
     (Zag's menu would hold it);
   - the open layer goes through the overlay bridge: opening another menu closes it, a change of screen closes it, and one Escape
     closes one layer. */
import * as menu from '@zag-js/menu';
import { LitElement, html, nothing } from 'lit';
import { JOBS, JOB_ROWS, jobById } from '../../../core/constants.ts';
import { JOB_ICONS } from '../../../data/job-icons.ts';
import { trackLastInput } from '../shared/key-focus.ts';
import { createOverlayBridge } from '../shared/overlay-bridge.ts';
import { ZagController, touchFriendlyTrigger } from '../shared/zag-controller.ts';
import { JOB_CHANGE_EVENT, JOB_MENU_NAME } from './job-menu-names.ts';

/* The gap between the button and the open menu, in px. */
const MENU_GAP_PX = 6;
/* The size of the icon in the button and in the menu, in px. */
const BUTTON_ICON_PX = 26;
const MENU_ICON_PX = 40;
/* Every job's "Name (CODE)", one per line: the hidden copy that gives the button the width of the widest job (Dark Knight (DRK),
   Astrologian (AST), Pictomancer (PCT)). */
const WIDEST_NAME_COPY = JOBS.map(job => `${job.name} (${job.id})`).join('\n');
/* One job of the menu: its id, its name and its icon (a data URL). */
interface MenuJob {
  id: string;
  name: string;
  icon: string;
}
/* The icons by job id. */
const ICON_BY_ID: Readonly<Record<string, string>> = JOB_ICONS;
/* The name of the job with id `id`. */
function nameOf(id: string): string {
  return jobById(id)?.name ?? id;
}
/* The rows of the menu: a role's name and its jobs with their names and icons. */
const ROLE_ROWS: readonly { label: string; jobs: readonly MenuJob[] }[] = JOB_ROWS.map(row => {
  const [label, ids] = row as readonly [string, readonly string[]];
  return { label, jobs: ids.map(id => ({ id, name: nameOf(id), icon: ICON_BY_ID[id] })) };
});
const ROLE_ROW_IDS: readonly (readonly string[])[] = ROLE_ROWS.map(row => row.jobs.map(job => job.id));

/* The job to light after an arrow key: from `from` (a job id) one role up or down (the icon in the same place, or the last of a
   shorter row) or one icon left or right inside its role. Where there is no further job it stays on `from`. Returns null for any
   other key. */
export function jobAfterArrow(from: string, key: string): string | null {
  const rowIndex = ROLE_ROW_IDS.findIndex(row => row.includes(from));
  if (rowIndex < 0) {
    return null;
  }
  const column = ROLE_ROW_IDS[rowIndex].indexOf(from);
  if (key === 'ArrowLeft' || key === 'ArrowRight') {
    return ROLE_ROW_IDS[rowIndex][column + (key === 'ArrowLeft' ? -1 : 1)] ?? from;
  }
  if (key === 'ArrowUp' || key === 'ArrowDown') {
    const row = ROLE_ROW_IDS[rowIndex + (key === 'ArrowUp' ? -1 : 1)];
    return row ? row[Math.min(column, row.length - 1)] : from;
  }
  return null;
}

/* The Zag menu of `host`: its props, the attributes of each part and the tie to the page's overlay manager. */
function makeZag(host: GsaJobMenu) {
  return new ZagController(host, {
    name: 'menu',
    machine: menu.machine,
    connect: (service, normalize) => menu.connect(service, normalize),
    getProps: () => ({
      ids: { trigger: host.buttonId || undefined, content: host.menuId || undefined },
      'aria-label': JOB_MENU_NAME,
      // always under the button (as the page's menus were); the list is no taller than the room under it and scrolls inside
      positioning: { placement: 'bottom-start' as const, gutter: MENU_GAP_PX, flip: false, strategy: 'fixed' as const },
      onOpenChange: ({ open }) => {
        if (open) {
          host.lightChosenJobAfterOpening();
        }
      },
      // the focus moved to another control by a script (not by Tab or a press, which have their own ways out): the menu closes and
      // the focus stays where it went
      onFocusOutside: event => {
        event.preventDefault();
        host.zag.closeWithoutFocus();
      },
      onSelect: ({ value }) => host.dispatchEvent(new CustomEvent(JOB_CHANGE_EVENT, { detail: value, bubbles: true, composed: true })),
      onEscapeKeyDown: event => host.bridge.guardEscape(event),
    }),
    parts: api => ({
      trigger: touchFriendlyTrigger(api.getTriggerProps()),
      positioner: api.getPositionerProps(),
      content: api.getContentProps(),
      item: ROLE_ROWS.flatMap(row =>
        row.jobs.map(job => api.getOptionItemProps({ type: 'radio', value: job.id, checked: job.id === host.job, valueText: job.name })),
      ),
    }),
  });
}

/* The `gsa-job-menu` element (registered below): see the file header. */
export class GsaJobMenu extends LitElement {
  static properties = {
    job: { type: String },
    sized: { type: Boolean },
    prefix: { type: String },
    buttonId: { type: String, attribute: 'button-id' },
    menuId: { type: String, attribute: 'menu-id' },
  };

  declare job: string;
  declare sized: boolean;
  declare prefix: string;
  declare buttonId: string;
  declare menuId: string;
  readonly zag: ReturnType<typeof makeZag>;
  readonly bridge: ReturnType<typeof createOverlayBridge>;

  constructor() {
    super();
    this.job = '';
    this.sized = false;
    this.prefix = 'job';
    this.buttonId = '';
    this.menuId = '';
    this.zag = makeZag(this);
    this.bridge = createOverlayBridge({
      id: this.zag.id,
      api: () => this.zag.api,
      closeWithoutFocus: () => this.zag.closeWithoutFocus(),
      root: () => this.querySelector('[data-zag-part="content"]'),
      opener: () => this.querySelector('[data-zag-part="trigger"]'),
    });
    // capture phase: before Zag's menu sees the keys that are ours (Tab, and the arrows by role)
    this.addEventListener('keydown', event => this.onKeyDown(event), { capture: true });
    // the last input of the page (`data-input`): the CSS draws the focus ring on the lit icon after a key and not after the pointer
    trackLastInput(this);
  }

  /* Light DOM: draw into the element itself, so the page's CSS reaches the markup. */
  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.bridge.release();
  }

  /* After each draw (the controller has put Zag's attributes on the parts by now) the layer is registered with the page's
     manager, or dropped from it. */
  protected override updated(): void {
    this.bridge.sync();
  }

  /* Tab closes the open menu and the focus moves on from where it is (Shift+Tab from the list first puts the focus on the button,
     so that it goes on to the control before it); the arrows move the light by role. The keys are handled before Zag sees them. */
  private onKeyDown(event: KeyboardEvent): void {
    if (!this.zag.machine || !this.zag.api.open) {
      return;
    }
    if (event.key === 'Tab') {
      event.stopPropagation();
      if (event.shiftKey) {
        this.querySelector<HTMLElement>('[data-zag-part="trigger"]')?.focus({ preventScroll: true });
      }
      this.zag.closeWithoutFocus();
      return;
    }
    const next = jobAfterArrow(this.zag.api.highlightedValue ?? this.job, event.key);
    if (next) {
      event.preventDefault();
      event.stopPropagation();
      this.zag.api.setHighlightedValue(next);
    }
  }

  /* When the menu opens, the chosen job is lit, so the arrows start from where the choice is (Zag lights the first row for
     ArrowDown and nothing for a press). Zag lights its row in a task it queues when the menu opens, so the change waits a
     microtask to come after it. */
  lightChosenJobAfterOpening(): void {
    queueMicrotask(() => {
      if (this.zag.machine && this.job) {
        this.zag.api.setHighlightedValue(this.job);
      }
    });
  }

  protected override render() {
    const job = jobById(this.job);
    if (!job) {
      return nothing;
    }
    const prefix = this.prefix;
    const jobText = html`<span id="${prefix}-name">${job.name}</span> <span class="jobcode" id="${prefix}-code">(${job.id})</span>`;
    return html`
      <span id="${prefix}-label">${JOB_MENU_NAME}</span>
      <button
        type="button"
        class="multi-btn jobbox"
        data-zag-part="trigger"
        aria-labelledby="${prefix}-label ${prefix}-name ${prefix}-code">
        <img src=${ICON_BY_ID[job.id]} alt="" width=${BUTTON_ICON_PX} height=${BUTTON_ICON_PX} /><span class="jobtext">${
          this.sized
            ? html`<span class="sized"><span>${jobText}</span><span class="sizertext" aria-hidden="true">${WIDEST_NAME_COPY}</span></span>`
            : jobText
        }</span>
      </button>
      <div data-zag-part="positioner">
        <div class="jobmenu" data-zag-part="content">
          ${ROLE_ROWS.map(
            row => html`
              <div class="jobrow" role="group" aria-label=${row.label}>
                <span class="jobrow-label" aria-hidden="true">${row.label}</span>
                <div class="jobicons">
                  ${row.jobs.map(
                    rowJob => html`<div class="jobbtn" data-zag-part="item" data-job-id=${rowJob.id} title=${rowJob.name} aria-label=${rowJob.name}>
                      <img src=${rowJob.icon} alt="" width=${MENU_ICON_PX} height=${MENU_ICON_PX} />
                    </div>`,
                  )}
                </div>
              </div>
            `,
          )}
        </div>
      </div>
    `;
  }
}

customElements.define('gsa-job-menu', GsaJobMenu);
