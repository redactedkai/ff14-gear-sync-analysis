/* The actions of the gear set pages on the store: what a set page holds that is not saved (the `setPages` slice, one entry per
   open page: app-state.ts SetPageState). The page itself (elements/set-page/) decides what an edit or an answer is; these
   keep the state and its rules:
   - An entry exists from `openPage` to `closePage`: a page left holds nothing, so the leave and the reload guards (the
     `unsettled` selector) never see it. An action on a page that is not open does nothing and returns false (a search answer
     that arrives after its page was left).
   - An entry is frozen and replaced on each change. The draft and the suggestion go in frozen (the page copies and freezes
     them, view-cache.ts frozenCopy) and are stored by reference, never copied: a frozen object is read as it is,
     so the draft and the suggestion are read plain.
   - Auto-fill: fill is 'idle' -> 'running' (startFill) -> 'waiting' (a suggestion), 'failed' (no set, or the solver broke) or
     'idle' (a line only, e.g. a pin dropped); Cancel and leaving make it 'cancelled'. A suggestion is there only while fill is
     'waiting'. Each search has an id from one counter of the whole store, so the answer of a search that was cancelled, or of
     a page left and opened again, never matches the search that runs now (a stale answer is ignored, with false returned).
   - The Gear to search count has its own id the same way: the newest count's answer is the one kept.
   An action that would change nothing returns before `update` (no revision, no render). */
import { emptySetPage } from './app-state.ts';
import type { AppStore, GearSet, GearToSearch, SetPageState, Suggestion } from './app-state.ts';

/* What the solver answers to a Gear to search request (ui/solve.ts): the line, the count and the box counts, and the Target GCD
   label. */
export interface GearToSearchAnswer {
  countText: string;
  searched: number | null;
  fromCounts: Record<string, number> | null;
  gcdLabel: GearToSearch['gcdLabel'];
}

/* How an Auto-fill ended without a suggestion: `line` is what the page shows ('' for none), `failed` that it is a failure (the
   solver broke or found no set) rather than a note (a pin dropped). */
export interface FillLine {
  line: string;
  failed?: boolean;
}

