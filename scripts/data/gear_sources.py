"""Where gear comes from, as far as the game files say: crafted, bought with tomestones, or bought with an ultimate's totem.

sources(csv_dir) returns {item id: bit mask}, with the bits named in `sources` of src/core/item-format.json.

- Crafted: the item is the result of a recipe (Recipe.ItemResult).
- Tomestone: a SpecialShop listing sells it for a tomestone. Shops do not store tomestone costs as item ids. A cost
  below 8 is a code read through the shop's UseCurrencyType (as SaintCoinach's SpecialShopListing does):
    4, 2 -> code 1..4 is one of the current tomestones (TomestonesItem rows with Tomestones > 0, in that order); 1 is
            Poetics. SaintCoinach does not decode type 2; the Lodestone shows its code 1 as Poetics (for example
            "Deepshadow Necklace of Healing x1 + Allagan Tomestone of Poetics x100" for the augmented necklace);
    16   -> code 1 is Poetics (2, 4, 6 and 7 are crafter and gatherer scrips);
    8    -> gil.
  A tomestone item id (any TomestonesItem.Item) as a plain cost also counts, and so does a listing that also takes a
  piece of gear in (augmentation and repair exchanges: the result costs tomestones). A piece made by trading in
  tomestone gear (for example Augmented Quetzalli from Quetzalli plus Surgelight Twine) counts too, repeated until
  nothing changes. The other direction does not: a piece taken in is not flagged, because whether a retired, no longer
  sold set was once bought with tomestones is not in the game files.
- Ultimate: a SpecialShop listing sells it for one of the ultimate totems below. The game files do not link a totem to
  its duty; the six older pairs match Teamcraft's data, and the Console Games Wiki says Mad Harlequin's Totem
  drops in Dancing Mad (Ultimate).
"""

import re
from pathlib import Path

from item_format import SchemaError, load_format, read_csv

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
TOME_CODES = {'4': {1, 2, 3, 4}, '16': {1}, '2': {1, 2, 3, 4}}


def bits():
    """{source key: bit} from item-format.json."""
    return {s['key']: 1 << i for i, s in enumerate(load_format()['sources'])}


def listing_count(header):
    """Number of listings per SpecialShop row (Item[0] .. Item[n-1])."""
    ks = [int(m.group(1)) for c in header if (m := re.match(r'Item\[(\d+)\]\.Item\[0\]$', c))]
    if not ks:
        raise SchemaError('SpecialShop.csv has no Item[k].Item[0] columns. Did a game patch rename them?')
    return max(ks) + 1


def sources(csv_dir, items):
    """{item id (int): bit mask}. items: the Item.csv rows (dicts with '#', 'Name' and 'EquipSlotCategory')."""
    d = Path(csv_dir)
    b = bits()
    out = {}

    def mark(item, key):
        if item:
            out[item] = out.get(item, 0) | b[key]

    for r in read_csv(d / 'Recipe.csv', ['ItemResult']):
        mark(int(r['ItemResult']), 'crafted')

    tome_items = {int(r['Item']) for r in read_csv(d / 'TomestonesItem.csv', ['Item', 'Tomestones']) if r['Item'] != '0'}
    names = {int(r['#']): r['Name'] for r in items}
    gear = {int(r['#']) for r in items if r['EquipSlotCategory'] not in ('', '0')}
    wrong = [f'{i} is {names.get(i)!r}, expected {n!r}' for i, n in ULTIMATE_TOTEMS.items() if names.get(i) != n]
    if wrong:
        raise SchemaError('Item.csv: ultimate totem ids changed: ' + '; '.join(wrong))

    shops = read_csv(d / 'SpecialShop.csv', ['UseCurrencyType'])
    n = listing_count(shops[0].keys()) if shops else 0
    trades = []  # (gear given, gear taken in), for "made from tomestone gear"
    for s in shops:
        codes = TOME_CODES.get(s['UseCurrencyType'], set())
        for k in range(n):
            costs = [int(s[f'Item[{k}].ItemCost[{j}]']) for j in range(3)]
            given = [g for j in range(2) if (g := int(s[f'Item[{k}].Item[{j}]']))]
            tome = any(c in codes if c < CODE_LIMIT else c in tome_items for c in costs if c)
            taken = [c for c in costs if c in gear]
            if taken:
                trades.append(([g for g in given if g in gear], taken))
            ult = any(c in ULTIMATE_TOTEMS for c in costs)
            if not (tome or ult):
                continue
            for got in given:
                if tome:
                    mark(got, 'tomestone')
                if ult:
                    mark(got, 'ultimate')
    changed = True
    while changed:
        changed = False
        for given, taken in trades:
            if any(out.get(c, 0) & b['tomestone'] for c in taken):
                for g in given:
                    if not out.get(g, 0) & b['tomestone']:
                        mark(g, 'tomestone')
                        changed = True
    return out


FILES = ['Recipe', 'SpecialShop', 'TomestonesItem']  # the sheets sources() reads, for fetch.py
