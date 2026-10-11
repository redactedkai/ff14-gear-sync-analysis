/* Advanced: generate hypothetical pieces, or enter one by hand. */
import { SLOT_LABEL } from '../../core/constants.js';
import { clampIlvl, buildPiece } from '../../core/formulas.js';
import { genericItems, mkItem } from '../../core/items.js';

export function generator() {
  return {
    /* keep the chosen substats / slots in the job's canonical order, whatever order they were ticked in */
    toggleSub(s, on) {
      const g = this.$store.app.gen, set = new Set(g.subs);
      on ? set.add(s) : set.delete(s);
      g.subs = this.job.substats.filter(x => set.has(x));
    },
    toggleType(t, on) {
      const g = this.$store.app.gen, set = new Set(g.types);
      on ? set.add(t) : set.delete(t);
      g.types = this.job.activeSlotTypes.filter(x => set.has(x));
    },
    generate() {
      const g = this.$store.app.gen;
      if (g.subs.length < 2 || !g.types.length) return;
      this.$store.app.replaceGenerated(genericItems(this.job, g.ilvl, g.subs, g.third, g.types));
    },
  };
}

function blankEntry(job) {
  return { slot: 'head', s1: 'spd', s2: job.substats[1], s3: '', stats: Object.fromEntries(job.stats.map(s => [s, 0])) };
}

export function handEntry() {
  return {
    name: '', ilvl: 130, copies: 1,
    slot: 'head', s1: 'spd', s2: '', s3: '', stats: {},   // set for the current job in init()
    init() {
      Object.assign(this, blankEntry(this.job));
      // slot, substat choices and stats depend on the job; name, item level and copies carry over
      this.$watch('$store.app.job', () => Object.assign(this, blankEntry(this.job)));
    },
    fill() {
      const st = buildPiece(this.job, clampIlvl(this.ilvl), this.slot, [this.s1, this.s2, this.s3 || null]);
      this.job.stats.forEach(s => { this.stats[s] = st[s]; });
    },
    add() {
      const st = {};
      this.job.stats.forEach(s => { st[s] = Math.max(0, Math.round(+this.stats[s] || 0)); });
      const name = String(this.name).trim() || (SLOT_LABEL[this.slot] + ' custom');
      this.$store.app.addItem(mkItem(name, this.slot, clampIlvl(this.ilvl), st, { copies: Math.min(2, Math.max(1, +this.copies || 1)) }));
      this.name = '';
    },
  };
}
