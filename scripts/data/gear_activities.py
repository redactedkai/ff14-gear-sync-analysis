"""What a player does to get each piece: the boxes of the page's "Gear from" filter (`activities` in
src/core/item-format.json), from the game files only (no item names).

routes(csv_dir, kept, cats) returns {Item.csv id: [route mask, ...]}. A piece has routes, any one of which gets it; a
route needs every box in its mask (bit i = `activities[i]`). A tradeable piece also gets the route made of the market
board bit alone (bit len(activities)), so the page's market board switch shows it whatever its source. A piece with no
route (retired, can no longer be obtained) is never listed.

How a route is found (docs/engineering/data-pipeline.md, "Gear from"):
- a tomestone named by item id is Poetics (slot 1 of TomestonesItem), a current one (slots 2 to 4; 4 is last patch's,
  still exchanged) or retired (slot 0);
- an item's ways to get it: a recipe (Crafting), a gil shop (Vendor), a Grand Company seal shop, a quest reward
  (Quest.Reward / OptionalItemReward, QuestClassJobReward), an achievement reward, a seasonal event gil shop
  (GilShop.FestivalId), or a SpecialShop listing, which needs everything it costs;
- a listing's cost is a currency or a piece traded in, resolved the same way, recursively; every way to pay each cost
  is kept (two costs with two ways each give four routes). Costs below 8 are currency codes read through the shop's
  UseCurrencyType: code 1 is Poetics, codes 2 and 3 the current tomestones, code 4 of type 4 a gatherers' scrip;
- a gil listing with a quest or achievement requirement is a Calamity Salvager rebuy, not a way in: the piece was
  earned first, and the requirement says how (its quest, or its achievement when that achievement gives the piece);
- tomestone codes name "the Nth current tomestone", so a retired shop decodes to today's tomestone. For codes 2 and 3
  only the gear at the highest item level sold for that code is live; older listings for the same code are retired.
  Retired Poetics shops (code 1) are listed in RETIRED_SHOPS;
- relic weapons (category relic) are their own activity, whatever their quest or tomestone route (owner's ruling);
- an item with no way in: a kept piece takes the activity of its category (a drop: dungeon, raid ...), except in the
  categories where every obtainable piece has a source (MUST_HAVE_SOURCE): there an untradeable piece is retired. A
  currency with no way in takes the activity of the gear it buys most (trial totems: Extreme trials);
- CURRENCIES places the currencies the game files cannot (checked on the Console Games Wiki), keyed by item id with the
  expected name, so a patch that reuses an id stops the run.

Activities map to boxes in ACTIVITY_BOX. Savage and Extreme split at the level cap (the highest equip level of the kept
gear): Current at the cap, Legacy below it, since content below the cap can be farmed unsynced. An activity with no box
stops the run.
"""

from collections import Counter, defaultdict
from pathlib import Path

from gear_sources import CODE_LIMIT, shop_listings
from item_format import ACCESSORY_TYPES, SchemaError, check_bools, check_ids, load_format, read_csv, read_item_sheet, slot_codes

GIL, WOLF_MARK, MGP = 1, 25, 29
FIXED_ITEMS = {GIL: 'Gil', WOLF_MARK: 'Wolf Mark', MGP: 'MGP'}  # item id -> expected name; their activities in activities_of

