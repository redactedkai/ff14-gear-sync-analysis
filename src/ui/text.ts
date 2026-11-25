/* Small text and data helpers the views and the components share: pure, no DOM, no Alpine. */

/* A whole number with en-US thousands separators ("1,234"), whatever the browser's locale: in a German browser
   "1.234" would read like a decimal next to GCDs such as "2.48s". The Defense row formats the same way. One formatter
   kept, not `n.toLocaleString('en-US')`: that builds a formatter per call, about 25 times slower over the 1,400 rows of
   Substat tiers. */
const INTEGER_FORMAT = new Intl.NumberFormat('en-US');
export const fmtInt = (n: number): string => INTEGER_FORMAT.format(n);

/* "3 slots", "1 change", "2 matches": a count and its word (a word ending in s or ch takes "es"). */
export function plural(count: number, word: string): string {
  let ending = '';
  if (count !== 1) {
    ending = /(s|ch)$/.test(word) ? 'es' : 's';
  }
  return `${count} ${word}${ending}`;
}

/* `one` for a count of 1, else `many`: the hand-written pair of a sentence ("it"/"them", "its slot is"/"their slots are"). */
export function oneOrMany<T>(count: number, one: T, many: T): T {
  return count === 1 ? one : many;
}

/* Names as one phrase, in order: "Head", "Head and Food", "Head, Ring 2 and Food" ('' for none). */
export function joinNames(names: string[]): string {
  if (names.length < 2) {
    return names.join('');
  }
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/* A deep copy of plain data (a saved sheet, a gear set, Auto-fill settings): the JSON round trip, which also drops Alpine's
   reactive wrappers. Only for JSON-safe data: no functions, no undefined kept, no Map. */
export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

/* What a thrown value says: its `message` when it has one, else the value itself (a rejected request's error, or whatever was thrown).
   The caller turns it into text. */
export function messageOf(error: unknown): unknown {
  return (error as { message?: unknown } | null | undefined)?.message || error;
}
