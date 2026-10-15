/* Gear browser: look up the item database with filters (see views/gear.js). Recomputed only while its tab is open. */
import Alpine from 'alpinejs';
import { gearView } from '../views/gear.js';
import { gearGroupToggles } from '../helpers.js';
import { EXPANSIONS } from '../../core/constants.js';

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
    /* oldest first, the game's own order */
    expansions: EXPANSIONS.map(([short, name]) => [short, name]),
    /* the dropdown button: "All expansions", one name, or how many are on */
    get expSummary() {
      const on = EXPANSIONS.filter(e => this.expShown(e[0]));
      if (on.length === EXPANSIONS.length) return 'All expansions';
      if (!on.length) return 'None';
      return on.length === 1 ? on[0][1] : `${on.length} expansions`;
    },
    expShown(short) {
      return !this.$store.app.browse.expOff.includes(short);
    },
    setExpShown(short, on) {
      const off = this.$store.app.browse.expOff.filter(k => k !== short);
      this.$store.app.browse.expOff = on ? off : EXPANSIONS.map(e => e[0]).filter(k => k === short || off.includes(k));
    },
    /* gear groups listed (ticked) or left out: the browser's own list, browse.exclude */
    ...gearGroupToggles('browse'),
    get typeOptions() {
      return [['any', 'Any slot']].concat(this.slotOptions);
    },
  };
}
