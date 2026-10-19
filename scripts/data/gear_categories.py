#!/usr/bin/env python3
"""Sort gear into categories by where it comes from, from the game files only (no item names).

Usage: python scripts/data/gear_categories.py <path-to-ffxiv-datamining>/csv/en   (prints a report)

The main signal is Item.SubcategorySort, an undocumented column: on gear, its last three digits group pieces by source.
Each code's meaning was checked against the Console Games Wiki and the Lodestone (docs/engineering/subcategory-sort-codes.md).
Shop data refines it where the code is not enough:
- ultimate: bought with an ultimate totem (gear_sources.py); these weapons share code 60 with trial gear;
- savage: code 20 (8-player raids) holds Normal and Savage together. From Heavensward on, Savage armor and weapons have
  dye slots and Normal ones do not, so dyeable code-20 gear seeds the Savage set; every shop that sells a seed piece
  shows the Savage currencies (the raid books), and anything bought with them is Savage too (accessories included).
  The Coils have no dye slots and no shops, so their gear stays "raid".
- code 10 holds both relic weapons and Eureka / Occult Crescent armor: weapons and shields are "relic", everything else
  "field_op". Field-zone relic weapons (Eureka, Resistance, Phantom) count as relic.

A code that is not in CATEGORY_BY_CODE stops the run, so a new kind of gear after a patch is noticed rather than
filed under a wrong category.
"""

import argparse
from collections import Counter
from pathlib import Path

from gear_sources import CODE_LIMIT, FLAGS, ULTIMATE_TOTEMS, shop_listings
from item_format import ACCESSORY_TYPES, WEAPON_TYPES, SchemaError, check_ids, load_format, read_csv, read_item_sheet, slot_codes

# SubcategorySort % 1000 -> category, for gear. Verified codes only (docs/engineering/subcategory-sort-codes.md).
CATEGORY_BY_CODE = {
    10: 'relic',  # weapons; non-weapons are field_op (see module docstring)
    11: 'relic',
    12: 'relic',
    13: 'relic',
    20: 'raid',  # savage is split out below
    40: 'alliance_raid',
    60: 'trial',  # ultimate is split out below; also holds the Proto Ultima pieces (Dun Scaith exchange)
    61: 'trial',
    80: 'artifact',
    100: 'tomestone',
    130: 'deep_dungeon',
    140: 'field_op',
    150: 'field_op',
    210: 'grand_company',
    220: 'grand_company',
    230: 'grand_company',
    250: 'diadem',  # equip level 60; at equip level 50 or below the same code is A Realm Reborn's Aetherial gear
    270: 'dungeon',
    300: 'crafted',  # augmented crafted gear (Shadowbringers on)
    310: 'wondrous_tails',
    320: 'crafted',  # also pre-ShB augmented crafted gear, Yama, and Paladin pieces from crafted "Arms" sets
    350: 'fate',
    370: 'field_op',  # Occult Crescent accessories; also one Hall of the Novice ring
    410: 'pvp',  # every piece is sold for Wolf Marks
    430: 'gold_saucer',  # level 50 weapons bought with MGP
    450: 'gil_vendor',
    470: 'crafted',  # Replica Allagan and replica relic weapons (glamour), every one has a recipe
    500: 'achievement',
    510: 'quest',
    520: 'venture',  # retainer venture rewards (Explorer's, Mage's, Thormoen's ...)
    530: 'quest',  # starting gear of jobs that begin above level 1
    830: 'seasonal_event',  # Hatching-tide egg caps
    921: 'collaboration',  # Yo-kai Watch weapons (Legendary Shogunyan Medals)
    922: 'collaboration',
    923: 'collaboration',
    980: 'promotional',
    990: 'legacy',  # 1.0 leftovers (the Dated gear) and other retired rewards; left out of the database
}
# The few pieces whose code says the wrong thing, checked on the Lodestone and the Console Games Wiki. Keyed by item id,
# with the expected name so a patch that reuses an id stops the run (as for the ultimate totems).
# Gear bought with this currency item -> category:
CURRENCY_OVERRIDES = {
    # code 60 (trial), but bought from Slimthix (Idyllshire) with Heat Shielding from the quest "Unidentified Flying
    # Object", part of the Shadow of Mhach alliance raid series: the 21 Proto Ultima pieces
    17521: ('Proto Ultima Heat Shielding', 'alliance_raid'),
}
# Single pieces -> category:
ITEM_OVERRIDES = {
    44410: ("Neophyte's Ring", 'quest'),  # code 370 (Occult Crescent), but the Hall of the Novice final reward
    2752: ('Peregrine Helm', 'venture'),  # code 990 (legacy), but a Quick Exploration venture reward today
}
CATEGORIES = sorted(set(CATEGORY_BY_CODE.values()) | {'savage', 'ultimate', 'field_op', 'aetherial'})
# Gear left out of the database (checked on the Console Games Wiki, docs/engineering/subcategory-sort-codes.md):
# - code 250, whose secondary attributes are random, so the stats in the game files are not what a piece has: the
#   Heavensward Diadem gear (equip level 60, also retired) and A Realm Reborn's Aetherial gear (equip level 50 or below);
# - code 990, gear that can no longer be obtained: 1.0 leftovers and retired achievement and event rewards.
LEFT_OUT = frozenset({'diadem', 'aetherial', 'legacy'})
AETHERIAL_MAX_EQUIP = 50  # code 250 at or below this equip level is Aetherial gear, above it Diadem gear
CODE_DIVISOR = 1000
# a piece's SubcategorySort below 1000 has no job or role prefix; the code is still the last three digits


