/* Nothing of Alpine is left or comes back: the page is Lit elements over our own store. This test pins the code's shape: it reads
   every .html, .js and .ts file under src/ (not src/data) for what Alpine code looks like, and checks that package.json does
   not list the packages. To update it: a new Alpine-looking pattern goes in ATTRIBUTE, TEMPLATE_BINDING or SCRIPT_USE, below,
   with a line in the self-test that it finds. A match that is legitimate (a word that only looks like one) is not added to an
   allow list: change the wording of the file that holds it. Lit templates in .ts files use `@click=`, `.prop=` and `?attr=`, so
   TEMPLATE_BINDING looks only in .html files, where Alpine's `:attr` and `@event` were the only way to bind. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..', '..');

/* An Alpine directive written as an attribute (`x-text="..."`, `x-on:click`, `x-data`), in any file. */
const ATTRIBUTE = /\sx-(?:data|show|if|for|text|bind|model|effect|ignore|cloak|ref|init|on)\b/;

/* Alpine's bindings in markup: `:class="..."` and `@click="..."`, looked for in .html files only. */
const TEMPLATE_BINDING = /\s(?::[\w-]+|@[\w.:-]+)=/;

/* Alpine's magics and API in code or comments: `$store`, `$watch`, `$refs`, `Alpine.<member>`, the package name. */
const SCRIPT_USE = /\$store|\$watch|\$refs|\bAlpine\.\w|alpinejs/;

/* The files under `dir` that hold Alpine code, as 'relative/path:line: text' strings (empty when there are none). `dir` is the
   src folder, or a stand-in for the self-test; a folder named `data` at the top is generated game data and is left out. */
function alpineUses(dir) {
  const found = [];
  const files = readdirSync(dir, { recursive: true })
    .map(file => file.replaceAll('\\', '/'))
    .filter(file => /\.(?:html|js|ts)$/.test(file) && !file.startsWith('data/'));
  for (const file of files) {
    const patterns = file.endsWith('.html') ? [ATTRIBUTE, TEMPLATE_BINDING, SCRIPT_USE] : [ATTRIBUTE, SCRIPT_USE];
    readFileSync(join(dir, file), 'utf8')
      .split(/\r?\n/)
      .forEach((line, index) => {
        if (patterns.some(pattern => pattern.test(line))) {
          found.push(`${file}:${index + 1}: ${line.trim().slice(0, 100)}`);
        }
      });
  }
  return found;
}

test('src holds no Alpine attribute, binding, magic or import', () => {
  assert.deepEqual(alpineUses(join(ROOT, 'src')), []);
});

test('package.json and the lock do not list Alpine or its reactivity package', () => {
  const manifest = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  const lock = JSON.parse(readFileSync(join(ROOT, 'package-lock.json'), 'utf8'));
  const declared = { ...manifest.dependencies, ...manifest.devDependencies };
  for (const name of ['alpinejs', '@vue/reactivity']) {
    assert.ok(!(name in declared), `package.json lists ${name}`);
    assert.ok(!(`node_modules/${name}` in lock.packages), `package-lock.json lists ${name}`);
  }
});

test('the scan finds Alpine code in a planted file and passes a clean one', () => {
  const base = mkdtempSync(join(tmpdir(), 'no-alpine-'));
  try {
    mkdirSync(join(base, 'data'));
    mkdirSync(join(base, 'ui'));
    // a clean Lit element and page: Lit's own `@click=`, `.prop=` and `?attr=` syntax in a .ts file are fine
    writeFileSync(join(base, 'ui', 'clean.ts'), `export const t = html\`<button @click=\${go} .value=\${v} ?hidden=\${h}>x</button>\`;\n`);
    writeFileSync(join(base, 'index.html'), '<body>\n  <gsa-app class="wrap"></gsa-app>\n</body>\n');
    writeFileSync(join(base, 'data', 'items.js'), 'x-text $store\n'); // generated data is left out
    assert.deepEqual(alpineUses(base), []);

    const planted = [
      ['ui/attribute.ts', 'const t = html`<i x-text="name"></i>`;\n'],
      ['ui/magic.js', 'const app = this.$store.app;\n'],
      ['ui/watch.js', 'this.$watch("x", f);\n'],
      ['ui/refs.js', 'this.$refs.box.focus();\n'],
      ['ui/api.js', 'Alpine.store("app", {});\n'],
      ['ui/import.ts', "import Alpine from 'alpinejs';\n"],
      ['page.html', '<button @click="go()" :class="open">x</button>\n'],
    ];
    for (const [file, text] of planted) {
      writeFileSync(join(base, file), text);
    }
    const found = alpineUses(base).map(entry => entry.split(':')[0]);
    assert.deepEqual(found.sort(), planted.map(([file]) => file).sort());
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});
