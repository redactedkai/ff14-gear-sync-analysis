/* "Checked against real gear and published caps": computed once, the first time the panel is opened. */
import { bandAccuracy, wikiChecks } from '../../core/validation.js';
import { fmtInt, pct0 } from '../helpers.js';

export function validationPanel() {
  return {
    view: null,
    onToggle(open) {
      if (!open || this.view) return;
      const bands = bandAccuracy().map(b => ({
        label: b.label,
        n: fmtInt(b.n),
        exact: pct0(b.exact, b.n),
        within1: pct0(b.within1, b.n),
        count: b.n,
      }));
      this.view = Object.freeze({
        bands,
        total: fmtInt(bands.reduce((a, b) => a + b.count, 0)),
        wiki: wikiChecks(),
      });
    },
  };
}