def code_of(item):
    return int(item['SubcategorySort']) % CODE_DIVISOR


def savage_items(csv_dir, items, gear):
    """Ids of Savage gear: dyeable code-20 gear, plus everything bought with a currency that a shop selling such a
    piece also takes. Returns (ids, currencies)."""
    by_id = {r['#']: r for r in items}
    seed = {i for i in gear if code_of(by_id[i]) == 20 and by_id[i]['DyeCount'] not in ('', '0')}
    listings = []  # (given, costs) as Item.csv ids (text, as in `gear`)
    costs_of_shop, shops_selling_seed = {}, set()  # by shop row id
    for shop, _k, given, costs in shop_listings(read_csv(Path(csv_dir) / 'SpecialShop.csv', ['#', 'UseCurrencyType'])):
        given = [str(g) for g in given]
        costs = [str(c) for c in costs if c >= CODE_LIMIT]  # below CODE_LIMIT: currency codes
        listings.append((given, costs))
        costs_of_shop.setdefault(shop['#'], set()).update(c for c in costs if c not in gear)
        if any(g in seed for g in given):
            shops_selling_seed.add(shop['#'])
    currencies = set().union(*(costs_of_shop[s] for s in shops_selling_seed))
    savage = set(seed)
    for given, costs in listings:
        if any(c in currencies for c in costs):
            savage.update(g for g in given if g in gear)
    return savage, currencies


def override_items(csv_dir, items):
    """{item id: category} from ITEM_OVERRIDES and CURRENCY_OVERRIDES. Raises SchemaError if an id no longer has its
    expected name."""
    names = {int(r['#']): r['Name'] for r in items}
    listed = {i: name for table in (ITEM_OVERRIDES, CURRENCY_OVERRIDES) for i, (name, _) in table.items()}
    where = 'ITEM_OVERRIDES or CURRENCY_OVERRIDES (scripts/data/gear_categories.py)'
    check_ids(names, listed, 'Item.csv', 'category override', where)
    out = {str(i): cat for i, (_, cat) in ITEM_OVERRIDES.items()}
    currencies = {i: cat for i, (_, cat) in CURRENCY_OVERRIDES.items()}
    for _shop, _k, given, costs in shop_listings(read_csv(Path(csv_dir) / 'SpecialShop.csv', ['UseCurrencyType'])):
        cat = next((currencies[c] for c in costs if c in currencies), None)
        if cat:
            out.update({str(g): cat for g in given})
    return out