# Currencies the game files cannot place: item id -> (expected name, routes). A route is a set of activities; no route
# means retired. Checked on the Console Games Wiki (docs/engineering/data-pipeline.md, "Gear from").
CURRENCIES = {
    10307: ('Centurio Seal', [{'Hunts'}]),
    26533: ('Sack of Nuts', [{'Hunts'}]),
    27: ('Allied Seal', [{'Hunts'}]),
    12236: ('Amber-encased Vilekin', [{'Levequests'}]),
    43547: ('Light-heavy Holoblade', [{'Savage'}]),
    43548: ('Universal Tomestone', [{'Savage'}]),
    46728: ('Universal Tomestone 2.0', [{'Savage'}]),
    49756: ('Universal Tomestone 3.0', [{'Savage'}]),
    # from Variant dungeon rewards or Criterion (Savage) manuscripts; neither can be run with an Unrestricted Party
    41699: ('Elevated Ester', [{'Variant & Criterion'}]),
    12995: ('Silver Chocobo Feather', [{'Promotional'}]),
    35831: ('Discal Tomestone', []),
    33329: ('Irregular Tomestone of Pageantry', []),
    49122: ('Irregular Tomestone of Aphorism', []),
    51750: ('Irregular Tomestone of Astronomy I', []),
    51751: ('Irregular Tomestone of Astronomy II', []),
    23381: ('Rising Token MMXVIII', []),
    9387: ('Antique Helm', [{'Dungeon'}]),
    9388: ('Antique Mail', [{'Dungeon'}]),
    9389: ('Antique Gauntlets', [{'Dungeon'}]),
    9390: ('Antique Breeches', [{'Dungeon'}]),
    9391: ('Antique Sollerets', [{'Dungeon'}]),
    30227: ('High Legatus Idol', [{'Extreme trial'}]),
    47101: ('Guardian Arkveld Certificate', [{'Extreme trial'}]),
    44868: ('Clouddark Demimateria I', [{'Chaotic alliance raid'}]),
    24815: ('Cryptic Seal', [{'High-end field op'}]),
    24816: ('Damascene Cloth', [{'High-end field op'}]),
    32186: ("Orderly Runner's Secrets (Head Gear)", [{'High-end field op'}]),
    32187: ("Orderly Runner's Secrets (Body Gear)", [{'High-end field op'}]),
    32188: ("Orderly Runner's Secrets (Hand Gear)", [{'High-end field op'}]),
    32189: ("Orderly Runner's Secrets (Leg Gear)", [{'High-end field op'}]),
    32190: ("Orderly Runner's Secrets (Foot Gear)", [{'High-end field op'}]),
    24988: ('Rakshasa Token', [{'Crafting'}]),
    23210: ('Resistance Token', [{'Crafting'}]),
    28723: ('Eulmoran Certificate of Import', [{'Crafting'}]),
    33440: ('Eulmoran Certificate of Grandeur', [{'Crafting'}]),
    30589: ('Eulmoran Certificate of Novelty', [{'Crafting'}]),
    44822: ('Everkeep Certificate of Grade 1 Import', [{'Crafting'}]),
    46976: ('Everkeep Certificate of Grade 2 Import', [{'Crafting'}]),
    51188: ('Everkeep Certificate of Grade 3 Import', [{'Crafting'}]),
    36794: ('Hannish Certificate of Grade 1 Import', [{'Crafting'}]),
    39088: ('Hannish Certificate of Grade 2 Import', [{'Crafting'}]),
    40896: ('Hannish Certificate of Grade 3 Import', [{'Crafting'}]),
}
# Retired Poetics shops (code 1): replaced by newer exchanges, and opened by nothing in the world (an NPC-to-shop trace
# over ENpcBase, menus and scripts; the item-level rule below covers codes 2 and 3 only). Shop id -> expected name.
RETIRED_SHOPS = {
    1769802: 'Lost Allagan Gear Exchange',
    1769983: 'Deepshadow Gear Exchange',  # the same pieces now sell for Sacks of Nuts (Deepshadow Gear Exchange, IL 470)
    1770304: 'Shire Gear Augmentation (IL 270 DoW)',
    1770305: 'Shire Gear Augmentation (IL 270 DoM)',
    1770306: 'Scaevan Gear Augmentation (IL 400 DoW)',
    1770307: 'Scaevan Gear Augmentation (IL 400 DoM)',
}
# Single pieces whose source is in a sheet this module does not read: item id -> (expected name, activity)
KNOWN_SOURCE = {44410: ("Neophyte's Ring", 'Quest')}  # the Hall of the Novice final reward

# A kept piece with no way in: the activity of its category (a drop). Artifact class rings drop in dungeons.
DROP_ACTIVITY = {
    'dungeon': 'Dungeon',
    'trial': 'Trial',
    'raid': 'Normal raid',
    'alliance_raid': 'Alliance raid',
    'savage': 'Savage',
    'ultimate': 'Ultimate',
    'deep_dungeon': 'Deep dungeon',
    'field_op': 'Field op',
    'relic': 'Relic',
    'pvp': 'PvP',
    'gold_saucer': 'Gold Saucer',
    'wondrous_tails': 'Wondrous Tails',
    'fate': 'FATE',
    'venture': 'Venture',
    'quest': 'Quest',
    'achievement': 'Achievement',
    'grand_company': 'Grand Company',
    'tomestone': 'Tomestones',
    'crafted': 'Crafting',
    'gil_vendor': 'Vendor',
    'seasonal_event': 'Event',
    'collaboration': 'Event',
    'promotional': 'Promotional',
    'artifact': 'Quest',
}
# A currency with no way in, by the category of the gear it buys, where that differs from DROP_ACTIVITY
CURRENCY_FROM_CATEGORY = {'trial': 'Extreme trial'}  # trial totems drop in Extreme trials
# Categories where every obtainable piece has a shop, quest or recipe source: an untradeable piece with none is retired
MUST_HAVE_SOURCE = {
    'tomestone',
    'artifact',
    'crafted',
    'gil_vendor',
    'gold_saucer',
    'grand_company',
    'pvp',
    'quest',
    'achievement',
    'savage',
    'ultimate',
    'deep_dungeon',
    'seasonal_event',
}

