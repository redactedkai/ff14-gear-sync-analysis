/* Check our synced stats against ffxiv-gearing's, every piece, job and sync setting (roadmap A5).

ffxiv-gearing (github.com/Asvel/ffxiv-gearing) runs its own code in its own page; our core is bundled from
scripts/validate/gearing/ours.js and injected into that page, so both tools compute each stat side by side. For every
job, every database piece it can wear, and every sync setting ffxiv-gearing offers (each job level 50 to 100 up to the
job's cap, "level only" and each duty item level it lists), each stat is compared and every difference is tagged with
the known cause it matches (ours.js). Pass: no difference tagged 'unexplained' or 'target'.

  --site local  their page built from the pinned clone (fetch.py), served from data/ffxiv-gearing/dist (default)
  --site live   their published page, https://asvel.github.io/ffxiv-gearing/ (one page load per job)

Output: scripts/validate/out/gearing-<site>.json (counts per job and setting, examples of each tag, every unexplained
difference) and a summary on stdout. With both files present, a live run also reports whether the two agree.

Run: python scripts/validate/gearing/fetch.py (once), then node scripts/validate/gearing/run.mjs [--site live] [--jobs SGE,PLD]
*/

import * as esbuild from 'esbuild';
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const CLONE = join(ROOT, 'data', 'ffxiv-gearing');
const OUT = join(ROOT, 'scripts', 'validate', 'out');
const BUNDLE = join(OUT, 'gearing-ours.js');
const LIVE_URL = 'https://asvel.github.io/ffxiv-gearing/';
const DATA_VERSION = '7.57'; // the data version the pinned commit carries (fetch.py COMMIT); the live page must show it too
const JOBS = 'PLD WAR DRK GNB WHM SCH AST SGE MNK DRG SAM RPR NIN VPR BRD MCH DNC BLM SMN RDM PCT BLU BST'.split(' ');
const TIMEOUT = 120_000;
// D3 (level-scaling gear) fixed on our side; D4 (tank Main Attribute) and D6 (bonus stats) corrected on theirs
const PASS_TAGS = new Set(['D1', 'D2', 'D5']);

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

async function bundle() {
  mkdirSync(OUT, { recursive: true });
  await esbuild.build({
    entryPoints: [join(ROOT, 'scripts', 'validate', 'gearing', 'ours.js')],
    bundle: true,
    format: 'iife',
    target: 'es2020',
    outfile: BUNDLE,
    logLevel: 'warning',
  });
}

/** Serve `directory` on a free local port. Returns { server, url }. */
async function serve(directory) {
  const server = createServer((req, res) => {
    let path = normalize(join(directory, decodeURIComponent(new URL(req.url, 'http://x').pathname)));
    if (!path.startsWith(directory + sep) && path !== directory) path = join(directory, 'index.html');
    if (existsSync(path) && statSync(path).isDirectory()) path = join(path, 'index.html');
    if (!existsSync(path)) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'content-type': MIME[extname(path)] ?? 'application/octet-stream' });
    createReadStream(path).pipe(res);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  return { server, url: `http://127.0.0.1:${server.address().port}/` };
}

async function openPage(browser, url) {
  const pg = await browser.newPage();
  const errors = [];
  pg.on('pageerror', e => errors.push(String(e.message ?? e)));
  await pg.goto(url);
  await pg.waitForFunction('window.store !== undefined && window.game !== undefined', null, { timeout: TIMEOUT });
  const version = await pg.evaluate(`document.body.innerText.includes('${DATA_VERSION}')`);
  if (!version) throw new Error(`${url}: the page does not show data version ${DATA_VERSION}; re-pin fetch.py and DATA_VERSION`);
  await pg.addScriptTag({ path: BUNDLE });
  return { pg, errors };
}

async function runJob(browser, url, job) {
  const { pg, errors } = await openPage(browser, url);
  const counts = await pg.evaluate(job => OURS.setup(window.store, window.game, job), job);
  const settings = await pg.evaluate(job => OURS.settings(window.game, job), job);
  const results = [];
  for (const [level, cap] of settings) {
    results.push(await pg.evaluate(([job, l, c]) => OURS.compare(window.store, job, l, c), [job, level, cap]));
  }
  await pg.close();
  if (errors.length) throw new Error(`${job}: page errors: ${JSON.stringify(errors.slice(0, 3))}`);
  return { ...counts, settings: results };
}

