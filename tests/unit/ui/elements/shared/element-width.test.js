/* The element width controller (src/ui/elements/shared/element-width.ts) with a fake host, a fake ResizeObserver and a manual frame
   clock, so no browser and no Lit are needed. The chart of Stat Allocation and of GCD Scaling is drawn at the width this reports. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ElementWidthController } from '../../../../../src/ui/elements/shared/element-width.ts';

/* A fake ResizeObserver that records what it watches; `report(width)` delivers a size to the latest one made. */
let watchers;
let frames;
class FakeObserver {
  constructor(callback) {
    this.callback = callback;
    this.targets = new Set();
    watchers.push(this);
  }
  observe(target) {
    this.targets.add(target);
  }
  disconnect() {
    this.targets.clear();
  }
}
const report = width => watchers.at(-1).callback([{ contentRect: { width } }]);
/* Runs the frames asked for so far. */
const runFrames = () => {
  for (const frame of frames.splice(0)) {
    frame();
  }
};

/* A controller on a fake host whose box is `box.current`, and the host's count of redraws. */
function setUp() {
  watchers = [];
  frames = [];
  globalThis.ResizeObserver = FakeObserver;
  globalThis.requestAnimationFrame = frame => frames.push(frame);
  const box = { current: {} };
  const host = {
    redraws: 0,
    controllers: [],
    addController(added) {
      this.controllers.push(added);
    },
    requestUpdate() {
      this.redraws += 1;
    },
  };
  const controller = new ElementWidthController(host, () => box.current);
  return { box, host, controller };
}

test('the width follows the box after each draw, in the next frame, rounded; a hidden box keeps the last width', () => {
  const { box, host, controller } = setUp();
  controller.hostUpdated();
  assert.deepEqual([...watchers[0].targets], [box.current]);
  report(512.4);
  assert.equal(controller.width, 0, 'not in the delivery that reports it');
  runFrames();
  assert.deepEqual([controller.width, host.redraws], [512, 1]);
  report(0);
  runFrames();
  assert.equal(controller.width, 512);
  report(512);
  runFrames();
  assert.equal(host.redraws, 1, 'the same width draws nothing again');
});

test('a box that comes and goes is followed again; no box, nothing is watched', () => {
  const { box, controller } = setUp();
  box.current = null;
  controller.hostUpdated();
  assert.equal(watchers.length, 0);
  box.current = {};
  controller.hostUpdated();
  assert.deepEqual([...watchers[0].targets], [box.current]);
  const first = box.current;
  box.current = {};
  controller.hostUpdated();
  assert.deepEqual([...watchers[0].targets], [box.current], 'the new box replaces the old one');
  assert.notEqual(first, box.current);
});

test('a disconnected host stops watching, and a reconnected one draws again to find its box', () => {
  const { host, controller } = setUp();
  controller.hostUpdated();
  controller.hostDisconnected();
  assert.equal(watchers[0].targets.size, 0);
  controller.hostConnected();
  assert.equal(host.redraws, 1);
  controller.hostUpdated();
  assert.equal(watchers.at(-1).targets.size, 1);
});
