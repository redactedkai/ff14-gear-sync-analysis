/* Helpers of the smoke test's look-and-layout checks (checkThemes, checkViewports in checks/look): the WCAG contrast
   arithmetic, the theme tokens read from src/styles/, and the in-page probes that read colors and boxes. No Playwright
   import and nothing from the other smoke test files, so tests/unit/smoke-helpers/visual.test.ts can check the arithmetic against the
   WCAG's own published values.

   Where the expected values come from:
   - contrast: the WCAG 2.1 definition (relative luminance, https://www.w3.org/TR/WCAG21/#dfn-relative-luminance, and
     the ratio (L1 + 0.05) / (L2 + 0.05), https://www.w3.org/TR/WCAG21/#dfn-contrast-ratio); level AA asks 4.5 for
     text and 3 for large text (1.4.3);
   - the tokens: the `:root` blocks of src/styles/tokens.css (the light values, the dark values twice), read here as text,
     never from the page under test. */

import { readStyles as readPageStyles } from '../../../scripts/build/styles.ts';

// ---------- WCAG 2.1 contrast ----------

/** An opaque sRGB color: red, green and blue, 0 to 255. */
export type Rgb = [number, number, number];
/** A color with opacity: red, green and blue (0 to 255) and alpha (0 to 1). */
export type Rgba = [number, number, number, number];

/** What probeText reads of one text for its colors: the text color, the opacity above it and the layers behind it (shownColors). */
export interface ShownSample {
  /** The text color. */
  color: Rgba;
  /** The product of the element's and its ancestors' opacity. */
  opacity: number;
  /** The background colors of the element and its ancestors, nearest first. */
  layers: Rgba[];
  /** An element in the chain paints a background image: the ratio is a guess. */
  gradient?: boolean;
}

/** What probeText reads of one text, with its size: what judge takes. */
export interface TextSample extends ShownSample {
  /** The font size in px. */
  size: number;
  /** The font weight. */
  weight: number;
}

/** Level AA contrast needed by normal text, and by large text (WCAG 1.4.3). */
export const AA_TEXT = 4.5;
export const AA_LARGE = 3;

/** Whether text is "large" for the AA threshold: at least 18 pt (24 px), or at least 14 pt (18.66 px) and bold (weight 700+). */
export function isLargeText(px: number, weight: number) {
  return px >= 24 || (px >= (14 * 4) / 3 && weight >= 700);
}

/** The relative luminance (0 black to 1 white) of an sRGB color `[r, g, b]` of 0 to 255 (WCAG 2.1). */
export function luminance([r, g, b]: Rgb) {
  const linear = (value: number) => {
    const s = value / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/** The contrast ratio (1 to 21) between two opaque colors `[r, g, b]`, in either order. */
export function contrastRatio(a: Rgb, b: Rgb) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** `top` (`[r, g, b, alpha]`, alpha 0 to 1) painted over the opaque `bottom` (`[r, g, b]`): the opaque color seen. */
export function blend([r, g, b, alpha]: Rgba, bottom: Rgb): Rgb {
  return [r * alpha + bottom[0] * (1 - alpha), g * alpha + bottom[1] * (1 - alpha), b * alpha + bottom[2] * (1 - alpha)];
}

/** The text and background colors a sample shows, as opaque `[r, g, b]`, and whether the background could be worked out.
 * `sample`: `color` (the text color, `[r, g, b, alpha]`), `opacity` (the product of the element's and its ancestors'
 * opacity), `layers` (the background colors of the element and its ancestors, nearest first, `[r, g, b, alpha]`) and
 * `gradient` (an element in the chain paints a background image: the ratio is a guess). The nearest opaque layer is the
 * base; the translucent layers nearer than it are painted over it, farthest first. With no opaque layer the base is white,
 * the browser's canvas in the light scheme (the page's body always paints one, so this does not happen on the page). */
export function shownColors(sample: ShownSample) {
  const firstOpaque = sample.layers.findIndex(layer => layer[3] >= 1);
  const opaqueLayer = sample.layers[firstOpaque];
  const base: Rgb = opaqueLayer ? [opaqueLayer[0], opaqueLayer[1], opaqueLayer[2]] : [255, 255, 255];
  const above = firstOpaque < 0 ? sample.layers : sample.layers.slice(0, firstOpaque);
  let background = base;
  for (const layer of [...above].reverse()) {
    background = blend(layer, background);
  }
  const [r, g, b, alpha] = sample.color;
  return { text: blend([r, g, b, alpha * sample.opacity], background), background, guessed: Boolean(sample.gradient) || firstOpaque < 0 };
}

/** The contrast ratio of a probed sample (see shownColors), and the ratio it needs. */
export function judge(sample: TextSample) {
  const { text, background, guessed } = shownColors(sample);
  const ratio = contrastRatio(text, background);
  const need = isLargeText(sample.size, sample.weight) ? AA_LARGE : AA_TEXT;
  return { ratio, need, ok: ratio >= need, guessed };
}

// ---------- the theme tokens of src/styles/tokens.css ----------

/** The text of the `{ ... }` block that follows the first occurrence of `header` in `css` (comments already removed). */
function blockAfter(css: string, header: string) {
  const at = css.indexOf(header);
  if (at < 0) {
    throw new Error(`styles.css has no "${header}" block`);
  }
  const open = css.indexOf('{', at);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') {
      depth++;
    }
    if (css[i] === '}' && --depth === 0) {
      return css.slice(open + 1, i);
    }
  }
  throw new Error(`styles.css: the "${header}" block is not closed`);
}

