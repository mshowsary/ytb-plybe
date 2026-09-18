import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SPLASH_STATION_ID, SPLASH_PLAY_FRIENDSHIP_BONUS,
  dogPlaySpot, dogPrefersSplash, splashPlayFriendshipBonus,
} from '../src/sim/petPlayBreak.js';

// Task E4 (batch 1, plan 3.1): "After z_splash, petPlayBreak.js picks splash1.front as the play
// spot for dogs; friendship +1 extra per play there." These are the pure decision functions this
// task owns — see the file's own comment for why the actual dog-walking/friendship-awarding wiring
// is a different task's file.

function worldWithSplash({ active = true, front = { x: 0, z: 12.2 } } = {}) {
  return { stations: new Map([['splash1', { id: 'splash1', type: 'splash', active, front }]]) };
}
function worldWithoutSplash() {
  return { stations: new Map([['fountain1', { id: 'fountain1', type: 'decor', active: true, front: { x: 0, z: 12.2 } }]]) };
}

test('before z_splash is built, there is no dedicated play spot', () => {
  assert.equal(dogPlaySpot(worldWithoutSplash()), null);
  assert.equal(dogPrefersSplash(worldWithoutSplash()), false);
  // Defensive against a bare/partial world too (no stations map at all).
  assert.equal(dogPlaySpot({}), null);
  assert.equal(dogPlaySpot(null), null);
});

test('once z_splash is built, dogs pick splash1.front as their play spot', () => {
  const world = worldWithSplash({ front: { x: 0.4, z: 11.8 } });
  const spot = dogPlaySpot(world);
  assert.deepEqual(spot, { x: 0.4, z: 11.8, stationId: SPLASH_STATION_ID });
  assert.equal(dogPrefersSplash(world), true);
});

test('an inactive splash station (not actually built yet) is not a play spot', () => {
  const world = worldWithSplash({ active: false });
  assert.equal(dogPlaySpot(world), null);
  assert.equal(dogPrefersSplash(world), false);
});

test('friendship bonus is +1 at the splash pool, 0 anywhere else', () => {
  const world = worldWithSplash();
  assert.equal(splashPlayFriendshipBonus(world, dogPlaySpot(world)), SPLASH_PLAY_FRIENDSHIP_BONUS);
  // Accepts a bare station id string too, not just the {stationId} shape.
  assert.equal(splashPlayFriendshipBonus(world, 'splash1'), SPLASH_PLAY_FRIENDSHIP_BONUS);
  assert.equal(splashPlayFriendshipBonus(world, { stationId: 'catTree1' }), 0);
  assert.equal(splashPlayFriendshipBonus(world, null), 0);
  // No bonus if the pool isn't actually built/active, even if asked about by id directly.
  assert.equal(splashPlayFriendshipBonus(worldWithoutSplash(), 'splash1'), 0);
});
