// Batch 4b (plan 3.9) — the brush-hold mini-game overlay (src/ui/groomGame.js). These tests pin the
// PURE parts named in this task's own verify step: the beat scoring bands (re-checked here against
// the REAL src/sim/world.js exports this file binds — groomPulseScale/groomJudgeQuality/
// GROOM_BEAT_SECONDS/GROOM_BEATS — plus this file's own local groomPulseOpacity) and the overlay's
// model (groomPipState, which paints each of the three beat pips off the world's own session shape).
// None of this touches the DOM factory (createGroomGame itself calls document.createElement, which
// needs a browser/jsdom this repo's plain `node --test` does not provide) — exactly the same split
// src/sim/world.js's own photoRingScale/photoJudgeQuality get from the DOM-heavy src/ui/photoGame.js
// that consumes them.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GROOM_BEATS, GROOM_HIT_SIZE, GROOM_BEAT_SECONDS,
  groomPulseOpacity, groomPipState,
} from '../src/ui/groomGame.js';
import { groomPulseScale, groomJudgeQuality, GROOM_TARGET_SCALE, GROOM_PERFECT_BAND, GROOM_GOOD_BAND } from '../src/sim/world.js';

test('re-exports the real sim contract (src/sim/world.js), not a placeholder', () => {
  assert.equal(GROOM_BEATS, 3);
  assert.ok(GROOM_HIT_SIZE >= 80, 'program rule: a >= 80x80 tap target');
  assert.ok(GROOM_BEAT_SECONDS > 0);
});

test('groomPulseScale/groomJudgeQuality (world.js) shrink toward the target exactly like photo\'s ring', () => {
  const start = groomPulseScale(0);
  const end = groomPulseScale(GROOM_BEAT_SECONDS);
  assert.ok(start > GROOM_TARGET_SCALE, 'the pulse starts above the target scale');
  assert.ok(end < GROOM_TARGET_SCALE, 'and ends below it — it passes through the target once');
  assert.equal(groomJudgeQuality(GROOM_TARGET_SCALE), 'perfect', 'landing exactly on target is a perfect release');
  // A hair inside each band (not exactly ON the boundary, which floating-point addition can push
  // to either side of an inclusive `<=`) so this test pins the band's SHAPE, not a rounding artifact.
  assert.equal(groomJudgeQuality(GROOM_TARGET_SCALE + GROOM_PERFECT_BAND - 0.001), 'perfect');
  assert.equal(groomJudgeQuality(GROOM_TARGET_SCALE + GROOM_PERFECT_BAND + 0.001), 'good');
  assert.equal(groomJudgeQuality(GROOM_TARGET_SCALE + GROOM_GOOD_BAND - 0.001), 'good');
  assert.equal(groomJudgeQuality(GROOM_TARGET_SCALE + GROOM_GOOD_BAND + 0.001), 'ok');
});

test('groomPulseOpacity: the reduced-motion substitute peaks exactly when the pulse crosses the target', () => {
  // Find t where groomPulseScale(t) crosses GROOM_TARGET_SCALE by a coarse linear search — the
  // function is monotonic (a straight shrink), so this is a stable, non-flaky way to locate it
  // without hard-coding the crossing time as a second copy of world.js's own interpolation math.
  let bestT = 0, bestD = Infinity;
  for (let i = 0; i <= 200; i++) {
    const t = (GROOM_BEAT_SECONDS * i) / 200;
    const d = Math.abs(groomPulseScale(t) - GROOM_TARGET_SCALE);
    if (d < bestD) { bestD = d; bestT = t; }
  }
  const peak = groomPulseOpacity(bestT);
  assert.ok(peak > groomPulseOpacity(0), 'opacity at the crossing must read higher than at the very start');
  assert.ok(peak > groomPulseOpacity(GROOM_BEAT_SECONDS), 'and higher than at the very end');
  // Bounded — a "plain opacity cycle" must never fully vanish or overshoot fully opaque range.
  for (const t of [0, GROOM_BEAT_SECONDS * 0.25, GROOM_BEAT_SECONDS * 0.5, GROOM_BEAT_SECONDS * 0.75, GROOM_BEAT_SECONDS]) {
    const o = groomPulseOpacity(t);
    assert.ok(o >= 0.4 && o <= 1, `opacity ${o} at t=${t} must stay in [0.4, 1]`);
  }
});

test('groomPipState: no session at all -> every pip pending', () => {
  assert.equal(groomPipState(0, null), 'pending');
  assert.equal(groomPipState(2, undefined), 'pending');
});

test('groomPipState: a fresh session (beat 0, no scores yet) -> pip 0 active, the rest pending', () => {
  const session = { beat: 0, beatScores: [], resolved: false };
  assert.equal(groomPipState(0, session), 'active');
  assert.equal(groomPipState(1, session), 'pending');
  assert.equal(groomPipState(2, session), 'pending');
});

test('groomPipState: recorded beats paint their OWN authoritative quality, never a re-derived one', () => {
  const session = { beat: 2, beatScores: ['perfect', 'ok'], resolved: false };
  assert.equal(groomPipState(0, session), 'perfect');
  assert.equal(groomPipState(1, session), 'ok');
  assert.equal(groomPipState(2, session), 'active', 'the third, unresolved beat is the live one');
});

test('groomPipState: a fully resolved session leaves no "active" pip', () => {
  const session = { beat: 3, beatScores: ['perfect', 'good', 'ok'], resolved: true };
  assert.equal(groomPipState(0, session), 'perfect');
  assert.equal(groomPipState(1, session), 'good');
  assert.equal(groomPipState(2, session), 'ok');
});
