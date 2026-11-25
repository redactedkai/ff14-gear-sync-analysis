// How the math works, GCD: the Haste menu's text stays inside its box.

import { NARROW, shot } from '../../lib/constants.mjs';
import { check } from '../../lib/expect.mjs';
import { showMath } from '../../lib/nav.mjs';
import { expectSelectValue, pickOption, selectOptions } from '../../lib/select.mjs';

/** The Haste select `#g-haste` as measured now: {text (the chosen option's), textWidth (px, in the select's own font),
 * roomWidth (px of the box left for text: inside the border, the padding and the chevron's reserved space), scrollWidth,
 * clientWidth}. */
const measureHaste = pg =>
  pg.evaluate(() => {
    const select = document.querySelector('#g-haste');
    const style = getComputedStyle(select);
    const text = select.textContent.trim();
    const canvas = document.createElement('canvas').getContext('2d');
    canvas.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    const border = parseFloat(style.borderLeftWidth) + parseFloat(style.borderRightWidth);
    return {
      text,
      textWidth: canvas.measureText(text).width,
      roomWidth: select.getBoundingClientRect().width - border - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
      scrollWidth: select.scrollWidth,
      clientWidth: select.clientWidth,
    };
  });

/** The number of pixels in the strip `width` px wide to the right of `#g-haste`, over its height, that differ from the
 * strip's top left pixel (the page background): text spilled out of the box shows as such pixels. */
async function inkRightOfHaste(pg, width) {
  const box = await pg.locator('#g-haste').boundingBox();
  const png = await pg.screenshot({ clip: { x: box.x + box.width + 2, y: box.y, width, height: box.height } });
  return pg.evaluate(async base64 => {
    const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${base64}`)).blob());
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext('2d');
    context.drawImage(bitmap, 0, 0);
    const { data } = context.getImageData(0, 0, bitmap.width, bitmap.height);
    let ink = 0;
    for (let at = 4; at < data.length; at += 4) {
      if (data[at] !== data[0] || data[at + 1] !== data[1] || data[at + 2] !== data[2]) {
        ink++;
      }
    }
    return ink;
  }, png.toString('base64'));
}

/** The Haste select's text never leaves its box. No option names a percent or a list of them. With the longest option
 * chosen, at 960 and 1280 px and also in a wider fallback font (Verdana), the text fits inside the box, between its
 * padding and the chevron, and the box has the same width for every option. A select forced narrower than its text clips it at the box: nothing is drawn beside it. */
export async function checkHasteSelectFits(pg) {
  await showMath(pg, 'gcd');
  const options = (await selectOptions(pg, '#g-haste')).map(option => ({ value: option.value, text: option.label }));
  check(options.length > 1, 'the Haste menu has no job options');
  for (const o of options) {
    check(!/[%/]/.test(o.text), `the Haste option "${o.text}" shows a percent or a list of them`);
  }
  const longest = options.reduce((a, b) => (b.text.length > a.text.length ? b : a));
  for (const [width, font] of [
    [NARROW.width, null],
    [1280, null],
    [NARROW.width, 'Verdana, sans-serif'],
  ]) {
    const where = `at ${width} px${font ? ` in ${font}` : ''}`;
    await pg.setViewportSize({ width, height: NARROW.height });
    await pg.evaluate(
      fontFamily =>
        fontFamily
          ? document.documentElement.style.setProperty('--sans', fontFamily)
          : document.documentElement.style.removeProperty('--sans'),
      font,
    );
    await pickOption(pg, '#g-haste', longest.value);
    await expectSelectValue(pg, '#g-haste', longest.value);
    const fit = await measureHaste(pg);
    check(fit.text === longest.text, `the Haste select shows "${fit.text}", not "${longest.text}" ${where}`);
    check(
      fit.textWidth <= fit.roomWidth,
      `"${fit.text}" is ${Math.round(fit.textWidth)} px wide in a box with ${Math.round(fit.roomWidth)} px of room ${where}`,
    );
    check(
      fit.scrollWidth <= fit.clientWidth,
      `the Haste select's content is ${fit.scrollWidth} px in a ${fit.clientWidth} px box ${where}`,
    );
    // the box is as wide as for the longest text whatever is picked: picking moves nothing
    const widths = new Set();
    for (const o of options) {
      await pickOption(pg, '#g-haste', o.value);
      widths.add(Math.round((await pg.locator('#g-haste').boundingBox()).width));
    }
    check(widths.size === 1, `the Haste select's width changes with the pick (${[...widths].join(', ')} px) ${where}`);
    await pickOption(pg, '#g-haste', longest.value);
    if (width === NARROW.width && !font) {
      await pg.screenshot({ path: shot('haste-select.png') });
    }
  }

  // a box narrower than the text: it is cut at the box, nothing is drawn beside it
  await pg.evaluate(() => {
    document.querySelector('#g-haste').closest('.mctl').style.width = '120px';
    document.querySelector('#g-haste').style.cssText = 'width: 120px; min-width: 0';
  });
  const spilled = await inkRightOfHaste(pg, 60);
  check(spilled === 0, `the Haste select, forced to 120 px, drew ${spilled} px of text outside its box`);

  // back to the page as it was
  await pg.evaluate(() => {
    document.documentElement.style.removeProperty('--sans');
    document.querySelector('#g-haste').closest('.mctl').style.width = '';
    document.querySelector('#g-haste').style.cssText = '';
  });
  await pickOption(pg, '#g-haste', '');
}
