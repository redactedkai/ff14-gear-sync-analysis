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

from gear_sources import ULTIMATE_TOTEMS, bits, listing_count
from item_format import SchemaError, load_format, read_csv

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
    shops = read_csv(Path(csv_dir) / 'SpecialShop.csv', ['UseCurrencyType'])
    n = listing_count(shops[0].keys()) if shops else 0
    listings = []
    currencies = set()
    for s in shops:
        shop_costs, sells_seed = set(), False
        for k in range(n):
            given = [g for j in range(2) if (g := s[f'Item[{k}].Item[{j}]']) != '0']
            costs = [c for j in range(3) if int(c := s[f'Item[{k}].ItemCost[{j}]']) >= 8]  # below 8: currency codes
            listings.append((given, costs))
            shop_costs.update(c for c in costs if c not in gear)
            sells_seed = sells_seed or any(g in seed for g in given)
        if sells_seed:
            currencies |= shop_costs
    savage = set(seed)
    for given, costs in listings:
        if any(c in currencies for c in costs):
            savage.update(g for g in given if g in gear)
    return savage, currencies


def override_items(csv_dir, items):
    """{item id: category} from ITEM_OVERRIDES and CURRENCY_OVERRIDES. Raises SchemaError if an id no longer has its
    expected name."""
    names = {int(r['#']): r['Name'] for r in items}
    listed = {**{i: n for i, (n, _) in ITEM_OVERRIDES.items()}, **{i: n for i, (n, _) in CURRENCY_OVERRIDES.items()}}
    wrong = [f'{i} is {names.get(i)!r}, expected {n!r}' for i, n in listed.items() if names.get(i) != n]
    if wrong:
        raise SchemaError('Item.csv: category override ids changed: ' + '; '.join(wrong))
    out = {str(i): c for i, (_, c) in ITEM_OVERRIDES.items()}
    currencies = {str(i): c for i, (_, c) in CURRENCY_OVERRIDES.items()}
    shops = read_csv(Path(csv_dir) / 'SpecialShop.csv', ['UseCurrencyType'])
    n = listing_count(shops[0].keys()) if shops else 0
    for s in shops:
        for k in range(n):
            cat = next((currencies[c] for j in range(3) if (c := s[f'Item[{k}].ItemCost[{j}]']) in currencies), None)
            if cat:
                out.update({g: cat for j in range(2) if (g := s[f'Item[{k}].Item[{j}]']) != '0'})
    return out


def categorize(csv_dir, kept, weapon_slots):
    """{Item.csv id: category} for the kept gear (gen_items.select). weapon_slots: the database slot codes of weapons
    and shields. Raises SchemaError on a code with no known meaning."""
    items = read_csv(Path(csv_dir) / 'Item.csv', ['#', 'Name', 'SubcategorySort', 'DyeCount', 'EquipSlotCategory'])
    gear = {r['#'] for r in items if r['EquipSlotCategory'] not in ('', '0')}
    savage, _ = savage_items(csv_dir, items, gear)
    overrides = override_items(csv_dir, items)
    ultimate = bits()['ultimate']
    unknown = Counter()
    out = {}
    for r, row in kept:
        code = code_of(r)
        cat = CATEGORY_BY_CODE.get(code)
        if cat is None:
            unknown[code] += 1
            continue
        if code == 10 and row[1] not in weapon_slots:
            cat = 'field_op'
        elif code == 20 and r['#'] in savage:
            cat = 'savage'
        elif code in (60, 61) and row[8] & ultimate:  # bought with an ultimate totem
            cat = 'ultimate'
        elif code == 250 and row[3] <= AETHERIAL_MAX_EQUIP:
            cat = 'aetherial'
        out[r['#']] = overrides.get(r['#'], cat)
    if unknown:
        listed = ', '.join(f'{c} ({n} pieces)' for c, n in sorted(unknown.items()))
        raise SchemaError(
            f'Item.csv: SubcategorySort code(s) with no known category: {listed}. See docs/engineering/subcategory-sort-codes.md.'
        )
    return out


ACCESSORY_SLOTS = {8, 9, 10, 11}  # ear, neck, wrist, ring: no dye slots on any gear


def check(kept, cats):
    """Cross-checks between the categories and the shop/recipe flags. Returns a list of problems (empty when fine).
    A Savage armor piece or weapon without a dye slot means a shop that sells Savage gear also took a currency used for
    other gear (for example a Normal-raid token), which the shop-level currency rule would wrongly treat as Savage."""
    b = bits()
    problems = []
    for r, row in kept:
        cat, src = cats[r['#']], row[8]
        if cat == 'savage' and row[1] not in ACCESSORY_SLOTS and r['DyeCount'] in ('', '0'):
            problems.append(f'{r["Name"]}: categorized savage but has no dye slot (a currency shared with other gear?)')
        if src & b['ultimate'] and cat != 'ultimate':
            problems.append(f'{r["Name"]}: bought with an ultimate totem but categorized {cat}')
        if src & b['crafted'] and cat != 'crafted':
            problems.append(f'{r["Name"]}: a recipe result but categorized {cat}')
    return problems


def source_masks(kept, cats):
    """{Item.csv id: source mask} over `sources` of item-format.json (the groups the optimizer can leave out): a group's
    bit is set when the piece's category is one of the group's categories, or when gear_sources.py already flagged it
    (the flags are kept: a tomestone purchase is tomestone gear whatever its code, such as Heavensward artifact armor
    bought with Esoterics). A `currentOnly` group takes only current-expansion pieces: those whose equip level is the
    highest of all kept gear (the level cap), so it moves on by itself when an expansion raises the cap."""
    group, current = {}, {}
    for i, s in enumerate(load_format()['sources']):
        for c in s['categories']:
            if c not in CATEGORIES:
                raise SchemaError(f'item-format.json: source {s["key"]!r} names unknown category {c!r}')
            target = current if s.get('currentOnly') else group
            target[c] = target.get(c, 0) | 1 << i
    cap = max(row[3] for _, row in kept) if kept else 0
    return {r['#']: row[8] | group.get(cats[r['#']], 0) | (current.get(cats[r['#']], 0) if row[3] == cap else 0) for r, row in kept}


def main(csv_dir):
    import gen_items  # here, so importing this module stays cheap
    from item_format import load_format

    kept, *_ = gen_items.select(csv_dir)
    weapon_slots = {s['code'] for s in load_format()['slots'] if s['type'] in ('weapon', 'offhand')}
    cats = categorize(csv_dir, kept, weapon_slots)
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
