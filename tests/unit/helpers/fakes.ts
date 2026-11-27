/* The fake kit of the unit tests: complete, typed stand-ins for browser objects, so a test hands them to typed code without a
   cast. A fake implements every member of the type it stands for (a `Storage` with `clear`),
   so code that later starts to call one more member does not break a test at run time. */

/* A Storage stand-in: localStorage's members over a Map, plus `data` (what is stored) and `failWith`, the error every
   setItem throws while it is set (a full storage: quotaError()). */
export interface FakeStorage extends Storage {
  readonly data: Map<string, string>;
  failWith: Error | null;
}

/* A new empty FakeStorage; `failWith` is the error every setItem throws (none by default). */
export function fakeStorage({ failWith = null }: { failWith?: Error | null } = {}): FakeStorage {
  const data = new Map<string, string>();
  return {
    data,
    failWith,
    get length() {
      return data.size;
    },
    clear() {
      data.clear();
    },
    key(index: number) {
      return [...data.keys()][index] ?? null;
    },
    getItem(key: string) {
      return data.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      if (this.failWith) {
        throw this.failWith;
      }
      data.set(key, String(value));
    },
    removeItem(key: string) {
      data.delete(key);
    },
  };
}

/* The error a full browser storage throws. */
export function quotaError(): Error & { code: number } {
  return Object.assign(new Error('full'), { name: 'QuotaExceededError', code: 22 });
}

/* The `self` a Web Worker script runs against, as a stand-in: `scope` is what the script gets (it sets `onmessage`; a copy of
   each message it posts is kept in `posted`, as a real post would copy it) and `send(data)` delivers one message to it, the way
   `worker.postMessage(data)` does. `Reply` is the shape of the messages the script posts. */
export interface FakeWorkerScope<Reply> {
  readonly posted: Reply[];
  readonly scope: { postMessage(message: Reply): void; onmessage?: (event: { data: unknown }) => void; __solverData?: unknown };
  send(data: unknown): void;
}

/* A new FakeWorkerScope with nothing posted and no handler yet. */
export function fakeWorkerScope<Reply>(): FakeWorkerScope<Reply> {
  const posted: Reply[] = [];
  const scope: FakeWorkerScope<Reply>['scope'] = {
    postMessage: message => {
      posted.push(structuredClone(message));
    },
  };
  return {
    posted,
    scope,
    send(data) {
      if (!scope.onmessage) {
        throw new Error('the worker script has set no onmessage handler');
      }
      scope.onmessage({ data });
    },
  };
}

/* A stand-in for the page's Web Worker: it keeps a copy of each message posted to it (`posted`: the messages of type `Sent`,
   which carry an `id`), and answers only when the test says so: `reply(i, body)` answers posted message i the way the worker
   script does, `send(data)` delivers any message, `fail()` fires its 'error' event and `failMessage()` its 'messageerror'. Its
   handlers throw when the code under test has switched them off, as a late call into a stopped worker should be seen. */
export class FakeWorker<Sent extends { id: number }> extends EventTarget implements Worker {
  readonly posted: Sent[] = [];
  terminated = false;
  onmessage: ((this: Worker, event: MessageEvent) => unknown) | null = null;
  onmessageerror: ((this: Worker, event: MessageEvent) => unknown) | null = null;
  onerror: ((this: AbstractWorker, event: ErrorEvent) => unknown) | null = null;

  postMessage(message: Sent): void {
    this.posted.push(structuredClone(message));
  }

  terminate(): void {
    this.terminated = true;
  }

  /* Delivers one message from the worker script, as the page's `onmessage` gets it. */
  send(data: unknown): void {
    const handler = this.onmessage;
    if (!handler) {
      throw new Error('the worker has no onmessage handler');
    }
    handler.call(this, new MessageEvent('message', { data }));
  }

  /* The worker script's answer to posted message `i`: its id and `body`. */
  reply(i: number, body: object): void {
    this.send({ id: this.posted[i].id, ...body });
  }

  /* The worker failing to load or crashing: an 'error' event that can be cancelled (`preventDefault`), with the fields of an ErrorEvent. */
  fail(): void {
    const handler = this.onerror;
    if (!handler) {
      throw new Error('the worker has no onerror handler');
    }
    handler.call(
      this,
      Object.assign(new Event('error', { cancelable: true }), { message: '', filename: '', lineno: 0, colno: 0, error: null }),
    );
  }

  /* A reply the page cannot read: a 'messageerror' event. */
  failMessage(): void {
    const handler = this.onmessageerror;
    if (!handler) {
      throw new Error('the worker has no onmessageerror handler');
    }
    handler.call(this, new MessageEvent('messageerror'));
  }
}

/* `value` as the answer of a generic method whose caller picks the result type (a Solver's `request<Result>`): JSON.parse is
   typed `any`, so the value takes the type asked for, with no cast. Only for a fake that answers a fixed value. */
export function answerAs<Result>(value: unknown): Result {
  return JSON.parse(JSON.stringify(value));
}
