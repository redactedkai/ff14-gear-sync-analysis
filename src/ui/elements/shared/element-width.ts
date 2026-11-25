/* A reactive controller that follows the width of one element inside its host (a chart's box), so the host draws the chart at that
   width and the chart's text keeps the page's size. The host creates it in its constructor with a function that finds the box, and
   reads `width` when it draws. The box may come and go (a chart that shows only while a view exists): after each draw the
   controller looks again and observes the box it finds now. A width of 0 (a hidden box) is ignored, so the last one stays.
   The host is a local interface (a LitElement fits it), so this file imports no Lit and Node tests it with a fake host. */

/* The part of Lit's reactive controller protocol the controller implements. */
export interface WidthLifecycle {
  hostConnected?(): void;
  hostUpdated?(): void;
  hostDisconnected?(): void;
}

/* What the controller needs of its host: a subset of what a LitElement has. */
export interface WidthHost {
  addController(controller: WidthLifecycle): void;
  requestUpdate(): void;
}

/* The controller; see the file header. */
export class ElementWidthController implements WidthLifecycle {
  /** The box's width in px (rounded), 0 until it has had one. */
  width = 0;
  readonly #host: WidthHost;
  readonly #find: () => Element | null;
  #observer: ResizeObserver | null = null;
  #target: Element | null = null;

  /* Adds the controller to `host`; `find` returns the box to follow (or null while there is none). */
  constructor(host: WidthHost, find: () => Element | null) {
    this.#host = host;
    this.#find = find;
    host.addController(this);
  }

  /* A reconnected host draws again, which looks for its box again. */
  hostConnected(): void {
    this.#host.requestUpdate();
  }

  /* After a draw: follow the box the host has now (if it is a different one). */
  hostUpdated(): void {
    const target = this.#find();
    if (target === this.#target) {
      return;
    }
    this.#observer?.disconnect();
    this.#target = target;
    if (!target) {
      return;
    }
    this.#observer ??= new ResizeObserver(([entry]) => this.#report(Math.round(entry.contentRect.width)));
    this.#observer.observe(target);
  }

  hostDisconnected(): void {
    this.#observer?.disconnect();
    this.#observer = null;
    this.#target = null;
  }

  /* A new width: drawn in the next frame, not in this delivery (a chart that changes its box in the same delivery makes WebKit report a
     loop). */
  #report(width: number): void {
    if (!width || width === this.width) {
      return;
    }
    requestAnimationFrame(() => {
      this.width = width;
      this.#host.requestUpdate();
    });
  }
}
