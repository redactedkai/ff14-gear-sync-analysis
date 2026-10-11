/* Sync caps: the per-slot ceiling at the current cap, and what a high item level piece keeps after syncing. */
import Alpine from 'alpinejs';
import { syncView } from '../views/sync-caps.js';
export function syncCaps() {
  return {
    view: null,
    init() {
      Alpine.effect(() => {
        this.view = syncView(this.$store.app);
      });
    },
  };
}
