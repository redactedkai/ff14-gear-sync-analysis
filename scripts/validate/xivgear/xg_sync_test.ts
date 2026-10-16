/* xivgear's side of the check (run.py copies this file into the clone's packages/core/src/test/ and runs it with their
   test runner). For each job and sync setting it loads their data the way their app does (NewApiDataManager for the
   job, level and item level sync, with the item filters opened so gear below item level 290 loads too), equips each
   piece alone in a gear set and reads every stat of the job from getStatDetail (the synced value their set shows, Main
   and Secondary Attribute folded in). Our side (ours.js, bundled to XG_OURS) compares them as it goes.

   Their data API is read through a disk cache (XG_CACHE): each URL is fetched once, then served from disk.
   Env: XG_OURS, XG_OUT (directory), XG_CACHE, XG_SETTINGS (settings.json), XG_JOBS (comma-separated), XG_LEVEL (only
   the settings at this job level; run.py starts one process per job and level, since memory grows with each setting). */
import { NewApiDataManager } from '../datamanager_new';
import { HEADLESS_SHEET_PROVIDER } from '../sheet';
import { CharacterGearSet } from '../gear';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

const env = (k: string) => {
  const v = process.env[k];
  if (!v) throw new Error(`${k} not set`);
  return v;
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const OURS = require(env('XG_OURS'));
const OUT = env('XG_OUT');
const CACHE = env('XG_CACHE');
const SETTINGS: [number, number | null][] = JSON.parse(fs.readFileSync(env('XG_SETTINGS'), 'utf8')).settings;
const JOBS = env('XG_JOBS').split(',');
const LEVEL = Number(env('XG_LEVEL'));

fs.mkdirSync(CACHE, { recursive: true });
const realFetch = globalThis.fetch;
const cacheStats = { hits: 0, misses: 0 };
(globalThis as any).fetch = async (input: any, init?: any) => {
  const url = typeof input === 'string' ? input : (input.url ?? String(input));
  const f = path.join(CACHE, crypto.createHash('sha1').update(url).digest('hex') + '.json');
  if (fs.existsSync(f)) {
    cacheStats.hits++;
    const c = JSON.parse(fs.readFileSync(f, 'utf8'));
    return new Response(c.body, { status: c.status, headers: c.headers });
  }
  cacheStats.misses++;
  const r = await realFetch(input, init);
  const body = await r.text();
  const headers: Record<string, string> = {};
  r.headers.forEach((v, k) => {
    headers[k] = v;
  });
  if (r.status === 200) fs.writeFileSync(f, JSON.stringify({ url, status: r.status, headers, body }));
  return new Response(body, { status: r.status, headers });
};

// silence their loading chatter
const log = console.log;
console.log = () => {};

describe('sync caps vs ours', () => {
  for (const job of JOBS) {
    it(job, async () => {
      const info = OURS.jobInfo(job);
      const settings: any[] = [];
      for (const [level, cap] of SETTINGS) {
        if (level !== LEVEL || level > info.maxLevel) continue;
        const dm: any = new NewApiDataManager([job as any], level as any, cap ?? undefined);
        dm.minEquipIlvl = 0; // load every item level and equip level
        dm.minEquipLvl = 1;
        await dm.loadData();
        const sheet: any = HEADLESS_SHEET_PROVIDER.fromScratch('v', 'v', job as any, level as any, cap ?? undefined, false);
        await sheet.loadFromDataManager(dm);
        const gs = new CharacterGearSet(sheet);
        const res = OURS.startSetting(job, level, cap);
        for (const item of dm.allItems) {
          if (item.isNqVersion || !item.displayGearSlotName) continue;
          const slot = item.displayGearSlotName === 'Ring' ? 'RingLeft' : item.displayGearSlotName;
          gs.setEquip(slot, item);
          const theirs: Record<string, number> = {};
          for (const [, k] of info.stats) theirs[k] = gs.getStatDetail(slot, k).effectiveAmount;
          gs.setEquip(slot, null);
          OURS.compareItem(res, item.id, theirs, item.isSyncedDown ? item.syncedDownTo : null);
        }
        settings.push(OURS.finishSetting(res));
      }
      if (!settings.length) return;
      fs.writeFileSync(path.join(OUT, `${job}-${LEVEL}.json`), JSON.stringify({ job, pieces: info.pieces, settings }));
      log(`${job}: ${settings.length} settings, cache ${cacheStats.hits} hits, ${cacheStats.misses} fetches`);
    }).timeout(3_600_000);
  }
});
