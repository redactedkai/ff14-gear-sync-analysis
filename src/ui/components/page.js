/* Page root and the job / sync settings panel. Nested components inherit the root's `job` and helpers. */
import { JOBS, ROLE_GROUP, SLOT_LABEL } from '../../core/constants.js';
import { speedParams } from '../../core/speed.js';
import { dataSourceLabel } from '../../core/tables.js';

export function page() {
  return {
    slotLabel: SLOT_LABEL,
    /* footer note naming the datamining commit; empty when unknown */
    dataSource: dataSourceLabel(),
    /* the current JobContext */
    get job() {
      return this.$store.app.jobCtx;
    },
    get slotOptions() {
      return this.job.activeSlotTypes.map(t => [t, SLOT_LABEL[t]]);
    },
    get substatOptions() {
      return this.job.substats.map(s => [s, this.job.label[s]]);
    },
  };
}

export function settings() {
  return {
    jobGroups: Object.keys(ROLE_GROUP).map(role => ({ role, label: ROLE_GROUP[role], jobs: JOBS.filter(j => j[2] === role) })),
    get levelInfo() {
      const app = this.$store.app,
        sp = speedParams(app.level);
      return `Lv ${app.level}: one ${this.job.label.spd} point is worth 130 ÷ ${sp.div} of a GCD step; the game’s own sync for this level is ${sp.sync}`;
    },
    get jobInfo() {
      const j = this.job;
      return (
        `${j.jobName}: main stat ${j.label.main}, speed stat ${j.label.spd}` +
        (j.profile.spec ? `, special substat ${j.label.spec}` : '') +
        `. Weapon: ${j.weaponMode === '2h' ? 'two-handed (counts twice toward average item level)' : 'one-handed with an off-hand (each counts once)'}.`
      );
    },
  };
}
