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
    /* job id waiting for confirmation, because switching would clear a non-empty pool */
    pendingJob: null,
    get pendingJobName() {
      return JOBS.find(j => j[0] === this.pendingJob)?.[1] ?? '';
    },
    get poolSize() {
      return this.$store.app.pool.length;
    },
    requestJob(id, select) {
      const app = this.$store.app;
      if (id === app.job) return;
      if (!app.pool.length) {
        app.setJob(id);
        return;
      }
      this.pendingJob = id;
      select.value = app.job; // the menu keeps showing the current job until the switch is confirmed
    },
    confirmJob() {
      this.$store.app.setJob(this.pendingJob);
      this.pendingJob = null;
    },
    cancelJob() {
      this.pendingJob = null;
    },
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