function summarize(report) {
  const tags = {};
  let stats = 0;
  let equal = 0;
  let pieces = 0;
  let bonus = 0;
  for (const job of Object.values(report.jobs)) {
    for (const s of job.settings) {
      for (const [k, v] of Object.entries(s.tags)) tags[k] = (tags[k] ?? 0) + v;
      stats += s.stats;
      equal += s.equal;
      pieces += s.pieces;
      bonus += s.bonus ?? 0;
    }
  }
  return { tags, stats, equal, pieces, bonus };
}

const n = v => v.toLocaleString('en-US');
/** A JSON value as Python prints it (the output of this script is the same as run.py's was). */
function py(v) {
  if (v === null) return 'None';
  if (typeof v === 'boolean') return v ? 'True' : 'False';
  if (typeof v === 'string') return `'${v}'`;
  if (Array.isArray(v)) return `[${v.map(py).join(', ')}]`;
  if (typeof v === 'object')
    return `{${Object.entries(v)
      .map(([k, x]) => `${py(k)}: ${py(x)}`)
      .join(', ')}}`;
  return String(v);
}
const dictRepr = o => (Object.keys(o).length ? py(o) : 'none');

async function main() {
  const { values } = parseArgs({
    options: { site: { type: 'string', default: 'local' }, jobs: { type: 'string', default: JOBS.join(',') } },
  });
  if (!['local', 'live'].includes(values.site)) throw new Error('--site must be local or live');
  const jobs = values.jobs.split(',');
  await bundle();
  let server = null;
  let url;
  if (values.site === 'local') {
    if (!existsSync(join(CLONE, 'dist', 'index.html'))) {
      console.error('No local build of ffxiv-gearing. Run: python scripts/validate/gearing/fetch.py');
      return 1;
    }
    ({ server, url } = await serve(join(CLONE, 'dist')));
  } else {
    url = LIVE_URL;
  }
  const report = { site: values.site, url, dataVersion: DATA_VERSION, jobs: {} };
  const browser = await chromium.launch();
  try {
    const { pg } = await openPage(browser, url);
    const caps = await pg.evaluate('OURS.capsSweep(window.game)');
    report.caps = caps;
    await pg.close();
    console.log(
      `caps: ${caps.levels} item levels, ${n(caps.compared)} caps compared, ${n(caps.equal)} equal, ` +
        `${n(caps.off1)} off by 1, ${n(caps.more)} off by more; [compared, differing] ${py(caps.byGroup)}`,
    );
    for (const job of jobs) {
      const r = await runJob(browser, url, job);
      report.jobs[job] = r;
      const t = {};
      for (const s of r.settings) for (const [k, v] of Object.entries(s.tags)) t[k] = (t[k] ?? 0) + v;
      console.log(
        `${job}: ${r.ours} pieces (${r.theirs} in their data, ${r.notWearable} not wearable there), ` +
          `${r.settings.length} settings, differences ${dictRepr(t)}`,
      );
    }
  } finally {
    await browser.close();
    server?.close();
  }
  const out = join(OUT, `gearing-${values.site}.json`);
  writeFileSync(out, JSON.stringify(report), 'utf-8');
  const { tags, stats, equal, pieces, bonus } = summarize(report);
  console.log(`\n${n(pieces)} piece checks, ${n(stats)} stats compared, ${n(equal)} equal (${((equal / stats) * 100).toFixed(4)}%)`);
  console.log(`  their Crucible / Occult bonus taken off before comparing (D6): ${n(bonus)} stats`);
  for (const k of Object.keys(tags).sort()) console.log(`  ${k}: ${n(tags[k])}`);
  const bad = Object.fromEntries(Object.entries(tags).filter(([k]) => !PASS_TAGS.has(k)));
  console.log(Object.keys(bad).length ? `FAIL: ${py(bad)}` : 'PASS: every difference has a known cause');
  const otherName = `gearing-${values.site === 'live' ? 'local' : 'live'}.json`;
  const other = join(OUT, otherName);
  if (existsSync(other)) {
    const o = JSON.parse(readFileSync(other, 'utf-8'));
    const same = jobs.every(j => JSON.stringify(o.jobs[j]?.settings) === JSON.stringify(report.jobs[j].settings));
    console.log(`${otherName}: ${same ? 'same results' : 'DIFFERENT results'} for these jobs`);
  }
  return Object.keys(bad).length ? 1 : 0;
}

process.exitCode = await main();
