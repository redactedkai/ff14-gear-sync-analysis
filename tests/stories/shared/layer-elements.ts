/* Two test elements for the overlay stories, standing for the two kinds of layer that live together on the page:
   - `zag-test-popover`: a Zag popover through the Zag controller and the overlay bridge, the way a real element is built;
   - `app-menu-stub`: a layer opened by the page's own overlay manager (src/ui/overlays.ts), as the app's menus are.
   Either can hold the other, so a story can open a Zag layer inside an app layer and the other way round. They live in the
   tests because the page has no Zag popover, and a story needs one beside a page layer, inside one and holding one. */
import * as popover from '@zag-js/popover';
import { LitElement, html, nothing } from 'lit';
import { createOverlayBridge } from '../../../src/ui/elements/shared/overlay-bridge.ts';
import { ZagController } from '../../../src/ui/elements/shared/zag-controller.ts';
import { overlays } from '../../../src/ui/overlays.ts';

/* The Zag controller of a popover on `host`: its props, its parts, and the bridge to the page's overlay manager. */
function makeZag(host: ZagTestPopover) {
  const zag = new ZagController(host, {
    name: 'popover',
    machine: popover.machine,
    connect: (service, normalize) => popover.connect(service, normalize),
    getProps: () => ({ positioning: { placement: 'bottom-start' as const }, onEscapeKeyDown: event => host.bridge.guardEscape(event) }),
    parts: api => ({
      trigger: api.getTriggerProps(),
      positioner: api.getPositionerProps(),
      content: api.getContentProps(),
      title: api.getTitleProps(),
    }),
  });
  return zag;
}

/* A Zag popover with a trigger button, a title and a button inside. `parentLayer` is the id of the page layer it is part of
   (it stays open with it); `innerMenu` puts an `app-menu-stub` inside it. */
export class ZagTestPopover extends LitElement {
  static properties = {
    label: { type: String },
    parentLayer: { type: String, attribute: 'parent-layer' },
    innerMenu: { type: Boolean, attribute: 'inner-menu' },
  };

  declare label: string;
  declare parentLayer: string | null;
  declare innerMenu: boolean;
  readonly zag: ReturnType<typeof makeZag>;
  readonly bridge: ReturnType<typeof createOverlayBridge>;

  constructor() {
    super();
    this.label = 'Popover';
    this.parentLayer = null;
    this.innerMenu = false;
    this.zag = makeZag(this);
    this.bridge = createOverlayBridge({
      id: this.zag.id,
      api: () => this.zag.api,
      closeWithoutFocus: () => this.zag.closeWithoutFocus(),
      root: () => this.querySelector('[data-zag-part="content"]'),
      opener: () => this.querySelector('[data-zag-part="trigger"]'),
      parent: () => this.parentLayer,
    });
  }

  /* Light DOM: draw into the element itself. */
  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.bridge.release();
  }

  /* After each draw the controller (a controller's hostUpdated runs first) has put Zag's attributes on the parts; the layer
     is then registered with, or dropped from, the page's manager. */
  protected override updated(): void {
    this.bridge.sync();
  }

  protected override render() {
    return html`
      <button type="button" data-zag-part="trigger">${this.label}</button>
      <div data-zag-part="positioner">
        <div data-zag-part="content" style="background: var(--surface); border: 1px solid var(--line); padding: 8px;">
          <span data-zag-part="title">${this.label} content</span>
          <button type="button">Inside ${this.label}</button>
          ${this.innerMenu ? html`<app-menu-stub layer-id="${this.zag.id}-menu" parent-layer=${this.zag.id} label="Inner menu"></app-menu-stub>` : nothing}
        </div>
      </div>
    `;
  }
}

/* A page layer: a button that opens a panel through the overlay manager, which closes it on Escape, on a press outside and
   when the focus leaves it. `layerId` is its id in the manager; `parentLayer` the layer it is part of; `withZag` puts a
   `zag-test-popover` inside the panel that is part of this layer. */
export class AppMenuStub extends LitElement {
  static properties = {
    layerId: { type: String, attribute: 'layer-id' },
    parentLayer: { type: String, attribute: 'parent-layer' },
    label: { type: String },
    withZag: { type: Boolean, attribute: 'with-zag' },
    isOpen: { state: true },
  };

  declare layerId: string;
  declare parentLayer: string | null;
  declare label: string;
  declare withZag: boolean;
  declare isOpen: boolean;

  constructor() {
    super();
    this.layerId = 'app-menu';
    this.parentLayer = null;
    this.label = 'App menu';
    this.withZag = false;
    this.isOpen = false;
  }

  /* Light DOM: draw into the element itself. */
  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    overlays.close(this.layerId);
  }

  /* Opens the panel through the manager, or closes it with the focus back on the button. */
  private toggle(): void {
    if (this.isOpen) {
      overlays.close(this.layerId, { restoreFocus: true });
      return;
    }
    overlays.open({
      id: this.layerId,
      root: () => this,
      opener: () => this.querySelector('button'),
      tabOut: true,
      parent: this.parentLayer,
      close: () => {
        this.isOpen = false;
      },
    });
    this.isOpen = true;
  }

  protected override render() {
    return html`
      <button type="button" aria-expanded=${this.isOpen ? 'true' : 'false'} @click=${() => this.toggle()}>${this.label}</button>
      <div role="group" aria-label="${this.label} panel" ?hidden=${!this.isOpen}>
        <span>${this.label} items</span>
        ${this.withZag ? html`<zag-test-popover parent-layer=${this.layerId} label="Zag in menu"></zag-test-popover>` : nothing}
      </div>
    `;
  }
}

customElements.define('zag-test-popover', ZagTestPopover);
customElements.define('app-menu-stub', AppMenuStub);
