/* The set page holds no Alpine.raw: its draft, suggestion and fill status are in the store, which never hands the template engine
   a state it could wrap (the entries are frozen), so nothing is unwrapped. A search of the page's sources for what unwrapping
   looks like, and for the old component fields the store holds now. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..', '..', '..', '..');
const PARTS = join(ROOT, 'src', 'ui', 'components', 'set-page');

/* The set page's component files: set-page.js and every part in set-page/. */
const FILES = [
  join(ROOT, 'src', 'ui', 'components', 'set-page.js'),
  ...readdirSync(PARTS)
    .filter(name => name.endsWith('.js'))
    .map(name => join(PARTS, name)),
];

/* The code of `file` without its comments (line and block), so a sentence that names the old way is not a use of it. */
function codeOf(file) {
  return readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
}

test('no Alpine.raw in the set page: no raw(), no .raw, no Alpine passed in', () => {
  const found = [];
  for (const file of FILES) {
    const code = codeOf(file);
    for (const pattern of [/\braw\s*\(/, /\.raw\b/, /\braw\s*[,:)]/, /\balpine\b/i]) {
      if (pattern.test(code)) found.push(`${file}: ${pattern}`);
    }
  }
  assert.deepEqual(found, []);
});

test('the set page does not assign what the store holds: no this.draft =, this.suggestion =, this.running =, this.fillLine =', () => {
  const found = [];
  for (const file of FILES) {
    codeOf(file)
      .split('\n')
      .forEach((line, index) => {
        if (/\bthis\.(draft|suggestion|running|fillLine|countText|searchedCount|fromCounts|fromCountsFor|gcdLabel)\s*=(?!=)/.test(line))
          found.push(`${file}:${index + 1}: ${line.trim()}`);
      });
  }
  assert.deepEqual(found, []);
});
