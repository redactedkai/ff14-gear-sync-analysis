/* The stylesheet text the tests read (scripts/build/styles.ts): the files src/styles/entry.css imports, in order, with the
   layer wrapper and the order statement when the entry has them. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { STYLES_DIR, expandStyles, readStyles } from '../../../scripts/build/styles.ts';

/* The files of the page's stylesheet in cascade order, as the old single list had them. */
const FILES_IN_ORDER = [
  'tokens',
  'base',
  'controls',
  'layout',
  'pieces',
  'menus',
  'fill-settings',
  'gear-browser',
  'math-bar',
  'math-piece-stats',
  'math-gcd',
  'math-tiers',
  'math-controls',
  'footer',
  'sheets',
  'set-page',
  'fallbacks',
];

/* The layer each file is imported into (src/styles/entry.css). */
const LAYER_OF = (name: string): string => {
  if (['tokens', 'base', 'controls', 'fallbacks'].includes(name)) {
    return name;
  }
  if (name === 'fill-settings') {
    return 'components.menus';
  }
  if (name.startsWith('math-')) {
    return 'views.math';
  }
  return ['layout', 'pieces', 'menus'].includes(name) ? `components.${name}` : `views.${name}`;
};

test('readStyles: the order statement, then each file of the cascade order inside its layer, joined with a blank line', () => {
  const blocks = FILES_IN_ORDER.map(name => {
    const text = readFileSync(join(STYLES_DIR, `${name}.css`), 'utf8');
    return `@layer ${LAYER_OF(name)} {\n${text}}\n`;
  });
  assert.equal(readStyles(), ['@layer tokens, base, controls, components, views, fallbacks;\n', ...blocks].join('\n'));
});

test('expandStyles: an import is replaced by its file, a comment line is left out', () => {
  const files: Record<string, string> = { 'a.css': '.a {\n  color: red;\n}\n', 'b.css': '.b {\n  color: blue;\n}\n' };
  const entry = '/* the entry */\n@import "./a.css"; /* first */\n@import "./b.css";\n';
  assert.equal(
    expandStyles(entry, (name: string) => files[name]),
    `${files['a.css']}\n${files['b.css']}`,
  );
});

test('expandStyles: an import with layer(name) goes inside @layer, and the order statement stays where it is', () => {
  const files: Record<string, string> = { 'a.css': '.a {\n  color: red;\n}\n', 'b.css': '.b {\n  color: blue;\n}\n' };
  const entry = '@layer one, two;\n@import "./a.css" layer(one);\n@import "./b.css" layer(two);\n';
  assert.equal(
    expandStyles(entry, (name: string) => files[name]),
    '@layer one, two;\n\n@layer one {\n.a {\n  color: red;\n}\n}\n\n@layer two {\n.b {\n  color: blue;\n}\n}\n',
  );
});

test('entry.css imports every file of src/styles/ exactly once', () => {
  const entry = readFileSync(join(STYLES_DIR, 'entry.css'), 'utf8');
  const imported = [...entry.matchAll(/^@import\s+"\.\/([\w.-]+)"/gm)].map(match => match[1]);
  assert.deepEqual(
    imported,
    FILES_IN_ORDER.map(name => `${name}.css`),
  );
  const onDisk = readdirSync(STYLES_DIR).filter(name => name.endsWith('.css') && name !== 'entry.css');
  assert.deepEqual([...imported].sort(), onDisk.sort(), 'a CSS file in src/styles/ that the entry does not import');
});
