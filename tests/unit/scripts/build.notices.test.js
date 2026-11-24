/* The licence notices of the bundled packages (scripts/build/build.mjs): the page's script must carry the notice of every
   third-party package it bundles. Lit and Vue (inside Alpine) keep theirs in their code, which esbuild moves to the end; the
   other groups are in NOTICE_PACKAGES, copied from their LICENSE files. To update when a package is added to the page: add
   its group to NOTICE_PACKAGES (or, if its code carries its own notice, to CARRIES_OWN_NOTICE below), and list it in the
   README's "Bundled" line and architecture.md's "Licence notices". */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as esbuild from 'esbuild';
import { NOTICE_PACKAGES, ROOT, esbuildOptions } from '../../../scripts/build/build.mjs';

/* The bundled packages whose code holds the notice that esbuild keeps, with the text that shows it in the output. */
const CARRIES_OWN_NOTICE = [
  { bundles: /^(lit|lit-html|lit-element|@lit\/.*)$/, shows: 'SPDX-License-Identifier: BSD-3-Clause' },
  { bundles: /^alpinejs$/, shows: '@vue/reactivity' },
];

/* The npm package name of a path inside node_modules, or null. */
const packageOf = path => path.match(/node_modules\/((?:@[^/]+\/)?[^/]+)/)?.[1] ?? null;

test('every third-party package the page bundles has its licence notice in the page script', async () => {
  const result = await esbuild.build({ ...esbuildOptions(), metafile: true });
  const output = result.outputFiles.find(file => file.path.endsWith('.js')).text;
  const bundled = new Set(
    Object.values(result.metafile.outputs)
      .flatMap(out => Object.keys(out.inputs))
      .map(packageOf)
      .filter(Boolean),
  );
  assert.ok(bundled.size > 5, 'the build bundles the libraries');
  for (const name of bundled) {
    const group = NOTICE_PACKAGES.find(each => each.bundles.test(name));
    if (group) {
      const license = readFileSync(join(ROOT, 'node_modules', group.licenseOf, 'LICENSE'), 'utf8');
      const copyrightLine = license.split('\n').find(line => line.startsWith('Copyright'));
      assert.ok(copyrightLine && output.includes(copyrightLine.trim()), `${name}: the notice "${copyrightLine}" is not in the page script`);
      continue;
    }
    const own = CARRIES_OWN_NOTICE.find(each => each.bundles.test(name));
    assert.ok(own, `${name} is bundled and has no licence notice: add it to NOTICE_PACKAGES (scripts/build/build.mjs)`);
    assert.ok(output.includes(own.shows), `${name}: its own notice (${own.shows}) is not in the page script`);
  }
});
