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

from gear_sources import CODE_LIMIT, listing_count
from item_format import SchemaError, check_bools, load_format, read_csv

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
ACCESSORY_SLOTS = {8, 9, 10, 11}  # database slot codes: ear, neck, wrist, ring

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
    wrong = [f'{i} is {names.get(i)!r}, expected {v[0]!r}' for i, v in table.items() if names.get(i) != v[0]]
    if wrong:
        hint = f'A patch reused the ids: find each item by name in Item.csv and update its id in {table_name}'
        hint += ' (scripts/data/gear_activities.py).'
        raise SchemaError(f'Item.csv: {what} ids changed: ' + '; '.join(wrong) + '. ' + hint)


def ways_in(csv_dir, kept_ids, ilvl_of):
    """({item id: [way]}, rebuys) for every item. A way is ('activity', name) or ('shop', costs, gate): costs is a tuple
    of ('activity', name) and ('item', id); gate is 'quest', 'achievement' or None (the listing needs a quest or an
    achievement first). rebuys: the items a Calamity Salvager sells back. ilvl_of: {item id: item level}, for the
    retired tomestone listings."""
    d = Path(csv_dir)
    out = defaultdict(list)
    rebuys = set()

    # rewards and recipes
    quests = read_csv(
        d / 'Quest.csv', ['#', 'Festival', *(f'Reward[{j}]' for j in range(7)), *(f'OptionalItemReward[{j}]' for j in range(5))]
    )
    for q in quests:
        for col in [*(f'Reward[{j}]' for j in range(7)), *(f'OptionalItemReward[{j}]' for j in range(5))]:
            if q[col].isdigit() and int(q[col]):
                out[int(q[col])].append(('activity', 'Quest'))
    for r in read_csv(d / 'QuestClassJobReward.csv', [f'RewardItem[{j}]' for j in range(4)]):
        for j in range(4):
            v = r[f'RewardItem[{j}]']
            if v.isdigit() and int(v):
                out[int(v)].append(('activity', 'Quest'))
    achievements = read_csv(d / 'Achievement.csv', ['#', 'Item'])
    for a in achievements:
        if a['Item'].isdigit() and int(a['Item']):
            out[int(a['Item'])].append(('activity', 'Achievement'))
    for r in read_csv(d / 'Recipe.csv', ['ItemResult']):
        if r['ItemResult'].isdigit() and int(r['ItemResult']):
            out[int(r['ItemResult'])].append(('activity', 'Crafting'))
    for r in read_csv(d / 'GCScripShopItem.csv', ['Item']):
        if r['Item'].isdigit() and int(r['Item']):
            out[int(r['Item'])].append(('activity', 'Grand Company'))

    # gil shops: seasonal event shops, Calamity Salvager rebuys (a listing with a requirement), plain vendors
    festival_quest = {int(q['#']) for q in quests if q['Festival'] not in ('', '0')}
    achievement_item = {int(a['#']): int(a['Item']) for a in achievements if a['Item'].isdigit()}
    festival_shops = {int(r['#']) for r in read_csv(d / 'GilShop.csv', ['#', 'FestivalId']) if r['FestivalId'] not in ('', '0')}
    for r in read_csv(d / 'GilShopItem.csv', ['#', 'Item', 'QuestRequired[0]', 'QuestRequired[1]', 'AchievementRequired']):
        if not (r['Item'].isdigit() and int(r['Item'])):
            continue
        got, shop = int(r['Item']), int(float(r['#']))  # '#' is "shop.listing"
        quests_needed = [int(r[c]) for c in ('QuestRequired[0]', 'QuestRequired[1]') if r[c] not in ('', '0')]
        achievement = int(r['AchievementRequired'] or 0)
        if shop in festival_shops:
            out[got].append(('activity', 'Event'))
        elif quests_needed or achievement:
            rebuys.add(got)
            for q in quests_needed:
                out[got].append(('activity', 'Event' if q in festival_quest else 'Quest'))
            if achievement and achievement_item.get(achievement) == got:
                out[got].append(('activity', 'Achievement'))
        else:
            out[got].append(('activity', 'Vendor'))

    # SpecialShop listings
    shops = read_csv(d / 'SpecialShop.csv', ['#', 'Name', 'UseCurrencyType', 'Quest'])
    shop_names = {int(s['#']): s['Name'] for s in shops}
    wrong = [f'{i} is {shop_names.get(i)!r}, expected {n!r}' for i, n in RETIRED_SHOPS.items() if shop_names.get(i) != n]
    if wrong:
        hint = (
            'A patch reused the ids: find each shop by name in SpecialShop.csv and update RETIRED_SHOPS (scripts/data/gear_activities.py).'
        )
        raise SchemaError('SpecialShop.csv: retired shop ids changed: ' + '; '.join(wrong) + '. ' + hint)
    shops = [s for s in shops if int(s['#']) not in RETIRED_SHOPS]
    n = listing_count(shops[0].keys()) if shops else 0
    listings = []  # (shop row, listing index, given, costs)
    for s in shops:
        for k in range(n):
            given = [g for j in range(2) if (g := int(s[f'Item[{k}].Item[{j}]']))]
            if given:
                costs = [c for j in range(3) if (c := int(s[f'Item[{k}].ItemCost[{j}]']))]
                listings.append((s, k, given, costs))

    def tome_code(s, c):
        """The tomestone code of a cost below CODE_LIMIT, or None when it is not a tomestone."""
        t = s['UseCurrencyType']
        if (t, c) == GATHERER_SCRIP:
            return None
        return c if t in TOME_TYPES or (t == '16' and c == 1) else None

    # the live gear for each current-tomestone code: the highest item level sold for it
    newest = {}
    for s, _listing, given, costs in listings:
        for c in costs:
            code = tome_code(s, c) if c < CODE_LIMIT else None
            if code in CURRENT_TOME_CODES:
                for g in given:
                    if g in kept_ids:
                        newest[code] = max(newest.get(code, 0), ilvl_of[g])

    for s, k, given, costs in listings:
        resolved = []
        retired = False
        for c in costs:
            if c >= CODE_LIMIT:
                resolved.append(('item', c))
                continue
            if s['UseCurrencyType'] == '8':
                resolved.append(('activity', 'Vendor'))
                continue
            code = tome_code(s, c)
            if code is None:
                resolved.append(('activity', 'Scrips'))
            elif code == 1:
                resolved.append(('activity', 'Poetics'))
            else:
                resolved.append(('activity', 'Tomestones'))
                gear_given = [g for g in given if g in kept_ids]
                retired = retired or bool(gear_given) and all(ilvl_of[g] < newest.get(code, 0) for g in gear_given)
        if retired:
            continue
        gate = (
            'quest'
            if s[f'Item[{k}].Quest'] not in ('', '0') or s['Quest'] not in ('', '0')
            else ('achievement' if s[f'Item[{k}].AchievementUnlock'] not in ('', '0') else None)
        )
        for got in given:
            out[got].append(('shop', tuple(resolved), gate))
    return out, rebuys


