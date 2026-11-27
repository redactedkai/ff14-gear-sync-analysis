/* The HQ mark's font: the Lodestone symbol font, hotlinked from a community mirror (src/styles/pieces.css @font-face). The mark
   shows plain "(HQ)" until the font has loaded; then the root element gets the class HQ_FONT_CLASS and the CSS swaps in
   the glyph. Offline, blocked or slow, the text stays, so a missing-character box never shows. */
const HQ_FONT_FAMILY = 'FFXIV_Lodestone_SSF';
export const HQ_GLYPH = String.fromCharCode(0xe03c); // the HQ symbol in that font
export const HQ_FONT_CLASS = 'hqfont';

/* The part of document.fonts the loader uses: `load` resolves to the faces that loaded (only their count matters). */
export interface FontLoader {
  load(font: string, text: string): Promise<readonly unknown[]>;
}

/* Loads the font through `fonts` (document.fonts) and adds HQ_FONT_CLASS to `root` (document.documentElement) when a
   face loaded. Returns the promise (always resolves); a missing font API, a failed or empty load changes nothing. */
export function enableHqFont(fonts: FontLoader | undefined, root: { classList: { add(name: string): void } }): Promise<void> {
  if (!fonts) {
    return Promise.resolve();
  }
  try {
    return Promise.resolve(fonts.load(`16px ${HQ_FONT_FAMILY}`, HQ_GLYPH)).then(
      loaded => {
        if (loaded.length) {
          root.classList.add(HQ_FONT_CLASS);
        }
      },
      () => {},
    );
  } catch {
    return Promise.resolve();
  }
}
