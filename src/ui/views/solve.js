/* What the page's solver (ui/solver.js) answers for a set page's Fill: the solve's answer, and the Fill settings' Gear
   to search line. The solve is core/recipe.js runRecipe; a set page puts its plain set on the set's rows
   (views/fill.js applyFill). Every builder takes plain inputs: the job (a JobContext), the sync settings ({cap, sync,
   level}: ui/settings.js syncSettings), the character level, the recipe (views/fill-settings.js fillRecipe) and a solver
   session (core/session.js), never the store.
   Pure view builders: no Alpine import, so Node can load and test them. */
import { emptyGearFrom, gcdRange, recipePool, runRecipe } from '../../core/recipe.js';
import { fmtInt } from '../helpers.js';
import { badPinMessages } from './fill.js';

/* {searched, left}: how many pieces of `gear` (a session's gear for `job`) the recipe searches, and how many its
   filters under Gear to search leave out, for its heading. */
export function searchCount(job, recipe, gear) {
  const searched = recipePool(job, recipe, gear).length;
  return { searched, left: gear.length - searched };
}

/* The Target GCD field's label for the range gcdRange gives ({top, fastest, haste}): the range in parentheses ("Target
   GCD (2.50 to 2.10)", the job's haste after it, or "off: the target is speed"). */
function gcdLabel(recipe, { top, fastest, haste }) {
  if (recipe.target === 'spd') return 'Target GCD (off: the target is speed)';
  const span = fastest == null ? '' : `${top.toFixed(2)} to ${fastest.toFixed(2)}`;
  const note = [span, haste ? `with ${haste.name} ${haste.pct}%` : ''].filter(Boolean).join(' ');
  return note ? `Target GCD (${note})` : 'Target GCD';
}

/* What Gear to search shows for the Fill settings as they are now: {countText ("searching 1,939 of 1,999 pieces"),
   emptyBoxes (the "Gear from" boxes with nothing for the job and the other filters, greyed out), gcdLabel (the Target
   GCD field's label, with the best meal when Food is on: one search for the most speed, kept in the session; 20 to
   100 ms), searched (how many pieces the recipe searches: the set page's "· 1,939 pieces")}. */
export function gearToSearchView(job, sync, level, recipe, session) {
  const gear = session.gear(job);
  const count = searchCount(job, recipe, gear);
  return {
    countText: `searching ${fmtInt(count.searched)} of ${fmtInt(count.searched + count.left)} pieces`,
    searched: count.searched,
    emptyBoxes: emptyGearFrom(job, recipe, gear),
    gcdLabel: gcdLabel(recipe, gcdRange(job, sync, level, recipe, session)),
  };
}

/* The answer of a solve for `recipe` that keeps `pins` (views/fill.js fillPlan's: {pieces, meal}, or null for none). The
   optimizer can throw (e.g. stat totals too large to rank exactly); the answer is then {kind: 'error', message}.
   Otherwise {kind: runRecipe's status, ...}:
   - 'ok': {set (the plain set, core/set.js: pieces by game id and stones, the meal's key), bestMeals (the keys of the
     meals tagged "best for goal", runRecipe's found.food.tagged: allMeals order; null with Food off), recipe, truncated (the
     search stopped at its node limit)}; both clone-safe, since the worker's reply carries them;
   - 'badpin' (a pin cannot be kept): {messages (badPinMessages: one plain line per problem), badPins (runRecipe's
     found.badPins)};
   - the other kinds ('excluded', 'noset', 'nogcd', 'infeasible'): {truncated}. */
export function solveView(job, sync, level, recipe, session, pins = null) {
  try {
    const run = runRecipe(job, sync, level, recipe, session, {}, pins);
    if (run.status === 'badpin')
      return { kind: 'badpin', messages: badPinMessages(job, run.found.badPins, pins), badPins: run.found.badPins };
    if (run.status === 'ok') {
      const bestMeals = run.found.food ? run.found.food.tagged.map(meal => meal.key) : null;
      return { kind: 'ok', set: run.set, bestMeals, recipe, truncated: !!run.found.truncated };
    }
    return { kind: run.status, truncated: !!run.found?.truncated };
  } catch (e) {
    return { kind: 'error', message: e?.message || String(e) };
  }
}