def categorize(csv_dir, kept, weapon_slots, items=None):
    """{Item.csv id: category} for the kept gear (gen_items.select). weapon_slots: the database slot codes of weapons
    and shields. items: the Item.csv rows (read_item_sheet), read here when None. Raises SchemaError on a code with
    no known meaning."""
    items = read_item_sheet(csv_dir, items)
    gear = {r['#'] for r in items if r['EquipSlotCategory'] not in ('', '0')}
    savage, _ = savage_items(csv_dir, items, gear)
    overrides = override_items(csv_dir, items)
    unknown = Counter()
    out = {}
    for r, piece in kept:
        code = code_of(r)
        cat = CATEGORY_BY_CODE.get(code)
        if cat is None:
            unknown[code] += 1
            continue
        if code == 10 and piece['slotCode'] not in weapon_slots:
            cat = 'field_op'
        elif code == 20 and r['#'] in savage:
            cat = 'savage'
        elif code in (60, 61) and piece['flags'] & FLAGS['ultimate']:  # bought with an ultimate totem
            cat = 'ultimate'
        elif code == 250 and piece['equipLevel'] <= AETHERIAL_MAX_EQUIP:
            cat = 'aetherial'
        out[r['#']] = overrides.get(r['#'], cat)
    if unknown:
        listed = ', '.join(f'{c} ({n} pieces)' for c, n in sorted(unknown.items()))
        raise SchemaError(
            f'Item.csv: SubcategorySort code(s) with no known category: {listed}. See docs/engineering/subcategory-sort-codes.md.'
        )
    return out


def check(kept, cats):
    """Cross-checks between the categories and the shop/recipe flags. Returns a list of problems (empty when fine).
    A Savage armor piece or weapon without a dye slot means a shop that sells Savage gear also took a currency used for
    other gear (for example a Normal-raid token), which the shop-level currency rule would wrongly treat as Savage."""
    problems = []
    accessory_slots = slot_codes(load_format(), ACCESSORY_TYPES)  # no dye slots on any of them
    for r, piece in kept:
        cat, src = cats[r['#']], piece['flags']
        if cat == 'savage' and piece['slotCode'] not in accessory_slots and r['DyeCount'] in ('', '0'):
            problems.append(f'{r["Name"]}: categorized savage but has no dye slot (a currency shared with other gear?)')
        if src & FLAGS['ultimate'] and cat != 'ultimate':
            problems.append(f'{r["Name"]}: bought with an ultimate totem but categorized {cat}')
        if src & FLAGS['crafted'] and cat != 'crafted':
            problems.append(f'{r["Name"]}: a recipe result but categorized {cat}')
    return problems


def main(csv_dir):
    import gen_items  # here, so importing this module stays cheap

    kept, *_ = gen_items.select(csv_dir)
    cats = categorize(csv_dir, kept, slot_codes(load_format(), WEAPON_TYPES))
    problems = check(kept, cats)
    counts = Counter(cats.values())
    print(f'{len(cats)} pieces')
    for cat in CATEGORIES:
        print(f'  {cat:15s} {counts.get(cat, 0):6,d}')
    totems = ', '.join(ULTIMATE_TOTEMS.values())
    print(f'(ultimate = bought with: {totems})')
    if problems:
        raise SchemaError(f'{len(problems)} cross-check problem(s): ' + '; '.join(problems[:10]))


if __name__ == '__main__':
    from item_format import run_main

    ap = argparse.ArgumentParser()
    ap.add_argument('csv_dir')
    run_main(main, ap.parse_args().csv_dir)
