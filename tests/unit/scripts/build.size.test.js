/* The size budget of the page's own code. The 4 MB page ceiling in build.test.js watches the whole
   page, where the item database is most of the bytes; this test watches the code we write and the libraries we bundle
   (JavaScript only, data left out), so a careless import shows up even when the page stays far below 4 MB. The method is
   Lit's check-size.js: bundle, gzip, compare with a number kept in the test. */
import { test } from 'node:test';
import * as esbuild from 'esbuild';
import assert from 'node:assert/strict';
import { gzipSync, constants } from 'node:zlib';
import { esbuildOptions, jsonParseData } from '../../../scripts/build/build.mjs';

/* The budget: gzip bytes of the page's JavaScript with everything from src/data/ left out. It is the size at the time of the
   last deliberate raise plus a headroom of about 1 kB, so a growth beyond that fails and the owner decides: raise
   it on purpose (docs/engineering/testing.md, "Raising the size budget") or remove what grew. */
const OWN_CODE_GZIP_BUDGET_BYTES = 143_100; // measured 142,234 without src/data/, plus 866 bytes; the store, its facades and the set page actions added 3,311

/* esbuild plugin placed before jsonParseData: every generated data file (src/data/*.json, plus the base64 job icons in
   src/data/job-icons.js) becomes an empty stub, so the bundle holds only our own code and libraries. Nothing runs the
   bundle, so the empty data is never read. */
const DATA_JSON_FILE = /[\\/]src[\\/]data[\\/][^\\/]+\.json$/;
const DATA_JS_FILE = /[\\/]src[\\/]data[\\/][^\\/]+\.js$/;
const DATA_FILE = /[\\/]src[\\/]data[\\/][^\\/]+\.(json|js)$/;
const stubData = {
  name: 'stub-data',
  setup(build) {
    build.onLoad({ filter: DATA_JSON_FILE }, () => ({ contents: 'export const text = ""; export default {};', loader: 'js' }));
    build.onLoad({ filter: DATA_JS_FILE }, () => ({ contents: 'export const JOB_ICONS = {};', loader: 'js' }));
  },
};

/* Bundle the page as the build does, minified, with the data stubbed; returns the gzip size (level 9, so the same bytes
   give the same number on every run) of the JavaScript output and the metafile. */
async function measureOwnCode() {
  const options = esbuildOptions();
  const result = await esbuild.build({
    ...options,
    plugins: [stubData, ...options.plugins.filter(plugin => plugin !== jsonParseData)],
    metafile: true,
  });
  const js = result.outputFiles.filter(file => file.path.endsWith('.js'));
  const gzipBytes = gzipSync(Buffer.concat(js.map(file => Buffer.from(file.contents))), { level: constants.Z_BEST_COMPRESSION }).length;
  return { gzipBytes, metafile: result.metafile };
}

test("size budget: the page's own JavaScript, without data, stays within its gzip budget", async () => {
  const { gzipBytes, metafile } = await measureOwnCode();

  // no data file may be left in the bundle but its stub (a few bytes each), or the number would count the database
  const dataBytes = Object.values(metafile.outputs)
    .flatMap(output => Object.entries(output.inputs))
    .filter(([path]) => DATA_FILE.test(path))
    .reduce((total, [, input]) => total + input.bytesInOutput, 0);
  assert.ok(dataBytes < 2_000, `${dataBytes} bytes of generated data are still in the measured bundle`);

  assert.ok(
    gzipBytes <= OWN_CODE_GZIP_BUDGET_BYTES,
    `own code is ${gzipBytes} bytes gzip, budget ${OWN_CODE_GZIP_BUDGET_BYTES} (${gzipBytes - OWN_CODE_GZIP_BUDGET_BYTES} over). ` +
      'If the growth is intended, raise OWN_CODE_GZIP_BUDGET_BYTES in tests/unit/scripts/build.size.test.js (docs/engineering/testing.md, "Raising the size budget").',
  );
});

test('size budget: two measurements give the same bytes', async () => {
  assert.equal((await measureOwnCode()).gzipBytes, (await measureOwnCode()).gzipBytes);
});

test('size budget: the budget is no more than 1 kB above the measured size, and 1 kB below it would fail', async () => {
  const { gzipBytes } = await measureOwnCode();
  assert.ok(
    OWN_CODE_GZIP_BUDGET_BYTES - gzipBytes <= 1_000,
    'the budget has slack beyond its headroom: lower it to the measured size plus about 1 kB',
  );
  assert.ok(gzipBytes > OWN_CODE_GZIP_BUDGET_BYTES - 1_000, 'a budget 1 kB below this one would not fail');
});
