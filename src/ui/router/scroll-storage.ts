/* Where each history entry was scrolled, kept over a reload in the tab's own storage (sessionStorage: this tab only). It is a
   convenience, so a blocked, full or damaged storage is never an error: the page then opens at the top. Pure of the DOM: the
   caller passes the storage, so Node can test it. */

/* The sessionStorage key of the positions: one JSON object, {history entry id: scrollY in px}. */
export const SCROLL_KEY = 'gsa-scroll-by-entry';

/* The browser's sessionStorage, or null where touching it throws (blocked storage). */
export function tabStorage(): Storage | null {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}

/* The saved positions as {entry id: scrollY}, with only the entries whose value is a finite number (any other value, such as
   a nested array or text, is dropped: it would throw or scroll nowhere when used). Never throws: {} for no storage, nothing
   saved, text that is not JSON or not an object. `storage` is a Storage or null. */
export function readScrollPositions(storage: Pick<Storage, 'getItem'> | null | undefined): Record<string, number> {
  try {
    const saved = JSON.parse(storage?.getItem(SCROLL_KEY) ?? '{}');
    if (saved === null || typeof saved !== 'object' || Array.isArray(saved)) {
      return {};
    }
    const positions: Record<string, number> = {};
    for (const [entry, y] of Object.entries(saved)) {
      if (typeof y === 'number' && Number.isFinite(y)) {
        positions[entry] = y;
      }
    }
    return positions;
  } catch {
    return {};
  }
}

/* Saves `positions` ({entry id: scrollY}) in `storage` (a Storage or null); does nothing where the storage refuses. */
export function writeScrollPositions(storage: Pick<Storage, 'setItem'> | null | undefined, positions: Record<string, number>): void {
  try {
    storage?.setItem(SCROLL_KEY, JSON.stringify(positions));
  } catch {
    // blocked or full: a reload then opens at the top
  }
}
