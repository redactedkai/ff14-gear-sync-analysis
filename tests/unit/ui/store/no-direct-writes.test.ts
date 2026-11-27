/* Every write to the page's state is an action call: no element or view assigns to what the app facade or the sheets facade
   hands out (the store counts an action, the page draws it and the settings are saved; an assignment into the plain state would
   do none of that). A search of the page's sources for the shapes an assignment takes: `app.<field> =` and
   `app.<group>.<field> =` (also through `this.app` and a local `app`), `Object.assign(app...)`, and `sheets.<field> =`.
   It pins the code's shape: to update it, add a field name to the lists below when the facades gain one. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..', '..', '..');

/* The files that read the facades: every .js, .ts and .html of src/ui (but the store's own folder), the page and main.js. */
function sourceFiles(folder, found = []) {
  for (const name of readdirSync(folder)) {
    const path = join(folder, name);
    if (statSync(path).isDirectory()) {
      if (relative(ROOT, path).replaceAll('\\', '/') !== 'src/ui/store') {
        sourceFiles(path, found);
      }
    } else if (/\.(js|ts|html)$/.test(name)) {
      found.push(path);
    }
  }
  return found;
}

const FILES = [...sourceFiles(join(ROOT, 'src', 'ui')), join(ROOT, 'src', 'index.html'), join(ROOT, 'src', 'main.js')];

/* A name the facades are held under: `this.app`, `app`, `sheets`, `store` (the sheets part's own). */
const APP = String.raw`\bapp`;
const SHEETS = String.raw`(?:this\.sheets|\bsheets|\bstore)`;
const ASSIGNMENT = String.raw`\s*(?:[-+*/|&]?=)(?!=)`;
const WRITES = [
  {
    name: 'an assignment to a field of the app facade',
    pattern: new RegExp(`${APP}\\.(?:job|cap|sync|level|tab|mathTab|pendingTab|sheetFigures|maxReal)${ASSIGNMENT}`),
  },
  {
    name: 'an assignment into a group of the app facade',
    pattern: new RegExp(`${APP}\\.(?:browse|piece|gcd|tiers)(?:\\[[^\\]]*\\]|\\.\\w+)+${ASSIGNMENT}`),
  },
  {
    name: 'Object.assign onto the app facade',
    pattern: /Object\.assign\(\s*(?:this\.)?app(?:\.\w+)?\s*,/,
  },
  {
    name: 'an assignment to a field of the sheets facade',
    pattern: new RegExp(`${SHEETS}\\.(?:screen|sheetId|setId|missing|saveMessage|note|noteSeq|busy|leaveGuard|unsettled|rev)${ASSIGNMENT}`),
  },
];

test('no template or component writes to the app or sheets facade: every write is an action call', () => {
  const found = [];
  for (const file of FILES) {
    const lines = readFileSync(file, 'utf8').split(/\r?\n/);
    lines.forEach((line, index) => {
      const code = line.replace(/\/\/.*$/, '');
      for (const { name, pattern } of WRITES) {
        if (pattern.test(code)) {
          found.push(`${relative(ROOT, file).replaceAll('\\', '/')}:${index + 1}: ${name}: ${line.trim()}`);
        }
      }
    });
  }
  assert.deepEqual(found, []);
});

test('the search finds the shapes it looks for', () => {
  const lines = [
    "app.browse.q = ''",
    'app.cap = null;',
    'app.piece.slots += 1',
    'Object.assign(this.app.browse, patch)',
    'this.sheets.note = text',
    'store.busy = true',
  ];
  const hits = lines.map(line => WRITES.some(({ pattern }) => pattern.test(line)));
  assert.deepEqual(hits, [true, true, true, true, true, true]);
});
