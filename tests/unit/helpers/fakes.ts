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
