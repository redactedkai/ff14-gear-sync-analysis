/* The two boxes of a sheet page's settings row, Clan and Party bonus: the entries of their lists as data for the
   template (the clans come from core/clan-bonus.js, the one list of them). Pure: no Alpine, no document. */
import { PARTY_ROLES_MAX, clanGroups } from '../../core/clan-bonus.js';

/* The first entry of the Clan list, which means no clan. */
export const NO_CLAN_TEXT = 'Select Race/Clan';
/* The first entry of the Party bonus list, which means no party bonus. */
const NO_PARTY_TEXT = 'No party bonus';

/* The text of the Party bonus entry for `roles` unique roles: "No party bonus" for 0, "1 unique role (1%)", "2 unique
   roles (2%)" ... 1% per role. */
export function partyText(roles) {
  if (roles === 0) {
    return NO_PARTY_TEXT;
  }
  return `${roles} unique ${roles === 1 ? 'role' : 'roles'} (${roles}%)`;
}

/* The lists of the Clan and Party bonus boxes: {
     noClanText                                 the Clan list's first entry (NO_CLAN_TEXT),
     groups: [{race, clans: [clan name, ...]}]  the Clan list under it, a heading per race,
     noClanText: NO_CLAN_TEXT, the first entry of the Clan list,
     parties: [{roles, text}]                   the Party bonus entries, 0 to PARTY_ROLES_MAX unique roles,
     clanChoices, partyChoices                  the same two lists as the options of a <gsa-select> ({value, label, group?}: the clan's
                                                name or '' for none, the roles as text),
     clanSizer, partySizer                      every text of a list, one per line: a select is only as wide as the
                                                option it shows, so the template draws a hidden copy of them beside it
                                                and the box keeps one width whatever is chosen }. */
export function bonusOptions() {
  const groups = clanGroups();
  const parties = Array.from({ length: PARTY_ROLES_MAX + 1 }, (_, roles) => ({ roles, text: partyText(roles) }));
  return {
    noClanText: NO_CLAN_TEXT,
    groups,
    parties,
    clanChoices: [
      { value: '', label: NO_CLAN_TEXT },
      ...groups.flatMap(group => group.clans.map(clan => ({ value: clan, label: clan, group: group.race }))),
    ],
    partyChoices: parties.map(party => ({ value: String(party.roles), label: party.text })),
    clanSizer: [NO_CLAN_TEXT, ...groups.flatMap(group => group.clans)].join('\n'),
    partySizer: parties.map(party => party.text).join('\n'),
  };
}