# Activity -> box key (`activities` in item-format.json). Vendor is untradeable gil-vendor gear (a tradeable piece
# already has the market board route); Savage and Extreme are split at the level cap in box_of().
ACTIVITY_BOX = {
    'Quest': 'quests',
    'Achievement': 'quests',
    'Crafting': 'crafted',
    'Levequests': 'crafted',
    'Dungeon': 'normal_duties',
    'Trial': 'normal_duties',
    'Normal raid': 'normal_duties',
    'Alliance raid': 'normal_duties',
    'Poetics': 'tomes_legacy',
    'Tomestones': 'tomes_current',
    'Grand Company': 'grand_company',
    'Hunts': 'hunts',
    'Vendor': 'misc',
    'Venture': 'misc',
    'FATE': 'misc',
    'Deep dungeon': 'deep_dungeons',
    'Gold Saucer': 'gold_saucer',
    'Field op': 'relics',
    'Relic': 'relics',
    'Wondrous Tails': 'wondrous_tails',
    'Variant & Criterion': 'variant',
    'PvP': 'pvp',
    'Extreme trial': 'extreme',
    'Chaotic alliance raid': 'extreme',
    'High-end field op': 'extreme',
    'Savage': 'savage',
    'Ultimate': 'ultimate',
    'Event': 'events',
    'Promotional': 'events',
}
SPLIT_AT_CAP = {'savage', 'extreme'}  # -> <key>_current at the level cap, <key>_legacy below it
RETIRED = 'Retired'  # an activity that cannot be done any more; a route needing it is dropped
MAX_DEPTH = 8  # trade-in chains (piece -> upgraded piece -> ...) are shorter; stops cycles
TOME_TYPES = {'2', '4'}  # UseCurrencyType whose codes 1-3 are tomestones (1 Poetics, 2 and 3 the current ones)
GATHERER_SCRIP = ('4', 4)  # (UseCurrencyType, code): a gatherers' scrip, not a tomestone
CURRENT_TOME_CODES = {2, 3}


def box_bits():
    """{box key: bit} from `activities` in item-format.json, and the market board bit (the next one)."""
    keys = [a['key'] for a in load_format()['activities']]
    return {k: 1 << i for i, k in enumerate(keys)}, 1 << len(keys)


def check_names(names, table, what, table_name):
    """Raises SchemaError when an id of `table` ({id: (expected name, ...)}) names another item in Item.csv. The message
    names `table_name`, the table in this file to update."""
    expected = {i: entry[0] for i, entry in table.items()}
    check_ids(names, expected, 'Item.csv', what, f'{table_name} (scripts/data/gear_activities.py)')


def is_id(value):
    """True for a cell that names a row: a whole number other than 0."""
    return value.isdigit() and int(value) != 0


