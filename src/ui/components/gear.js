/* Gear browser: look up the item database with filters (see views/gear.js). Recomputed only while its tab is open. */
import Alpine from 'alpinejs';
import { gearView } from '../views/gear.js';
import { expansionToggles, gearFromToggles } from '../helpers.js';

export function gear() {
  return {
    view: null,
    init() {
      Alpine.effect(() => {
        const app = this.$store.app;
        if (app.tab !== 'browse') return;
        this.view = gearView(app);
      });
    },
    get sortOptions() {
      return [['ilvl', 'Item level']].concat(this.job.stats.map(s => [s, 'Synced ' + this.job.label[s]]));
    },
    /* the Expansion filter, browse.expOff (the optimizer has its own, opt.expOff) */
    ...expansionToggles('browse'),
    /* the "Gear from" filter: the browser's own boxes and market board switch (browse.exclude, browse.market) */
    ...gearFromToggles('browse'),
    get emptyBoxes() {
      return this.view?.emptyBoxes || [];
    },
    get typeOptions() {
      return [['any', 'Any slot']].concat(this.slotOptions);
    },
  };
}
