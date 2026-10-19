#!/usr/bin/env node
/* Local development: rebuild dist/index.html on every change under src/ and serve it.
   Run: npm run dev   then open the printed URL. Output is not minified. */
import * as esbuild from 'esbuild';
import { watch } from 'node:fs';
import { join } from 'node:path';
import { esbuildOptions, writePage, SRC, DIST, PARTIALS } from './build.mjs';

const writeOnEnd = {
  name: 'write-page',
  setup(build) {
    build.onEnd(result => {
      if (result.errors.length) return;
      const size = writePage(result.outputFiles);
      console.log(`[${new Date().toLocaleTimeString()}] dist/index.html ${size.toLocaleString('en-US')} bytes`);
    });
  },
};

const ctx = await esbuild.context({ ...esbuildOptions({ minify: false }), plugins: [writeOnEnd] });
await ctx.watch();
// esbuild only watches files it imports; the HTML template and its partials are read separately
watch(join(SRC, 'index.html'), () => ctx.rebuild().catch(() => {}));
watch(PARTIALS, () => ctx.rebuild().catch(() => {}));
const { hosts, port } = await ctx.serve({ servedir: DIST, host: '127.0.0.1' });
console.log(`serving http://${hosts[0]}:${port}/`);
