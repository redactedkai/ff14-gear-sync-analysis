/* The math tab's SVG charts (src/ui/sync-charts.js), shown with x-html: text passed in never becomes markup; the
   overgeared chart's bands, cap line, shading and labels, the speed step chart's bars and haste marks, and the width. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OVERGEAR_BANDS, escapeXml, overgearChartSvg, speedStepChartSvg } from '../../src/ui/sync-charts.js';

/* Audit 12, finding 2: the charts said they were "built only from numbers", but they take a slot name and stat names.
   All are constants today; escaping them keeps a future label (an item name, say) from adding markup. */
test('charts: names are escaped, so a label cannot add markup', () => {
  assert.equal(escapeXml(`<b a="1">&'`), '&#60;b a=&#34;1&#34;&#62;&#38;&#39;');
  const curve = [130, 140, 150, 160].map(il => ({ il, points: 40, parts: [24, 16], melds: 0 }));
  const svg = overgearChartSvg({
    curve,
    cap: 135,
    il: 150,
    ref: 40,
    slotName: '<img src=x onerror=alert(1)>',
    labels: ['<script>x</script>', 'Direct Hit'],
    ceilings: [24, 24],
    width: 600,
  });
  assert.doesNotMatch(svg, /<img|<script/);
  assert.match(svg, /Item level of the &#60;img src=x onerror=alert\(1\)&#62;/);
  assert.match(svg, /&#60;script&#62;x&#60;\/script&#62;/);
});

/* A made-up overgeared curve, item levels 120 to 170 by 10: two substats that reach their ceiling (24) at 140 and 150,
   and melds (6) only at or below the cap of 130, where the piece keeps them. */
const CURVE = [120, 130, 140, 150, 160, 170].map(il => {
  const parts = [Math.min(24, il - 116), Math.min(24, il - 126)];
  const melds = il <= 130 ? 6 : 0;
  return { il, parts, melds, points: parts[0] + parts[1] + melds };
});
const overgear = patch =>
  overgearChartSvg({
    curve: CURVE,
    cap: 130,
    il: 150,
    ref: 24,
    slotName: 'head',
    labels: ['Critical Hit', 'Direct Hit'],
    ceilings: [24, 24],
    ...patch,
  });

test('overgeared chart: a band per substat and one for melds, the cap line, the piece marked, the reference line labelled', () => {
  const svg = overgear({ width: 600 });
  assert.match(svg, /^<svg class="chart" viewBox="0 0 600 300"/);
  // the bands in OVERGEAR_BANDS order, bottom up: the 1st substat, the 2nd, then the melds
  const fills = [...svg.matchAll(/<polygon [^>]*fill="([^"]+)" opacity="([^"]+)"/g)].map(m => [m[1], Number(m[2])]);
  assert.deepEqual(
    fills,
    OVERGEAR_BANDS.map(b => [b.fill, b.opacity]),
  );
  assert.equal((svg.match(/stroke="var\(--bad\)"/g) || []).length, 1, 'one cap line');
  assert.match(svg, />Item level 150</);
  assert.match(svg, />24: item level 130 with its melds</);
  assert.match(svg, />Item level of the head</);
  // where each substat reaches its ceiling above the cap
  assert.match(svg, />24: at the cap from 140</);
  assert.match(svg, />24: at the cap from 150</);
});

test('overgeared chart: the item levels above the cap with as many points as the reference are shaded', () => {
  // 140 has 24 + 14 = 38 points against a reference of 40; 150 on has 48
  assert.match(overgear({ ref: 40 }), /data-shade="150-170"/);
  assert.doesNotMatch(overgear({ ref: 99 }), /data-shade/);
  // a cap outside the curve's range draws no cap line
  assert.doesNotMatch(overgear({ cap: 100 }), /var\(--bad\)/);
});

test('charts: drawn at the given width, never narrower than 420, 760 when unknown; nothing for an empty list', () => {
  assert.match(overgear({ width: 200 }), /viewBox="0 0 420 300"/);
  assert.match(overgear({ width: 0 }), /viewBox="0 0 760 300"/);
  assert.equal(overgearChartSvg({ curve: [], cap: 130, il: 150, ref: 0, slotName: 'head' }), '');
  assert.equal(speedStepChartSvg({ bars: [], level: 50 }), '');
  assert.match(speedStepChartSvg({ bars: [{ level: 1, speed: 3 }], level: 1, width: 900 }), /viewBox="0 0 900 250"/);
});

test('speed step chart: a bar per level with its level, the chosen one highlighted and labelled, a line per haste mark', () => {
  const bars = Array.from({ length: 100 }, (_, i) => ({ level: i + 1, speed: 3 + i / 10 }));
  const svg = speedStepChartSvg({ bars, level: 50, marks: [{ level: 66, pct: 13 }], width: 800 });
  const levels = [...svg.matchAll(/<rect class="stepbar[^"]*" data-level="(\d+)"/g)].map(m => Number(m[1]));
  assert.deepEqual(
    levels,
    bars.map(b => b.level),
  );
  assert.deepEqual(
    [...svg.matchAll(/class="stepbar on" data-level="(\d+)"/g)].map(m => m[1]),
    ['50'],
  );
  assert.match(svg, /<title>Level 50: about 8 speed per step<\/title>/); // 3 + 4.9, rounded
  assert.match(svg, />level 50: ~8</);
  assert.equal((svg.match(/class="hasteline"/g) || []).length, 1);
  assert.match(svg, />13% at 66</);
});