def routes(csv_dir, kept, cats):
    """{Item.csv id (str): sorted list of route masks} for the kept gear (gen_items.select, LEFT_OUT categories
    removed). cats: {Item.csv id (str): category} (gear_categories.categorize). Raises SchemaError on an activity with
    no box, an override id that names another item, or a kept piece whose category has no drop activity."""
    d = Path(csv_dir)
    items = {int(r['#']): r for r in read_csv(d / 'Item.csv', ['#', 'Name', 'IsUntradable', 'LevelItem'])}
    check_bools(items.values(), ['IsUntradable'], 'Item.csv')
    names = {i: r['Name'] for i, r in items.items()}
    check_names(names, CURRENCIES, 'currency', 'CURRENCIES')
    check_names(names, KNOWN_SOURCE, 'known source', 'KNOWN_SOURCE')
    check_names(names, {i: (n,) for i, n in FIXED_ITEMS.items() if i != GIL}, 'fixed currency', 'FIXED_ITEMS')
    category = {int(r['#']): cats[r['#']] for r, _ in kept}
    slot_of = {int(r['#']): piece['slotCode'] for r, piece in kept}
    level_of = {int(r['#']): piece['equipLevel'] for r, piece in kept}
    ilvl_of = {i: int(r['LevelItem']) for i, r in items.items() if r['LevelItem'].isdigit()}
    missing = sorted({c for c in category.values() if c not in DROP_ACTIVITY})
    if missing:
        raise SchemaError(
            f'gear_activities.py: no drop activity for categories {missing}. Add each to DROP_ACTIVITY in '
            'scripts/data/gear_activities.py: the activity a piece of that category with no source in the game files takes.'
        )
    # tomestone item -> its slot: 1 Poetics, 2 and 3 the current ones, 4 last patch's (still exchanged), 0 retired
    tome_slot = {
        int(r['Item']): int(r['Tomestones']) for r in read_csv(d / 'TomestonesItem.csv', ['Item', 'Tomestones']) if r['Item'] != '0'
    }
    ways, rebuys = ways_in(csv_dir, set(category), ilvl_of)
    currency_routes = {i: frozenset(frozenset(r) for r in rs) for i, (_, rs) in CURRENCIES.items()}

    def single(activity):
        return frozenset({frozenset({activity})})

    def buys_most(currency):
        """The category of the kept gear a currency buys most, or None."""
        count = Counter(
            category[got] for got, ws in ways.items() if got in category for w in ws if w[0] == 'shop' and ('item', currency) in w[1]
        )
        return count.most_common(1)[0][0] if count else None

    memo = {}

    def activities_of(item, depth=0):
        """The item's routes: a frozenset of frozensets of activities (empty: no way in at all)."""
        if (item, depth) in memo:
            return memo[(item, depth)]
        if item in tome_slot:
            slot = tome_slot[item]
            result = single('Poetics' if slot == 1 else RETIRED if slot == 0 else 'Tomestones')
        elif item in FIXED_ITEMS:
            result = single({GIL: 'Vendor', WOLF_MARK: 'PvP', MGP: 'Gold Saucer'}[item])
        elif item in currency_routes:
            result = currency_routes[item] or single(RETIRED)
        elif category.get(item) == 'relic':
            result = single('Relic')
        else:
            result = resolve(item, depth)
        memo[(item, depth)] = result
        return result

    def resolve(item, depth):
        found = set()
        needs_retired = False  # some way in costs something retired
        for way in ways.get(item, ()):
            if way[0] == 'activity':
                found.add(frozenset({way[1]}))
                continue
            if depth >= MAX_DEPTH:
                continue
            _, costs, gate = way
            needs = {frozenset()}  # every way to pay all the costs: one route per cost, combined
            for kind, value in costs:
                options = {frozenset({value})} if kind == 'activity' else activities_of(value, depth + 1)
                needs = {n | o for n in needs for o in options}
            for need in needs:
                if RETIRED in need:
                    needs_retired = True
                    continue
                if gate and need <= {'Vendor'}:  # a gil (or free) listing behind a quest or an achievement
                    need = frozenset({'Quest' if gate == 'quest' else 'Achievement'})
                found.add(need or frozenset({'Vendor'}))
        if found:
            return frozenset(found)
        if item in category:  # a kept piece with no live way in
            cat = category[item]
            if item in KNOWN_SOURCE:
                return single(KNOWN_SOURCE[item][1])
            if cat == 'artifact' and slot_of[item] in ACCESSORY_SLOTS:
                return single('Dungeon')
            if cat in MUST_HAVE_SOURCE:
                if item in rebuys:  # earned through a quest or coffer these sheets do not hold
                    return single('Quest')
                if items[item]['IsUntradable'] == 'True':
                    return single(RETIRED)
            return single(DROP_ACTIVITY[cat])
        if needs_retired:  # a currency whose ways in all cost something retired
            return single(RETIRED)
        cat = buys_most(item)  # a currency with no way in
        return single(CURRENCY_FROM_CATEGORY.get(cat, DROP_ACTIVITY[cat])) if cat else frozenset()

    bits, market = box_bits()
    cap = max(level_of.values()) if level_of else 0

    def box_of(activity, item):
        if activity == 'Vendor' and items[item]['IsUntradable'] == 'False':
            return market  # tradeable gil-vendor gear: the market board switch decides
        key = ACTIVITY_BOX.get(activity)
        if key is None:
            raise SchemaError(
                f'gear_activities.py: activity {activity!r} (item {item} {names.get(item)!r}) has no box. Map it to a box in '
                'ACTIVITY_BOX (scripts/data/gear_activities.py); for a new box, also add it to `activities` in '
                'src/core/item-format.json.'
            )
        if key in SPLIT_AT_CAP:
            key += '_current' if level_of[item] == cap else '_legacy'
        return bits[key]

    out = {}
    for item in category:
        masks = set()
        for route in activities_of(item):
            if RETIRED in route:
                continue
            mask = 0
            for activity in route:
                mask |= box_of(activity, item)
            masks.add(mask)
        if items[item]['IsUntradable'] == 'False':
            masks.add(market)
        # a route that needs more than another one adds nothing
        out[str(item)] = sorted(m for m in masks if not any(o != m and o & m == o for o in masks))
    return out


TOME_NAME_PREFIX = 'Allagan Tomestone of '


def current_tome_names(csv_dir):
    """The short names of the current tomestones (TomestonesItem slots 2 and 3, in that order), e.g. ['Mathematics',
    'Mnemonics']. Raises SchemaError when a slot is empty."""
    d = Path(csv_dir)
    names = {r['#']: r['Name'] for r in read_csv(d / 'Item.csv', ['#', 'Name'])}
    slot_item = {int(r['Tomestones']): r['Item'] for r in read_csv(d / 'TomestonesItem.csv', ['Item', 'Tomestones'])}
    missing = [c for c in sorted(CURRENT_TOME_CODES) if slot_item.get(c, '0') == '0']
    if missing:
        raise SchemaError(f'TomestonesItem.csv: no tomestone in slot(s) {missing}')
    return [names[slot_item[c]].removeprefix(TOME_NAME_PREFIX) for c in sorted(CURRENT_TOME_CODES)]


FILES = ['Quest', 'QuestClassJobReward', 'Achievement', 'GCScripShopItem', 'GilShop', 'GilShopItem']  # for fetch.py
