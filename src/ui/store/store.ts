/* The page's one state holder: a plain object tree changed in place by named actions, with a revision per top-level slice
   (and per part of a slice, below) and one notification per tick. Pure: no DOM, no Lit, no Alpine (it runs in Node). Not a
   reactive proxy: the optimizer and the worker read the plain data (CLAUDE.md), so a change is announced by `update`, never
   noticed by a setter. */

/* How many action names `Store.log` keeps (the newest). */
export const ACTION_LOG_LIMIT = 50;

/* A function that is told the state may have changed. It reads what it needs from `store.state`. */
export type Listener = () => void;

/* What a Store takes besides its state.
   parts: the parts of a slice that have a revision of their own, {slice: paths inside it}; a path is a key of the slice
   ('browse') or two keys joined by a dot ('panels.browse'). A part's revision counts the actions after which the part holds
   different values (its fields compared one by one with `Object.is`, an object or array inside counting as changed when it is
   another object), so a reader of one part is run again only when that part changed. Every key of a slice with parts must
   be covered by a part (the constructor throws on one that is not), so a field added to the state cannot be left out.
   onUpdate(key, revision): called inside `update`, as soon as the action has counted, with a revision key (a slice's name or a
   part's 'slice.path') and its new revision; the page hands in a function that copies the revision into an object its template
   engine tracks (the facades read that copy), so a template re-runs without waiting for the tick's notification. */
export interface StoreOptions {
  parts?: Readonly<Record<string, readonly string[]>>;
  onUpdate?: (key: string, revision: number) => void;
}

/* The slice an action name belongs to: the text before the first slash ('settings/editBrowse' is slice 'settings'). */
export function sliceOf(actionName: string): string {
  const slash = actionName.indexOf('/');
  return slash < 0 ? '' : actionName.slice(0, slash);
}

/* The revision key of the part `path` of slice `slice` ('settings.panels.browse'). */
export function partKey(slice: string, path: string): string {
  return `${slice}.${path}`;
}

/* What `path` (keys joined by dots) of `value` holds. */
function valueAt(value: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((inside, key) => (inside as Record<string, unknown>)[key], value);
}

/* A part's value as it is now, for comparing later: an object or array is copied one level deep (an action changes it in
   place); anything else is itself. */
function snapshot(value: unknown): unknown {
  if (Array.isArray(value)) {
    return [...value];
  }
  return value !== null && typeof value === 'object' ? { ...value } : value;
}

/* Whether a part holds what its snapshot held: the same fields, each the same by `Object.is`. */
function sameAsSnapshot(now: unknown, before: unknown): boolean {
  if (typeof now !== 'object' || now === null || typeof before !== 'object' || before === null) {
    return Object.is(now, before);
  }
  const nowFields = now as Record<string, unknown>;
  const beforeFields = before as Record<string, unknown>;
  const keys = Object.keys(nowFields);
  return keys.length === Object.keys(beforeFields).length && keys.every(key => Object.is(nowFields[key], beforeFields[key]));
}

/* Whether the value inside the slice at `prefix` ('' for the slice itself) is covered by `paths`: it is a part, or every field
   of it is covered ('panels' with 'panels.browse' and 'panels.math'). */
function isCovered(value: unknown, prefix: string, paths: readonly string[]): boolean {
  if (prefix !== '' && paths.includes(prefix)) {
    return true;
  }
  if (value === null || typeof value !== 'object' || !paths.some(path => path.startsWith(`${prefix}.`) || prefix === '')) {
    return false;
  }
  return Object.entries(value).every(([key, inside]) => isCovered(inside, prefix === '' ? key : `${prefix}.${key}`, paths));
}

/* Throw unless every key of the slice's object `value` is in a part. */
function requireCovered(slice: string, value: object, paths: readonly string[]): void {
  for (const [key, inside] of Object.entries(value)) {
    if (!isCovered(inside, key, paths)) {
      throw new Error(`The state's ${slice}.${key} is in no part of its slice`);
    }
  }
}

/* The state and who changed it. `State` is an object whose top-level keys are the slices (settings, screen, ...): each slice
   has a revision that counts the actions that named it, so a reader of one slice can skip a change of another (a Select
   compares what it selected; the revisions are for readers that cannot compare, such as Alpine's tracking in the facade). A
   slice may also be split into parts (StoreOptions.parts), each with a revision that counts only the actions that changed it.
   The store finds that out by comparing each part before and after the action, so an action names nothing but its slice and a
   new action cannot forget a part. */
