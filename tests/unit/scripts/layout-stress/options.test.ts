/* The command line of the layout stress tool (scripts/layout-stress/options.mjs). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs } from '../../../../scripts/layout-stress/options.mjs';

test('the defaults: Chromium, the screens that are built, page fonts, a full run, the stress build', () => {
  const options = parseArgs([]);
  assert.deepEqual(options.browsers, ['chromium']);
  assert.deepEqual(options.screens, ['sheets', 'set', 'gear', 'math-piece', 'math-gcd', 'math-tiers']);
  assert.deepEqual([options.fonts, options.quick, options.stress], [false, false, true]);
});

test('each option is read', () => {
  const options = parseArgs([
    '--screens=gear,sheets',
    '--browsers=chromium,firefox,webkit',
    '--fonts',
    '--quick',
    '--report=out/r.html',
    '--workers=2',
    '--no-stress',
    '--keep',
  ]);
  assert.deepEqual(options.screens, ['gear', 'sheets']);
  assert.deepEqual(options.browsers, ['chromium', 'firefox', 'webkit']);
  assert.deepEqual([options.fonts, options.quick, options.stress, options.keep, options.workers], [true, true, false, true, 2]);
  assert.equal(options.report, 'out/r.html');
});

test('a math screen is accepted by name; a wrong name or option is an error that says what is wrong', () => {
  assert.deepEqual(parseArgs(['--screens=math-piece']).screens, ['math-piece']);
  assert.match(parseArgs(['--screens=nope']).error, /unknown screen nope; the choices are sheets, set, gear, math-piece/);
  assert.match(parseArgs(['--browsers=ie']).error, /unknown browser ie/);
  assert.match(parseArgs(['--wat']).error, /unknown option --wat/);
  assert.match(parseArgs(['--workers=0']).error, /unknown option/);
});
