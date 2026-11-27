/* The command line of the layout stress tool (scripts/layout-stress/options.ts). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs } from '../../../../scripts/layout-stress/options.ts';

/* The options `argv` parses to; fails the test when it names an error. */
function optionsOf(argv: string[]) {
  const result = parseArgs(argv);
  assert.ok(!('error' in result), `parseArgs(${argv.join(' ')}): ${'error' in result ? result.error : ''}`);
  return result;
}

/* The error text `argv` parses to; fails the test when it parses. */
function errorOf(argv: string[]): string {
  const result = parseArgs(argv);
  assert.ok('error' in result, `parseArgs(${argv.join(' ')}) is an error`);
  return result.error;
}

test('the defaults: Chromium, the screens that are built, page fonts, a full run, the stress build', () => {
  const options = optionsOf([]);
  assert.deepEqual(options.browsers, ['chromium']);
  assert.deepEqual(options.screens, ['sheets', 'set', 'gear', 'math-piece', 'math-gcd', 'math-tiers']);
  assert.deepEqual([options.fonts, options.quick, options.stress], [false, false, true]);
});

test('each option is read', () => {
  const options = optionsOf([
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
  assert.deepEqual(optionsOf(['--screens=math-piece']).screens, ['math-piece']);
  assert.match(errorOf(['--screens=nope']), /unknown screen nope; the choices are sheets, set, gear, math-piece/);
  assert.match(errorOf(['--browsers=ie']), /unknown browser ie/);
  assert.match(errorOf(['--wat']), /unknown option --wat/);
  assert.match(errorOf(['--workers=0']), /unknown option/);
});
