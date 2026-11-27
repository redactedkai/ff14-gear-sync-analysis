"""Step reporting for the data scripts: a tqdm progress bar when tqdm is installed, otherwise one line per step.

tqdm is optional and not a project dependency; nothing else changes when it is missing.
"""

from collections.abc import Callable, Iterable, Iterator
from typing import TypeVar

T = TypeVar('T')

try:
    from tqdm import tqdm
except ImportError:
    tqdm = None


def steps(items: Iterable[T], label: Callable[[T], str] = str, unit: str = 'step') -> Iterator[T]:
    """Yield each item of `items` after announcing it with label(item): as the bar's description, or as a printed line."""
    items = list(items)
    if tqdm is None:
        for item in items:
            print(f'{label(item)}...', flush=True)
            yield item
        return
    with tqdm(items, unit=unit) as bar:
        for item in bar:
            bar.set_description(label(item))
            yield item


def bar(items: Iterable[T], label: str, unit: str = 'item') -> Iterable[T]:
    """`items` with a progress bar labelled `label`, or, without tqdm, the items after one printed line."""
    if tqdm is not None:
        return tqdm(items, desc=label, unit=unit)
    print(f'{label}...', flush=True)
    return items


def note(text: str) -> None:
    """Print a line without breaking a progress bar."""
    if tqdm is None:
        print(text, flush=True)
    else:
        tqdm.write(text)
