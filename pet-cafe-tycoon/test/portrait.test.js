// Task 2.2 (renderer half, plan §3.2.1): portrait.js is a pure "render into whatever renderer/DOM
// the caller has" module -- node:test has neither a WebGL context nor a DOM, so these tests inject
// a minimal fake renderer and a minimal fake `document.createElement('canvas')` and assert the
// CONTRACT: invalid input never throws, identical (petKey, poseId, accessoryId) triples are cached
// (the renderer is not asked to render twice), and distinct triples are not conflated.
import test from 'node:test';
import assert from 'node:assert/strict';

class FakeCanvasContext {
  createImageData(w, h) { return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }; }
  putImageData() {}
}
class FakeCanvas {
  constructor() { this.width = 0; this.height = 0; this._ctx = new FakeCanvasContext(); this._n = FakeCanvas.count++; }
  getContext() { return this._ctx; }
  toDataURL() { return `data:image/png;base64,FAKE${this._n}`; }
}
FakeCanvas.count = 0;

globalThis.document = {
  createElement(tag) {
    if (tag !== 'canvas') throw new Error('unexpected element ' + tag);
    return new FakeCanvas();
  },
};

const { renderPetPortrait, clearPortraitCache, PORTRAIT_SIZE } = await import('../src/render/portrait.js');

function makeRenderer() {
  const calls = { setRenderTarget: 0, render: 0, readRenderTargetPixels: 0 };
  return {
    calls,
    setRenderTarget(target) { calls.setRenderTarget++; this._lastTarget = target; },
    render() { calls.render++; },
    readRenderTargetPixels(rt, x, y, w, h, buffer) { calls.readRenderTargetPixels++; buffer.fill(120); },
  };
}

test('renders a data URL and never throws on missing/invalid input', () => {
  assert.equal(renderPetPortrait(null, { petKey: 'cat:0' }), null, 'no renderer at all');
  const renderer = makeRenderer();
  assert.equal(renderPetPortrait(renderer, { petKey: 'not-a-pet' }), null, 'unparseable petKey');
  assert.equal(renderPetPortrait(renderer, {}), null, 'missing petKey entirely');
  assert.equal(renderer.calls.render, 0, 'an invalid request must never touch the renderer');
});

test('a real request renders exactly once and caches the exact same result', () => {
  clearPortraitCache();
  const renderer = makeRenderer();
  const first = renderPetPortrait(renderer, { petKey: 'cat:0', poseId: 'idle' });
  assert.equal(typeof first, 'string');
  assert.ok(first.startsWith('data:image/png;base64,'));
  assert.equal(renderer.calls.render, 1);

  const second = renderPetPortrait(renderer, { petKey: 'cat:0', poseId: 'idle' });
  assert.equal(second, first, 'identical (petKey, poseId, accessoryId) must be byte-identical (deterministic)');
  assert.equal(renderer.calls.render, 1, 'a cache hit must not re-render');
});

test('an unknown poseId falls back to idle rather than throwing, and still caches under "idle"', () => {
  clearPortraitCache();
  const renderer = makeRenderer();
  const known = renderPetPortrait(renderer, { petKey: 'dog:1', poseId: 'idle' });
  const unknown = renderPetPortrait(renderer, { petKey: 'dog:1', poseId: 'some-future-clip-id' });
  assert.equal(unknown, known, 'unknown pose ids resolve to the same fallback pose and cache slot');
  assert.equal(renderer.calls.render, 1, 'the fallback must hit the same cache entry, not render twice');
});

test('distinct pets, poses and accessories are cached distinctly', () => {
  clearPortraitCache();
  const renderer = makeRenderer();
  const catIdle = renderPetPortrait(renderer, { petKey: 'cat:0', poseId: 'idle' });
  const catSit = renderPetPortrait(renderer, { petKey: 'cat:0', poseId: 'sit' });
  const dogIdle = renderPetPortrait(renderer, { petKey: 'dog:0', poseId: 'idle' });
  const catWithBow = renderPetPortrait(renderer, { petKey: 'cat:0', poseId: 'idle', accessoryId: 'acc_bow' });
  const ids = new Set([catIdle, catSit, dogIdle, catWithBow]);
  assert.equal(ids.size, 4, 'four distinct requests must not collapse onto the same cached image');
  assert.equal(renderer.calls.render, 4);
});

test('an unknown accessoryId is ignored (portrait still renders) rather than throwing', () => {
  clearPortraitCache();
  const renderer = makeRenderer();
  const result = renderPetPortrait(renderer, { petKey: 'bunny:2', accessoryId: 'not-a-real-accessory' });
  assert.equal(typeof result, 'string');
});

test('the render target is sized to the documented portrait size and restored to null afterward', () => {
  clearPortraitCache();
  const renderer = makeRenderer();
  let sawTargetSet = false, sawTargetCleared = false;
  const originalSetRenderTarget = renderer.setRenderTarget.bind(renderer);
  renderer.setRenderTarget = target => {
    if (target) { sawTargetSet = true; assert.equal(target.width, PORTRAIT_SIZE); assert.equal(target.height, PORTRAIT_SIZE); }
    else sawTargetCleared = true;
    originalSetRenderTarget(target);
  };
  renderPetPortrait(renderer, { petKey: 'hamster:3' });
  assert.equal(sawTargetSet, true);
  assert.equal(sawTargetCleared, true);
});
