/* The Zag popover and the overlay-manager tie that the Expansion and Gear categories menus share. Each menu is a button and a panel
   of checkboxes in the page's light DOM; Zag's popover (not modal) gives it Escape, a press outside, a close when the focus
   leaves it and the focus back on the button, and floating-ui (inside Zag) its place:
   - under the button, or over it when that side has more room; the panel is no taller than the room on its side (the CSS reads
     Zag's `--available-height`) and scrolls inside;
   - the focus stays on the button when it opens (a click or ArrowDown on the button), as the page's other menus do; Tab moves
     on into the panel, and a Tab out of it closes it;
   - inside the Auto-fill settings popover (an element with `data-overlay-layer`, the id of its layer in the overlay manager) the
     menu is a child layer of that popover (it stays open under it) and is fixed to the window, so the popover's scroll box does
     not cut it. */
import * as popover from '@zag-js/popover';
import { createOverlayBridge } from '../shared/overlay-bridge.ts';
import { ZagController, type ZagHost } from '../shared/zag-controller.ts';

/* The gap between the button and the open panel, in px. */
const PANEL_GAP_PX = 4;
/* The attribute of an element that is a layer of the overlay manager, holding the layer's id: a menu inside it is its child. */
const LAYER_ATTRIBUTE = 'data-overlay-layer';

/* What a menu element tells the popover: the ids of its button and panel (the page's tests and labels name them), which side of
   the button the panel's edge is aligned to, and the part of the markup that is its layer. */
export interface FilterPopoverOptions {
  element: ZagHost & Element;
  triggerId: () => string;
  contentId: () => string;
  /* `bottom-start` (the panel's left edge on the button's) or `bottom-end` (right edge on the button's). */
  placement: 'bottom-start' | 'bottom-end';
  /* The name of the panel: `labelId` (its `aria-labelledby`: the id of the label over the button) or, when the markup has no visible
     label, `name` (its `aria-label`). */
  labelId?: () => string;
  name?: string;
  /* The window's line the panel must stay under (px from the window's top; the page's pinned headers end there), read at each placement;
     none: the window's top. */
  viewTop?: () => number;
}

/* The part of the window under the line `top` (px from the window's top), as the area a panel must stay in. */
function windowBelow(top: number) {
  return { x: 0, y: top, width: innerWidth, height: innerHeight - top };
}

/* The id of the overlay layer `element` is inside (the Auto-fill settings popover's), or null on the page. */
function parentLayerOf(element: Element): string | null {
  return element.closest(`[${LAYER_ATTRIBUTE}]`)?.getAttribute(LAYER_ATTRIBUTE) ?? null;
}

/* Returns the Zag popover controller and the overlay bridge of one menu element; the element draws `data-zag-part` "trigger",
   "positioner" and "content" and calls `bridge.sync()` after each draw and `bridge.release()` when it leaves the page. */
export function createFilterPopover(options: FilterPopoverOptions) {
  const { element, triggerId, contentId, placement, labelId, name, viewTop } = options;
  const zag = new ZagController(element, {
    name: 'popover',
    machine: popover.machine,
    connect: (service, normalize) => popover.connect(service, normalize),
    getProps: () => ({
      ids: { trigger: triggerId(), content: contentId() },
      autoFocus: false,
      portalled: false,
      positioning: {
        placement,
        gutter: PANEL_GAP_PX,
        strategy: parentLayerOf(element) ? ('fixed' as const) : ('absolute' as const),
        // the window under the pinned parts of the page: the panel flips and is no taller than the room there
        ...(viewTop ? { boundary: () => windowBelow(viewTop()) } : {}),
      },
      onEscapeKeyDown: event => bridge.guardEscape(event),
    }),
    parts: api => ({
      trigger: {
        ...api.getTriggerProps(),
        // the arrow down on the button opens the panel, as it does the page's other menus
        onkeydown(event: KeyboardEvent) {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            api.setOpen(true);
          }
        },
      },
      // the part that holds the label and the button (when the markup has one) is what the panel is placed against, so an upward
      // panel ends over the label too
      anchor: api.getAnchorProps(),
      positioner: api.getPositionerProps(),
      content: { ...api.getContentProps(), ...(labelId ? { 'aria-labelledby': labelId() } : { 'aria-label': name }) },
    }),
  });
  const bridge = createOverlayBridge({
    id: zag.id,
    api: () => zag.api,
    closeWithoutFocus: () => zag.closeWithoutFocus(),
    root: () => element.querySelector('[data-zag-part="content"]'),
    opener: () => element.querySelector('[data-zag-part="trigger"]'),
    parent: () => parentLayerOf(element),
  });
  return { zag, bridge };
}
