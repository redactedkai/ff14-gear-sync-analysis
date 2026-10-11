/* Your pool: the items the optimizer searches. */
import Alpine from 'alpinejs';
import { SLOT_LABEL } from '../../core/constants.js';
import { poolView } from '../views/pool.js';
export function pool() {
  return {
    view: null,
    init() {
      Alpine.effect(() => {
        const app = this.$store.app;
        app.poolVersion; // dependency: any pool change
        this.view = poolView(app);
      });
    },
    get filterOptions() {
      return [['all', 'all items']].concat(this.job.activeSlotTypes.map(t => [t, SLOT_LABEL[t]]));
    },
  };
}
