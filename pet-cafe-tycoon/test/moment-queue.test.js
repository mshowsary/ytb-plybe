// test/moment-queue.test.js — one queue for everything that celebrates over the play field.
//
// Three toast systems used to share one screen position with three timers, so a seated visit that
// fired a discovery and a friendship level-up drew two pills on top of each other; banners kept
// firing over the day summary. src/ui/moments.js queues them: one at a time, held while a sheet is
// open, bounded. These tests drive the queue with a fake clock.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMomentQueue, MOMENT_QUEUE_MAX } from '../src/ui/moments.js';

function fakeClock() {
  let now = 0, id = 0;
  const timers = new Map();
  return {
    schedule(fn, ms) { const t = ++id; timers.set(t, { at: now + ms, fn }); return t; },
    cancel(t) { timers.delete(t); },
    advance(ms) {
      const end = now + ms;
      for (;;) {
        const next = [...timers.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        timers.delete(next[0]); now = next[1].at; next[1].fn();
      }
      now = end;
    },
  };
}
// A timed item that records when it is on screen.
function toast(log, key, ms = 1000, kind = 'toast') {
  return { kind, key, ms, outMs: 200, show: () => log.push(`+${key}`), hide: () => log.push(`-${key}`), after: () => log.push(`.${key}`) };
}

test('two toasts never share the screen: the second starts only after the first has left', () => {
  const clock = fakeClock(), log = [];
  const q = createMomentQueue({ schedule: clock.schedule, cancel: clock.cancel });
  q.push(toast(log, 'discovery'));
  q.push(toast(log, 'friendship'));
  assert.deepEqual(log, ['+discovery'], 'only the first is showing');
  clock.advance(1000);
  assert.deepEqual(log, ['+discovery', '-discovery'], 'fading out, the second still waits');
  clock.advance(200);
  assert.deepEqual(log, ['+discovery', '-discovery', '.discovery', '+friendship']);
  clock.advance(1200);
  assert.deepEqual(log.slice(-2), ['-friendship', '.friendship']);
  assert.equal(q.active, null);
});

test('nothing starts while a sheet is open; the queue resumes when it closes', () => {
  const clock = fakeClock(), log = [];
  let sheetOpen = true, resume = null;
  const q = createMomentQueue({ schedule: clock.schedule, cancel: clock.cancel, held: () => sheetOpen, whenFree: fn => { resume = fn; } });
  q.push(toast(log, 'banner', 2500, 'banner'));
  q.push(toast(log, 'toast'));
  assert.deepEqual(log, [], 'held: nothing drawn over the sheet');
  assert.equal(q.pending.length, 2);
  sheetOpen = false; resume();
  assert.deepEqual(log, ['+banner']);
});

test('one waiter however many moments arrive while held', () => {
  const clock = fakeClock();
  let waiters = 0;
  const q = createMomentQueue({ schedule: clock.schedule, held: () => true, whenFree: () => { waiters++; } });
  for (let i = 0; i < 3; i++) q.push(toast([], `t${i}`));
  assert.equal(waiters, 1);
});

test('a self-run moment (a card reveal) owns its clock and the queue waits for done()', () => {
  const clock = fakeClock(), log = [];
  const q = createMomentQueue({ schedule: clock.schedule, cancel: clock.cancel });
  let finish = null;
  q.push({ kind: 'pet', key: 'pet:cat:1', run: done => { log.push('+pet'); finish = done; } });
  q.push(toast(log, 'after'));
  clock.advance(5000);
  assert.deepEqual(log, ['+pet'], 'the toast waits for the reveal');
  finish(); finish(); // a double done() is one done
  assert.deepEqual(log, ['+pet', '+after']);
});

test('a burst is bounded: the oldest banner/toast is dropped, a pet or photo reveal never is', () => {
  const clock = fakeClock(), log = [];
  const q = createMomentQueue({ schedule: clock.schedule, cancel: clock.cancel, held: () => true, whenFree: () => {} });
  q.push({ kind: 'pet', key: 'pet', run: () => {} });
  for (let i = 0; i < MOMENT_QUEUE_MAX + 2; i++) q.push(toast(log, `t${i}`));
  const kinds = q.pending.map(p => p.key);
  assert.equal(kinds.length, MOMENT_QUEUE_MAX);
  assert.equal(kinds[0], 'pet', 'the pet reveal survives');
  assert.deepEqual(kinds.slice(1), [`t3`, `t4`, `t5`], 'the newest toasts are kept');
});

test('the same moment twice in a row is one moment', () => {
  const clock = fakeClock(), log = [];
  const q = createMomentQueue({ schedule: clock.schedule, cancel: clock.cancel });
  assert.equal(q.push(toast(log, 'rush', 2500, 'banner')), true);
  assert.equal(q.push(toast(log, 'rush', 2500, 'banner')), false, 'already on screen');
  q.push(toast(log, 'x'));
  assert.equal(q.push(toast(log, 'x')), false, 'already waiting');
});
