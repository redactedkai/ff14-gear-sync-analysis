/* Nothing imports Alpine any more: the page's root is a Lit element. Audit 07, finding 5: three components imported it when their
   module loaded, so Node could not load them for a unit test. Every module under src/ui and src/core must stay loadable
   in Node, so none may import 'alpinejs'. TODO: R42-2 widens this scan to every Alpine attribute and call and removes the package. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/* Every .js and .ts file under `dir` (a URL ending in /), as paths relative to it. */
function jsFilesUnder(dir) {
  return readdirSync(dir, { recursive: true })
    .map(file => file.replaceAll('\\', '/'))
    .filter(file => /\.(js|ts)$/.test(file));
}

const ALPINE_IMPORT = /from\s+['"]alpinejs['"]|import\s+['"]alpinejs['"]/;

test('no module under src/ui or src/core, nor main.js, imports Alpine', () => {
  for (const folder of ['../../../src/ui/', '../../../src/core/']) {
    const dir = new URL(folder, import.meta.url);
    const files = jsFilesUnder(dir);
    assert.ok(files.length > 10, `${folder} has files to check`);
    for (const file of files) {
      assert.doesNotMatch(readFileSync(new URL(file, dir), 'utf8'), ALPINE_IMPORT, folder + file);
    }
  }
  assert.doesNotMatch(readFileSync(new URL('../../../src/main.js', import.meta.url), 'utf8'), ALPINE_IMPORT, 'main.js');
});

/* the scan lists .ts files. A planted .ts file that imports Alpine is listed, and the pattern matches its import. */
test('the scan sees a .ts file that imports Alpine', () => {
  const base = mkdtempSync(join(tmpdir(), 'no-alpine-ts-'));
  try {
    mkdirSync(join(base, 'sub'));
    writeFileSync(join(base, 'sub', 'stray.ts'), "import Alpine from 'alpinejs';\nexport const x: number = 1;\n");
    const dir = new URL(`${pathToFileURL(base).href}/`);
    const files = jsFilesUnder(dir);
    assert.deepEqual(files, ['sub/stray.ts']);
    assert.match(readFileSync(new URL(files[0], dir), 'utf8'), ALPINE_IMPORT);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});
