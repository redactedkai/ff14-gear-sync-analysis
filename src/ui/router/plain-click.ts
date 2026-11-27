/* Which clicks on an in-page link the page handles itself. A link is a real <a href="#/...">, so the browser's own ways of
   opening it (Ctrl or Cmd click, Shift click, Alt click, middle click, "Open in new tab") work; only a plain click is taken
   over, to move inside the page with no reload. Pure: no DOM, so Node can test it. */

/* Whether `event` is a plain click: the primary button with no Ctrl, Cmd (meta), Shift or Alt held. A middle click never
   reaches a `click` listener, but its button is checked all the same. `event` is a click's MouseEvent (only `button`,
   `ctrlKey`, `metaKey`, `shiftKey`, `altKey` are read). */
export function plainClick(event: Pick<MouseEvent, 'button' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'>): boolean {
  return event.button === 0 && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey;
}

/* A link's click as the page's handlers read it. */
export type LinkClick = Pick<MouseEvent, 'button' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey' | 'preventDefault'>;

/* The handler of an in-page link's click: on a plain click, cancels the browser's navigation and runs `move`, and returns true;
   on any other click, does nothing, so the browser opens the link its own way, and returns false. `event` is the click. */
export function followInPage(event: LinkClick, move: () => void): boolean {
  if (!plainClick(event)) {
    return false;
  }
  event.preventDefault();
  move();
  return true;
}
