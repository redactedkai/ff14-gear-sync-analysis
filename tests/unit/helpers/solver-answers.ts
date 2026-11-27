/* Reading what the solver's handler answers (src/ui/solver.ts makeSolverHandler) in a test: the answer that is not an error, and
   a `solve` result of one kind. Each throws, saying what the answer was, when it is another. */
import type { HandlerAnswer } from '../../../src/ui/solver.ts';

/* A handler's answer that is not an error: {result, ms}. */
export function answered(answer: HandlerAnswer) {
  if ('error' in answer) {
    throw new Error(`the handler answered with an error: ${answer.error}`);
  }
  return answer;
}

/* The result of a `solve` answer that found a set. */
export function okResult(answer: HandlerAnswer) {
  const { result } = answered(answer);
  if (!('kind' in result) || result.kind !== 'ok') {
    throw new Error('the answer is not a solve that found a set');
  }
  return result;
}

/* The result of a `solve` answer that held a pin the solve cannot keep. */
export function badPinResult(answer: HandlerAnswer) {
  const { result } = answered(answer);
  if (!('kind' in result) || result.kind !== 'badpin') {
    throw new Error('the answer is not a bad pin');
  }
  return result;
}
