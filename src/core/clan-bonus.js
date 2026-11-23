/* The clan bonus and the party bonus: two additions to a character's main stat and Vitality that the set totals can
   count (roadmap A28, A29). Both are applied on top of a saved gear set, never in the search: the optimizer and Auto-fill
   do not read this file.
   - Clan: a flat offset of -3 to +3 per attribute (Tribe sheet, src/data/item-level.json CLANS), the same at every level.
     The character panel counts it (confirmed by the owner; xivgear and the Wiki's attribute formula add it too); the
     offsets are verified (they equal xivgear's RACE_STATS and the Wiki's Starting Attributes page: a base of 20 plus the offset).
   - Party: 1% of every attribute for each unique role in the current party, up to 5% (the Patch 5.0 notes and the Wiki's
     Party page; the party need not be full). The tool shows only the main stat and Vitality, so it applies it to those two.
     It rounds down (xivgear does, and the owner confirms the game does). It applies at any sync, in synced duties and
     Ultimates too (xivgear has no sync condition; the owner confirms it is added at the end, like a meal).
   Order (xivgear's): the party bonus multiplies base + clan + gear, then the meal's points are added; a meal's bonus is
   worked out from the value before the party bonus. */
import { CLANS } from './tables.js';

/* The most unique roles a party can have (tank, healer, melee, physical ranged, magic ranged): 5 roles = 5%. */
export const PARTY_ROLES_MAX = 5;

const CLAN_BY_NAME = new Map(CLANS.map(clan => [clan.clan, clan]));

/* The clans grouped by race, in the game's order, for a menu: [{race, clans: [clan name, ...]}] (8 races of 2 clans). */
export function clanGroups() {
  const groups = [];
  for (const { race, clan } of CLANS) {
    const last = groups.at(-1);
    if (last?.race === race) last.clans.push(clan);
    else groups.push({ race, clans: [clan] });
  }
  return groups;
}

/* Whether `name` is the name of a clan ("Midlander"). */
export function isClan(name) {
  return CLAN_BY_NAME.has(name);
}

/* What clan `clanName` adds to the stat `statKey` (a stat key: str, dex, int, mind, vit), in points. 0 for no clan (null,
   '' or an unknown name) and for a stat no clan changes (a substat, Piety). */
export function clanOffset(clanName, statKey) {
  const points = CLAN_BY_NAME.get(clanName)?.[statKey];
  return typeof points === 'number' ? points : 0;
}

/* `value` as a number of unique party roles: a whole number from 0 to PARTY_ROLES_MAX (anything else is 0). */
export function partyRoles(value) {
  const roles = Math.trunc(Number(value));
  return Number.isFinite(roles) ? Math.min(PARTY_ROLES_MAX, Math.max(0, roles)) : 0;
}

/* `points` with the party bonus of `roles` unique roles: floor(points x (1 + 0.01 x roles)), in whole-number arithmetic
   (1311 x 1.05 is 1376.55 on paper; a float product could land either side of a whole number at other values). */
export function withPartyBonus(points, roles) {
  return Math.floor((points * (100 + partyRoles(roles))) / 100);
}

/* The stat keys of `job` that the clan and the party bonus change: its main stat and Vitality. */
export function bonusStats(job) {
  return [job.mainKey, 'vit'];
}

/* A stat's number as the character panel shows it, with the bonuses: `parts` is {base (statBase), gear (the pieces'
   points after sync and stones), meal (the meal's points, 0 for none), clan (a clan name or null), roles (unique party
   roles, 0 for no party bonus)}. The main stat and Vitality are floor((base + clan + gear) x party) + meal; every other
   stat is base + gear + meal. `meal` must be the meal's bonus on base + clan + gear (food.js foodBonus), not on the
   party-boosted value. */
export function characterStat(job, stat, { base, gear, meal = 0, clan = null, roles = 0 }) {
  if (!bonusStats(job).includes(stat)) return base + gear + meal;
  return withPartyBonus(base + clanOffset(clan, stat) + gear, roles) + meal;
}
