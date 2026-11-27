/* The page's CSS: src/styles/entry.css lists the files in cascade order. The build lets esbuild bundle the imports
   (build.ts); the tests that read the stylesheet as text get the same text from readStyles() below. */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const STYLES_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'styles');

/* The stylesheet's entry file, inside STYLES_DIR. */
export const ENTRY_FILE = 'entry.css';

/* A line of the entry file that imports a file: `@import "./name.css";` with an optional `layer(name)`; then the group
   holds the file name and the layer name (undefined for none). A comment may follow on the same line. */
const IMPORT_LINE = /^@import\s+"\.\/([\w.-]+\.css)"(?:\s+layer\(([\w.-]+)\))?\s*;/;

/**
 * The stylesheet as one string, for the tests and tools that read it as text: the files `entryText` imports, in order, each
 * as `readFile(name)` returns it (inside `@layer name { ... }` when the import names a layer), joined with a blank line, and
 * the entry's `@layer a, b;` order statements where they stand. Every other line of the entry (comments) is left out.
 * Each file ends with one newline, with no blank line after its last rule. `readFile` is a function from a file name to its text.
 */
export function expandStyles(entryText, readFile) {
  const parts = [];
  for (const line of entryText.split('\n')) {
    const imported = IMPORT_LINE.exec(line);
    if (imported) {
      const [, name, layer] = imported;
      const text = readFile(name);
      parts.push(layer ? `@layer ${layer} {\n${text}}\n` : text);
    } else if (/^@layer\s/.test(line)) {
      parts.push(`${line.trim()}\n`);
    }
  }
  return parts.join('\n');
}

/** The whole stylesheet as one string: the files src/styles/entry.css imports, in order (see expandStyles). */
export function readStyles() {
  const read = name => readFileSync(join(STYLES_DIR, name), 'utf8');
  return expandStyles(read(ENTRY_FILE), read);
}