def reward_ways(csv_path, ways):
    """Adds the rewards and recipes to `ways` ({item id: [way]}, see ways_in): quest rewards (Quest.Reward,
    OptionalItemReward, QuestClassJobReward), achievement rewards, recipe results and Grand Company seal shop items.
    Returns (festival_quests, achievement_item) for the gil shops: the ids of seasonal event quests, and {achievement
    id: the item it gives}."""
    reward_cols = [*(f'Reward[{j}]' for j in range(7)), *(f'OptionalItemReward[{j}]' for j in range(5))]
    quests = read_csv(csv_path / 'Quest.csv', ['#', 'Festival', *reward_cols])
    for quest in quests:
        for col in reward_cols:
            if is_id(quest[col]):
                ways[int(quest[col])].append(('activity', 'Quest'))
    job_reward_cols = [f'RewardItem[{j}]' for j in range(4)]
    for row in read_csv(csv_path / 'QuestClassJobReward.csv', job_reward_cols):
        for col in job_reward_cols:
            if is_id(row[col]):
                ways[int(row[col])].append(('activity', 'Quest'))
    achievements = read_csv(csv_path / 'Achievement.csv', ['#', 'Item'])
    for achievement in achievements:
        if is_id(achievement['Item']):
            ways[int(achievement['Item'])].append(('activity', 'Achievement'))
    for sheet, col, activity in (('Recipe', 'ItemResult', 'Crafting'), ('GCScripShopItem', 'Item', 'Grand Company')):
        for row in read_csv(csv_path / f'{sheet}.csv', [col]):
            if is_id(row[col]):
                ways[int(row[col])].append(('activity', activity))
    festival_quests = {int(q['#']) for q in quests if q['Festival'] not in ('', '0')}
    achievement_item = {int(a['#']): int(a['Item']) for a in achievements if a['Item'].isdigit()}
    return festival_quests, achievement_item


def gil_shop_ways(csv_path, ways, rebuys, festival_quests, achievement_item):
    """Adds the gil shop listings to `ways`: a seasonal event shop's listing is Event; a listing that needs a quest or
    an achievement is a Calamity Salvager rebuy (added to `rebuys`), whose way is the quest (Event for a seasonal event
    quest) or the achievement when that achievement gives the piece; any other listing is Vendor."""
    festival_shops = {int(r['#']) for r in read_csv(csv_path / 'GilShop.csv', ['#', 'FestivalId']) if r['FestivalId'] not in ('', '0')}
    quest_cols = ('QuestRequired[0]', 'QuestRequired[1]')
    for row in read_csv(csv_path / 'GilShopItem.csv', ['#', 'Item', *quest_cols, 'AchievementRequired']):
        if not is_id(row['Item']):
            continue
        got, shop = int(row['Item']), int(float(row['#']))  # '#' is "shop.listing"
        quests_needed = [int(row[col]) for col in quest_cols if row[col] not in ('', '0')]
        achievement = int(row['AchievementRequired'] or 0)
        if shop in festival_shops:
            ways[got].append(('activity', 'Event'))
        elif quests_needed or achievement:
            rebuys.add(got)
            for quest in quests_needed:
                ways[got].append(('activity', 'Event' if quest in festival_quests else 'Quest'))
            if achievement and achievement_item.get(achievement) == got:
                ways[got].append(('activity', 'Achievement'))
        else:
            ways[got].append(('activity', 'Vendor'))


def tome_code(shop, cost):
    """The tomestone code of a cost below CODE_LIMIT in `shop` (read through its UseCurrencyType: 1 Poetics, 2 and 3
    the current tomestones), or None when it is not a tomestone (a scrip)."""
    currency_type = shop['UseCurrencyType']
    if (currency_type, cost) == GATHERER_SCRIP:
        return None
    return cost if currency_type in TOME_TYPES or (currency_type == '16' and cost == 1) else None


def live_tome_ilvls(listings, kept_ids, ilvl_of):
    """{current tomestone code: the highest item level of kept gear sold for it}: the live gear of each code. A code
    names "the nth current tomestone", so a listing for it at a lower item level is a retired shop's."""
    newest = {}
    for shop, _k, given, costs in listings:
        for cost in costs:
            code = tome_code(shop, cost) if cost < CODE_LIMIT else None
            if code in CURRENT_TOME_CODES:
                for item in given:
                    if item in kept_ids:
                        newest[code] = max(newest.get(code, 0), ilvl_of[item])
    return newest


def listing_costs(shop, given, costs, newest, kept_ids, ilvl_of):
    """(resolved costs, retired) of a SpecialShop listing: each cost as ('item', id) or ('activity', name) (gil:
    Vendor; tomestone codes: Poetics or Tomestones; other codes: Scrips), and True when the listing sells current
    tomestone gear below that code's live item level (newest, from live_tome_ilvls)."""
    resolved, retired = [], False
    for cost in costs:
        if cost >= CODE_LIMIT:
            resolved.append(('item', cost))
            continue
        if shop['UseCurrencyType'] == '8':
            resolved.append(('activity', 'Vendor'))
            continue
        code = tome_code(shop, cost)
        if code is None:
            resolved.append(('activity', 'Scrips'))
        elif code == 1:
            resolved.append(('activity', 'Poetics'))
        else:
            resolved.append(('activity', 'Tomestones'))
            gear_given = [item for item in given if item in kept_ids]
            retired = retired or bool(gear_given) and all(ilvl_of[item] < newest.get(code, 0) for item in gear_given)
    return resolved, retired


