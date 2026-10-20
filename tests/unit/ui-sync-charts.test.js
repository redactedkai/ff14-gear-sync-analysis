/* The math tab's SVG charts (src/ui/sync-charts.js), shown with x-html: text passed in never becomes markup. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { escapeXml, overgearChartSvg } from '../../src/ui/sync-charts.js';

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
