/* Pixel comparison of two folders of screenshots (scripts/shots/shots.mjs; docs/engineering/testing.md, "Run by hand").

Compares each PNG in <dirA> with the PNG of the same name in <dirB>. Byte-identical files are skipped; the others are
decoded in Chromium (Playwright, no image library) and compared pixel by pixel. A pixel differs when one of its four
channels (red, green, blue, alpha) differs by more than --threshold (out of 255; default 2). For each file that differs
it prints the number of differing pixels, their bounding box (x0,y0 to x1,y1, in px) and the largest channel
difference; a file missing from either folder, or of another size, counts as differing.

Run: npm run shots:compare -- <dirA> <dirB> [--threshold 2]
Exits 1 when any file differs.
*/

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { numberOption } from '../perf/args.mjs';

// the two folders: the first two arguments that are not an option or an option's value
const folders = process.argv.slice(2).filter((arg, at, args) => !arg.startsWith('--') && !args[at - 1]?.startsWith('--'));
if (folders.length !== 2) {
  console.error('usage: node scripts/shots/compare.mjs <dirA> <dirB> [--threshold 2]');
  process.exit(1);
}
const [dirA, dirB] = folders.map(dir => resolve(dir));
const threshold = numberOption('threshold', 2);

const pngNames = dir => readdirSync(dir).filter(name => name.endsWith('.png'));
const namesA = pngNames(dirA);
const namesB = new Set(pngNames(dirB));
const report = [];
for (const name of namesB) if (!namesA.includes(name)) report.push(`${name}: missing in ${dirA}`);

/* In the page: decode two PNGs (base64) and compare them. Returns {size} when the sizes differ, else {count, box,
   maxDiff}: the pixels with a channel difference above `limit`, their bounding box [x0, y0, x1, y1] (null when none)
   and the largest channel difference of any pixel. */
async function diffInPage([pngA, pngB, limit]) {
  const decode = async base64 => {
    const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${base64}`)).blob());
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext('2d');
    context.drawImage(bitmap, 0, 0);
    return { width: bitmap.width, height: bitmap.height, data: context.getImageData(0, 0, bitmap.width, bitmap.height).data };
  };
  const [imageA, imageB] = await Promise.all([decode(pngA), decode(pngB)]);
  if (imageA.width !== imageB.width || imageA.height !== imageB.height)
    return { size: `${imageA.width}x${imageA.height} against ${imageB.width}x${imageB.height}` };

  let count = 0;
  let maxDiff = 0;
  const box = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, -1, -1];
  for (let offset = 0; offset < imageA.data.length; offset += 4) {
    let pixelDiff = 0;
    for (let channel = 0; channel < 4; channel++)
      pixelDiff = Math.max(pixelDiff, Math.abs(imageA.data[offset + channel] - imageB.data[offset + channel]));
    maxDiff = Math.max(maxDiff, pixelDiff);
    if (pixelDiff <= limit) continue;
    count++;
    const pixel = offset / 4;
    const x = pixel % imageA.width;
    const y = Math.floor(pixel / imageA.width);
    box[0] = Math.min(box[0], x);
    box[1] = Math.min(box[1], y);
    box[2] = Math.max(box[2], x);
    box[3] = Math.max(box[3], y);
  }
  return { count, box: count ? box : null, maxDiff };
}

// compare each pair; byte-identical files need no decoding
const browser = await chromium.launch();
const page = await browser.newPage();
let identical = 0;
for (const name of namesA) {
  const pathB = resolve(dirB, name);
  if (!existsSync(pathB)) {
    report.push(`${name}: missing in ${dirB}`);
    continue;
  }
  const bytesA = readFileSync(resolve(dirA, name));
  const bytesB = readFileSync(pathB);
  if (bytesA.equals(bytesB)) {
    identical++;
    continue;
  }
  const result = await page.evaluate(diffInPage, [bytesA.toString('base64'), bytesB.toString('base64'), threshold]);
  if (result.size) report.push(`${name}: size ${result.size}`);
  else if (result.count)
    report.push(`${name}: ${result.count} px differ, box ${result.box.join(',')}, max channel difference ${result.maxDiff}`);
  else identical++;
}
await browser.close();

console.log(`${identical} identical (within ${threshold}/255), ${report.length} differ`);
if (report.length) {
  console.log(report.join('\n'));
  process.exit(1);
}
