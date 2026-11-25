/* The story gallery: the page Playwright's `mount` fixture opens. `window.mount({ story, props })` renders a story into
   #root and `window.unmount()` clears it. A story is a function (props) => Lit template; the registry
   (out/registry.generated.js, written by tests/stories/build.mjs) maps a story file to a lazy import. The page's own
   stylesheet is loaded, so an element looks as it does on the page. */
import { nothing, render } from 'lit';
import '../../../src/styles/entry.css';
import { stories } from '../out/registry.generated.js';

const root = document.getElementById('root');

/* An error nobody caught (a render() that throws shows up as a rejected promise inside Lit) goes to the console as an
   error too: Chromium reports it as a page error on its own, Firefox and WebKit may not. The test fixture fails on both. */
addEventListener('unhandledrejection', event => console.error(`unhandled rejection: ${event.reason?.stack ?? event.reason}`));

/* The story function for an id like 'app/gsa-counter/Default' (file id, then the exported name), or undefined. */
async function findStory(storyId) {
  const split = storyId.lastIndexOf('/');
  const filePath = storyId.slice(0, split);
  const exportName = storyId.slice(split + 1);
  const loadFile = stories[filePath];
  return loadFile ? (await loadFile())[exportName] : undefined;
}

window.mount = async ({ story, props }) => {
  const makeTemplate = await findStory(story);
  if (!makeTemplate) {
    throw new Error(`Unknown story: ${story}`);
  }
  // render() reuses the root's part, so a second call with the same template updates in place (the fixture's update())
  render(await makeTemplate(props ?? {}), root);
};

window.unmount = () => {
  render(nothing, root);
  root.replaceChildren();
};