def listing_gate(shop, k):
    """'quest' when listing k of `shop` (or the whole shop) needs a quest first, 'achievement' when it needs an
    achievement, else None."""
    if shop[f'Item[{k}].Quest'] not in ('', '0') or shop['Quest'] not in ('', '0'):
        return 'quest'
    return 'achievement' if shop[f'Item[{k}].AchievementUnlock'] not in ('', '0') else None


def special_shop_ways(csv_path, ways, kept_ids, ilvl_of):
    """Adds the SpecialShop listings to `ways` as ('shop', costs, gate) (see ways_in), leaving out the RETIRED_SHOPS
    and the retired tomestone listings (listing_costs). Raises SchemaError when a RETIRED_SHOPS id names another shop."""
    shops = read_csv(csv_path / 'SpecialShop.csv', ['#', 'Name', 'UseCurrencyType', 'Quest'])
    shop_names = {int(s['#']): s['Name'] for s in shops}
    check_ids(shop_names, RETIRED_SHOPS, 'SpecialShop.csv', 'retired shop', 'RETIRED_SHOPS (scripts/data/gear_activities.py)')
    shops = [s for s in shops if int(s['#']) not in RETIRED_SHOPS]
    listings = [listing for listing in shop_listings(shops) if listing[2]]  # (shop row, listing index, given, costs)
    newest = live_tome_ilvls(listings, kept_ids, ilvl_of)
    for shop, k, given, costs in listings:
        resolved, retired = listing_costs(shop, given, costs, newest, kept_ids, ilvl_of)
        if retired:
            continue
        for got in given:
            ways[got].append(('shop', tuple(resolved), listing_gate(shop, k)))


def ways_in(csv_dir, kept_ids, ilvl_of):
    """({item id: [way]}, rebuys) for every item. A way is ('activity', name) or ('shop', costs, gate): costs is a tuple
    of ('activity', name) and ('item', id); gate is 'quest', 'achievement' or None (the listing needs a quest or an
    achievement first). rebuys: the items a Calamity Salvager sells back. ilvl_of: {item id: item level}, for the
    retired tomestone listings."""
    csv_path = Path(csv_dir)
    ways = defaultdict(list)
    rebuys = set()
    festival_quests, achievement_item = reward_ways(csv_path, ways)
    gil_shop_ways(csv_path, ways, rebuys, festival_quests, achievement_item)
    special_shop_ways(csv_path, ways, kept_ids, ilvl_of)
    return ways, rebuys


def single(activity):
    """The routes of something got one way only: one route of one activity."""
    return frozenset({frozenset({activity})})


