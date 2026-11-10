/* Only the page's entry point (src/main.js) imports Alpine. Audit 07, finding 5: three components imported it when their
   module loaded, so Node could not load them for a unit test. Every module under src/ui and src/core must stay loadable
   in Node, so none may import 'alpinejs'; main.js hands the store what it needs. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

/* Every .js file under `dir` (a URL ending in /), as paths relative to it. */
function jsFilesUnder(dir) {
  return readdirSync(dir, { recursive: true })
    .map(file => file.replaceAll('\\', '/'))
    .filter(file => file.endsWith('.js'));
}

test('no module under src/ui or src/core imports Alpine: only main.js does', () => {
  for (const folder of ['../../src/ui/', '../../src/core/']) {
    const dir = new URL(folder, import.meta.url);
    const files = jsFilesUnder(dir);
    assert.ok(files.length > 10, `${folder} has files to check`);
    for (const file of files) {
      assert.doesNotMatch(readFileSync(new URL(file, dir), 'utf8'), /from\s+['"]alpinejs['"]|import\s+['"]alpinejs['"]/, folder + file);
    }
  }
  assert.match(readFileSync(new URL('../../src/main.js', import.meta.url), 'utf8'), /from 'alpinejs'/);
});
