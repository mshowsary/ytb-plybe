import { test } from 'node:test'; import assert from 'node:assert/strict';
import { createAudio } from '../src/audio/synth.js';
test('createAudio returns independent host, music and SFX controls without touching AudioContext', () => {
  const A = createAudio();
  assert.equal(typeof A.unlock, 'function');
  assert.equal(typeof A.setHostMute, 'function');
  assert.equal(typeof A.setSfx, 'function');
  assert.equal(typeof A.setMusic, 'function');
  assert.equal(typeof A.play, 'function');
  assert.equal(A.muted, false);
  assert.equal(A.sfxEnabled, true);
  assert.equal(A.musicEnabled, true);
  A.setSfx(false);
  assert.equal(A.sfxEnabled, false);
  assert.equal(A.musicEnabled, true);
  assert.equal(A.muted, false);
  A.setMusic(false);
  assert.equal(A.musicEnabled, false);
  A.setHostMute(true);
  assert.equal(A.muted, true);
});
test('audio controls before unlock are safe no-ops in node', () => {
  const A = createAudio();
  for (const name of ['coin','pop','drop','ding','chime','build','step','tap','angry','penalty','pour','clean','petCat','petDog','petBunny','nonexistent']) {
    assert.doesNotThrow(() => A.play(name));
  }
  assert.doesNotThrow(() => A.unlock());
  assert.doesNotThrow(() => A.setHostMute(true));
  assert.doesNotThrow(() => A.setSfx(false));
  assert.doesNotThrow(() => A.setMusic(false));
});