class RouteFinder:
    """Works out an item's routes (activities_of): frozensets of activities, any one of which gets it.
    ways, rebuys: from ways_in; category: {kept piece id: category}; slot_of: {kept piece id: slot code}; untradable:
    the ids whose IsUntradable is True; tome_slot: {tomestone item id: its TomestonesItem slot}; accessory_slots: slot
    codes of accessories. The routes are memoised per (item, depth), since trade-in chains share their pieces."""

    def __init__(self, ways, rebuys, category, slot_of, untradable, tome_slot, accessory_slots):
        self.ways, self.rebuys, self.category, self.slot_of = ways, rebuys, category, slot_of
        self.untradable, self.tome_slot, self.accessory_slots = untradable, tome_slot, accessory_slots
        self.currency_routes = {i: frozenset(frozenset(r) for r in rs) for i, (_, rs) in CURRENCIES.items()}
        self.memo = {}

    def activities_of(self, item, depth=0):
        """The item's routes: a frozenset of frozensets of activities (empty: no way in at all)."""
        if (item, depth) in self.memo:
            return self.memo[(item, depth)]
        if item in self.tome_slot:
            slot = self.tome_slot[item]
            result = single('Poetics' if slot == 1 else RETIRED if slot == 0 else 'Tomestones')
        elif item in FIXED_ITEMS:
            result = single({GIL: 'Vendor', WOLF_MARK: 'PvP', MGP: 'Gold Saucer'}[item])
        elif item in self.currency_routes:
            result = self.currency_routes[item] or single(RETIRED)
        elif self.category.get(item) == 'relic':
            result = single('Relic')
        else:
            result = self.resolve(item, depth)
        self.memo[(item, depth)] = result
        return result

    def resolve(self, item, depth):
        """The routes through the item's ways in: every way to pay all the costs of each way, a gil or free listing
        behind a quest or an achievement counting as that quest or achievement. With no live way in: no_way_in."""
        found = set()
        needs_retired = False  # some way in costs something retired
        for way in self.ways.get(item, ()):
            if way[0] == 'activity':
                found.add(frozenset({way[1]}))
                continue
            if depth >= MAX_DEPTH:
                continue
            _, costs, gate = way
            needs = {frozenset()}  # every way to pay all the costs: one route per cost, combined
            for kind, value in costs:
                options = {frozenset({value})} if kind == 'activity' else self.activities_of(value, depth + 1)
                needs = {have | option for have in needs for option in options}
            for need in needs:
                if RETIRED in need:
                    needs_retired = True
                    continue
                if gate and need <= {'Vendor'}:  # a gil (or free) listing behind a quest or an achievement
                    need = frozenset({'Quest' if gate == 'quest' else 'Achievement'})
                found.add(need or frozenset({'Vendor'}))
        return frozenset(found) if found else self.no_way_in(item, needs_retired)

    def no_way_in(self, item, needs_retired):
        """The routes of an item with no live way in (inferred, docs/engineering/data-pipeline.md, Sources): a kept
        piece takes KNOWN_SOURCE, Dungeon for an artifact accessory, or its category's DROP_ACTIVITY (retired, or Quest
        for a rebuy, in a MUST_HAVE_SOURCE category); a currency whose ways in all cost something retired is retired;
        another currency takes the activity of the gear it buys most."""
        if item in self.category:
            cat = self.category[item]
            if item in KNOWN_SOURCE:
                return single(KNOWN_SOURCE[item][1])
            if cat == 'artifact' and self.slot_of[item] in self.accessory_slots:
                return single('Dungeon')
            if cat in MUST_HAVE_SOURCE:
                if item in self.rebuys:  # earned through a quest or coffer these sheets do not hold
                    return single('Quest')
                if item in self.untradable:
                    return single(RETIRED)
            return single(DROP_ACTIVITY[cat])
        if needs_retired:
            return single(RETIRED)
        cat = self.buys_most(item)
        return single(CURRENCY_FROM_CATEGORY.get(cat, DROP_ACTIVITY[cat])) if cat else frozenset()

    def buys_most(self, currency):
        """The category of the kept gear a currency buys most, or None (a tie goes to the first category counted)."""
        count = Counter(
            self.category[got]
            for got, ways in self.ways.items()
            if got in self.category
            for way in ways
            if way[0] == 'shop' and ('item', currency) in way[1]
        )
        return count.most_common(1)[0][0] if count else None


class Boxes:
    """Turns routes into the page's box masks (`activities` in item-format.json). level_of: {kept piece id: equip
    level}, whose highest is the level cap where Savage and Extreme split; tradeable: the ids whose IsUntradable is
    False; names: {item id: name}, for the error message."""

    def __init__(self, level_of, tradeable, names):
        self.bits, self.market = box_bits()
        self.level_of, self.tradeable, self.names = level_of, tradeable, names
        self.cap = max(level_of.values()) if level_of else 0

    def bit(self, activity, item):
        """The box bit of one activity of a kept piece. Raises SchemaError on an activity with no box."""
        if activity == 'Vendor' and item in self.tradeable:
            return self.market  # tradeable gil-vendor gear: the market board switch decides
        key = ACTIVITY_BOX.get(activity)
        if key is None:
            raise SchemaError(
                f'gear_activities.py: activity {activity!r} (item {item} {self.names.get(item)!r}) has no box. Map it to a box in '
                'ACTIVITY_BOX (scripts/data/gear_activities.py); for a new box, also add it to `activities` in '
                'src/core/item-format.json.'
            )
        if key in SPLIT_AT_CAP:
            key += '_current' if self.level_of[item] == self.cap else '_legacy'
        return self.bits[key]

    def masks(self, item, routes):
        """The sorted route masks of a kept piece: one per route that needs nothing retired, the market board bit alone
        when it is tradeable, and none that needs more than another one (it would add nothing)."""
        masks = set()
        for route in routes:
            if RETIRED in route:
                continue
            mask = 0
            for activity in route:
                mask |= self.bit(activity, item)
            masks.add(mask)
        if item in self.tradeable:
            masks.add(self.market)
        return sorted(m for m in masks if not any(o != m and o & m == o for o in masks))


