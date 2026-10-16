/* "Checked against real gear and published caps": computed once, the first time the panel is opened. */
import { bandAccuracy, wikiChecks } from '../../core/validation.js';
import { fmtInt } from '../helpers.js';

export function validationPanel() {
  return {
    view: null,
    onToggle(open) {
      if (!open || this.view) return;
      // counts, not percentages: rounded to whole percents the few misses would read as 100%
      const raw = bandAccuracy();
      const sum = k => raw.reduce((a, b) => a + b[k], 0);
      const bands = raw.map(b => ({
        label: b.label,
        n: fmtInt(b.n),
        exact: fmtInt(b.exact),
        off1: fmtInt(b.within1 - b.exact),
        more: fmtInt(b.n - b.within1),
      }));
      this.view = Object.freeze({
        bands,
        total: fmtInt(sum('n')),
        exact: fmtInt(sum('exact')),
        wiki: wikiChecks(),
      });
    },
  };
}
