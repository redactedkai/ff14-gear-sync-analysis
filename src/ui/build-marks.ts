/* What a test build shows besides the page: the "DEV" badge by the title and the branch and commit in the footer. The build
   (scripts/build/build.ts buildMarks, handed in by esbuildOptions as the constant `__BUILD_MARKS__`) decides; the page's root
   element draws them. Null on main, and wherever no build ran (a unit test in Node). */

/* The marks of a test build: the badge's text, and the footer's "branch @ commit". */
export interface BuildMarks {
  label: string;
  where: string;
}

// replaced by esbuild's `define` in a build; not declared at all in Node
declare const __BUILD_MARKS__: BuildMarks | null;

/* The marks of this build, or null for none. */
export const BUILD_MARKS: BuildMarks | null = typeof __BUILD_MARKS__ === 'undefined' ? null : __BUILD_MARKS__;