/** The custom properties declared in a block's text, as { '--name': 'value' } (spaces inside a value squeezed). */
function declarations(block: string) {
  const out: Record<string, string> = {};
  for (const [, name, value] of block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    out[name] = value.trim().replace(/\s+/g, ' ');
  }
  return out;
}

/** The theme tokens in the CSS text `css`: `light` (the `:root` block), `darkSetting` (the block under
 * `@media (prefers-color-scheme: dark)`, for a page with no forced theme) and `darkForced` (`:root[data-theme="dark"]`).
 * The dark blocks hold only the tokens that change; `color-scheme` is not a token and is left out.
 * @returns {{ light: Record<string, string>, darkSetting: Record<string, string>, darkForced: Record<string, string> }} */
export function readThemeTokens(css: string) {
  const plain = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const media = blockAfter(plain, '@media (prefers-color-scheme: dark)');
  return {
    light: declarations(blockAfter(plain, ':root {')),
    darkSetting: declarations(blockAfter(media, ':root:not([data-theme="light"])')),
    darkForced: declarations(blockAfter(plain, ':root[data-theme="dark"]')),
  };
}

/** The tokens a page shows under `scheme` ('light' or 'dark'): the light ones, with the dark ones over them.
 * @returns {Record<string, string>} */
export function tokensFor(css: string, scheme: 'light' | 'dark') {
  const tokens = readThemeTokens(css);
  return scheme === 'dark' ? { ...tokens.light, ...tokens.darkForced } : tokens.light;
}

/** An opaque or translucent token value (`#rrggbb`, `rgb(...)`, `rgba(...)`) as `[r, g, b, alpha]`; null for anything else. */
export function tokenColor(value: string): Rgba | null {
  const hex = /^#([0-9a-f]{6})$/i.exec(value);
  if (hex) {
    const digits = hex[1] ?? '';
    const [r, g, b] = [0, 2, 4].map(i => Number.parseInt(digits.slice(i, i + 2), 16));
    return [r ?? 0, g ?? 0, b ?? 0, 1];
  }
  const fn = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(value);
  return fn ? [Number(fn[1]), Number(fn[2]), Number(fn[3]), fn[4] === undefined ? 1 : Number(fn[4])] : null;
}

/** The text of the page's stylesheet, the files of src/styles/entry.css joined (read by the smoke test as the oracle of the tokens). */
export const readStyles = readPageStyles;

// ---------- in-page probes (run by page.evaluate: each is self-contained) ----------

/** In the page: the colors and size of text, for the contrast checks. `spec`: `named` (a list of `{ name, selector }`: the
 * first visible, enabled element matching each (an inactive control is exempt from WCAG 1.4.3), reported as missing when there is none) and/or `root` (a selector: every visible
 * text of it, one sample per element that holds text, with disabled controls, hidden text and the screen-reader-only
 * lines left out: WCAG 1.4.3 exempts inactive controls). Returns the samples, each `{ name, text, color, opacity, layers,
 * gradient, size, weight }` as shownColors reads them, or `{ name, missing: true }`. */
