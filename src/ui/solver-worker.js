/* The optimizer's Web Worker (ui/solver.js workerSolver): answers each solver request with the handler's reply, tagged
   with the request's id. Bundled on its own by the build (scripts/build/build.mjs solverWorker), which wraps it to run
   on the page's first message, the data files' texts: until then the data modules it imports cannot load. */
import { makeSolverHandler } from './solver.js';

const handle = makeSolverHandler();

self.onmessage = ({ data }) => {
  const { id, ...request } = data;
  self.postMessage({ id, ...handle(request) });
};
