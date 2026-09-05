import test from 'node:test';
import assert from 'node:assert/strict';
import { createPresentationScheduler } from '../src/core/presentationScheduler.js';

function fakeRuntime(extra = {}) {
  let time = 0, nextId = 1;
  const timers = new Map(), frames = new Map();
  const env = {
    now: () => time,
    setTimer(fn, ms) { const id = nextId++; timers.set(id, { fn, due: time + ms }); return id; },
    clearTimer(id) { timers.delete(id); },
    requestFrame(fn) { const id = nextId++; frames.set(id, fn); return id; },
    cancelFrame(id) { frames.delete(id); },
    ...extra,
  };
  function advance(ms) {
    time += ms;
    for (;;) {
      const due = [...timers.entries()].filter(([, t]) => t.due <= time).sort((a, b) => a[1].due - b[1].due)[0];
      if (!due) break;
      timers.delete(due[0]); due[1].fn();
    }
  }
  function frame() {
    const pending = [...frames.entries()]; frames.clear();
    for (const [, fn] of pending) fn(time);
  }
  return { env, advance, frame, get time() { return time; }, timers, frames };
}

test('scheduled presentation preserves remaining time across a long host pause', () => {
  const rt = fakeRuntime();
  const s = createPresentationScheduler(rt.env);
  let fired = 0;
  s.schedule(() => fired++, 1000);
  rt.advance(300);
  s.setPaused('host', true);
  rt.advance(10_000);
  assert.equal(fired, 0, 'wall-clock pause must not consume presentation delay');
  s.setPaused('host', false);
  rt.advance(699);
  assert.equal(fired, 0);
  rt.advance(1);
  assert.equal(fired, 1);
});

test('host and user pause reasons are independent', () => {
  const rt = fakeRuntime();
  const s = createPresentationScheduler(rt.env);
  let fired = false;
  s.schedule(() => { fired = true; }, 100);
  s.setPaused('user', true);
  s.setPaused('host', true);
  rt.advance(500);
  s.setPaused('host', false);
  rt.advance(500);
  assert.equal(fired, false, 'user pause must keep scheduler frozen after host resumes');
  assert.equal(s.paused, true);
  s.setPaused('user', false);
  rt.advance(99);
  assert.equal(fired, false);
  rt.advance(1);
  assert.equal(fired, true);
  assert.equal(s.paused, false);
});

test('nested presentation RAF work is cancelled while paused and resumes with its remaining frame count', () => {
  const rt = fakeRuntime();
  const s = createPresentationScheduler(rt.env);
  let fired = 0;
  s.afterFrames(() => fired++, 2);
  rt.frame();
  assert.equal(fired, 0);
  s.setPaused('host', true);
  rt.frame();
  rt.frame();
  assert.equal(fired, 0);
  s.setPaused('host', false);
  rt.frame();
  assert.equal(fired, 1);
});

test('whenResumed waits until every pause reason clears', async () => {
  const rt = fakeRuntime();
  const s = createPresentationScheduler(rt.env);
  s.setPaused('host', true);
  s.setPaused('user', true);
  let resolved = false;
  const p = s.whenResumed().then(() => { resolved = true; });
  s.setPaused('host', false);
  await Promise.resolve();
  assert.equal(resolved, false);
  s.setPaused('user', false);
  await p;
  assert.equal(resolved, true);
});

test('active CSS/Web Animations pause once and resume only after the final pause reason clears', () => {
  const owned = {
    playState:'running', pauses:0, plays:0,
    pause() { this.pauses++; this.playState = 'paused'; },
    play() { this.plays++; this.playState = 'running'; },
  };
  const alreadyPaused = {
    playState:'paused', pauses:0, plays:0,
    pause() { this.pauses++; }, play() { this.plays++; },
  };
  const rt = fakeRuntime({ listAnimations: () => [owned, alreadyPaused] });
  const s = createPresentationScheduler(rt.env);

  s.setPaused('host', true);
  assert.equal(owned.pauses, 1);
  assert.equal(alreadyPaused.pauses, 0, 'scheduler must not take ownership of externally paused animation');
  s.setPaused('user', true);
  assert.equal(owned.pauses, 1, 'second pause reason must not pause twice');
  s.setPaused('host', false);
  assert.equal(owned.plays, 0);
  s.setPaused('user', false);
  assert.equal(owned.plays, 1);
  assert.equal(alreadyPaused.plays, 0);
});
