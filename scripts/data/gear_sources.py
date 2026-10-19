"""Two facts about gear that the gear categories need (gear_categories.py): is it crafted, and is it bought with an
ultimate's totem. Where a piece comes from for the page's "Gear from" filter is gear_activities.py.

flags(csv_dir, items) returns {item id: bit mask} over FLAGS.

- Crafted: the item is the result of a recipe (Recipe.ItemResult).
- Ultimate: a SpecialShop listing sells it for one of the ultimate totems below. The game files do not link a totem to
  its duty; the six older pairs match Teamcraft's data, and the Console Games Wiki says Mad Harlequin's Totem
  drops in Dancing Mad (Ultimate).

Shops do not store every cost as an item id: a cost below CODE_LIMIT is a currency code read through the shop's
UseCurrencyType (tomestones, scrips, gil; gear_activities.py decodes them).
"""

import re
from pathlib import Path

from item_format import SchemaError, read_csv

ULTIMATE_TOTEMS = {
    21197: 'Dreadwyrm Totem',  # The Unending Coil of Bahamut
    23175: 'Ultima Totem',  # The Weapon's Refrain
    28633: 'Colossus Totem',  # The Epic of Alexander
    36810: 'Dragonsong Totem',  # Dragonsong's Reprise
    38951: 'Omega Totem',  # The Omega Protocol
    44743: 'Oracle Totem',  # Futures Rewritten
    52321: "Mad Harlequin's Totem",  # Dancing Mad (the wiki says it drops there)
}
CODE_LIMIT = 8  # costs below this are currency codes, not item ids
FLAGS = {'crafted': 1, 'ultimate': 2}


def listing_count(header):
    """Number of listings per SpecialShop row (Item[0] .. Item[n-1])."""
    ks = [int(m.group(1)) for c in header if (m := re.match(r'Item\[(\d+)\]\.Item\[0\]$', c))]
    if not ks:
        raise SchemaError('SpecialShop.csv has no Item[k].Item[0] columns. Did a game patch rename them?')
    return max(ks) + 1


def flags(csv_dir, items):
    """{item id (int): bit mask over FLAGS}. items: the Item.csv rows (dicts with '#' and 'Name')."""
    d = Path(csv_dir)
    out = {}

    def mark(item, key):
        if item:
            out[item] = out.get(item, 0) | FLAGS[key]

    for r in read_csv(d / 'Recipe.csv', ['ItemResult']):
        mark(int(r['ItemResult']), 'crafted')

    names = {int(r['#']): r['Name'] for r in items}
    wrong = [f'{i} is {names.get(i)!r}, expected {n!r}' for i, n in ULTIMATE_TOTEMS.items() if names.get(i) != n]
    if wrong:
        hint = 'A patch reused the ids: find each item by name in Item.csv and update its id in ULTIMATE_TOTEMS'
        hint += ' (scripts/data/gear_sources.py).'
        raise SchemaError('Item.csv: ultimate totem ids changed: ' + '; '.join(wrong) + '. ' + hint)

    shops = read_csv(d / 'SpecialShop.csv', ['UseCurrencyType'])
    n = listing_count(shops[0].keys()) if shops else 0
    for s in shops:
        for k in range(n):
            costs = [int(s[f'Item[{k}].ItemCost[{j}]']) for j in range(3)]
            if any(c in ULTIMATE_TOTEMS for c in costs):
                for j in range(2):
                    mark(int(s[f'Item[{k}].Item[{j}]']), 'ultimate')
    return out


FILES = ['Recipe', 'SpecialShop', 'TomestonesItem']  # the sheets this module and gear_activities.py read, for fetch.py
