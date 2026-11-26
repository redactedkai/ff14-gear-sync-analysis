/* What the page's solver (ui/solver.js) answers for a set page's Auto-fill: the solve's answer, and the Auto-fill settings' Gear
   to search line. The solve is core/recipe.ts runRecipe; a set page puts its plain set on the set's rows
   (sheets/fill.js applyFill). Every builder takes plain inputs: the job (a JobContext), the sync settings ({cap, sync,
   level}: ui/job-sync-panel.ts syncSettings), the character level, the recipe (sheets/fill-settings.js fillRecipe) and a solver
   session (core/session.ts), never the store.
   Pure view builders, so Node can load and test them. */
import { gcdRange, gearFromCounts, recipePool, runRecipe } from '../core/recipe.ts';
import { fmtInt } from './text.ts';
import { badPinMessages } from './sheets/fill.js';

/* {searched, left}: how many pieces of `gear` (a session's gear for `job`) the recipe searches, and how many its
   filters under Gear to search leave out, for its heading. */
export function searchCount(job, recipe, gear) {
  const searched = recipePool(job, recipe, gear).length;
  return { searched, left: gear.length - searched };
}

/* The Target GCD field's label for `job` and the range gcdRange gives ({top, fastest, haste}), as the parts the label shows
   and the sentence a screen reader reads: {name ("Target GCD"), range ("2.12–1.83", with an en dash; '' when no set
   was found), haste ("Increase Attack Speed 15%", or null for a job with no always-on haste), off ("Off: goal is
   speed" while the target is the speed stat, else null), full (the whole sentence: "Target GCD (2.12 to 1.83 with Increase
   Attack Speed 15%)", "Target GCD (off: the target is speed)")}. The wording lives here only; the template displays the parts. */
function gcdLabel(job, recipe, { top, fastest, haste }) {
  const name = 'Target GCD';
  if (recipe.target === job.speedKey) {
    return { name, range: '', haste: null, off: 'Off: goal is speed', full: `${name} (off: the target is speed)` };
  }
  const range = fastest == null ? '' : `${top.toFixed(2)}–${fastest.toFixed(2)}`;
  const hasteText = haste ? `${haste.name} ${haste.pct}%` : null;
  const spoken = [range?.replace('–', ' to '), hasteText && `with ${hasteText}`].filter(Boolean).join(' ');
  return { name, range, haste: hasteText, off: null, full: spoken ? `${name} (${spoken})` : name };
}

/* What Gear to search shows for the Auto-fill settings as they are now: {countText ("searching 1,939 of 1,999 pieces"),
   searched (the number of pieces searched: 0 turns the Auto-fill button off), fromCounts ({box key: pieces}, how many pieces each "Gear categories" box holds under the other filters: gearFromCounts), gcdLabel (the Target
   GCD field's label parts, gcdLabel's, with the best meal when Food is on: one search for the most speed, run every time; 20 to
   100 ms)}. */
export function gearToSearchView(job, sync, level, recipe, session) {
  const gear = session.gear(job);
  const count = searchCount(job, recipe, gear);
  return {
    countText: `searching ${fmtInt(count.searched)} of ${fmtInt(count.searched + count.left)} pieces`,
    searched: count.searched,
    fromCounts: gearFromCounts(job, recipe, gear),
    gcdLabel: gcdLabel(job, recipe, gcdRange(job, sync, level, recipe, session)),
  };
}

/* The answer of a solve for `recipe` that keeps `pins` (sheets/fill.js fillPlan's: {pieces, meal}, or null for none). The
   optimizer can throw (e.g. stat totals too large to rank exactly); the answer is then {kind: 'error', message}.
   Otherwise {kind: runRecipe's status, ...}:
   - 'ok': {set (the plain set, core/set.ts: pieces by game id and stones, the meal's key), bestMeals (the keys of the
     meals tagged "best for goal", runRecipe's found.food.tagged: allMeals order; null with Food off), recipe, truncated (the
     search stopped at its node limit)}; both clone-safe, since the worker's reply carries them;
   - 'badpin' (a pin cannot be kept): {messages (badPinMessages: one plain line per problem), badPins (runRecipe's
     found.badPins)};
   - the other kinds ('excluded', 'noset', 'nogcd', 'infeasible'): {truncated}. */
export function solveView(job, sync, level, recipe, session, pins = null) {
  try {
    const run = runRecipe(job, sync, level, recipe, session, {}, pins);
    if (run.status === 'badpin') {
      return { kind: 'badpin', messages: badPinMessages(run.found.badPins), badPins: run.found.badPins };
    }
    if (run.status === 'ok') {
      const bestMeals = run.found.food ? run.found.food.tagged.map(meal => meal.key) : null;
      return { kind: 'ok', set: run.set, bestMeals, recipe, truncated: Boolean(run.found.truncated) };
    }
    return { kind: run.status, truncated: Boolean(run.found?.truncated) };
  } catch (e) {
    return { kind: 'error', message: e?.message || String(e) };
  }
}
