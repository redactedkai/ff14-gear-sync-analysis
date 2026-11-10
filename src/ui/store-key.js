/* The localStorage key of the saved settings, and the prefix of the sheets' keys (sheet-storage.js). Kept when the saved
   shape changes: restoreState repairs an older one (no users to migrate yet; CLAUDE.md, Page rules). A module of its own,
   so storage code takes the key without loading the settings' state module. */
export const STORE_KEY = 'ilvl-stat-lab-v4';
