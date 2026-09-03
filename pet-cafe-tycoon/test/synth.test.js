import { test } from 'node:test'; import assert from 'node:assert/strict';
import { createAudio } from '../src/audio/synth.js';
test('createAudio returns the documented API without touching window/AudioContext', () => {
  const A = createAudio();
  assert.equal(typeof A.unlock, 'function');
  assert.equal(typeof A.setHostMute, 'function');
  assert.equal(typeof A.setSfx, 'function');
  assert.equal(typeof A.play, 'function');
  assert.equal(typeof A.muted, 'boolean');
  assert.equal(A.muted, false);
});
test('play before unlock is a safe no-op (no AudioContext exists in node)', () => {
  const A = createAudio();
  assert.doesNotThrow(() => A.play('coin'));
  assert.doesNotThrow(() => A.play('pop'));
  assert.doesNotThrow(() => A.play('drop'));
  assert.doesNotThrow(() => A.play('ding'));
  assert.doesNotThrow(() => A.play('chime'));
  assert.doesNotThrow(() => A.play('build'));
  assert.doesNotThrow(() => A.play('step'));
  assert.doesNotThrow(() => A.play('tap'));
  assert.doesNotThrow(() => A.play('angry'));
  assert.doesNotThrow(() => A.play('nonexistent'));
  assert.doesNotThrow(() => A.unlock()); // no AudioContext in node: this must not throw either
  assert.doesNotThrow(() => A.setHostMute(true));
  assert.doesNotThrow(() => A.setSfx(false));
});
