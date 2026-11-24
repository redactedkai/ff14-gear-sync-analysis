/* The page's one state holder: a plain object tree changed in place by named actions, with a revision per top-level slice
   and one notification per tick. Pure: no DOM, no Lit, no Alpine (it runs in Node). Not a reactive proxy: the optimizer and
   the worker read the plain data (CLAUDE.md), so a change is announced by `update`, never noticed by a setter. */

/* How many action names `Store.log` keeps (the newest). */
export const ACTION_LOG_LIMIT = 50;

/* A function that is told the state may have changed. It reads what it needs from `store.state`. */
export type Listener = () => void;

/* The slice an action name belongs to: the text before the first slash ('settings/editBrowse' is slice 'settings'). */
export function sliceOf(actionName: string): string {
  const slash = actionName.indexOf('/');
  return slash < 0 ? '' : actionName.slice(0, slash);
}

/* The state and who changed it. `State` is an object whose top-level keys are the slices (settings, screen, ...): each slice
   has a revision that counts the actions that named it, so a reader of one slice can skip a change of another (a Select
   compares what it selected; the revisions are for readers that cannot compare, such as Alpine's tracking in the facade). */
export class Store<State extends Record<string, object>> {
  /* The live state. Read it freely; change it only inside the function `update` is given. */
  readonly state: State;
  /* How many actions named each slice (the slice's revision), and how many actions ran in all (`rev`). */
  readonly revs: { [Slice in keyof State]: number };
  rev = 0;
  /* The names of the last ACTION_LOG_LIMIT actions, the newest last (for the debug hook and for tests). */
  readonly log: string[] = [];

  #listeners = new Set<Listener>();
  #notifyQueued = false;

  /* A store over `state`: the object is used as it is (not copied), so the caller keeps no other way to change it. */
  constructor(state: State) {
    this.state = state;
    this.revs = Object.fromEntries(Object.keys(state).map(slice => [slice, 0])) as { [Slice in keyof State]: number };
  }

  /* Run `change` on the live state (it may change it in place), count the action `name` ('<slice>/<action>': the slice must
     be one of the state's top-level keys) in the slice's revision and the log, and tell the listeners once at the end of the
     tick however many actions ran in it. Returns what `change` returns, so an action can hand back its result. The action is
     counted even when `change` throws (it may have changed part of the state before it did). */
  update<Result = void>(name: string, change: (state: State) => Result): Result {
    const slice = sliceOf(name);
    if (!(slice in this.revs)) throw new Error(`Action "${name}" names no slice of the state`);
    try {
      return change(this.state);
    } finally {
      this.revs[slice as keyof State] += 1;
      this.rev += 1;
      this.log.push(name);
      if (this.log.length > ACTION_LOG_LIMIT) this.log.splice(0, this.log.length - ACTION_LOG_LIMIT);
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

  /* Schedule the one notification of this tick, unless one is already waiting. */
  #queueNotification(): void {
    if (this.#notifyQueued) return;
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
      if (!this.#listeners.has(listener)) continue;
      try {
        listener();
      } catch (error) {
        if (!failed) firstError = error;
        failed = true;
      }
    }
    if (failed) throw firstError;
  }
}
