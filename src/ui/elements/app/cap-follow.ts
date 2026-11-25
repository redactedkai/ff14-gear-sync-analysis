/* What the item level field does after its inputs changed, when it follows the level (the Job and sync panels of the Gear browser and
   of Stat Allocation: `follow`). One rule, as the page had it in seven watchers; a `.ts` module with no import, so Node tests can read
   it. The field's own state is in `cap-field.ts`. */

/* The inputs of the field a change can name. */
export type FollowInput = 'value' | 'syncOn' | 'level' | 'active' | 'scope';

/* What to do: `reset` drops the text typed in the box and the cap the page lowered (the tab or the sheet changed); `dropTyped` drops
   the text typed (the stored cap changed); `lowerNow` lowers the cap to what the level allows, now; `lowerWhenLevelSettles` does it
   once the level has stopped changing (the level box commits on every keystroke, and typing 80 passes through 8, which would lower the
   cap to level 8's). */
export interface FollowPlan {
  reset: boolean;
  dropTyped: boolean;
  lowerNow: boolean;
  lowerWhenLevelSettles: boolean;
}

/* The plan for `changed` (the names of the inputs that changed), while the field is `active` (its tab is open: a hidden panel never
   lowers or flags the open one's cap) and `loweredTo` (the cap the page last lowered it to, or null). The cap the page itself just
   lowered to is no reason to lower again. */
export function followPlan(changed: ReadonlySet<FollowInput>, active: boolean, loweredTo: number | null, cap: number | null): FollowPlan {
  const plan: FollowPlan = { reset: false, dropTyped: false, lowerNow: false, lowerWhenLevelSettles: false };
  if (changed.has('active') || changed.has('scope')) {
    plan.reset = true;
  }
  if (!active) {
    return plan;
  }
  if (changed.has('value')) {
    plan.dropTyped = true;
    plan.lowerNow = cap !== loweredTo;
  }
  if (changed.has('syncOn')) {
    plan.lowerNow = true;
  }
  if (changed.has('level')) {
    plan.lowerWhenLevelSettles = true;
  }
  return plan;
}
