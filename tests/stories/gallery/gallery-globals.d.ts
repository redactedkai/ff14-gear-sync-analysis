/* The types of the story gallery page (tests/stories/gallery/main.ts), which no module exports: the story registry that
   tests/stories/build.ts writes (esbuild aliases `story-registry` to it), the stylesheet import, and `window.mount` and
   `window.unmount`. Written without an import or export, so these are global declarations. */

/* A story file: its exports, each a function from props to a Lit template (or a constant the specs import). */
type StoryModule = Record<string, ((props: object) => unknown) | undefined>;

declare module 'story-registry' {
  /* Every `*.story.ts` file, keyed by its path under tests/stories without the extension, as a lazy import. */
  export const stories: Record<string, (() => Promise<StoryModule>) | undefined>;
}

declare module '*.css' {}

interface Window {
  /* Renders a story into #root: `story` is its id ('app/job-menu/Default'), `props` what its function gets. */
  mount(request: { story: string; props?: object }): Promise<void>;
  /* Clears #root. */
  unmount(): void;
}
