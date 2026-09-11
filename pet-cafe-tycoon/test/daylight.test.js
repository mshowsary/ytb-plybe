import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { DAY_LENGTH } from '../src/sim/day.js';
import { KEYFRAMES, sampleDaylight, applyGoldenBoost, createDaylightState } from '../src/render/daylight.js';

const hex = c => '#' + c.getHexString(THREE.SRGBColorSpace).toUpperCase();

test('keyframes land exactly on the plan table at their own times', () => {
  for (const k of KEYFRAMES) {
    const s = sampleDaylight(k.t);
    assert.equal(hex(s.sun), k.sun.toUpperCase(), `sun at t=${k.t}`);
    assert.equal(hex(s.hemiSky), k.hemiSky.toUpperCase(), `hemi sky at t=${k.t}`);
    assert.equal(hex(s.hemiGround), k.hemiGround.toUpperCase(), `hemi ground at t=${k.t}`);
    assert.equal(hex(s.skyTop), k.skyTop.toUpperCase(), `sky top at t=${k.t}`);
    assert.equal(hex(s.skyHorizon), k.skyHorizon.toUpperCase(), `sky horizon at t=${k.t}`);
    assert.equal(hex(s.fog), k.fog.toUpperCase(), `fog at t=${k.t}`);
    assert.equal(s.sunI, k.sunI, `sun intensity at t=${k.t}`);
  }
});

test('the table spans the whole shift and clamps outside it', () => {
  assert.equal(KEYFRAMES[0].t, 0);
  assert.equal(KEYFRAMES[KEYFRAMES.length - 1].t, DAY_LENGTH);
  assert.equal(hex(sampleDaylight(-30).sun), KEYFRAMES[0].sun.toUpperCase());
  assert.equal(hex(sampleDaylight(DAY_LENGTH + 500).sun), KEYFRAMES[KEYFRAMES.length - 1].sun.toUpperCase());
});

test('the sun travels east to west and rises then sets', () => {
  let prevAz = Infinity;
  for (const k of KEYFRAMES) {
    assert.ok(k.azimuth < prevAz, `azimuth must decrease at t=${k.t}`);
    prevAz = k.azimuth;
    // Below ~14° the ±14 m shadow ortho box clips the shadows off the floor.
    assert.ok(k.elevation >= 14, `elevation floor at t=${k.t}`);
  }
  assert.ok(sampleDaylight(130).elevation > sampleDaylight(45).elevation);
  assert.ok(sampleDaylight(45).elevation > sampleDaylight(215).elevation);
});

test('grade warmth is cool in the morning and warm at sunset (plan §5.2)', () => {
  // The plan's −0.04 morning end was measured on screen at exactly cancelling the cream floor
  // (R−B of the lit floor came out at −1, i.e. dead neutral). Half of it keeps the morning the
  // coolest, crispest light of the day while the floor still reads cream rather than grey.
  assert.ok(sampleDaylight(45).warmth < 0, 'morning light is cool');
  assert.ok(sampleDaylight(45).warmth >= -0.04, 'but never cold enough to grey the cream floor');
  assert.equal(sampleDaylight(215).warmth, 0.06);
  let coolest = Infinity;
  for (const k of KEYFRAMES) coolest = Math.min(coolest, k.warmth);
  assert.equal(sampleDaylight(45).warmth, coolest, 'morning is the coolest point of the day');
  assert.ok(sampleDaylight(90).warmth < 0.02, 'the bright half of the day must not be sepia');
});

test('the interior only lights up late, and shadows only cool late', () => {
  for (const t of [45, 90, 130]) {
    assert.equal(sampleDaylight(t).interior, 0, `interior glow must be off at t=${t}`);
    assert.equal(sampleDaylight(t).lights, 0, `string lights must be off at t=${t}`);
    assert.equal(hex(sampleDaylight(t).shadowTint), '#FFFFFF', `neutral shadows at t=${t}`);
  }
  assert.ok(sampleDaylight(215).lights > 0.9, 'string lights on at sunset');
  assert.equal(sampleDaylight(240).interior, 1, 'café fully lit from within at dusk');
  const dusk = sampleDaylight(240).shadowTint;
  assert.ok(dusk.b > dusk.r, 'dusk shadows read blue, never sepia');
});

test('golden hour boosts the current keyframe instead of replacing it', () => {
  const morning = applyGoldenBoost(sampleDaylight(45, createDaylightState()), 1);
  const sunset = applyGoldenBoost(sampleDaylight(215, createDaylightState()), 1);
  assert.ok(morning.sunI > sunset.sunI, 'a golden morning is still brighter than a golden sunset');
  assert.ok(morning.sun.b > sunset.sun.b, 'a golden morning is still less orange than a golden sunset');
  const plain = sampleDaylight(45, createDaylightState());
  assert.ok(morning.sunI > plain.sunI && morning.warmth > plain.warmth, 'the boost does something');
  assert.equal(applyGoldenBoost(sampleDaylight(45, createDaylightState()), 0).sunI, plain.sunI);
});
