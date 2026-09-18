import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reliefAttentionScale, RELIEF_ATTENTION_SECONDS } from '../src/ui/reliefAttention.js';

// 2026-09-17: a rewarded offer appearing used to slow the whole café to 0.55x for 1.2 s. It is a
// visual beat only now; the simulation's speed is never touched by a monetization prompt.
test('a new relief offer never changes the speed of the simulation', () => {
  for (const remaining of [2, 1, 0.5, 0, -1]) {
    assert.equal(reliefAttentionScale(remaining), 1);
    assert.equal(reliefAttentionScale(remaining, true), 1);
  }
});

test('the attention beat is brief', () => {
  assert.ok(RELIEF_ATTENTION_SECONDS > 0 && RELIEF_ATTENTION_SECONDS <= 1);
});