/* The actions of the gear set pages on `store`. */
export function createSetPageActions(store: AppStore) {
  let lastFillId = 0;
  let lastCountId = 0;

  /* The entry of `setId`, or null when no page is open for it. */
  function entry(setId: string): SetPageState | null {
    return store.state.setPages[setId] ?? null;
  }

  /* `setId`'s entry replaced by itself with `fields` (the action `name`); false when no page is open for it. */
  function replace(name: string, setId: string, fields: Partial<SetPageState>): boolean {
    const page = entry(setId);
    if (!page) {
      return false;
    }
    store.update(name, state => {
      state.setPages[setId] = Object.freeze({ ...page, ...fields });
    });
    return true;
  }

  /* Throw unless `value` is frozen or null: a draft or a suggestion goes in frozen, so nothing can change it after. */
  function requireFrozen(value: object | null, what: string): void {
    if (value !== null && !Object.isFrozen(value)) {
      throw new Error(`The ${what} must be frozen before it is stored`);
    }
  }

  return {
    /* Open the page of gear set `setId` at rest (it stays as it is when open already). */
    openPage(setId: string): void {
      if (entry(setId)) {
        return;
      }
      store.update('setPages/openPage', state => {
        state.setPages[setId] = emptySetPage();
      });
    },

    /* Close the page of gear set `setId` (it was left, or its set was deleted): its entry goes, with any draft and result. */
    closePage(setId: string): void {
      if (!entry(setId)) {
        return;
      }
      store.update('setPages/closePage', state => void delete state.setPages[setId]);
    },

    /* The page's manual draft (a frozen GearSet), or null for none. False when no page is open for `setId`. */
    setDraft(setId: string, draft: Readonly<GearSet> | null): boolean {
      requireFrozen(draft, 'draft');
      const page = entry(setId);
      if (page && page.draft === draft) {
        return true;
      }
      return replace('setPages/setDraft', setId, { draft });
    },

    /* Start an Auto-fill: the status is 'running' under a new search id, the line is cleared. Returns the id, or null when
       no page is open for `setId`. */
    startFill(setId: string): number | null {
      const id = ++lastFillId;
      return replace('setPages/startFill', setId, { fill: 'running', fillId: id, fillLine: '' }) ? id : null;
    },

    /* The search `id` answered with a suggestion (a frozen {suggested, declined}): it waits for Apply or Discard. False, and
       nothing changes, when the answer is stale (the search was cancelled, or the page left). */
    fillSuggested(setId: string, id: number, suggestion: Suggestion): boolean {
      requireFrozen(suggestion, 'suggestion');
      if (entry(setId)?.fillId !== id) {
        return false;
      }
      return replace('setPages/fillSuggested', setId, { suggestion, fill: 'waiting', fillLine: '' });
    },

    /* The search `id` ended without a suggestion: the page shows `result.line`, and the status is 'failed' when `result.failed`,
       else 'idle'. False when the answer is stale. */
    fillEnded(setId: string, id: number, result: FillLine): boolean {
      if (entry(setId)?.fillId !== id) {
        return false;
      }
      return replace('setPages/fillEnded', setId, { fill: result.failed ? 'failed' : 'idle', fillLine: result.line });
    },

    /* The run is over (answered, failed or stopped): no search id is kept, and a status still 'running' becomes 'idle'. */
    endFill(setId: string): void {
      const page = entry(setId);
      if (!page || (page.fillId === null && page.fill !== 'running')) {
        return;
      }
      replace('setPages/endFill', setId, { fillId: null, fill: page.fill === 'running' ? 'idle' : page.fill });
    },

    /* Cancel a running Auto-fill (Cancel, or leaving the page): the status is 'cancelled' and the search id is dropped, so its
       answer, if it still comes, is ignored. False when none runs. */
    cancelFill(setId: string): boolean {
      if (entry(setId)?.fill !== 'running') {
        return false;
      }
      return replace('setPages/cancelFill', setId, { fill: 'cancelled', fillId: null });
    },

    /* The result waiting is replaced by `suggestion` (a frozen {suggested, declined}: a Take box changed), or dropped (null: Apply,
       Discard or leaving): the status is 'waiting' with a suggestion and 'idle' once a waiting one is gone. */
    setSuggestion(setId: string, suggestion: Suggestion | null): boolean {
      requireFrozen(suggestion, 'suggestion');
      const page = entry(setId);
      if (!page) {
        return false;
      }
      if (page.suggestion === suggestion) {
        return true;
      }
      let fill = page.fill;
      if (suggestion) {
        fill = 'waiting';
      } else if (page.fill === 'waiting') {
        fill = 'idle';
      }
      return replace('setPages/setSuggestion', setId, { suggestion, fill });
    },

    /* A Gear to search count starts for the job and filters named by `countedFor` (text): returns its id, or null when no page is
       open for `setId`. The box counts of other filters are dropped now; the line and the count stay until the new ones land. */
    startCount(setId: string, countedFor: string): number | null {
      const page = entry(setId);
      if (!page) {
        return null;
      }
      const id = ++lastCountId;
      const gearToSearch =
        page.gearToSearch.fromCountsFor === countedFor
          ? page.gearToSearch
          : Object.freeze({ ...page.gearToSearch, fromCounts: null, fromCountsFor: null });
      replace('setPages/startCount', setId, { countId: id, gearToSearch });
      return id;
    },

    /* The count `id`, made for `countedFor`, answered with `answer`. False, and nothing changes, when it is not the newest count
       or its page was left. */
    countLanded(setId: string, id: number, countedFor: string, answer: GearToSearchAnswer): boolean {
      if (entry(setId)?.countId !== id) {
        return false;
      }
      const gearToSearch: GearToSearch = Object.freeze({
        countText: answer.countText,
        searched: answer.searched,
        fromCounts: answer.fromCounts ? Object.freeze({ ...answer.fromCounts }) : null,
        fromCountsFor: countedFor,
        gcdLabel: Object.freeze({ ...answer.gcdLabel }),
      });
      return replace('setPages/countLanded', setId, { countId: null, gearToSearch });
    },

    /* The count `id` failed: its line becomes `text`, unless it was `cancelled` (a newer request replaced it). False when it is
       not the newest count. */
    countFailed(setId: string, id: number, text: string, cancelled: boolean): boolean {
      const page = entry(setId);
      if (!page || page.countId !== id) {
        return false;
      }
      const gearToSearch = cancelled ? page.gearToSearch : Object.freeze({ ...page.gearToSearch, countText: text });
      return replace('setPages/countFailed', setId, { countId: null, gearToSearch });
    },
  };
}

/* The actions of the gear set pages. */
export type SetPageActions = ReturnType<typeof createSetPageActions>;
