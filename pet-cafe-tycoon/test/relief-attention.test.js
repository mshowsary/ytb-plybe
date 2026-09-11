import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reliefAttentionScale, RELIEF_ATTENTION_SCALE, RELIEF_ATTENTION_SECONDS } from '../src/ui/reliefAttention.js';

test('new relief attention is a brief slowdown, never a pause', () => {
  assert.equal(RELIEF_ATTENTION_SECONDS, 1.2);
  assert.ok(RELIEF_ATTENTION_SCALE > 0 && RELIEF_ATTENTION_SCALE < 1);
  assert.equal(reliefAttentionScale(1), RELIEF_ATTENTION_SCALE);
  assert.equal(reliefAttentionScale(0), 1);
  assert.equal(reliefAttentionScale(-1), 1);
});

test('reduced-motion users never receive the simulation slowdown', () => {
  assert.equal(reliefAttentionScale(1, true), 1);
});