def routes(csv_dir, kept, cats, items=None):
    """{Item.csv id (str): sorted list of route masks} for the kept gear (gen_items.select, LEFT_OUT categories
    removed). cats: {Item.csv id (str): category} (gear_categories.categorize). items: the Item.csv rows
    (read_item_sheet), read here when None. Raises SchemaError on an activity with no box, an override id that names
    another item, or a kept piece whose category has no drop activity."""
    csv_path = Path(csv_dir)

    # the sheets, and the hand-kept tables checked against them
    items = {int(r['#']): r for r in read_item_sheet(csv_dir, items)}
    check_bools(items.values(), ['IsUntradable'], 'Item.csv')
    names = {i: r['Name'] for i, r in items.items()}
    check_names(names, CURRENCIES, 'currency', 'CURRENCIES')
    check_names(names, KNOWN_SOURCE, 'known source', 'KNOWN_SOURCE')
    check_names(names, {i: (name,) for i, name in FIXED_ITEMS.items() if i != GIL}, 'fixed currency', 'FIXED_ITEMS')
    category = {int(r['#']): cats[r['#']] for r, _ in kept}
    missing = sorted({c for c in category.values() if c not in DROP_ACTIVITY})
    if missing:
        raise SchemaError(
            f'gear_activities.py: no drop activity for categories {missing}. Add each to DROP_ACTIVITY in '
            'scripts/data/gear_activities.py: the activity a piece of that category with no source in the game files takes.'
        )
    # tomestone item -> its slot: 1 Poetics, 2 and 3 the current ones, 4 last patch's (still exchanged), 0 retired
    tome_rows = read_csv(csv_path / 'TomestonesItem.csv', ['Item', 'Tomestones'])
    tome_slot = {int(r['Item']): int(r['Tomestones']) for r in tome_rows if r['Item'] != '0'}

    # every item's ways in, then each kept piece's routes
    ilvl_of = {i: int(r['LevelItem']) for i, r in items.items() if r['LevelItem'].isdigit()}
    ways, rebuys = ways_in(csv_dir, set(category), ilvl_of)
    untradable = {i for i, r in items.items() if r['IsUntradable'] == 'True'}
    slot_of = {int(r['#']): piece['slotCode'] for r, piece in kept}
    accessory_slots = slot_codes(load_format(), ACCESSORY_TYPES)
    finder = RouteFinder(ways, rebuys, category, slot_of, untradable, tome_slot, accessory_slots)

    # the routes as box masks
    tradeable = {i for i, r in items.items() if r['IsUntradable'] == 'False'}
    boxes = Boxes({int(r['#']): piece['equipLevel'] for r, piece in kept}, tradeable, names)
    return {str(item): boxes.masks(item, finder.activities_of(item)) for item in category}


TOME_NAME_PREFIX = 'Allagan Tomestone of '


def current_tome_names(csv_dir, items=None):
    """The short names of the current tomestones (TomestonesItem slots 2 and 3, in that order), e.g. ['Mathematics',
    'Mnemonics']. items: the Item.csv rows (read_item_sheet), read here when None. Raises SchemaError when a slot is
    empty."""
    d = Path(csv_dir)
    names = {r['#']: r['Name'] for r in read_item_sheet(csv_dir, items)}
    slot_item = {int(r['Tomestones']): r['Item'] for r in read_csv(d / 'TomestonesItem.csv', ['Item', 'Tomestones'])}
    missing = [c for c in sorted(CURRENT_TOME_CODES) if slot_item.get(c, '0') == '0']
    if missing:
        raise SchemaError(f'TomestonesItem.csv: no tomestone in slot(s) {missing}')
    return [names[slot_item[c]].removeprefix(TOME_NAME_PREFIX) for c in sorted(CURRENT_TOME_CODES)]


FILES = ['Quest', 'QuestClassJobReward', 'Achievement', 'GCScripShopItem', 'GilShop', 'GilShopItem']  # for fetch.py
