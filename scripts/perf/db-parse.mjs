/* Browser timing of the inlined item database: how long Chromium takes to read and run it (audit 16, R9).

The page carries src/data/items.json as a JavaScript object literal inside its one script (esbuild turns a JSON import
into code). This script times, on small pages of its own, the time from a performance mark just before the script to
one just after it, which covers the HTML parser reading the script's text and V8 parsing, compiling and running it:
  - literal: the item database bundled exactly as the page bundles it (esbuild, the build's options), and nothing else;
  - JSON.parse: the same data as one string passed to JSON.parse, the form V8 reads fastest for large data;
  - page script: the whole script of dist/index.html (Alpine, the page code and every data file), run up to its end.
Each run is a fresh browser context with a comment that makes the script text unique, so V8's compilation cache never
serves an earlier run. CPU throttle 1x (this machine), 4x and 6x (Chrome DevTools' slow-device emulation).

Run: npm run build && node scripts/perf/db-parse.mjs [--runs 7] [--rates 1,4,6]
Pages and results are written to scripts/perf/out/db-parse/ (gitignored).
*/

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';
import { chromium } from 'playwright';
import { BROWSER_TARGETS } from '../build/build.mjs';
import { listOption, numberOption } from './args.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ITEMS = resolve(ROOT, 'src', 'data', 'items.json');
const PAGE = resolve(ROOT, 'dist', 'index.html');
const OUT = resolve(ROOT, 'scripts', 'perf', 'out', 'db-parse');
const RUN_MARK = '/*RUN*/'; // replaced by a comment naming the run, so no two runs share a script text

const median = xs => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const BEFORE = `<script>performance.mark('before')</script>`;
const AFTER = `<script>performance.mark('after'); performance.measure('script', 'before', 'after')</script>`;

/* A page with `script` between two marks; the measure 'script' spans them. */
function timedPage(script) {
  if (/<\/script/i.test(script)) throw new Error('the script contains "</script", which would end it early');
  return `<!doctype html><meta charset="utf-8"><title>db parse</title>\n${BEFORE}<script>${RUN_MARK}${script}</script>${AFTER}`;
}

/* The item database as the page bundles it: a JSON import in an iife, minified for the build's browsers. */
async function literalScript() {
  const result = await esbuild.build({
    stdin: { contents: `import items from ${JSON.stringify(ITEMS)}; window.__db = items;`, resolveDir: ROOT, loader: 'js' },
    bundle: true,
    format: 'iife',
    target: BROWSER_TARGETS,
    minify: true,
    write: false,
    logLevel: 'warning',
  });
  return result.outputFiles[0].text;
}

/* The same data as a JSON.parse call on one string literal. */
function jsonParseScript() {
  const minified = JSON.stringify(JSON.parse(readFileSync(ITEMS, 'utf8')));
  return `window.__db=JSON.parse(${JSON.stringify(minified)});`;
}

/* dist/index.html with marks around its script (the inline script that holds the bundle; the build writes it as
   "<script>" and a line break, and checks that it holds no "</script"). */
function pageWithMarks() {
  const html = readFileSync(PAGE, 'utf8');
  const at = html.indexOf('<script>\n');
  if (at < 0) throw new Error('no bundle script in dist/index.html; run npm run build');
  const end = html.indexOf('</script>', at) + '</script>'.length;
  const script = html.slice(at + '<script>'.length, end);
  return `${html.slice(0, at)}${BEFORE}<script>${RUN_MARK}${script}${AFTER}${html.slice(end)}`;
}

async function timeOnce(browser, html, rate, run) {
  const file = resolve(OUT, `run-${run}.html`);
  writeFileSync(file, html.replace(RUN_MARK, `/* run ${run} */`));
  const ctx = await browser.newContext();
  const pg = await ctx.newPage();
  const cdp = await ctx.newCDPSession(pg);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate }); // before navigation, so the script runs throttled
  await pg.goto(pathToFileURL(file).href, { waitUntil: 'load', timeout: 120_000 });
  const ms = await pg.evaluate(`performance.getEntriesByName('script')[0].duration`);
  await ctx.close();
  return ms;
}

async function main() {
  const runs = numberOption('runs', 7);
  const rates = listOption('rates', ['1', '4', '6']).map(Number);
  mkdirSync(OUT, { recursive: true });
  const variants = [
    ['literal (as the page has it)', timedPage(await literalScript())],
    ['JSON.parse of one string', timedPage(jsonParseScript())],
    ['page script, all of it', pageWithMarks()],
  ];
  console.log(`item database ${readFileSync(ITEMS).length.toLocaleString('en-US')} bytes; median and range of ${runs} runs`);
  const results = [];
  const browser = await chromium.launch();
  let run = 0;
  try {
    for (const rate of rates) {
      console.log(`\nCPU ${rate}x${rate === 1 ? ' (this machine)' : ' slower'}`);
      for (const [name, html] of variants) {
        const times = [];
        for (let i = 0; i < runs; i++) times.push(await timeOnce(browser, html, rate, run++));
        const [lo, hi] = [Math.min(...times), Math.max(...times)];
        console.log(`  ${name}: median ${median(times).toFixed(0)} ms (${lo.toFixed(0)} to ${hi.toFixed(0)})`);
        results.push({ rate, variant: name, ms: times });
      }
    }
  } finally {
    await browser.close();
  }
  writeFileSync(resolve(OUT, 'results.json'), JSON.stringify(results, null, 1));
}

await main();