export function probeText(spec: { named?: { name: string; selector: string }[]; root?: string }) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    throw new Error('probeText: the page has no 2D canvas');
  }
  // a computed color text as [r, g, b, alpha]: rgb()/rgba() and color(srgb ...) as Chromium writes them; any other through a canvas
  const toRgba = (text: string): Rgba => {
    const rgb = /^rgba?\(([^)]+)\)$/.exec(text);
    if (rgb) {
      const [r, g, b, a = 1] = rgb[1]
        .split(/[\s,/]+/)
        .filter(Boolean)
        .map(Number);
      return [r, g, b, a];
    }
    const srgb = /^color\(srgb ([^)]+)\)$/.exec(text);
    if (srgb) {
      const [r, g, b, a = 1] = srgb[1]
        .split(/[\s/]+/)
        .filter(Boolean)
        .map(Number);
      return [r * 255, g * 255, b * 255, a];
    }
    context.clearRect(0, 0, 1, 1);
    context.fillStyle = text;
    context.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data;
    return [r, g, b, a / 255];
  };
  const describe = (el: Element) => `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${[...el.classList].map(c => `.${c}`).join('')}`;
  const visible = (el: Element) => el.checkVisibility({ checkVisibilityCSS: true }) && el.getClientRects().length > 0;
  const sample = (el: HTMLElement, name?: string) => {
    const style = getComputedStyle(el);
    const layers = [];
    let opacity = 1;
    let gradient = false;
    for (let up: HTMLElement | null = el; up; up = up.parentElement) {
      const upStyle = getComputedStyle(up);
      layers.push(toRgba(upStyle.backgroundColor));
      if (upStyle.backgroundImage !== 'none') {
        gradient = true;
      }
      opacity *= Number(upStyle.opacity);
    }
    return {
      name: name ?? `${describe(el)} "${((el instanceof HTMLInputElement ? el.value : null) ?? el.textContent ?? '').trim().slice(0, 28)}"`,
      color: toRgba(style.color),
      opacity,
      layers,
      gradient,
      size: Number.parseFloat(style.fontSize),
      weight: Number(style.fontWeight),
    };
  };
  const samples: (ReturnType<typeof sample> | { name: string; missing: true })[] = [];
  for (const { name, selector } of spec.named ?? []) {
    const el = [...document.querySelectorAll<HTMLElement & { disabled?: boolean }>(selector)].find(e => visible(e) && !e.disabled);
    samples.push(el ? sample(el, name) : { name, missing: true });
  }
  if (spec.root) {
    const seen = new Set();
    const rootElement = document.querySelector(spec.root);
    if (!rootElement) {
      throw new Error(`probeText: nothing matches ${spec.root}`);
    }
    const walker = document.createTreeWalker(rootElement, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const el = node.parentElement;
      if (!el || !(node.textContent ?? '').trim() || seen.has(el) || !visible(el)) {
        continue;
      }
      seen.add(el);
      if (el.closest(':disabled, [aria-disabled="true"], [aria-hidden="true"], .sr-only, option, script, style')) {
        continue;
      }
      samples.push(sample(el));
    }
  }
  return samples;
}

/** In the page: what the theme made of the page, for the token checks. `names` are token names (`--bg`); `surfaces` are
 * `{ name, selector }` of elements whose background should be a token. Returns `{ tokens: { '--bg': 'value' }, body,
 * surfaces: { name: 'rgb(...)' | null } }` (the computed background colors as text). */
export function probeTheme({ names, surfaces }: { names: string[]; surfaces: { name: string; selector: string }[] }) {
  const root = getComputedStyle(document.documentElement);
  const background = (selector: string) => {
    const el = [...document.querySelectorAll(selector)].find(e => e.getClientRects().length > 0);
    return el ? getComputedStyle(el).backgroundColor : null;
  };
  return {
    tokens: Object.fromEntries(names.map((name: string) => [name, root.getPropertyValue(name).trim().replace(/\s+/g, ' ')])),
    body: getComputedStyle(document.body).backgroundColor,
    surfaces: Object.fromEntries(surfaces.map(({ name, selector }) => [name, background(selector)])),
  };
}

/** A computed `rgb(r, g, b)` or `rgba(...)` text as `[r, g, b, alpha]` (Node side). */
export function parseComputed(text: string | null | undefined): Rgba | null {
  const parts = /^rgba?\(([^)]+)\)$/
    .exec(text ?? '')?.[1]
    .split(/[\s,/]+/)
    .filter(Boolean)
    .map(Number);
  return parts ? [parts[0], parts[1], parts[2], parts[3] ?? 1] : null;
}
