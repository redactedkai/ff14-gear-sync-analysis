"""Two facts about gear that the gear categories need (gear_categories.py): is it crafted, and is it bought with an
ultimate's totem. Where a piece comes from for the page's "Gear categories" filter is gear_activities.py.

flags(csv_dir, items) returns {item id: bit mask} over FLAGS.

- Crafted: the item is the result of a recipe (Recipe.ItemResult).
- Ultimate: a SpecialShop listing sells it for one of the ultimate totems below. The game files do not link a totem to
  its duty; the six older pairs match Teamcraft's data, and the Console Games Wiki says Mad Harlequin's Totem
  drops in Dancing Mad (Ultimate).

Shops do not store every cost as an item id: a cost below CODE_LIMIT is a currency code read through the shop's
UseCurrencyType (tomestones, scrips, gil; gear_activities.py decodes them).
"""

import re
from collections.abc import Iterable, Iterator
from pathlib import Path
from typing import TypeAlias

from item_format import Row, SchemaError, check_ids, read_csv

ULTIMATE_TOTEMS: dict[int, str] = {
    21197: 'Dreadwyrm Totem',  # The Unending Coil of Bahamut
    23175: 'Ultima Totem',  # The Weapon's Refrain
    28633: 'Colossus Totem',  # The Epic of Alexander
    36810: 'Dragonsong Totem',  # Dragonsong's Reprise
    38951: 'Omega Totem',  # The Omega Protocol
    44743: 'Oracle Totem',  # Futures Rewritten
    52321: "Mad Harlequin's Totem",  # Dancing Mad (the wiki says it drops there)
}
CODE_LIMIT: int = 8  # costs below this are currency codes, not item ids
FLAGS: dict[str, int] = {'crafted': 1, 'ultimate': 2}
LISTING_GIVES, LISTING_COSTS = 2, 3  # items a SpecialShop listing gives (Item[k].Item[j]) and costs (Item[k].ItemCost[j])


# One SpecialShop listing: (shop row, listing index k, item ids given, costs as ints; see shop_listings)
Listing: TypeAlias = tuple[Row, int, list[int], list[int]]


def listing_count(header: Iterable[str]) -> int:
    """Number of listings per SpecialShop row (Item[0] .. Item[n-1])."""
    ks: list[int] = [int(m.group(1)) for c in header if ((m := re.match(r'Item\[(\d+)\]\.Item\[0\]$', c)) is not None)]
    if len(ks) == 0:
        raise SchemaError('SpecialShop.csv has no Item[k].Item[0] columns. Did a game patch rename them?')
    return max(ks) + 1


def shop_listings(shops: list[Row]) -> Iterator[Listing]:
    """(shop row, listing index k, given, costs) for every listing of every SpecialShop row (dicts from read_csv):
    given is the item ids the listing gives (Item[k].Item[0..1]), costs what it costs (Item[k].ItemCost[0..2]), as
    ints with the zeros left out. A cost below CODE_LIMIT is a currency code, read through the shop's UseCurrencyType
    (gear_activities.py). Listings that give nothing are included (given empty)."""
    n: int = listing_count(shops[0].keys()) if len(shops) > 0 else 0
    for shop in shops:
        for k in range(n):
            given: list[int] = [item for j in range(LISTING_GIVES) if ((item := int(shop[f'Item[{k}].Item[{j}]'])) != 0)]
            costs: list[int] = [cost for j in range(LISTING_COSTS) if ((cost := int(shop[f'Item[{k}].ItemCost[{j}]'])) != 0)]
            yield shop, k, given, costs


def flags(csv_dir: Path | str, items: Iterable[Row]) -> dict[int, int]:
    """{item id (int): bit mask over FLAGS}. items: the Item.csv rows (dicts with '#' and 'Name')."""
    d: Path = Path(csv_dir)
    out: dict[int, int] = {}

    def mark(item: int, key: str) -> None:
        if item != 0:
            out[item] = out.get(item, 0) | FLAGS[key]

    for r in read_csv(d / 'Recipe.csv', ['ItemResult']):
        mark(int(r['ItemResult']), 'crafted')

    names: dict[int, str] = {int(r['#']): r['Name'] for r in items}
    check_ids(names, ULTIMATE_TOTEMS, 'Item.csv', 'ultimate totem', 'ULTIMATE_TOTEMS (scripts/data/gear_sources.py)')

    for _shop, _k, given, costs in shop_listings(read_csv(d / 'SpecialShop.csv', ['UseCurrencyType'])):
        if any(c in ULTIMATE_TOTEMS for c in costs):
            for item in given:
                mark(item, 'ultimate')
    return out


FILES: list[str] = ['Recipe', 'SpecialShop', 'TomestonesItem']  # the sheets this module and gear_activities.py read, for fetch.py