export class Store<State extends Record<string, object>> {
  /* The live state. Read it freely; change it only inside the function `update` is given. */
  readonly state: State;
  /* How many actions named each slice (under the slice's name), how many changed each part (under the part's key, `partKey`),
     and how many actions ran in all (`rev`). */
  readonly revs: { [Slice in keyof State]: number } & Record<string, number>;
  rev = 0;
  /* The names of the last ACTION_LOG_LIMIT actions, the newest last (for the debug hook and for tests). */
  readonly log: string[] = [];

  #listeners = new Set<Listener>();
  #notifyQueued = false;
  #onUpdate: ((key: string, revision: number) => void) | undefined;
  #parts: Readonly<Record<string, readonly string[]>>;

  /* A store over `state`: the object is used as it is (not copied), so the caller keeps no other way to change it. */
  constructor(state: State, options: StoreOptions = {}) {
    this.state = state;
    this.#onUpdate = options.onUpdate;
    this.#parts = options.parts ?? {};
    for (const [slice, paths] of Object.entries(this.#parts)) {
      requireCovered(slice, state[slice], paths);
    }
    this.revs = Object.fromEntries(this.revisionKeys().map(key => [key, 0])) as typeof this.revs;
  }

  /* The key of every revision this store keeps: each slice's name and each part's key. */
  revisionKeys(): string[] {
    const slices = Object.keys(this.state);
    return [...slices, ...slices.flatMap(slice => (this.#parts[slice] ?? []).map(path => partKey(slice, path)))];
  }

  /* Run `change` on the live state (it may change it in place), count the action `name` ('<slice>/<action>': the slice must
     be one of the state's top-level keys) in the slice's revision and the log, count it in the revision of each part of the
     slice that now holds other values, and tell the listeners once at the end of the tick however many actions ran in it.
     Returns what `change` returns, so an action can hand back its result. The action is counted even when `change` throws
     (it may have changed part of the state before it did). */
  update<Result = void>(name: string, change: (state: State) => Result): Result {
    const slice = sliceOf(name);
    if (!(slice in this.state)) {
      throw new Error(`Action "${name}" names no slice of the state`);
    }
    const paths = this.#parts[slice] ?? [];
    const before = paths.map(path => snapshot(valueAt(this.state[slice], path)));
    try {
      return change(this.state);
    } finally {
      this.#count(slice);
      paths.forEach((path, index) => {
        if (!sameAsSnapshot(valueAt(this.state[slice], path), before[index])) {
          this.#count(partKey(slice, path));
        }
      });
      this.rev += 1;
      this.log.push(name);
      if (this.log.length > ACTION_LOG_LIMIT) {
        this.log.splice(0, this.log.length - ACTION_LOG_LIMIT);
      }
      this.#queueNotification();
    }
  }

  /* Call `listener` after the actions of a tick (once per tick, in a microtask). Returns the function that removes it. */
  subscribe(listener: Listener): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  /* How many listeners are subscribed (a test checks that a disconnected element left none behind). */
  get listenerCount(): number {
    return this.#listeners.size;
  }

  /* Add one to the revision `key` and tell `onUpdate`. */
  #count(key: string): void {
    const revs: Record<string, number> = this.revs;
    revs[key] += 1;
    this.#onUpdate?.(key, revs[key]);
  }

  /* Schedule the one notification of this tick, unless one is already waiting. */
  #queueNotification(): void {
    if (this.#notifyQueued) {
      return;
    }
    this.#notifyQueued = true;
    queueMicrotask(() => {
      this.#notifyQueued = false;
      this.#notify();
    });
  }

  /* Call every listener (a copy of the set; one that unsubscribed while this runs is skipped). A listener that throws does
     not stop the others; the first error is thrown after all have run, so it still reaches the console. */
  #notify(): void {
    let firstError: unknown;
    let failed = false;
    for (const listener of [...this.#listeners]) {
      if (!this.#listeners.has(listener)) {
        continue;
      }
      try {
        listener();
      } catch (error) {
        if (!failed) {
          firstError = error;
        }
        failed = true;
      }
    }
    if (failed) {
      throw firstError;
    }
  }
}
