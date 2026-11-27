/* Finds colors written as literals (#hex, rgb(), hsl(), oklch() and so on, or a color name) in CSS text, outside the token
   blocks that are allowed to hold them (CLAUDE.md, "Page rules": colors only through CSS tokens on :root). */

const COLOR_FUNCTION = /(#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\s*\()/i;
// names a stylesheet would plausibly use; `transparent`, `currentColor` and `inherit` take no color of their own
const COLOR_NAMES =
  /\b(white|black|red|green|blue|gray|grey|silver|maroon|purple|fuchsia|lime|olive|yellow|navy|teal|aqua|orange|pink|brown|gold|cyan|magenta|crimson|tomato|salmon)\b/i;
const COLOR_PROPERTIES =
  /^(color|background|background-color|border(-[a-z]+)*|outline(-[a-z]+)*|box-shadow|text-shadow|fill|stroke|caret-color|accent-color|text-decoration(-color)?|column-rule(-color)?|scrollbar-color)$/;

/** One declaration found in CSS text: its selector (the nested ones joined by the walk), property and value. */
export interface CssDeclaration {
  selector: string;
  property: string;
  value: string;
}

/** The text of the `{ ... }` block opened at index `open` of `css`, and the index after its closing brace. */
function block(css: string, open: number): { body: string; end: number } {
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') {
      depth++;
    }
    if (css[i] === '}' && --depth === 0) {
      return { body: css.slice(open + 1, i), end: i + 1 };
    }
  }
  throw new Error('unclosed block');
}

/** Every declaration in `css` (comments removed) as `{ selector, property, value }`, with the `:root` token blocks of the theme
 * (the light values, the system-dark block under `@media (prefers-color-scheme: dark)` and `:root[data-theme="dark"]`)
 * left out: they are where the colors are defined. Nested at-rules (@media, @supports, @keyframes) are walked into. */
function declarationsOutsideTokens(css: string): CssDeclaration[] {
  const out: CssDeclaration[] = [];
  const walk = (text: string, inside: string): void => {
    let at = 0;
    while (at < text.length) {
      const open = text.indexOf('{', at);
      const semi = text.indexOf(';', at);
      if (semi >= 0 && (open < 0 || semi < open)) {
        const [property, ...rest] = text.slice(at, semi).split(':');
        out.push({ selector: inside, property: property.trim(), value: rest.join(':').trim() });
        at = semi + 1;
        continue;
      }
      if (open < 0) {
        const tail = text.slice(at).trim();
        if (tail.includes(':')) {
          const [property, ...rest] = tail.split(':');
          out.push({ selector: inside, property: property.trim(), value: rest.join(':').trim() });
        }
        return;
      }
      const selector = text.slice(at, open).trim().replace(/\s+/g, ' ');
      const { body, end } = block(text, open);
      // the token blocks
      const isToken = /^:root(\[data-theme="dark"\]|:not\(\[data-theme="light"\]\))?$/.test(selector);
      if (!isToken) {
        walk(body, selector);
      }
      at = end;
    }
  };
  walk(css.replace(/\/\*[\s\S]*?\*\//g, ''), '');
  return out;
}

/** The declarations of `css` that hard-code a color: `[{ selector, property, value }]`, empty when every color goes through a
 * `var(--token)`. A color inside an at-rule's condition (`@supports (color: color-mix(in srgb, red 50%, blue))`) is a feature
 * test, not a declaration, and is not reported. Strings (`content: "red"`) are ignored. */
export function findLiteralColors(css: string): CssDeclaration[] {
  return declarationsOutsideTokens(css).filter(({ property, value }) => {
    const bare = value.replace(/"[^"]*"|'[^']*'/g, '').replace(/var\(--[\w-]+\)/g, '');
    if (COLOR_FUNCTION.test(bare)) {
      return true;
    }
    return COLOR_PROPERTIES.test(property) && COLOR_NAMES.test(bare);
  });
}
