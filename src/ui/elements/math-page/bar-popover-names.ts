/* The event of <gsa-bar-popover> that the page's template and the element share, written once: the popover closed by itself
   (Escape, a press outside, Tab out, another layer). The template listens with `@popover-close`, which cannot import this. A
   `.ts` module with no import, so Node tests can read it. */
export const POPOVER_CLOSE_EVENT = 'popover-close';
